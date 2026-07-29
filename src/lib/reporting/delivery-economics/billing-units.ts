// src/lib/reporting/delivery-economics/billing-units.ts
//
// PURE. The billing-unit layer of the Delivery Economics report.
//
// WHY THIS EXISTS
// ---------------
// The first version of this report normalised everything per ENDPOINT. That is
// not how TCT bills. A Complete Care invoice is a set of separate recurring
// lines, each with its own unit type and its own quantity:
//
//   TCT Complete Business    qty 1   x $250.00   (per COMPANY, flat)
//   TCT-Complete-User        qty 15  x $100.00   (per USER)
//   TCT-Complete-Device      qty 20  x  $50.00   (per DEVICE)
//   Remote PC Access         qty 1   x  $15.00   (add-on)
//   Exchange Online (Plan 2) qty 3   x  $10.00   (resold licence, separate)
//
// Users and devices are independent counts — 15 users against 20 devices on
// one customer, 32 users against 28 devices on another. Dividing labour by a
// single endpoint count silently assumes they move together, so cost per unit
// was attributed to the wrong denominator and per-user services (a third to
// half of managed revenue) had no cost basis at all.
//
// So: units come from the contract, revenue comes from the contracted rate,
// and labour is fitted ACROSS the denominators rather than assigned to one.
//
// Two things here are deliberate and easy to "fix" wrongly:
//   1. Rates are read per CONTRACT, never from the service catalogue. The
//      catalogue price is a default that live contracts routinely override
//      (one customer pays $100/user against a $80 catalogue entry, another
//      $33.60). Reporting catalogue rates would misstate revenue on nearly
//      every managed customer.
//   2. ContractServiceUnits holds one row per service PER BILLING PERIOD. The
//      rows must be filtered to the period being reported, never summed — a
//      three-year contract carries ~36 rows per service and summing them
//      reports 36x the real headcount.

import type {
  BilledUnitType,
  BillingUnitLine,
  CompanyBilling,
  CompanyTier,
  DeliveryTier,
  LaborFit,
  RateVariance,
  ServiceCatalogEntry,
  TierUnitMix,
  UnitEconomics,
} from './types'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000

/** The unit types that carry delivery labour — the real cost denominators. */
export const MANAGED_UNIT_TYPES: BilledUnitType[] = ['user', 'device', 'server', 'site', 'business']

/** Everything else on the invoice: resold, passed through, or one-off. */
export const PASSTHROUGH_UNIT_TYPES: BilledUnitType[] = ['license', 'backup', 'addon', 'labor', 'other']

// ---------------------------------------------------------------------------
// Service -> unit type
// ---------------------------------------------------------------------------

// ORDER IS LOAD-BEARING. First match wins, so the traps come first:
//   * "Microsoft 365 BUSINESS Premium" is a resold licence, not the per-company
//     business line. Licences must be tested before /business/.
//   * "TCT-Complete-User-SharedMailbox" contains "User" but is a per-mailbox
//     add-on, not a user seat.
//   * "Email Protection - Business" and "Business Password Manager" are add-ons
//     that happen to contain the word "business".
// Matched against the live Autotask service catalogue (128 active services).
const UNIT_TYPE_PATTERNS: { type: BilledUnitType; rx: RegExp }[] = [
  // Resold licences and subscriptions billed straight through to the customer.
  {
    type: 'license',
    rx: /^(microsoft|office 365|exchange online|google workspace|sharepoint|azure active directory|windows 365)|microsoft entra|microsoft copilot|\[nce\]|\[new commerce experience\]|^duo -/i,
  },
  // Backup products — priced per appliance, per seat or per instance depending
  // on the SKU, so they are reported as their own class rather than guessed at.
  {
    type: 'backup',
    rx: /^backups?\b|datto cloud continuity|saas protection|saas defense|endpoint backup|cyber cloud|azure backup|entra backup/i,
  },
  // Per-mailbox / per-seat add-ons that would otherwise be read as user seats.
  { type: 'addon', rx: /shared\s*mailbox|password manager|email protection/i },
  // Optional extras that must not be counted as managed units. "Remote PC
  // Access" in particular contains "PC" and was read as a billed device — on a
  // real invoice that turned 20 managed devices into 21 and shifted every
  // per-device figure.
  {
    type: 'addon',
    rx: /remote (pc )?access|hardware loaner|website hosting|documentation management|domain renewal|ssl renewal/i,
  },
  // The per-company "cost to play" line, and compliance which is also flat.
  { type: 'business', rx: /\bbusiness\b|\bcompliance\b/i },
  { type: 'server', rx: /\bserver\b/i },
  // Per-site / per-network monitoring.
  { type: 'site', rx: /network monitoring|-network\b|\bunms\b|guest wifi|domain monitoring/i },
  // An Ally admin seat is a named internal-IT seat: a user-shaped unit.
  { type: 'user', rx: /\buser\b|admin[- ]seat/i },
  { type: 'device', rx: /\bdevice\b|\bpc\b|\brmm\b|\bendpoint\b/i },
  { type: 'labor', rx: /\blabor\b|hourly rate|-misc\b/i },
]

