// src/lib/reporting/delivery-economics/analyzer.ts
//
// PURE analysis for the Delivery Economics report. No I/O, no clock reads
// beyond what callers pass in — every function here is a function of its
// arguments, so the whole report can be exercised from fixtures.
//
// Conventions that matter and are easy to get wrong:
//   * companyID === 0 means INTERNAL work (no customer). Autotask uses 0
//     rather than null, so a falsy check is correct here but a `== null`
//     check is not.
//   * An endpoint is a Datto RMM managed device, which INCLUDES servers.
//     Hours-per-endpoint must be divided by the same population it was
//     measured against or the figure silently inflates.
//   * A tier with no customers yields `null` hours-per-endpoint and
//     `measured: false`. Never a zero — a fabricated zero reads as "this tier
//     is free to deliver", which is the opposite of unknown.

import {
  computeRateVariance,
  computeTierUnitMix,
  computeUnitEconomics,
  fitLaborModel,
  type LaborObservation,
} from './billing-units'
import type {
  BillingCapture,
  CapacityMember,
  CapacitySummary,
  CompanyBilling,
  DataSourceStatus,
  CompanyTier,
  DeliveryEconomicsReport,
  DeliveryTier,
  DeliveryTimeEntry,
  EndpointCount,
  MonthlyPoint,
  NonBillableBreakdown,
  NonBillableSizeBand,
  ResourceAllocation,
  TierEconomics,
  TierOrUnmanaged,
  WorkNature,
} from './types'

export const DELIVERY_TIERS: DeliveryTier[] = ['basic', 'standard', 'comprehensive', 'complete', 'comanaged']

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0)

export const isInternal = (e: DeliveryTimeEntry) => !e.companyID

/**
 * Map an Autotask contract name to a service tier.
 *
 * Name-based because the contract CATEGORY is not reliable on this instance:
 * "Managed Service - Gold" covers both Standard and Comprehensive contracts,
 * and some managed contracts carry no category at all. The internal codenames
 * are matched too — "Bastion" is Comprehensive and "Fortress" is Complete, and
 * live contracts use both.
 */
export function tierFromContractName(name: string | null | undefined): DeliveryTier | null {
  if (!name) return null
  const n = name.toLowerCase()
  if (n.includes('complete') || n.includes('fortress')) return 'complete'
  if (n.includes('comprehensive') || n.includes('bastion')) return 'comprehensive'
  if (n.includes('ally') || n.includes('co-managed') || n.includes('comanaged')) return 'comanaged'
  if (n.includes('standard') && n.includes('care')) return 'standard'
  if (n.includes('watchtower')) return 'basic'
  if (n.includes('basic') && n.includes('care')) return 'basic'
  return null
}

/**
 * Richest tier wins when a company holds several managed contracts. A customer
 * with both "Complete Care" and a "Microsoft Licenses" contract is a Complete
 * Care customer; picking the first match would misclassify them.
 */
const TIER_RANK: Record<DeliveryTier, number> = { basic: 1, standard: 2, comanaged: 3, comprehensive: 4, complete: 5 }

export function resolveCompanyTiers(
  contracts: { companyID: number; contractName: string | null; statusName?: string | null }[]
): CompanyTier[] {
  const best = new Map<number, { tier: DeliveryTier; name: string }>()
  for (const c of contracts) {
    if (c.statusName && c.statusName.toLowerCase() !== 'active') continue
    const tier = tierFromContractName(c.contractName)
    if (!tier) continue
    const cur = best.get(c.companyID)
    if (!cur || TIER_RANK[tier] > TIER_RANK[cur.tier]) {
      best.set(c.companyID, { tier, name: c.contractName ?? '' })
    }
  }
  return [...best.entries()].map(([companyId, v]) => ({
    companyId,
    tier: v.tier,
    sourceContractName: v.name,
  }))
}

// ---------------------------------------------------------------------------
// Allocation and capacity
// ---------------------------------------------------------------------------

