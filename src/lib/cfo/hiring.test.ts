/**
 * Parity tests: every expected value below is taken verbatim from the computed
 * cells of the "TCT New Hire Breakeven Calculator" workbook (July 2026) that
 * this module was ported from. If these fail, the port has drifted from the
 * owner's spreadsheet.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_ASSUMPTIONS, computeAll, isHiringAssumptions, sumItems } from './hiring'

const r = computeAll(DEFAULT_ASSUMPTIONS)
const dollars = (cents: number) => cents / 100

describe('shared cost detail (Cost Breakdown Detail sheet)', () => {
  it('tooling totals $218.73/mo', () => {
    expect(dollars(sumItems(DEFAULT_ASSUMPTIONS.shared.toolingItems))).toBeCloseTo(218.73, 2)
  })
  it('equipment totals $1,030 one-time', () => {
    expect(dollars(sumItems(DEFAULT_ASSUMPTIONS.shared.equipmentItems))).toBe(1030)
  })
  it('onboarding totals $800 one-time', () => {
    expect(dollars(sumItems(DEFAULT_ASSUMPTIONS.shared.onboardingItems))).toBe(800)
  })
})

describe('US W-2 employees', () => {
  it('Tier 1 ($25/hr) matches the sheet', () => {
    const t = r.usW2[0]
    expect(dollars(t.baseMonthlyCents)).toBeCloseTo(4333.33, 2)
    expect(dollars(t.totalMonthlyCents)).toBeCloseTo(5579.17, 2)
    expect(t.billableHoursPerMonth).toBeCloseTo(166.667, 2)
    expect(dollars(t.costPerBillableHourCents)).toBeCloseTo(33.48, 2)
    expect(dollars(t.month1TotalCents)).toBeCloseTo(6379.17, 2)
    expect(dollars(t.requiredBillingRateCents)).toBeCloseTo(74.39, 2)
    expect(dollars(t.requiredMonthlyRevenueCents)).toBeCloseTo(12398.15, 2)
    expect(dollars(t.yearlyTotalCents)).toBeCloseTo(66950.03, 1)
    expect(dollars(t.year1TotalCents)).toBeCloseTo(67750.03, 1)
    expect(dollars(t.requiredAnnualRevenueCents)).toBeCloseTo(148777.84, 1)
  })

  it('Tier 1 burden lines match the sheet (FUTA/SUTA/Medicare/SS/WC caps)', () => {
    const byLabel = Object.fromEntries(r.usW2[0].lines.map((l) => [l.label, dollars(l.monthlyCents)]))
    expect(byLabel['Employer FUTA']).toBeCloseTo(3.5, 2)
    expect(byLabel['Employer SUTA + RSF (NY)']).toBeCloseTo(24.93, 2)
    expect(byLabel['Employer Medicare']).toBeCloseTo(62.83, 2)
    expect(byLabel['Employer Social Security']).toBeCloseTo(268.67, 2)
    expect(byLabel["Workers' comp"]).toBeCloseTo(52.87, 2)
    expect(byLabel['Tooling (per-seat)']).toBeCloseTo(218.73, 2)
    expect(byLabel['Equipment (amortized)']).toBeCloseTo(14.31, 2)
    expect(byLabel['Health insurance (PPO)']).toBeCloseTo(600, 2)
  })

  it('Tiers 2 and 3 match the sheet', () => {
    expect(dollars(r.usW2[1].totalMonthlyCents)).toBeCloseTo(6522.71, 2)
    expect(dollars(r.usW2[2].totalMonthlyCents)).toBeCloseTo(8409.79, 2)
    expect(dollars(r.usW2[2].requiredBillingRateCents)).toBeCloseTo(112.13, 2)
  })

  it('reference margins 50/60% match the sheet', () => {
    const ref = Object.fromEntries(r.usW2[0].referenceRevenue.map((x) => [x.marginPct, dollars(x.monthlyCents)]))
    expect(ref[50]).toBeCloseTo(11158.34, 2)
    expect(ref[60]).toBeCloseTo(13947.92, 2)
  })
})

describe('US 1099 contractors — pay + tooling only', () => {
  it('all tiers match the sheet, no taxes/equipment/health/onboarding', () => {
    expect(dollars(r.us1099[0].totalMonthlyCents)).toBeCloseTo(4552.06, 2)
    expect(dollars(r.us1099[1].totalMonthlyCents)).toBeCloseTo(5418.73, 2)
    expect(dollars(r.us1099[2].totalMonthlyCents)).toBeCloseTo(7152.06, 2)
    expect(dollars(r.us1099[0].costPerBillableHourCents)).toBeCloseTo(27.31, 2)
    expect(r.us1099[0].onboardingCents).toBe(0)
    expect(r.us1099[0].month1TotalCents).toBe(r.us1099[0].totalMonthlyCents)
  })
})

describe('PH contractors — 13th-month + payment fee + tooling', () => {
  it('all tiers match the sheet', () => {
    expect(dollars(r.ph[0].totalMonthlyCents)).toBeCloseTo(1367.36, 2)
    expect(dollars(r.ph[1].totalMonthlyCents)).toBeCloseTo(1742.91, 2)
    expect(dollars(r.ph[2].totalMonthlyCents)).toBeCloseTo(1179.59, 2)
    expect(r.ph[0].billableHoursPerMonth).toBeCloseTo(160, 3)
    expect(dollars(r.ph[0].costPerBillableHourCents)).toBeCloseTo(8.55, 2)
    expect(dollars(r.ph[0].requiredBillingRateCents)).toBeCloseTo(18.99, 2)
  })

  it('Tier 3 (4h/day, no PTO/holidays) matches the sheet', () => {
    const t = r.ph[2]
    expect(t.paidHoursPerYear).toBe(1040)
    expect(t.billableHoursPerMonth).toBeCloseTo(86.667, 2)
    expect(dollars(t.costPerBillableHourCents)).toBeCloseTo(13.61, 2)
    expect(dollars(t.requiredBillingRateCents)).toBeCloseTo(30.25, 2)
  })
})

describe('isHiringAssumptions guard', () => {
  it('accepts the v2 defaults', () => {
    expect(isHiringAssumptions(DEFAULT_ASSUMPTIONS)).toBe(true)
    expect(isHiringAssumptions(JSON.parse(JSON.stringify(DEFAULT_ASSUMPTIONS)))).toBe(true)
  })
  it('rejects the pre-v2 us/ph shape and junk', () => {
    expect(isHiringAssumptions({ us: { hourlyWageCents: 2500 }, ph: { monthlyRateCents: 160000 }, targetGrossMarginPct: 50 })).toBe(false)
    expect(isHiringAssumptions(null)).toBe(false)
    expect(isHiringAssumptions({ version: 2 })).toBe(false)
    expect(isHiringAssumptions({ ...DEFAULT_ASSUMPTIONS, usW2: { ...DEFAULT_ASSUMPTIONS.usW2, tiers: [] } })).toBe(false)
  })
})