/**
 * Classify a service by the unit it is billed against.
 *
 * Returns 'other' rather than guessing when nothing matches — unmatched names
 * are surfaced in the report so the taxonomy can be corrected against reality
 * instead of quietly absorbing a new SKU into the wrong bucket.
 */
export function classifyServiceUnitType(serviceName: string | null | undefined): BilledUnitType {
  const n = (serviceName ?? '').trim()
  if (!n) return 'other'
  for (const { type, rx } of UNIT_TYPE_PATTERNS) if (rx.test(n)) return type
  return 'other'
}

// ---------------------------------------------------------------------------
// Contract lines -> per-company billed unit mix
// ---------------------------------------------------------------------------

/** Does [startDate, endDate] cover the anchor day? */
function coversDate(startDate: string | null | undefined, endDate: string | null | undefined, anchor: string): boolean {
  const s = (startDate ?? '').slice(0, 10)
  const e = (endDate ?? '').slice(0, 10)
  if (!s) return false
  if (s > anchor) return false
  return !e || e >= anchor
}

export interface ContractServiceRow {
  id: number
  contractID: number
  serviceID: number
  unitPrice?: number | null
  unitCost?: number | null
}

export interface ContractServiceUnitRow {
  contractID: number
  contractServiceID?: number | null
  serviceID: number
  units: number
  price?: number | null
  cost?: number | null
  startDate?: string | null
  endDate?: string | null
}

/**
 * Reconstruct the recurring invoice lines per company for ONE billing period.
 *
 * `anchorDate` (YYYY-MM-DD) selects the period: the unit row whose window
 * covers it, else the most recent row that started before it. Falling back to
 * the latest prior period matters because unit rows are written ahead of the
 * period by a scheduled job and a contract can briefly have no current row —
 * treating that as zero units would erase the customer from the report.
 */