export function computeAllocation(
  entries: DeliveryTimeEntry[],
  months: number,
  capacity: CapacityMember[]
): ResourceAllocation[] {
  const capByName = new Map(capacity.map((c) => [c.resourceName, c.monthlyCapacityHours]))
  const agg = new Map<string, { cust: number; int: number }>()
  for (const e of entries) {
    const cur = agg.get(e.resourceName) ?? { cust: 0, int: 0 }
    if (isInternal(e)) cur.int += e.hoursWorked
    else cur.cust += e.hoursWorked
    agg.set(e.resourceName, cur)
  }
  const m = months > 0 ? months : 1
  return [...agg.entries()]
    .map(([resourceName, v]) => {
      const total = v.cust + v.int
      const capHours = capByName.get(resourceName) ?? null
      const monthlyTotal = total / m
      return {
        resourceName,
        totalHours: round2(total),
        customerHours: round2(v.cust),
        internalHours: round2(v.int),
        internalSharePct: pct(v.int, total),
        capacityHours: capHours,
        utilisationPct: capHours && capHours > 0 ? pct(monthlyTotal, capHours) : null,
      }
    })
    .sort((a, b) => b.totalHours - a.totalHours)
}

/**
 * Capacity from the SCALABLE delivery roster only. The owner's own delivery
 * hours are real work but are not capacity you can sell into, and a fixed-fee
 * adviser carries no hours at all — counting either would invent headroom that
 * does not exist.
 */
export function computeCapacity(
  entries: DeliveryTimeEntry[],
  months: number,
  capacity: CapacityMember[]
): CapacitySummary {
  const m = months > 0 ? months : 1
  const roster = new Set(capacity.map((c) => c.resourceName))
  const scalable = capacity.reduce((s, c) => s + c.monthlyCapacityHours, 0)

  let cust = 0
  let internal = 0
  for (const e of entries) {
    if (!roster.has(e.resourceName)) continue
    if (isInternal(e)) internal += e.hoursWorked
    else cust += e.hoursWorked
  }
  const customerPerMonth = cust / m
  const internalPerMonth = internal / m
  const idle = Math.max(0, scalable - customerPerMonth - internalPerMonth)
  return {
    scalableHoursPerMonth: round2(scalable),
    customerHoursPerMonth: round2(customerPerMonth),
    internalHoursPerMonth: round2(internalPerMonth),
    idleHoursPerMonth: round2(idle),
    redeployableHoursPerMonth: round2(idle + internalPerMonth),
    utilisationPct: pct(customerPerMonth + internalPerMonth, scalable),
  }
}

/** Month-by-month customer vs internal split — this is where the trend lives. */
export function computeMonthly(entries: DeliveryTimeEntry[]): MonthlyPoint[] {
  const byMonth = new Map<string, { cust: number; int: number }>()
  for (const e of entries) {
    const month = (e.dateWorked || '').slice(0, 7)
    if (!month) continue
    const cur = byMonth.get(month) ?? { cust: 0, int: 0 }
    if (isInternal(e)) cur.int += e.hoursWorked
    else cur.cust += e.hoursWorked
    byMonth.set(month, cur)
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      customerHours: round2(v.cust),
      internalHours: round2(v.int),
      internalSharePct: pct(v.int, v.cust + v.int),
    }))
}

// ---------------------------------------------------------------------------
// Per-tier economics
// ---------------------------------------------------------------------------

export function computeTierEconomics(
  entries: DeliveryTimeEntry[],
  months: number,
  tiers: CompanyTier[],
  endpoints: EndpointCount[]
): TierEconomics[] {
  const m = months > 0 ? months : 1
  const tierOf = new Map(tiers.map((t) => [t.companyId, t.tier]))
  const epOf = new Map(endpoints.map((e) => [e.companyId, e.endpoints]))

  const hoursByCompany = new Map<number, number>()
  for (const e of entries) {
    if (isInternal(e)) continue
    hoursByCompany.set(e.companyID, (hoursByCompany.get(e.companyID) ?? 0) + e.hoursWorked)
  }

  return DELIVERY_TIERS.map((tier) => {
    let companies = 0
    let eps = 0
    let hours = 0
    for (const [companyId, h] of hoursByCompany) {
      if (tierOf.get(companyId) !== tier) continue
      const ep = epOf.get(companyId) ?? 0
      // A company with no endpoints cannot contribute to a per-endpoint rate.
      if (ep <= 0) continue
      companies += 1
      eps += ep
      hours += h
    }
    const perMonth = hours / m
    return {
      tier,
      companies,
      endpoints: eps,
      hoursPerMonth: round2(perMonth),
      hoursPerEndpointPerMonth: eps > 0 ? Math.round((perMonth / eps) * 1000) / 1000 : null,
      measured: eps > 0 && companies > 0,
    }
  })
}

