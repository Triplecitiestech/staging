// src/lib/reporting/delivery-economics/service.ts
//
// I/O layer for the Delivery Economics report. Pulls from Autotask (time
// entries + contracts) and Datto RMM (endpoint counts per company), then hands
// everything to the pure analyzer. Kept separate so the analysis can be tested
// from fixtures with no network.
//
// TWO NON-OBVIOUS THINGS, both learned the hard way:
//
// 1. Autotask TimeEntries pagination 405s on windows that exceed one page.
//    A whole month reliably fails ("The requested resource does not support
//    http method 'GET'" after 500 records). So the window is fetched in
//    HALF-MONTH slices and de-duplicated by entry id. Do not "simplify" this
//    back to one call per month.
// 2. Datto RMM pagination is 0-INDEXED. Starting at page 1 silently skips the
//    first 250 rows. The endpoint→Autotask-company mapping lives on the raw
//    site rows (autotaskCompanyId), which the typed client does not surface,
//    so this uses the GET-only getV2 passthrough.

import { AutotaskClient } from '@/lib/autotask'
import { DattoRmmClient } from '@/lib/datto-rmm'
import { withRetry, withTimeout } from '@/lib/resilience'
import laborModel from '@/config/sales-calculator/labor.json'
import { buildDeliveryEconomicsReport, resolveCompanyTiers } from './analyzer'
import { buildCompanyBilling } from './billing-units'
import type {
  CapacityMember,
  CompanyBilling,
  CompanyTier,
  DataSourceStatus,
  DeliveryEconomicsReport,
  DeliveryTimeEntry,
  EndpointCount,
  ServiceCatalogEntry,
} from './types'

/**
 * The scalable delivery roster and departed staff.
 *
 * Deliberately config-in-code rather than derived: "who counts as sellable
 * delivery capacity" is a business judgement, not a fact in Autotask. The
 * owner's own delivery hours are real but not capacity you can sell into, and
 * a fixed-fee adviser carries no hours — including either would invent
 * headroom. Aggregate hours only; no pay rates here (the loaded-cost model
 * lives in src/config/sales-calculator/labor.json).
 */
export const DELIVERY_ROSTER: CapacityMember[] = [
  { resourceName: 'Benjamin Miguel', monthlyCapacityHours: 160 },
  { resourceName: 'Ghenel Bacalla', monthlyCapacityHours: 86.7 },
]

/** Departed staff — excluded from cost, capacity and hours-per-endpoint alike. */
export const EXCLUDED_RESOURCES = ['Mark Jagdon']

const HALF_MONTH_DAYS = 15

/** Inclusive half-month slices, small enough to stay inside one Autotask page. */
export function buildFetchSlices(from: Date, to: Date): { from: Date; to: Date }[] {
  const slices: { from: Date; to: Date }[] = []
  const cursor = new Date(from.getTime())
  while (cursor <= to) {
    const sliceFrom = new Date(cursor.getTime())
    const sliceTo = new Date(cursor.getTime())
    sliceTo.setUTCDate(sliceTo.getUTCDate() + HALF_MONTH_DAYS - 1)
    slices.push({ from: sliceFrom, to: sliceTo > to ? new Date(to.getTime()) : sliceTo })
    cursor.setUTCDate(cursor.getUTCDate() + HALF_MONTH_DAYS)
  }
  return slices
}

export interface DeliveryEconomicsTelemetry {
  entries: DeliveryTimeEntry[]
  tiers: CompanyTier[]
  endpoints: EndpointCount[]
  billing: CompanyBilling[]
  unclassifiedServices: string[]
  dataSources: DataSourceStatus[]
  warnings: string[]
}

/** Bounded-concurrency map. Keeps per-contract fan-out off Autotask's throat. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

const CONTRACT_FETCH_CONCURRENCY = 6
/** Lookback for unit rows, wide enough to catch the anchor period and the one before it. */
const UNIT_WINDOW_LOOKBACK_DAYS = 45