export function buildCompanyBilling(input: {
  contracts: { id: number; companyID: number; contractName: string | null }[]
  services: ServiceCatalogEntry[]
  contractServices: ContractServiceRow[]
  contractServiceUnits: ContractServiceUnitRow[]
  tiers: CompanyTier[]
  anchorDate: string
}): { companies: CompanyBilling[]; unclassifiedServices: string[] } {
  const { contracts, services, contractServices, contractServiceUnits, tiers, anchorDate } = input

  const companyOfContract = new Map(contracts.map((c) => [c.id, c.companyID]))
  const contractNameOf = new Map(contracts.map((c) => [c.id, c.contractName ?? '']))
  const serviceById = new Map(services.map((s) => [s.id, s]))
  const tierOf = new Map(tiers.map((t) => [t.companyId, t.tier]))

  // Rate per contract service line, keyed by contract+service.
  const rateOf = new Map<string, { unitPrice: number | null; unitCost: number | null }>()
  const csById = new Map<number, ContractServiceRow>()
  for (const cs of contractServices) {
    csById.set(cs.id, cs)
    rateOf.set(`${cs.contractID}:${cs.serviceID}`, {
      unitPrice: cs.unitPrice ?? null,
      unitCost: cs.unitCost ?? null,
    })
  }

  // Pick ONE unit row per contract+service: the period covering the anchor,
  // else the latest period that started before it.
  const chosen = new Map<string, ContractServiceUnitRow>()
  for (const u of contractServiceUnits) {
    const key = `${u.contractID}:${u.serviceID}`
    const cur = chosen.get(key)
    const covers = coversDate(u.startDate, u.endDate, anchorDate)
    const curCovers = cur ? coversDate(cur.startDate, cur.endDate, anchorDate) : false
    if (covers && !curCovers) {
      chosen.set(key, u)
      continue
    }
    if (covers === curCovers) {
      const s = (u.startDate ?? '').slice(0, 10)
      const cs = (cur?.startDate ?? '').slice(0, 10)
      // Among equally-eligible rows keep the latest that has not started in the
      // future relative to the anchor.
      if (!cur || (s <= anchorDate && s > cs)) chosen.set(key, u)
    }
  }

  const unclassified = new Set<string>()
  const byCompany = new Map<number, CompanyBilling>()

  for (const [key, u] of chosen) {
    const companyId = companyOfContract.get(u.contractID)
    if (companyId == null) continue
    const svc = serviceById.get(u.serviceID)
    const name = svc?.name ?? `Service ${u.serviceID}`
    const unitType = classifyServiceUnitType(name)
    if (unitType === 'other') unclassified.add(name)

    // Contracted rate first; the period rate is the fallback, the catalogue
    // rate the last resort (and flagged, because it is not what is billed).
    const rate = rateOf.get(key)
    const contracted = rate?.unitPrice
    const periodRate = u.price
    const unitPrice = contracted ?? periodRate ?? svc?.unitPrice ?? 0
    const unitCost = rate?.unitCost ?? u.cost ?? svc?.unitCost ?? 0
    const rateSource: BillingUnitLine['rateSource'] =
      contracted != null ? 'contract' : periodRate != null ? 'period' : 'catalog'

    const line: BillingUnitLine = {
      serviceId: u.serviceID,
      serviceName: name,
      unitType,
      units: u.units,
      unitPrice: round2(unitPrice),
      unitCost: round2(unitCost),
      monthlyRevenue: round2(u.units * unitPrice),
      monthlyToolingCost: round2(u.units * unitCost),
      catalogUnitPrice: svc?.unitPrice ?? null,
      rateSource,
      contractName: contractNameOf.get(u.contractID) ?? null,
    }

    const existing = byCompany.get(companyId)
    if (existing) existing.lines.push(line)
    else {
      byCompany.set(companyId, {
        companyId,
        tier: tierOf.get(companyId) ?? 'unmanaged',
        lines: [line],
        units: {} as Record<BilledUnitType, number>,
        revenue: {} as Record<BilledUnitType, number>,
        toolingCost: {} as Record<BilledUnitType, number>,
        managedRevenue: 0,
        passthroughRevenue: 0,
      })
    }
  }

  const companies = [...byCompany.values()].map((c) => {
    const units = {} as Record<BilledUnitType, number>
    const revenue = {} as Record<BilledUnitType, number>
    const toolingCost = {} as Record<BilledUnitType, number>
    for (const t of [...MANAGED_UNIT_TYPES, ...PASSTHROUGH_UNIT_TYPES]) {
      units[t] = 0
      revenue[t] = 0
      toolingCost[t] = 0
    }
    for (const l of c.lines) {
      units[l.unitType] += l.units
      revenue[l.unitType] += l.monthlyRevenue
      toolingCost[l.unitType] += l.monthlyToolingCost
    }
    let managed = 0
    let passthrough = 0
    for (const t of MANAGED_UNIT_TYPES) managed += revenue[t]
    for (const t of PASSTHROUGH_UNIT_TYPES) passthrough += revenue[t]
    for (const t of [...MANAGED_UNIT_TYPES, ...PASSTHROUGH_UNIT_TYPES]) {
      revenue[t] = round2(revenue[t])
      toolingCost[t] = round2(toolingCost[t])
    }
    return {
      ...c,
      units,
      revenue,
      toolingCost,
      managedRevenue: round2(managed),
      passthroughRevenue: round2(passthrough),
    }
  })

  return { companies, unclassifiedServices: [...unclassified].sort() }
}

// ---------------------------------------------------------------------------
// Labour attribution across denominators
// ---------------------------------------------------------------------------

/**
 * Solve a small symmetric normal-equation system by Gauss-Jordan with partial
 * pivoting. Returns null when the system is singular, which is the honest
 * answer for a design matrix with collinear columns (e.g. every customer
 * having exactly as many devices as users).
 */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r
    if (Math.abs(m[piv][col]) < 1e-9) return null
    ;[m[col], m[piv]] = [m[piv], m[col]]
    const d = m[col][col]
    for (let c = col; c <= n; c++) m[col][c] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = m[r][col]
      if (f === 0) continue
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c]
    }
  }
  return m.map((row) => row[n])
}