/**
 * Per-company delivery hours per month, paired with billed unit counts — the
 * observations the labour fit runs on.
 *
 * Only companies with billed units are included. A company with hours but no
 * contract service lines cannot inform how hours split between users and
 * devices, and feeding it in as zero-units would drag the fixed term upward.
 */
export function buildLaborObservations(
  entries: DeliveryTimeEntry[],
  months: number,
  billing: CompanyBilling[]
): LaborObservation[] {
  const m = months > 0 ? months : 1
  const hoursByCompany = new Map<number, number>()
  for (const e of entries) {
    if (isInternal(e)) continue
    hoursByCompany.set(e.companyID, (hoursByCompany.get(e.companyID) ?? 0) + e.hoursWorked)
  }
  return billing
    .filter((b) => b.tier !== 'unmanaged')
    .map((b) => ({
      companyId: b.companyId,
      hoursPerMonth: round2((hoursByCompany.get(b.companyId) ?? 0) / m),
      users: b.units.user ?? 0,
      devices: b.units.device ?? 0,
      servers: b.units.server ?? 0,
      managedRevenue: b.managedRevenue,
    }))
}

// ---------------------------------------------------------------------------
// Billing capture
// ---------------------------------------------------------------------------

/**
 * Invoiced vs written-off, by tier. Uses `billingStatus` (derived from
 * BillingItems) when present, because the `billable` boolean records intent at
 * entry time and not what was actually invoiced. Falls back to the boolean
 * when the caller could not resolve billing status.
 */
export function computeBillingCapture(entries: DeliveryTimeEntry[], tiers: CompanyTier[]): BillingCapture[] {
  const tierOf = new Map(tiers.map((t) => [t.companyId, t.tier]))
  const agg = new Map<TierOrUnmanaged, { inv: number; non: number; unp: number }>()

  for (const e of entries) {
    if (isInternal(e)) continue
    const key: TierOrUnmanaged = tierOf.get(e.companyID) ?? 'unmanaged'
    const cur = agg.get(key) ?? { inv: 0, non: 0, unp: 0 }
    const status = e.billingStatus ?? (e.billable ? 'approved_not_invoiced' : 'non_billable')
    if (status === 'invoiced') cur.inv += e.hoursWorked
    else if (status === 'non_billable') cur.non += e.hoursWorked
    else cur.unp += e.hoursWorked
    agg.set(key, cur)
  }

  const order: TierOrUnmanaged[] = [...DELIVERY_TIERS, 'unmanaged']
  return order
    .filter((k) => agg.has(k))
    .map((tier) => {
      const v = agg.get(tier)!
      const total = v.inv + v.non + v.unp
      return {
        tier,
        invoicedHours: round2(v.inv),
        nonBillableHours: round2(v.non),
        unpostedHours: round2(v.unp),
        totalHours: round2(total),
        invoicedPct: total > 0 ? pct(v.inv, total) : null,
      }
    })
}

// ---------------------------------------------------------------------------
// What the written-off work actually is
// ---------------------------------------------------------------------------

// Ordered: the first match wins, so the most specific patterns come first.
// Proactive notification is checked before anything else because the outreach
// template mentions the very words ("security", "Windows machines") that the
// other patterns look for.
const NATURE_PATTERNS: { nature: WorkNature; rx: RegExp }[] = [
  { nature: 'proactive-notification', rx: /dated security item|expiring the 2011|secure boot|we found this|recommend(ed)? remediation/i },
  { nature: 'project-implementation', rx: /\bproject\b|implementation|on-?site|access point|scope of work|deployment plan|migration/i },
  { nature: 'backup-alert', rx: /backup/i },
  { nature: 'rmm-hardware-alert', rx: /\bsmart\b|disk health|storage alert|datto rmm generated|hardware alert/i },
  { nature: 'security-detection', rx: /trojan|malware|ransomware|detection:|threat detected|quarantin/i },
]

export function classifyWorkNature(summaryNotes: string | null | undefined): WorkNature {
  const s = summaryNotes ?? ''
  if (!s.trim()) return 'unclassified'
  for (const { nature, rx } of NATURE_PATTERNS) if (rx.test(s)) return nature
  return 'unclassified'
}

const PROJECT_SIZED_HOURS = 2

