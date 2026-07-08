/**
 * New-hire break-even calculator — fully-loaded cost and required revenue for
 * US W-2 employees vs. US 1099 contractors vs. Philippines contractors, three
 * tiers each. Ported 1:1 from the owner's "TCT New Hire Breakeven Calculator"
 * workbook (July 2026): NY employer taxes with wage-base caps (FUTA, SUTA+RSF,
 * Medicare, Social Security), workers' comp class 5191, itemized per-seat
 * tooling / equipment / onboarding detail, 13th-month + Gusto/Wise fees for PH,
 * billable-hour math, and required billing rate / revenue at a target margin.
 *
 * Cost applicability mirrors the workbook (blank column = not applicable):
 *  - Employer taxes, workers' comp, health, equipment, onboarding → US W-2 only
 *  - 13th-month accrual, payment processing fee, paid holidays → PH only
 *  - Per-seat tooling → all three hire types
 *
 * Pure functions + editable defaults. All money in cents, all rates as plain
 * percentages (6.2 = 6.2%).
 */

export type HireType = 'usW2' | 'us1099' | 'ph'

export interface HireTierInputs {
  label: string
  hourlyRateCents: number
  hoursPerDay: number            // paid hours/yr = hoursPerDay × 5 days × 52 wks
  ptoHoursPerYear: number        // reduces billable availability
  holidayHoursPerYear: number    // paid regular holidays (PH: 10 days × 8h)
}

export interface UsW2Policy {
  futaRatePct: number            // employer FUTA (0.6%)
  futaWageBaseCents: number      // $7,000 annual cap
  sutaRatePct: number            // NY UI (confirmed 2026)
  rsfRatePct: number             // NY Re-employment Services Fund
  sutaWageBaseCents: number      // NY 2026 combined SUTA/RSF wage base
  medicareRatePct: number        // employer Medicare, uncapped
  socialSecurityRatePct: number
  socialSecurityWageBaseCents: number
  workersCompRatePct: number     // class 5191 Install/Repair Techs ($1.22/$100)
  healthMonthlyCents: number     // PPO employer share (estimate — not offered today)
  includeHealth: boolean
}

export interface PhPolicy {
  thirteenthMonthPct: number     // accrual on base pay (1/12 ≈ 8.33%)
  paymentFeeMonthlyCents: number // Gusto/Wise: $12/user + $5/txn
}

export interface CostItem { label: string; cents: number }

export interface SharedCosts {
  toolingItems: CostItem[]       // monthly per-seat software (all hire types)
  equipmentItems: CostItem[]     // one-time hardware (US W-2 only)
  equipmentLifeYears: number     // straight-line amortization
  onboardingItems: CostItem[]    // one-time recruiting/onboarding (US W-2, month 1)
}

export interface HiringAssumptions {
  version: 2
  usW2: { tiers: HireTierInputs[]; policy: UsW2Policy }
  us1099: { tiers: HireTierInputs[] }
  ph: { tiers: HireTierInputs[]; policy: PhPolicy }
  shared: SharedCosts
  targetGrossMarginPct: number   // gross margin target on labor
}

export interface CostLine { label: string; monthlyCents: number }

export interface HireTierResult {
  label: string
  hourlyRateCents: number
  paidHoursPerYear: number
  baseMonthlyCents: number
  lines: CostLine[]                    // burden lines on top of base pay
  totalMonthlyCents: number            // fully-loaded steady-state monthly cost
  billableHoursPerMonth: number        // (paid − PTO − holidays) / 12
  costPerBillableHourCents: number
  burdenMultiple: number               // loaded / base
  onboardingCents: number              // one-time (0 unless US W-2)
  month1TotalCents: number             // monthly + one-time onboarding
  requiredBillingRateCents: number     // per billable hour at target margin
  requiredMonthlyRevenueCents: number
  referenceRevenue: { marginPct: number; monthlyCents: number }[]
  yearlyTotalCents: number
  year1TotalCents: number              // yearly + one-time onboarding
  requiredAnnualRevenueCents: number
}

export interface HiringResults { usW2: HireTierResult[]; us1099: HireTierResult[]; ph: HireTierResult[] }