export interface LaborObservation {
  companyId: number
  /** Delivery hours for this company across the whole window, per month. */
  hoursPerMonth: number
  users: number
  devices: number
  servers: number
  /** Managed recurring revenue per month — the fallback allocation weight. */
  managedRevenue: number
}

const REGRESSION_MIN_OBSERVATIONS = 8

/**
 * Gate on ADJUSTED R², not raw R².
 *
 * With ~10-25 customers and 3-4 parameters, raw R² overfits badly: hours
 * deliberately generated to be independent of customer size still score 0.48-0.62
 * against this design matrix. Adjusted R² charges for each parameter and puts
 * that same synthetic noise at 0.22, which is the answer we want. Reverting this
 * to raw R² would let the report present coincidence as measurement.
 */
const REGRESSION_MIN_ADJ_R2 = 0.35

/**
 * Fit delivery hours to the billed unit counts.
 *
 * Model: hours = perUser*users + perDevice*devices + perServer*servers + fixed
 *
 * Ordinary least squares, then any negative coefficient is dropped and the fit
 * repeated — a negative hours-per-user is arithmetically possible and
 * physically meaningless, and shipping one would produce negative costs.
 *
 * When there is too little data or the fit explains too little variance, this
 * falls back to allocating labour in proportion to each unit type's share of
 * managed revenue, and says so in `method`. That is a weaker claim, so it is
 * labelled rather than dressed up as measurement: with a handful of customers
 * the honest statement is "we allocate it this way", not "we measured it".
 */