/**
 * Non-billable CUSTOMER time, grouped by what it was. The split that matters:
 * proactive monitoring and alert response is work TCT initiated and is
 * correctly unbilled, while project-sized entries are delivery labour that was
 * written off. Lumping the two together overstates recoverable revenue by an
 * order of magnitude.
 */
export function computeNonBillableBreakdown(entries: DeliveryTimeEntry[]): NonBillableBreakdown[] {
  const agg = new Map<WorkNature, { hours: number; entries: number; project: number }>()
  for (const e of entries) {
    if (isInternal(e)) continue
    const status = e.billingStatus ?? (e.billable ? 'approved_not_invoiced' : 'non_billable')
    if (status !== 'non_billable') continue
    const nature = classifyWorkNature(e.summaryNotes)
    const cur = agg.get(nature) ?? { hours: 0, entries: 0, project: 0 }
    cur.hours += e.hoursWorked
    cur.entries += 1
    if (e.hoursWorked >= PROJECT_SIZED_HOURS) cur.project += e.hoursWorked
    agg.set(nature, cur)
  }
  return [...agg.entries()]
    .map(([nature, v]) => ({
      nature,
      hours: round2(v.hours),
      entries: v.entries,
      projectSizedHours: round2(v.project),
    }))
    .sort((a, b) => b.hours - a.hours)
}

/**
 * Size distribution of non-billable customer entries. Entry size is the
 * cheapest reliable signal of what work is: alert response arrives in
 * sub-30-minute increments, project labour does not.
 */
export function computeNonBillableSizeBands(entries: DeliveryTimeEntry[]): NonBillableSizeBand[] {
  const bands: NonBillableSizeBand[] = [
    { band: 'under-30-min', entries: 0, hours: 0 },
    { band: '30-min-to-2-h', entries: 0, hours: 0 },
    { band: 'over-2-h', entries: 0, hours: 0 },
  ]
  for (const e of entries) {
    if (isInternal(e)) continue
    const status = e.billingStatus ?? (e.billable ? 'approved_not_invoiced' : 'non_billable')
    if (status !== 'non_billable') continue
    const i = e.hoursWorked < 0.5 ? 0 : e.hoursWorked < PROJECT_SIZED_HOURS ? 1 : 2
    bands[i].entries += 1
    bands[i].hours += e.hoursWorked
  }
  return bands.map((b) => ({ ...b, hours: round2(b.hours) }))
}

// ---------------------------------------------------------------------------
// Data-quality signals
// ---------------------------------------------------------------------------

/** Time entries with no ticket — invisible to any ticket-based report. */
export function computeHoursWithNoTicket(entries: DeliveryTimeEntry[]): number {
  return round2(entries.filter((e) => !e.ticketID).reduce((s, e) => s + e.hoursWorked, 0))
}

/**
 * Internal-bucket entries whose text names an outside party, i.e. customer
 * work logged without a company. Deliberately conservative — it looks for a
 * caller/requester phrasing rather than any proper noun, so it under-reports
 * rather than accusing.
 */
const MISFILED_RX = /\b(?:call|called|emailed|reached out|requested|reported)\b[^.]{0,60}\bfrom\b|\bfrom\s+[A-Z][a-z]+\s+of\s+[A-Z]/

