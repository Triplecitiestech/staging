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
  warnings: string[]
}

/**
 * Contract service lines -> per-company billed unit mix.
 *
 * Three separate reads because Autotask splits an invoice line across three
 * entities: Services holds the name, ContractServices the rate, and
 * ContractServiceUnits the quantity for a given billing period. There is no
 * single endpoint that returns a recurring invoice line whole.
 *
 * A failure here degrades the billed-unit sections only — the capacity and
 * billing-capture sections do not depend on contracts.
 */
async function fetchCompanyBilling(
  autotask: AutotaskClient,
  contracts: { id: number; companyID: number; contractName: string | null }[],
  tiers: CompanyTier[],
  anchorDate: string,
  warnings: string[]
): Promise<{ billing: CompanyBilling[]; unclassifiedServices: string[] }> {
  try {
    const [catalog, contractServices, contractServiceUnits] = await Promise.all([
      withRetry(() => autotask.getServicesList({ activeOnly: false }), { maxRetries: 2 }),
      withRetry(() => autotask.listContractServices(), { maxRetries: 2 }),
      withRetry(() => autotask.listContractServiceUnits(), { maxRetries: 2 }),
    ])
    const services: ServiceCatalogEntry[] = catalog.services.map((s) => ({
      id: Number(s.id),
      name: String(s.name ?? ''),
      unitPrice: s.unitPrice == null ? null : Number(s.unitPrice),
      unitCost: s.unitCost == null ? null : Number(s.unitCost),
    }))
    const { companies, unclassifiedServices } = buildCompanyBilling({
      contracts,
      services,
      contractServices,
      contractServiceUnits,
      tiers,
      anchorDate,
    })
    return { billing: companies, unclassifiedServices }
  } catch (err) {
    warnings.push(
      `Contract service lines unavailable (${err instanceof Error ? err.message : String(err)}). ` +
        'Per-billed-unit economics are omitted for this run rather than estimated.'
    )
    return { billing: [], unclassifiedServices: [] }
  }
}

interface RawDattoSite {
  autotaskCompanyId?: string | number | null
  devices?: number | null
}

/** Datto sites → endpoints per Autotask company. 0-indexed pagination. */
async function fetchEndpointCounts(datto: DattoRmmClient, warnings: string[]): Promise<EndpointCount[]> {
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
  } catch (err) {
    warnings.push(
      `Datto RMM endpoint counts unavailable (${err instanceof Error ? err.message : String(err)}). ` +
        'Per-tier hours-per-endpoint cannot be computed without them.'
    )
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

  // Time entries, half-month at a time, de-duplicated by id. One failed slice
  // degrades that slice only — a partial window is reported, never silently
  // treated as "no work happened then".
  const byId = new Map<number, DeliveryTimeEntry>()
  for (const slice of buildFetchSlices(opts.from, opts.to)) {
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
      warnings.push(
        `Time entries ${slice.from.toISOString().slice(0, 10)}..${slice.to.toISOString().slice(0, 10)} failed ` +
          `(${err instanceof Error ? err.message : String(err)}). Figures for that period are missing, not zero.`
      )
    }
  }

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
    // Anchor on the window end: the billed unit mix reported is the one in
    // force at the end of the measured period, so revenue and hours describe
    // the same customer base.
    const result = await fetchCompanyBilling(
      autotask,
      contracts.map((c) => ({ id: c.id, companyID: c.companyID, contractName: c.contractName ?? null })),
      tiers,
      opts.to.toISOString().slice(0, 10),
      warnings
    )
    billing = result.billing
    unclassifiedServices = result.unclassifiedServices
  } catch (err) {
    warnings.push(
      `Autotask contracts unavailable (${err instanceof Error ? err.message : String(err)}). ` +
        'Every customer will read as unmanaged and per-tier figures will be empty.'
    )
  }

  return {
    entries: [...byId.values()],
    tiers,
    endpoints: await fetchEndpointCounts(datto, warnings),
    billing,
    unclassifiedServices,
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
