/**
 * CFO dashboard demo-mode transform.
 *
 * Anonymizes account/destination/customer/debt/rule names via the existing
 * useDemoMode().company() helper, AND scales every monetary value by ONE
 * consistent factor (derived from the same session seed via num(_, KEY)).
 * Using a single factor across all cents preserves ratios, runway days,
 * coverage status, payoff timelines, etc. — the math still works, only the
 * absolute amounts and labels are obscured.
 *
 * Pure: takes DashboardData + helpers, returns a new DashboardData.
 */

import { generateActions } from './compute'
import type { DashboardData } from './build'

interface DemoHelpers {
  active: boolean
  company: (s: string) => string
  num: (value: number, key: string) => number
}

const KEY = 'cfo-scale'

const maskReq = (demo: DemoHelpers, s: string): string => (s ? demo.company(s) : s)
const maskOpt = <T extends string | null | undefined>(demo: DemoHelpers, s: T): T => (s ? (demo.company(s) as T) : s)
const scaleReq = (demo: DemoHelpers, v: number): number => demo.num(v, KEY)
const scaleOpt = <T extends number | null | undefined>(demo: DemoHelpers, v: T): T => (v == null ? v : (demo.num(v, KEY) as T))

export function applyCfoDemo(data: DashboardData, demo: DemoHelpers): DashboardData {
  if (!demo.active) return data

  const cards = {
    ...data.cards,
    totalSetAsideCents: scaleReq(demo, data.cards.totalSetAsideCents),
    lastMonthFundedCents: scaleReq(demo, data.cards.lastMonthFundedCents),
    cards: data.cards.cards.map((c) => ({ name: maskReq(demo, c.name), balanceCents: scaleReq(demo, c.balanceCents) })),
  }

  const monthly = {
    ...data.monthly,
    coverage: Object.fromEntries(
      Object.entries(data.monthly.coverage).map(([k, v]) => [k, k.endsWith('Cents') ? scaleReq(demo, v as number) : v])
    ) as typeof data.monthly.coverage,
    pl: Object.fromEntries(
      Object.entries(data.monthly.pl).map(([k, v]) => [k, k.endsWith('Cents') ? scaleReq(demo, v as number) : v])
    ) as typeof data.monthly.pl,
  }

  const netFlow = {
    inflowCents: scaleReq(demo, data.netFlow.inflowCents),
    outflowCents: scaleReq(demo, data.netFlow.outflowCents),
    netCents: scaleReq(demo, data.netFlow.netCents),
  }

  const runway = data.runway && {
    ...data.runway,
    currentBalanceCents: scaleReq(demo, data.runway.currentBalanceCents),
    dailyOutCents: scaleReq(demo, data.runway.dailyOutCents),
  }

  const pace = data.pace && {
    ...data.pace,
    thisMonthOutCents: scaleReq(demo, data.pace.thisMonthOutCents),
    typicalMonthlyCents: scaleReq(demo, data.pace.typicalMonthlyCents),
    expectedByNowCents: scaleReq(demo, data.pace.expectedByNowCents),
    projectedMonthEndCents: scaleReq(demo, data.pace.projectedMonthEndCents),
  }

  const opsForecast = data.opsForecast && {
    ...data.opsForecast,
    currentBalanceCents: scaleReq(demo, data.opsForecast.currentBalanceCents),
    expectedOutCents: scaleReq(demo, data.opsForecast.expectedOutCents),
    expectedInCents: scaleReq(demo, data.opsForecast.expectedInCents),
    projectedBalanceCents: scaleReq(demo, data.opsForecast.projectedBalanceCents),
    expectedOut: data.opsForecast.expectedOut.map((o) => ({ ...o, name: maskReq(demo, o.name), avgAmountCents: scaleReq(demo, o.avgAmountCents) })),
    expectedIn: data.opsForecast.expectedIn.map((o) => ({ ...o, name: maskReq(demo, o.name), amountCents: scaleReq(demo, o.amountCents) })),
  }

  const monthlyPL = data.monthlyPL.map((p) => ({
    ...p,
    incomeCents: scaleReq(demo, p.incomeCents),
    outflowCents: scaleReq(demo, p.outflowCents),
    netCents: scaleReq(demo, p.netCents),
  }))

  const opsBreakdown = {
    totalCents: scaleReq(demo, data.opsBreakdown.totalCents),
    // category labels (payroll/credit-card/etc.) aren't sensitive — leave as-is
    byCategory: data.opsBreakdown.byCategory.map((c) => ({ ...c, amountCents: scaleReq(demo, c.amountCents) })),
    byDestination: data.opsBreakdown.byDestination.map((c) => ({ name: maskReq(demo, c.name), amountCents: scaleReq(demo, c.amountCents), pct: c.pct })),
  }

  const obligations = data.obligations.map((o) => ({
    ...o,
    podName: maskReq(demo, o.podName),
    destName: maskReq(demo, o.destName),
    avgAmountCents: scaleReq(demo, o.avgAmountCents),
    annualizedCents: scaleReq(demo, o.annualizedCents),
  }))

  const anomalies = data.anomalies.map((a) => ({
    ...a,
    podName: maskReq(demo, a.podName),
    driverName: maskReq(demo, a.driverName),
    sumCents: scaleReq(demo, a.sumCents),
    baselineCents: scaleReq(demo, a.baselineCents),
    driverAmountCents: scaleReq(demo, a.driverAmountCents),
  }))

  const yoy = data.yoy.map((y) => ({
    ...y,
    name: maskOpt(demo, y.name),
    current: scaleReq(demo, y.current),
    prior: scaleReq(demo, y.prior),
  }))

  const rules = data.rules.map((r) => ({ ...r, name: maskReq(demo, r.name) }))

  const ownerPay = data.ownerPay && {
    ...data.ownerPay,
    currentBalanceCents: scaleReq(demo, data.ownerPay.currentBalanceCents),
    netFlow30dCents: scaleReq(demo, data.ownerPay.netFlow30dCents),
    in30Cents: scaleReq(demo, data.ownerPay.in30Cents),
    out30Cents: scaleReq(demo, data.ownerPay.out30Cents),
    total90Cents: scaleReq(demo, data.ownerPay.total90Cents),
    monthlyTrend: data.ownerPay.monthlyTrend.map((p) => ({ ...p, inCents: scaleReq(demo, p.inCents), outCents: scaleReq(demo, p.outCents), netCents: scaleReq(demo, p.netCents) })),
    topDestinations: data.ownerPay.topDestinations.map((t) => ({ ...t, name: maskReq(demo, t.name), amountCents: scaleReq(demo, t.amountCents) })),
    byCategory: data.ownerPay.byCategory.map((c) => ({ ...c, amountCents: scaleReq(demo, c.amountCents) })),
    recurring: data.ownerPay.recurring.map((r) => ({ ...r, name: maskReq(demo, r.name), avgAmountCents: scaleReq(demo, r.avgAmountCents), annualizedCents: scaleReq(demo, r.annualizedCents) })),
  }

  const activityByDest = data.activityByDest.map((a) => ({
    ...a,
    name: maskReq(demo, a.name),
    totalCents: scaleReq(demo, a.totalCents),
    recent: a.recent.map((t) => ({ ...t, amountCents: scaleReq(demo, t.amountCents), sourceName: maskReq(demo, t.sourceName) })),
  }))

  const incomeSplit = data.incomeSplit && {
    ...data.incomeSplit,
    totalDistributedCents: scaleReq(demo, data.incomeSplit.totalDistributedCents),
    podRatios: data.incomeSplit.podRatios.map((p) => ({ ...p, podName: maskOpt(demo, p.podName), totalCents: scaleReq(demo, p.totalCents) })),
  }

  // ─── Debts (scale, mask names, keep APR/ratios) ─────────────────────────
  const scaleDebtArr = <D extends { name: string; balanceCents: number; minPaymentCents: number; monthlyInterestCents: number; interestAtMinCents: number; paidFromPod?: string }>(arr: D[]): D[] =>
    arr.map((d) => ({
      ...d,
      name: maskReq(demo, d.name),
      balanceCents: scaleReq(demo, d.balanceCents),
      minPaymentCents: scaleReq(demo, d.minPaymentCents),
      monthlyInterestCents: scaleReq(demo, d.monthlyInterestCents),
      interestAtMinCents: scaleOpt(demo, d.interestAtMinCents),
      paidFromPod: d.paidFromPod ? maskReq(demo, d.paidFromPod) : d.paidFromPod,
    }))

  const scaleGroup = (g: NonNullable<DashboardData['debts']>['business']) => g && {
    ...g,
    debts: scaleDebtArr(g.debts),
    totalBalanceCents: scaleReq(demo, g.totalBalanceCents),
    totalMinPaymentCents: scaleReq(demo, g.totalMinPaymentCents),
    totalMonthlyInterestCents: scaleReq(demo, g.totalMonthlyInterestCents),
    annualInterestBurdenCents: scaleReq(demo, g.annualInterestBurdenCents),
    avalancheOrder: g.avalancheOrder.map((n) => maskReq(demo, n)),
    snowballOrder: g.snowballOrder.map((n) => maskReq(demo, n)),
    scenarios: {
      minOnly: { ...g.scenarios.minOnly, totalInterestCents: scaleReq(demo, g.scenarios.minOnly.totalInterestCents), extraCents: scaleReq(demo, g.scenarios.minOnly.extraCents) },
      plus500: { ...g.scenarios.plus500, totalInterestCents: scaleReq(demo, g.scenarios.plus500.totalInterestCents), extraCents: scaleReq(demo, g.scenarios.plus500.extraCents) },
      plus1000: { ...g.scenarios.plus1000, totalInterestCents: scaleReq(demo, g.scenarios.plus1000.totalInterestCents), extraCents: scaleReq(demo, g.scenarios.plus1000.extraCents) },
      plus2000: { ...g.scenarios.plus2000, totalInterestCents: scaleReq(demo, g.scenarios.plus2000.totalInterestCents), extraCents: scaleReq(demo, g.scenarios.plus2000.extraCents) },
    },
  }

  const debts = data.debts && {
    ...data.debts,
    all: scaleDebtArr(data.debts.all),
    business: scaleGroup(data.debts.business),
    personal: scaleGroup(data.debts.personal),
    combinedTotalBalanceCents: scaleReq(demo, data.debts.combinedTotalBalanceCents),
    combinedMonthlyInterestCents: scaleReq(demo, data.debts.combinedMonthlyInterestCents),
    combinedAnnualInterestCents: scaleReq(demo, data.debts.combinedAnnualInterestCents),
  }

  // ─── AR ────────────────────────────────────────────────────────────────
  const ar = data.ar && {
    ...data.ar,
    totalOpenCents: scaleReq(demo, data.ar.totalOpenCents),
    atRiskCents: scaleReq(demo, data.ar.atRiskCents),
    likelyCollectableCents: scaleReq(demo, data.ar.likelyCollectableCents),
    bucketTotalsCents: Object.fromEntries(Object.entries(data.ar.bucketTotalsCents).map(([k, v]) => [k, scaleReq(demo, v)])),
    topCustomers: data.ar.topCustomers.map((c) => ({
      ...c,
      name: maskReq(demo, c.name),
      totalCents: scaleReq(demo, c.totalCents),
      byBucketCents: c.byBucketCents
        ? Object.fromEntries(Object.entries(c.byBucketCents).map(([k, v]) => [k, scaleReq(demo, v)]))
        : c.byBucketCents,
    })),
    staleCustomers: data.ar.staleCustomers.map((c) => ({ ...c, name: maskReq(demo, c.name), atRiskCents: scaleReq(demo, c.atRiskCents) })),
  }

  // ─── QuickBooks snapshot (scale every cents in pl + balanceSheet) ──────
  const scaleObj = <T extends Record<string, unknown>>(o: T): T => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(o)) {
      if (k.endsWith('Cents') && typeof v === 'number') out[k] = scaleReq(demo, v)
      else out[k] = v
    }
    return out as T
  }
  const qb = data.qb && {
    ...data.qb,
    pl: data.qb.pl ? (scaleObj(data.qb.pl as unknown as Record<string, unknown>) as typeof data.qb.pl) : data.qb.pl,
    balanceSheet: data.qb.balanceSheet
      ? {
          ...(scaleObj(data.qb.balanceSheet as unknown as Record<string, unknown>) as typeof data.qb.balanceSheet),
          creditCards: data.qb.balanceSheet.creditCards?.map((c) => ({ name: maskReq(demo, c.name), balanceCents: scaleReq(demo, c.balanceCents) })),
        }
      : data.qb.balanceSheet,
  }

  // ─── QuickBooks spend insight (scale cents; mask vendor names, keep account
  // category names — same policy as opsBreakdown.byCategory) ───────────────
  const scaleArr = (arr: number[]): number[] => arr.map((v) => scaleReq(demo, v))
  const qbSpend = data.qbSpend && {
    ...data.qbSpend,
    totalMonthlyCents: scaleArr(data.qbSpend.totalMonthlyCents),
    byCategory: data.qbSpend.byCategory.map((r) => ({ ...r, monthlyCents: scaleArr(r.monthlyCents), totalCents: scaleReq(demo, r.totalCents) })),
    byVendor: data.qbSpend.byVendor.map((r) => ({ ...r, label: maskReq(demo, r.label), monthlyCents: scaleArr(r.monthlyCents), totalCents: scaleReq(demo, r.totalCents) })),
    anomalies: data.qbSpend.anomalies.map((a) => ({
      ...a,
      label: a.kind === 'vendor' ? maskReq(demo, a.label) : a.label,
      latestCents: scaleReq(demo, a.latestCents),
      baselineCents: scaleReq(demo, a.baselineCents),
      deltaCents: scaleReq(demo, a.deltaCents),
      monthly: scaleArr(a.monthly),
    })),
  }

  const outflowDrilldown = data.outflowDrilldown.map((mo) => ({
    ...mo,
    totalOutCents: scaleReq(demo, mo.totalOutCents),
    top: mo.top.map((t) => ({ ...t, name: maskReq(demo, t.name), amountCents: scaleReq(demo, t.amountCents) })),
  }))

  // Regenerate actions from the masked data so action text references the
  // anonymized names + scaled amounts.
  const actions = generateActions({
    qb: qb ?? null,
    debts: debts ?? null,
    ar: ar ?? null,
    empowerLiveBalanceCents: scaleOpt(demo, data.empowerLiveBalanceCents),
  })

  const nextPayrollMasked = data.nextPayroll && {
    ...data.nextPayroll,
    amountCents: scaleReq(demo, data.nextPayroll.amountCents),
  }

  return {
    ...data,
    totalCashCents: scaleReq(demo, data.totalCashCents),
    empowerLiveBalanceCents: scaleOpt(demo, data.empowerLiveBalanceCents),
    monthly,
    netFlow,
    runway,
    pace,
    cards,
    opsForecast,
    monthlyPL,
    opsBreakdown,
    obligations,
    anomalies,
    yoy,
    rules,
    ownerPay,
    activityByDest,
    incomeSplit,
    debts,
    ar,
    qb,
    qbSpend,
    outflowDrilldown,
    nextPayroll: nextPayrollMasked,
    actions,
  }
}