/**
 * Contract service lines -> per-company billed unit mix.
 *
 * Three separate reads because Autotask splits an invoice line across three
 * entities: Services holds the name, ContractServices the rate, and
 * ContractServiceUnits the quantity for a given billing period. There is no
 * single endpoint that returns a recurring invoice line whole.
 *
 * FETCHED PER CONTRACT, AND THAT IS NOT AN OPTIMISATION — it is the only thing
 * that works. `queryAll` paginates by following `pageDetails.nextPageUrl` with a
 * GET, which this Autotask zone rejects with HTTP 405 whenever the original
 * query used `includeFields` (docs/gotchas.md -> Autotask). ContractServiceUnits
 * holds ONE ROW PER SERVICE PER BILLING PERIOD, so a single three-year contract
 * contributes ~36 rows per service and an account-wide query blows past the
 * 500-record first page immediately — which is exactly how the first live run
 * came back with an empty billed-unit section and $0 managed revenue. Scoping to
 * one contract and a ~6-week window keeps every response inside one page, so
 * nextPageUrl is never followed. Do NOT "simplify" this back to one call.
 *
 * A failure here degrades the billed-unit sections only — capacity and
 * billing-capture do not depend on contracts.
 */
async function fetchCompanyBilling(
  autotask: AutotaskClient,
  contracts: { id: number; companyID: number; contractName: string | null }[],
  tiers: CompanyTier[],
  anchorDate: string,
  to: Date,
  warnings: string[]
): Promise<{ billing: CompanyBilling[]; unclassifiedServices: string[]; status: DataSourceStatus }> {
  const fail = (detail: string): { billing: CompanyBilling[]; unclassifiedServices: string[]; status: DataSourceStatus } => {
    warnings.push(
      `Contract service lines unavailable (${detail}). Per-billed-unit economics are omitted for this run ` +
        'rather than estimated — every per-unit figure would otherwise read as zero.'
    )
    return { billing: [], unclassifiedServices: [], status: { source: 'contract-service-lines', ok: false, detail } }
  }

  let services: ServiceCatalogEntry[]
  try {
    const catalog = await withRetry(() => autotask.getServicesList({ activeOnly: false }), { maxRetries: 2 })
    services = catalog.services.map((s) => ({
      id: Number(s.id),
      name: String(s.name ?? ''),
      unitPrice: s.unitPrice == null ? null : Number(s.unitPrice),
      unitCost: s.unitCost == null ? null : Number(s.unitCost),
    }))
  } catch (err) {
    return fail(`service catalogue: ${err instanceof Error ? err.message : String(err)}`)
  }

  const unitsFrom = new Date(to.getTime() - UNIT_WINDOW_LOOKBACK_DAYS * 86_400_000)
  const perContractErrors: string[] = []

  const results = await mapLimit(contracts, CONTRACT_FETCH_CONCURRENCY, async (c) => {
    try {
      const [svc, units] = await Promise.all([
        withRetry(() => autotask.listContractServices({ contractId: c.id }), { maxRetries: 2 }),
        withRetry(() => autotask.listContractServiceUnits({ contractId: c.id, from: unitsFrom, to }), { maxRetries: 2 }),
      ])
      return { svc, units }
    } catch (err) {
      perContractErrors.push(`contract ${c.id}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  })

  const okResults = results.filter((r): r is NonNullable<typeof r> => r !== null)
  if (okResults.length === 0) {
    return fail(
      contracts.length === 0
        ? 'no active contracts to read lines from'
        : `all ${contracts.length} contracts failed — first: ${perContractErrors[0] ?? 'unknown'}`
    )
  }

  const { companies, unclassifiedServices } = buildCompanyBilling({
    contracts,
    services,
    contractServices: okResults.flatMap((r) => r.svc),
    contractServiceUnits: okResults.flatMap((r) => r.units),
    tiers,
    anchorDate,
  })

  // A partial read is reported as partial. Silently dropping a contract would
  // understate that customer's revenue and never look like an error.
  if (perContractErrors.length) {
    warnings.push(
      `${perContractErrors.length} of ${contracts.length} contracts could not be read, so their revenue and units are ` +
        `MISSING rather than zero: ${perContractErrors.slice(0, 3).join('; ')}` +
        `${perContractErrors.length > 3 ? '; …' : ''}`
    )
  }

  return {
    billing: companies,
    unclassifiedServices,
    status: {
      source: 'contract-service-lines',
      ok: true,
      detail: perContractErrors.length
        ? `${okResults.length}/${contracts.length} contracts read`
        : `${okResults.length} contracts read`,
    },
  }
}

interface RawDattoSite {
  autotaskCompanyId?: string | number | null
  devices?: number | null
}

/** Datto sites → endpoints per Autotask company. 0-indexed pagination. */
async function fetchEndpointCounts(
  datto: DattoRmmClient,
  warnings: string[],
  statuses: DataSourceStatus[]
): Promise<EndpointCount[]> {
  const byCompany = new Map<number, number>()
  try {
    for (let page = 0; page < 8; page++) {
      const res = (await withTimeout(
        () => datto.getV2(`/api/v2/account/sites?page=${page}&max=250`),
        30_000,
        'datto sites'
      )) as { sites?: RawDattoSite[] } | null
      const rows = res?.sites ?? []
      for (const s of rows) {
        const raw = s.autotaskCompanyId
        const id = typeof raw === 'number' ? raw : raw && /^\d+$/.test(String(raw)) ? Number(raw) : null
        if (id === null) continue
        byCompany.set(id, (byCompany.get(id) ?? 0) + (s.devices ?? 0))
      }
      if (rows.length < 250) break
    }
    statuses.push({
      source: 'datto-endpoints',
      ok: byCompany.size > 0,
      detail: byCompany.size > 0
        ? `${byCompany.size} companies mapped`
        : 'Datto returned no site rows carrying an autotaskCompanyId',
    })
    if (byCompany.size === 0) {
      warnings.push(
        'Datto RMM returned no sites mapped to an Autotask company, so the per-tier endpoint table shows 0 companies ' +
          'because it has no denominator — not because those tiers have no customers.'
      )
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    warnings.push(
      `Datto RMM endpoint counts unavailable (${detail}). Per-tier hours-per-endpoint cannot be computed without them, ` +
        'so that table reads 0 companies — treat it as unmeasured, not empty.'
    )
    statuses.push({ source: 'datto-endpoints', ok: false, detail })
  }
  return [...byCompany.entries()].map(([companyId, endpoints]) => ({ companyId, endpoints }))
}

export async function fetchDeliveryTelemetry(opts: {
  from: Date
  to: Date
  autotask?: AutotaskClient
  datto?: DattoRmmClient
}): Promise<DeliveryEconomicsTelemetry> {
  const autotask = opts.autotask ?? new AutotaskClient()
  const datto = opts.datto ?? new DattoRmmClient()
  const warnings: string[] = []
  const dataSources: DataSourceStatus[] = []
  let sliceFailures = 0
  let sliceCount = 0

  // Time entries, half-month at a time, de-duplicated by id. One failed slice
  // degrades that slice only — a partial window is reported, never silently
  // treated as "no work happened then".
  const byId = new Map<number, DeliveryTimeEntry>()
  for (const slice of buildFetchSlices(opts.from, opts.to)) {
    sliceCount++
    try {
      const rows = await withRetry(
        () => autotask.searchTimeEntries({ from: slice.from, to: slice.to, withBillingStatus: true }),
        { maxRetries: 2 }
      )
      for (const r of rows) {
        byId.set(r.id, {
          id: r.id,
          resourceName: r.resourceName ?? 'Unknown',
          dateWorked: r.dateWorked,
          hoursWorked: r.hoursWorked ?? 0,
          billable: !!r.billable,
          companyID: r.companyID ?? 0,
          ticketID: r.ticketID ?? null,
          ticketNumber: r.ticketNumber ?? null,
          billingCodeID: r.billingCodeID ?? null,
          summaryNotes: r.summaryNotes ?? null,
          billingStatus: r.billingStatus ?? null,
        })
      }
    } catch (err) {
      sliceFailures++
      warnings.push(
        `Time entries ${slice.from.toISOString().slice(0, 10)}..${slice.to.toISOString().slice(0, 10)} failed ` +
          `(${err instanceof Error ? err.message : String(err)}). Figures for that period are missing, not zero.`
      )
    }
  }

  dataSources.push({
    source: 'time-entries',
    ok: sliceFailures < sliceCount,
    detail: sliceFailures
      ? `${sliceCount - sliceFailures}/${sliceCount} windows read, ${byId.size} entries`
      : `${byId.size} entries across ${sliceCount} windows`,
  })

  let tiers: CompanyTier[] = []
  let billing: CompanyBilling[] = []
  let unclassifiedServices: string[] = []
  try {
    const contracts = await withRetry(() => autotask.listContracts({ activeOnly: true }), { maxRetries: 2 })
    tiers = resolveCompanyTiers(
      contracts.map((c) => ({
        companyID: c.companyID,
        contractName: c.contractName ?? null,
        statusName: c.statusName ?? null,
      }))
    )
    dataSources.push({
      source: 'contracts',
      ok: tiers.length > 0,
      detail: tiers.length > 0
        ? `${contracts.length} active contracts, ${tiers.length} companies tiered`
        : `${contracts.length} active contracts but none matched a tier name — every customer reads as unmanaged`,
    })
    if (contracts.length > 0 && tiers.length === 0) {
      warnings.push(
        `Autotask returned ${contracts.length} active contracts but none matched a known tier name, so every customer ` +
          'reads as unmanaged and the per-tier tables are empty. Tier comes from the contract NAME — check for a ' +
          'renamed or newly-named managed contract.'
      )
    }
    // Anchor on the window end: the billed unit mix reported is the one in
    // force at the end of the measured period, so revenue and hours describe
    // the same customer base.
    const result = await fetchCompanyBilling(
      autotask,
      contracts.map((c) => ({ id: c.id, companyID: c.companyID, contractName: c.contractName ?? null })),
      tiers,
      opts.to.toISOString().slice(0, 10),
      opts.to,
      warnings
    )
    billing = result.billing
    unclassifiedServices = result.unclassifiedServices
    dataSources.push(result.status)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    warnings.push(
      `Autotask contracts unavailable (${detail}). Every customer will read as unmanaged, and both the per-tier and ` +
        'per-billed-unit tables will be empty — that is a failed read, not a business result.'
    )
    dataSources.push({ source: 'contracts', ok: false, detail })
    dataSources.push({ source: 'contract-service-lines', ok: false, detail: 'skipped — contracts could not be read' })
  }

  return {
    entries: [...byId.values()],
    tiers,
    endpoints: await fetchEndpointCounts(datto, warnings, dataSources),
    billing,
    unclassifiedServices,
    dataSources,
    warnings,
  }
}

/** Months in the window, to one decimal — the divisor for every /month figure. */
export function windowMonths(from: Date, to: Date): number {
  const days = (to.getTime() - from.getTime()) / 86_400_000 + 1
  return Math.round((days / 30.44) * 100) / 100
}

export async function generateDeliveryEconomicsReport(opts: {
  from: Date
  to: Date
  now?: Date
  autotask?: AutotaskClient
  datto?: DattoRmmClient
}): Promise<DeliveryEconomicsReport> {
  const telemetry = await fetchDeliveryTelemetry(opts)
  const report = buildDeliveryEconomicsReport({
    entries: telemetry.entries,
    tiers: telemetry.tiers,
    endpoints: telemetry.endpoints,
    billing: telemetry.billing,
    unclassifiedServices: telemetry.unclassifiedServices,
    dataSources: telemetry.dataSources,
    capacity: DELIVERY_ROSTER,
    excludedResources: EXCLUDED_RESOURCES,
    // Same blended loaded rate the sales calculator quotes against, so a deal
    // priced in the calculator and a customer measured here use one cost basis.
    deliveryCostPerHour: laborModel.deliveryCostPerHour,
    window: {
      from: opts.from.toISOString().slice(0, 10),
      to: opts.to.toISOString().slice(0, 10),
      months: windowMonths(opts.from, opts.to),
    },
    generatedAt: (opts.now ?? new Date()).toISOString(),
  })
  return { ...report, notes: [...telemetry.warnings, ...report.notes] }
}