export function fitLaborModel(observations: LaborObservation[]): LaborFit {
  const usable = observations.filter((o) => o.hoursPerMonth > 0 && (o.users > 0 || o.devices > 0))
  const warnings: string[] = []

  /**
   * Fallback: one blended hours-per-billed-unit, applied to every unit type.
   *
   * Deliberately flat rather than revenue-weighted. Weighting labour by price
   * would make the expensive line look expensive to deliver purely because it
   * is priced higher — it would launder the pricing assumption back in as if it
   * were a measurement, and the whole point of this report is to test that
   * assumption.
   */
  const unitShareFit = (reason: string): LaborFit => {
    warnings.push(reason)
    let hours = 0
    let totalUnits = 0
    for (const o of usable) {
      hours += o.hoursPerMonth
      totalUnits += o.users + o.devices + o.servers
    }
    const blended = totalUnits > 0 ? round3(hours / totalUnits) : null
    const anyServers = usable.some((o) => o.servers > 0)
    return {
      method: 'unit-share',
      perUserHours: blended,
      perDeviceHours: blended,
      perServerHours: anyServers ? blended : null,
      fixedHoursPerCompany: null,
      r2: null,
      adjustedR2: null,
      observations: usable.length,
      warnings,
    }
  }

  if (usable.length < REGRESSION_MIN_OBSERVATIONS) {
    return unitShareFit(
      `Only ${usable.length} customers had both billed units and logged hours in this window; ` +
        `${REGRESSION_MIN_OBSERVATIONS} are needed to fit hours to unit counts. Labour is allocated by unit share instead — ` +
        'treat per-unit labour as an allocation, not a measurement.'
    )
  }

  const hasServers = usable.some((o) => o.servers > 0)
  // Columns: users, devices, [servers], intercept.
  const cols = (o: LaborObservation) =>
    hasServers ? [o.users, o.devices, o.servers, 1] : [o.users, o.devices, 1]

  let active = hasServers ? [0, 1, 2, 3] : [0, 1, 2]
  let coef: number[] | null = null

  for (let attempt = 0; attempt < 4; attempt++) {
    const k = active.length
    const ata: number[][] = Array.from({ length: k }, () => Array(k).fill(0))
    const atb: number[] = Array(k).fill(0)
    for (const o of usable) {
      const x = cols(o)
      for (let i = 0; i < k; i++) {
        atb[i] += x[active[i]] * o.hoursPerMonth
        for (let j = 0; j < k; j++) ata[i][j] += x[active[i]] * x[active[j]]
      }
    }
    const sol = solve(ata, atb)
    if (!sol) {
      return unitShareFit(
        'Billed unit counts are collinear across customers, so hours cannot be attributed between them by fitting. ' +
          'Labour is allocated by unit share instead.'
      )
    }
    // Keep the intercept free to go negative-free too: a negative fixed term
    // would hand back "serving a customer saves time", which is nonsense.
    const worst = sol.reduce((wi, v, i) => (v < sol[wi] ? i : wi), 0)
    if (sol[worst] < 0 && active.length > 1) {
      active = active.filter((_, i) => i !== worst)
      continue
    }
    coef = sol
    break
  }

  if (!coef) {
    return unitShareFit('Every fitted labour coefficient came out negative. Labour is allocated by unit share instead.')
  }

  // Clamp at zero rather than trusting the drop loop to have removed every
  // negative term: with a single surviving column the loop keeps it, and a
  // negative coefficient here would emerge downstream as a negative cost.
  const byIndex = new Map(active.map((colIdx, i) => [colIdx, Math.max(0, coef![i])]))
  const perUser = byIndex.get(0) ?? 0
  const perDevice = byIndex.get(1) ?? 0
  const perServer = hasServers ? (byIndex.get(2) ?? 0) : 0
  const fixed = byIndex.get(hasServers ? 3 : 2) ?? 0

  const meanHours = usable.reduce((s, o) => s + o.hoursPerMonth, 0) / usable.length
  let ssRes = 0
  let ssTot = 0
  for (const o of usable) {
    const pred = perUser * o.users + perDevice * o.devices + perServer * o.servers + fixed
    ssRes += (o.hoursPerMonth - pred) ** 2
    ssTot += (o.hoursPerMonth - meanHours) ** 2
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0
  const params = active.length
  const dof = usable.length - params
  const adjR2 = dof > 0 && ssTot > 0 ? Math.max(0, 1 - (1 - r2) * ((usable.length - 1) / dof)) : 0

  if (adjR2 < REGRESSION_MIN_ADJ_R2) {
    return unitShareFit(
      `Unit counts explain only ${Math.round(adjR2 * 100)}% of the variance in delivery hours once the ${params} fitted ` +
        `parameters are charged for (n=${usable.length}; unadjusted ${Math.round(r2 * 100)}%), below the threshold to ` +
        'report them as measured. Labour is allocated evenly per billed unit instead. Low explanatory power is itself a ' +
        'finding: hours are driven more by what each customer is doing than by how many units they carry.'
    )
  }

  if (usable.length < 15) {
    warnings.push(
      `Fitted on ${usable.length} customers. The coefficients are directionally useful but a single large customer ` +
        'can move them materially — re-read them as the base grows.'
    )
  }
  if (!hasServers) {
    warnings.push('No customer had billed server units in this window, so per-server labour is not measured.')
  }

  return {
    method: 'regression',
    perUserHours: round3(perUser),
    perDeviceHours: round3(perDevice),
    perServerHours: hasServers ? round3(perServer) : null,
    fixedHoursPerCompany: round3(fixed),
    r2: Math.round(r2 * 1000) / 1000,
    adjustedR2: Math.round(adjR2 * 1000) / 1000,
    observations: usable.length,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Unit economics
// ---------------------------------------------------------------------------

/**
 * Revenue, tooling cost, allocated labour and CONTRIBUTION per billed unit.
 *
 * Contribution, never absorption: the fixed pool is reported separately rather
 * than spread over units, because a fully-absorbed per-unit cost falls as the
 * customer base grows and would price the same deal unprofitable today and
 * profitable next quarter.
 *
 * The per-company fixed hours from the fit are attributed to the BUSINESS unit
 * (the per-company line exists to cover exactly that), which is why a business
 * line can show a loss while the customer overall is profitable.
 */
export function computeUnitEconomics(
  companies: CompanyBilling[],
  fit: LaborFit,
  deliveryCostPerHour: number
): UnitEconomics[] {
  const companyCount = companies.filter((c) => c.tier !== 'unmanaged').length

  const laborHoursPerUnit: Partial<Record<BilledUnitType, number | null>> = {
    user: fit.perUserHours,
    device: fit.perDeviceHours,
    server: fit.perServerHours,
    site: null,
    business: fit.fixedHoursPerCompany,
  }

  const out: UnitEconomics[] = []
  for (const unitType of MANAGED_UNIT_TYPES) {
    let units = 0
    let revenue = 0
    let toolingCost = 0
    for (const c of companies) {
      units += c.units[unitType] ?? 0
      revenue += c.revenue[unitType] ?? 0
      toolingCost += c.toolingCost[unitType] ?? 0
    }
    if (units === 0 && revenue === 0) continue

    // The business line is billed once per company, so its labour denominator
    // is companies rather than units — they are usually equal, but not when a
    // customer carries two business lines.
    const hoursPerUnit = laborHoursPerUnit[unitType] ?? null
    const totalLaborHours =
      hoursPerUnit == null ? null : hoursPerUnit * (unitType === 'business' ? companyCount : units)
    const laborCost = totalLaborHours == null ? null : totalLaborHours * deliveryCostPerHour

    const revenuePerUnit = units > 0 ? revenue / units : null
    const toolingPerUnit = units > 0 ? toolingCost / units : null
    const laborPerUnit = laborCost != null && units > 0 ? laborCost / units : null
    const contribution =
      laborCost == null ? null : revenue - toolingCost - laborCost

    out.push({
      unitType,
      unitsBilled: units,
      companies: companyCount,
      monthlyRevenue: round2(revenue),
      monthlyToolingCost: round2(toolingCost),
      monthlyLaborCost: laborCost == null ? null : round2(laborCost),
      laborHoursPerUnit: hoursPerUnit == null ? null : round3(hoursPerUnit),
      revenuePerUnit: revenuePerUnit == null ? null : round2(revenuePerUnit),
      toolingCostPerUnit: toolingPerUnit == null ? null : round2(toolingPerUnit),
      laborCostPerUnit: laborPerUnit == null ? null : round2(laborPerUnit),
      contributionPerUnit:
        contribution == null || units === 0 ? null : round2(contribution / units),
      monthlyContribution: contribution == null ? null : round2(contribution),
      contributionMarginPct:
        contribution == null || revenue <= 0 ? null : Math.round((contribution / revenue) * 1000) / 10,
    })
  }
  return out
}

/** Billed unit mix and revenue split per tier — the "what are we actually selling" view. */
export function computeTierUnitMix(companies: CompanyBilling[]): TierUnitMix[] {
  const byTier = new Map<DeliveryTier | 'unmanaged', CompanyBilling[]>()
  for (const c of companies) {
    const list = byTier.get(c.tier) ?? []
    list.push(c)
    byTier.set(c.tier, list)
  }
  const order: (DeliveryTier | 'unmanaged')[] = ['basic', 'standard', 'comprehensive', 'complete', 'comanaged', 'unmanaged']
  return order
    .filter((t) => byTier.has(t))
    .map((tier) => {
      const list = byTier.get(tier)!
      const units = {} as Record<BilledUnitType, number>
      const revenue = {} as Record<BilledUnitType, number>
      for (const t of [...MANAGED_UNIT_TYPES, ...PASSTHROUGH_UNIT_TYPES]) {
        units[t] = 0
        revenue[t] = 0
      }
      let managed = 0
      let passthrough = 0
      for (const c of list) {
        for (const t of [...MANAGED_UNIT_TYPES, ...PASSTHROUGH_UNIT_TYPES]) {
          units[t] += c.units[t] ?? 0
          revenue[t] = round2(revenue[t] + (c.revenue[t] ?? 0))
        }
        managed += c.managedRevenue
        passthrough += c.passthroughRevenue
      }
      return {
        tier,
        companies: list.length,
        units,
        revenue,
        managedRevenue: round2(managed),
        passthroughRevenue: round2(passthrough),
      }
    })
}

/**
 * Contracts billing below the service catalogue rate.
 *
 * Not a defect list — a discount ledger. The catalogue rate is the current list
 * price and older contracts were signed against older ones, so a gap is
 * expected; it is the SIZE of the gap that is worth seeing, because it is
 * invisible on any individual invoice.
 */
export function computeRateVariance(companies: CompanyBilling[], minGapPct = 5): RateVariance[] {
  const rows: RateVariance[] = []
  for (const c of companies) {
    for (const l of c.lines) {
      const cat = l.catalogUnitPrice
      if (cat == null || cat <= 0 || l.rateSource === 'catalog') continue
      if (!MANAGED_UNIT_TYPES.includes(l.unitType)) continue
      const gapPct = ((l.unitPrice - cat) / cat) * 100
      if (Math.abs(gapPct) < minGapPct) continue
      rows.push({
        companyId: c.companyId,
        tier: c.tier,
        serviceName: l.serviceName,
        unitType: l.unitType,
        units: l.units,
        contractedUnitPrice: l.unitPrice,
        catalogUnitPrice: cat,
        gapPct: Math.round(gapPct * 10) / 10,
        monthlyGap: round2((l.unitPrice - cat) * l.units),
      })
    }
  }
  return rows.sort((a, b) => a.monthlyGap - b.monthlyGap)
}