// ── Defaults from the break-even workbook + cost-of-hire Q&A (July 2026) ────
export const DEFAULT_ASSUMPTIONS: HiringAssumptions = {
  version: 2,
  usW2: {
    tiers: [
      { label: 'Tier 1 (Entry Level)', hourlyRateCents: 2500, hoursPerDay: 8, ptoHoursPerYear: 80, holidayHoursPerYear: 0 },
      { label: 'Tier 2 (Intermediate)', hourlyRateCents: 3000, hoursPerDay: 8, ptoHoursPerYear: 80, holidayHoursPerYear: 0 },
      { label: 'Tier 3 (High Skilled)', hourlyRateCents: 4000, hoursPerDay: 8, ptoHoursPerYear: 80, holidayHoursPerYear: 0 },
    ],
    policy: {
      futaRatePct: 0.6,
      futaWageBaseCents: 700_000,
      sutaRatePct: 1.625,
      rsfRatePct: 0.075,
      sutaWageBaseCents: 1_760_000,
      medicareRatePct: 1.45,
      socialSecurityRatePct: 6.2,
      socialSecurityWageBaseCents: 18_450_000,
      workersCompRatePct: 1.22,
      healthMonthlyCents: 60_000,
      includeHealth: true,
    },
  },
  us1099: {
    tiers: [
      { label: 'Tier 1 (Entry Level)', hourlyRateCents: 2500, hoursPerDay: 8, ptoHoursPerYear: 80, holidayHoursPerYear: 0 },
      { label: 'Tier 2 (Intermediate)', hourlyRateCents: 3000, hoursPerDay: 8, ptoHoursPerYear: 80, holidayHoursPerYear: 0 },
      { label: 'Tier 3 (High Skilled)', hourlyRateCents: 4000, hoursPerDay: 8, ptoHoursPerYear: 80, holidayHoursPerYear: 0 },
    ],
  },
  ph: {
    tiers: [
      { label: 'Tier 1 (Ben)', hourlyRateCents: 600, hoursPerDay: 8, ptoHoursPerYear: 80, holidayHoursPerYear: 80 },
      { label: 'Tier 2 (Rio)', hourlyRateCents: 800, hoursPerDay: 8, ptoHoursPerYear: 80, holidayHoursPerYear: 80 },
      { label: 'Tier 3 (Ghenel)', hourlyRateCents: 1000, hoursPerDay: 4, ptoHoursPerYear: 0, holidayHoursPerYear: 0 },
    ],
    policy: { thirteenthMonthPct: 8.33, paymentFeeMonthlyCents: 2200 },
  },
  shared: {
    toolingItems: [
      { label: 'Kaseya (RMM/PSA)', cents: 11_900 },
      { label: 'RingCentral (phone)', cents: 3_500 },
      { label: 'Microsoft 365 (via Pax8)', cents: 2_323 },
      { label: 'Domotz', cents: 150 },
      { label: 'ITGlue (Manage 360)', cents: 4_000 },
    ],
    equipmentItems: [
      { label: 'Laptop / desktop', cents: 85_000 },
      { label: 'Peripherals (keyboard, mouse)', cents: 3_000 },
      { label: 'Phone (mobile)', cents: 15_000 },
    ],
    equipmentLifeYears: 6,
    onboardingItems: [
      { label: 'Job posting', cents: 10_000 },
      { label: 'LinkedIn sourcing / candidate search', cents: 20_000 },
      { label: 'Background check', cents: 10_000 },
      { label: 'Medical examination', cents: 30_000 },
      { label: 'HR paperwork & account setup', cents: 10_000 },
    ],
  },
  targetGrossMarginPct: 55,
}

export const REFERENCE_MARGINS = [50, 55, 60]

export const sumItems = (items: CostItem[]) => items.reduce((s, i) => s + (Number.isFinite(i.cents) ? i.cents : 0), 0)

const paidHoursPerYear = (t: HireTierInputs) => t.hoursPerDay * 5 * 52

// Cap-aware employer tax: MIN(annual base, wage base) × rate, spread monthly.
const cappedTaxMonthly = (annualBaseCents: number, wageBaseCents: number, ratePct: number) =>
  (Math.min(annualBaseCents, wageBaseCents) * (ratePct / 100)) / 12

function buildResult(
  t: HireTierInputs,
  baseMonthly: number,
  lines: CostLine[],
  onboardingCents: number,
  marginPct: number,
): HireTierResult {
  const paidHours = paidHoursPerYear(t)
  const totalMonthly = baseMonthly + lines.reduce((s, l) => s + l.monthlyCents, 0)
  const billableHoursPerMonth = Math.max(0, (paidHours - t.ptoHoursPerYear - t.holidayHoursPerYear) / 12)
  const costPerHour = billableHoursPerMonth > 0 ? totalMonthly / billableHoursPerMonth : 0
  // Clamp so a margin ≥100% can't divide by zero.
  const keep = 1 - Math.min(Math.max(marginPct, 0), 95) / 100
  const yearly = totalMonthly * 12
  return {
    label: t.label,
    hourlyRateCents: t.hourlyRateCents,
    paidHoursPerYear: paidHours,
    baseMonthlyCents: Math.round(baseMonthly),
    lines,
    totalMonthlyCents: Math.round(totalMonthly),
    billableHoursPerMonth,
    costPerBillableHourCents: Math.round(costPerHour),
    burdenMultiple: baseMonthly > 0 ? totalMonthly / baseMonthly : 0,
    onboardingCents,
    month1TotalCents: Math.round(totalMonthly + onboardingCents),
    requiredBillingRateCents: Math.round(costPerHour / keep),
    requiredMonthlyRevenueCents: Math.round(totalMonthly / keep),
    referenceRevenue: REFERENCE_MARGINS.map((m) => ({ marginPct: m, monthlyCents: Math.round(totalMonthly / (1 - m / 100)) })),
    yearlyTotalCents: Math.round(yearly),
    year1TotalCents: Math.round(yearly + onboardingCents),
    requiredAnnualRevenueCents: Math.round(yearly / keep),
  }
}

