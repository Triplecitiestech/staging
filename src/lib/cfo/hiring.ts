/**
 * Hiring cost calculator — fully-loaded cost of a US W-2 employee vs. a
 * Philippines-based contractor, including the hidden/burden costs on top of
 * the base wage (employer taxes, workers' comp, benefits, per-seat tooling,
 * equipment, 13th-month, FX fees, etc.).
 *
 * Pure functions + editable defaults. All money in cents, all rates as plain
 * percentages (9 = 9%). Defaults are researched estimates clearly surfaced in
 * the UI — Rio's questionnaire fills in the real per-seat numbers.
 */

export interface UsHireInputs {
  hourlyWageCents: number
  hoursPerWeek: number
  weeksPerYear: number
  ptoDays: number               // paid days not worked (PTO + holidays)
  payrollTaxPct: number         // employer FICA (7.65%) + FUTA + NY SUTA, blended
  workersCompPct: number
  healthMonthlyCents: number    // employer share of premium (0 if not offered)
  retirementMatchPct: number    // 401k match (0 if not offered)
  toolingMonthlyCents: number   // per-seat software: Kaseya, M365, RingCentral, Pax8…
  equipmentOneTimeCents: number
  equipmentAmortMonths: number
  otherMonthlyCents: number     // misc overhead allocation
}

export interface PhHireInputs {
  monthlyRateCents: number
  hoursPerWeek: number
  thirteenthMonth: boolean       // 13th-month pay (one extra month/yr)
  paymentFeePct: number          // Gusto contractor / Wise / FX fees
  hmoMonthlyCents: number        // optional health stipend / HMO
  toolingMonthlyCents: number    // per-seat software (still needed)
  equipmentOneTimeCents: number
  equipmentAmortMonths: number
  otherMonthlyCents: number
}

export interface HiringAssumptions {
  us: UsHireInputs
  ph: PhHireInputs
  targetGrossMarginPct: number   // for the "revenue needed to cover" calc
}

export interface CostLine { label: string; annualCents: number }
export interface HiringResult {
  baseAnnualCents: number
  burdenAnnualCents: number
  loadedAnnualCents: number
  loadedMonthlyCents: number
  productiveHours: number
  effectiveHourlyCents: number   // loaded cost per actually-worked hour
  burdenMultiple: number         // loaded / base
  lines: CostLine[]              // burden breakdown
  revenueNeededAnnualCents: number
  revenueNeededMonthlyCents: number
}

// ── Researched default estimates (2025/26). Editable in the UI. ────────────
export const DEFAULT_ASSUMPTIONS: HiringAssumptions = {
  us: {
    hourlyWageCents: 2500,
    hoursPerWeek: 40,
    weeksPerYear: 52,
    ptoDays: 15,
    payrollTaxPct: 9,        // FICA 7.65 + FUTA ~0.6 + NY SUTA (blended)
    workersCompPct: 1,       // IT/field blended — confirm class code with carrier
    healthMonthlyCents: 0,   // set to employer premium share if offered (US avg ≈ $625/mo single)
    retirementMatchPct: 0,
    toolingMonthlyCents: 30000, // Kaseya + M365 + RingCentral + Pax8 + misc per seat — confirm
    equipmentOneTimeCents: 240000,
    equipmentAmortMonths: 36,
    otherMonthlyCents: 0,
  },
  ph: {
    monthlyRateCents: 160000,
    hoursPerWeek: 40,
    thirteenthMonth: true,
    paymentFeePct: 2,
    hmoMonthlyCents: 0,
    toolingMonthlyCents: 25000,
    equipmentOneTimeCents: 120000,
    equipmentAmortMonths: 36,
    otherMonthlyCents: 0,
  },
  targetGrossMarginPct: 50,
}

const equipAnnual = (oneTime: number, months: number) => (months > 0 ? Math.round((oneTime * 12) / months) : 0)

function withRevenue(baseAnnual: number, burdenAnnual: number, lines: CostLine[], productiveHours: number, marginPct: number): HiringResult {
  const loadedAnnual = baseAnnual + burdenAnnual
  const margin = Math.max(1, marginPct) / 100
  return {
    baseAnnualCents: Math.round(baseAnnual),
    burdenAnnualCents: Math.round(burdenAnnual),
    loadedAnnualCents: Math.round(loadedAnnual),
    loadedMonthlyCents: Math.round(loadedAnnual / 12),
    productiveHours: Math.round(productiveHours),
    effectiveHourlyCents: productiveHours > 0 ? Math.round(loadedAnnual / productiveHours) : 0,
    burdenMultiple: baseAnnual > 0 ? loadedAnnual / baseAnnual : 0,
    lines: lines.filter((l) => l.annualCents > 0),
    revenueNeededAnnualCents: Math.round(loadedAnnual / margin),
    revenueNeededMonthlyCents: Math.round(loadedAnnual / margin / 12),
  }
}

export function computeUs(i: UsHireInputs, targetGrossMarginPct: number): HiringResult {
  const baseAnnual = i.hourlyWageCents * i.hoursPerWeek * i.weeksPerYear
  const lines: CostLine[] = [
    { label: 'Employer payroll taxes (FICA/FUTA/SUTA)', annualCents: baseAnnual * (i.payrollTaxPct / 100) },
    { label: "Workers' compensation", annualCents: baseAnnual * (i.workersCompPct / 100) },
    { label: '401(k) match', annualCents: baseAnnual * (i.retirementMatchPct / 100) },
    { label: 'Health insurance (employer share)', annualCents: i.healthMonthlyCents * 12 },
    { label: 'Software / per-seat tooling', annualCents: i.toolingMonthlyCents * 12 },
    { label: 'Equipment (amortized)', annualCents: equipAnnual(i.equipmentOneTimeCents, i.equipmentAmortMonths) },
    { label: 'Other overhead', annualCents: i.otherMonthlyCents * 12 },
  ]
  const burden = lines.reduce((s, l) => s + l.annualCents, 0)
  const productiveHours = i.hoursPerWeek * i.weeksPerYear - i.ptoDays * (i.hoursPerWeek / 5)
  return withRevenue(baseAnnual, burden, lines, productiveHours, targetGrossMarginPct)
}

export function computePh(i: PhHireInputs, targetGrossMarginPct: number): HiringResult {
  const baseAnnual = i.monthlyRateCents * 12
  const thirteenth = i.thirteenthMonth ? i.monthlyRateCents : 0
  const feeBase = baseAnnual + thirteenth
  const lines: CostLine[] = [
    { label: '13th-month pay', annualCents: thirteenth },
    { label: 'Payment / FX / platform fees', annualCents: feeBase * (i.paymentFeePct / 100) },
    { label: 'HMO / health stipend', annualCents: i.hmoMonthlyCents * 12 },
    { label: 'Software / per-seat tooling', annualCents: i.toolingMonthlyCents * 12 },
    { label: 'Equipment (amortized)', annualCents: equipAnnual(i.equipmentOneTimeCents, i.equipmentAmortMonths) },
    { label: 'Other overhead', annualCents: i.otherMonthlyCents * 12 },
  ]
  const burden = lines.reduce((s, l) => s + l.annualCents, 0)
  const productiveHours = i.hoursPerWeek * 52
  return withRevenue(baseAnnual, burden, lines, productiveHours, targetGrossMarginPct)
}