export function computeSuspectedMisfiledHours(entries: DeliveryTimeEntry[]): number {
  return round2(
    entries
      .filter((e) => isInternal(e) && MISFILED_RX.test(e.summaryNotes ?? ''))
      .reduce((s, e) => s + e.hoursWorked, 0)
  )
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function buildDeliveryEconomicsReport(input: {
  entries: DeliveryTimeEntry[]
  tiers: CompanyTier[]
  endpoints: EndpointCount[]
  capacity: CapacityMember[]
  window: { from: string; to: string; months: number }
  excludedResources?: string[]
  generatedAt: string
  /** Billed unit mix per company. Omit when contract lines are unavailable. */
  billing?: CompanyBilling[]
  unclassifiedServices?: string[]
  /** Per-upstream fetch outcomes, so a failed read never reads as a zero. */
  dataSources?: DataSourceStatus[]
  /** Blended loaded cost of a delivery hour. */
  deliveryCostPerHour: number
}): DeliveryEconomicsReport {
  const { entries, tiers, endpoints, capacity, window, generatedAt, deliveryCostPerHour } = input
  const excluded = new Set(input.excludedResources ?? [])
  const kept = excluded.size ? entries.filter((e) => !excluded.has(e.resourceName)) : entries

  const monthly = computeMonthly(kept)
  const notes: string[] = []

  // --- Billed-unit economics -------------------------------------------------
  const billing = input.billing ?? []
  let unitEconomics: DeliveryEconomicsReport['unitEconomics'] = []
  let tierUnitMix: DeliveryEconomicsReport['tierUnitMix'] = []
  let laborFit: DeliveryEconomicsReport['laborFit'] = null
  let rateVariance: DeliveryEconomicsReport['rateVariance'] = []
  let managedRevenue = 0
  let passthroughRevenue = 0

  if (billing.length) {
    laborFit = fitLaborModel(buildLaborObservations(kept, window.months, billing))
    unitEconomics = computeUnitEconomics(billing, laborFit, deliveryCostPerHour)
    tierUnitMix = computeTierUnitMix(billing)
    rateVariance = computeRateVariance(billing)
    for (const b of billing) {
      managedRevenue += b.managedRevenue
      passthroughRevenue += b.passthroughRevenue
    }
    notes.push(
      'Cost to serve is measured against the units TCT actually bills — users, devices, servers, sites and the ' +
        'per-company line — not against endpoints. Users and devices move independently (one Complete customer bills ' +
        '15 users against 20 devices, another 32 against 28), so a single endpoint denominator attributes cost to the ' +
        'wrong line.'
    )
    if (laborFit.method === 'unit-share') {
      notes.push(
        'Per-unit labour here is an ALLOCATION, not a measurement — see the labour-model note for why the fit was ' +
          'rejected. Unit revenue and tooling cost are still measured from the contracts.'
      )
    }
    for (const w of laborFit.warnings) notes.push(w)
    if (input.unclassifiedServices?.length) {
      notes.push(
        `${input.unclassifiedServices.length} billed service(s) could not be matched to a billing unit and are counted ` +
          `as "other" rather than guessed at: ${input.unclassifiedServices.slice(0, 12).join(', ')}` +
          `${input.unclassifiedServices.length > 12 ? ', …' : ''}.`
      )
    }
  } else {
    notes.push(
      'Contract service lines were unavailable, so per-billed-unit economics are not shown. The endpoint figures below ' +
        'are a coverage measure only — they are not cost to serve.'
    )
  }

  const unmeasured = computeTierEconomics(kept, window.months, tiers, endpoints).filter((t) => !t.measured)
  if (unmeasured.length) {
    notes.push(
      `No customers on ${unmeasured.map((t) => t.tier).join(', ')} in this window — hours per endpoint is null, not zero. ` +
        'The sales calculator proxies those tiers from the nearest measured one.'
    )
  }
  if (monthly.length >= 2) {
    const first = monthly[0]
    const last = monthly[monthly.length - 1]
    const dir = last.internalSharePct < first.internalSharePct ? 'fallen' : 'risen'
    notes.push(
      `Internal-work share has ${dir} from ${first.internalSharePct}% (${first.month}) to ${last.internalSharePct}% (${last.month}). ` +
        'Internal hours are the growth runway — track this rather than any single reading.'
    )
  }
  notes.push(
    'Endpoints come from Datto RMM and include servers plus any stale devices. Endpoint counts measure RMM COVERAGE, ' +
      'not the billing base — a device under management is not necessarily a billed device unit.'
  )

  return {
    generatedAt,
    window,
    timeEntriesAnalysed: kept.length,
    excludedResources: [...excluded],
    capacity: computeCapacity(kept, window.months, capacity),
    allocation: computeAllocation(kept, window.months, capacity),
    monthly,
    tiers: computeTierEconomics(kept, window.months, tiers, endpoints),
    billingCapture: computeBillingCapture(kept, tiers),
    nonBillable: computeNonBillableBreakdown(kept),
    nonBillableSizeBands: computeNonBillableSizeBands(kept),
    unitEconomics,
    tierUnitMix,
    laborFit,
    rateVariance,
    dataSources: input.dataSources ?? [],
    unclassifiedServices: input.unclassifiedServices ?? [],
    managedRevenuePerMonth: round2(managedRevenue),
    passthroughRevenuePerMonth: round2(passthroughRevenue),
    hoursWithNoTicket: computeHoursWithNoTicket(kept),
    suspectedMisfiledCustomerHours: computeSuspectedMisfiledHours(kept),
    notes,
  }
}