export function computeUsW2Tier(t: HireTierInputs, policy: UsW2Policy, shared: SharedCosts, marginPct: number): HireTierResult {
  const baseMonthly = (t.hourlyRateCents * paidHoursPerYear(t)) / 12
  const annualBase = baseMonthly * 12
  const equipMonthly = shared.equipmentLifeYears > 0 ? sumItems(shared.equipmentItems) / shared.equipmentLifeYears / 12 : 0
  const lines: CostLine[] = [
    { label: 'Employer FUTA', monthlyCents: cappedTaxMonthly(annualBase, policy.futaWageBaseCents, policy.futaRatePct) },
    { label: 'Employer SUTA + RSF (NY)', monthlyCents: cappedTaxMonthly(annualBase, policy.sutaWageBaseCents, policy.sutaRatePct + policy.rsfRatePct) },
    { label: 'Employer Medicare', monthlyCents: baseMonthly * (policy.medicareRatePct / 100) },
    { label: 'Employer Social Security', monthlyCents: cappedTaxMonthly(annualBase, policy.socialSecurityWageBaseCents, policy.socialSecurityRatePct) },
    { label: "Workers' comp", monthlyCents: baseMonthly * (policy.workersCompRatePct / 100) },
    { label: 'Tooling (per-seat)', monthlyCents: sumItems(shared.toolingItems) },
    { label: 'Equipment (amortized)', monthlyCents: equipMonthly },
    { label: 'Health insurance (PPO)', monthlyCents: policy.includeHealth ? policy.healthMonthlyCents : 0 },
  ]
  return buildResult(t, baseMonthly, lines, sumItems(shared.onboardingItems), marginPct)
}

export function computeUs1099Tier(t: HireTierInputs, shared: SharedCosts, marginPct: number): HireTierResult {
  const baseMonthly = (t.hourlyRateCents * paidHoursPerYear(t)) / 12
  const lines: CostLine[] = [
    { label: 'Tooling (per-seat)', monthlyCents: sumItems(shared.toolingItems) },
  ]
  return buildResult(t, baseMonthly, lines, 0, marginPct)
}

export function computePhTier(t: HireTierInputs, policy: PhPolicy, shared: SharedCosts, marginPct: number): HireTierResult {
  const baseMonthly = (t.hourlyRateCents * paidHoursPerYear(t)) / 12
  const lines: CostLine[] = [
    { label: '13th-month pay (accrual)', monthlyCents: baseMonthly * (policy.thirteenthMonthPct / 100) },
    { label: 'Payment fee (Gusto/Wise)', monthlyCents: policy.paymentFeeMonthlyCents },
    { label: 'Tooling (per-seat)', monthlyCents: sumItems(shared.toolingItems) },
  ]
  return buildResult(t, baseMonthly, lines, 0, marginPct)
}

export function computeAll(a: HiringAssumptions): HiringResults {
  return {
    usW2: a.usW2.tiers.map((t) => computeUsW2Tier(t, a.usW2.policy, a.shared, a.targetGrossMarginPct)),
    us1099: a.us1099.tiers.map((t) => computeUs1099Tier(t, a.shared, a.targetGrossMarginPct)),
    ph: a.ph.tiers.map((t) => computePhTier(t, a.ph.policy, a.shared, a.targetGrossMarginPct)),
  }
}

const isTier = (v: unknown): v is HireTierInputs => {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.label === 'string' && typeof o.hourlyRateCents === 'number' && typeof o.hoursPerDay === 'number'
    && typeof o.ptoHoursPerYear === 'number' && typeof o.holidayHoursPerYear === 'number'
}

const isItemList = (v: unknown): v is CostItem[] =>
  Array.isArray(v) && v.every((i) => i && typeof i === 'object' && typeof (i as CostItem).label === 'string' && typeof (i as CostItem).cents === 'number')

/**
 * Structural guard for the v2 assumption shape. Used by the config API on save
 * and by the UI on load — pre-v2 payloads stored under `hiring_assumptions`
 * (the old us/ph shape) fail this check and the defaults are used instead.
 */
export function isHiringAssumptions(v: unknown): v is HiringAssumptions {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  if (o.version !== 2 || typeof o.targetGrossMarginPct !== 'number') return false
  const tiersOk = (t: unknown) => Array.isArray(t) && t.length > 0 && t.every(isTier)
  if (!tiersOk(o.usW2?.tiers) || typeof o.usW2?.policy?.futaRatePct !== 'number') return false
  if (!tiersOk(o.us1099?.tiers)) return false
  if (!tiersOk(o.ph?.tiers) || typeof o.ph?.policy?.thirteenthMonthPct !== 'number') return false
  const s = o.shared
  return !!s && isItemList(s.toolingItems) && isItemList(s.equipmentItems) && isItemList(s.onboardingItems)
    && typeof s.equipmentLifeYears === 'number'
}
