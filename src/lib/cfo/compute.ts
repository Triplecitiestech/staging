/**
 * CFO analytics. Faithful TypeScript port of the standalone tool's compute.mjs.
 * Pure functions over Sequence transfers/accounts plus QuickBooks/debt/AR
 * config. No I/O.
 */

import { categorize } from './categories'
import type {
  Account, Transfer, TransfersByAccount, Rule, RuleLastExecution,
  CategoryMap, DebtsConfig, DebtInput, QbSnapshot, ArSnapshot, ScheduledOutflow,
} from './types'

const DAY_MS = 86400000

export const isoDaysAgo = (d: number): string => new Date(Date.now() - d * DAY_MS).toISOString()

function startOfIsoWeek(date: string | number | Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay() || 7
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1))
  return d
}

function ymKey(date: string | number | Date): string {
  const d = new Date(date)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function ymLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0
}

interface Cadence { name: string; daysPerYear: number }
function detectCadence(avgGapDays: number): Cadence | null {
  if (avgGapDays >= 6 && avgGapDays <= 9) return { name: 'weekly', daysPerYear: 52 }
  if (avgGapDays >= 12 && avgGapDays <= 16) return { name: 'biweekly', daysPerYear: 26 }
  if (avgGapDays >= 24 && avgGapDays <= 35) return { name: 'monthly', daysPerYear: 12 }
  if (avgGapDays >= 80 && avgGapDays <= 100) return { name: 'quarterly', daysPerYear: 4 }
  return null
}

function normalizeCounterparty(name?: string | null): string | null {
  if (!name) return null
  return name.replace(/\s*\|\s*\d+\s*$/, '').replace(/\s+\d+\s*$/, '').trim()
}

export function destinationKey(t: Transfer): string | null {
  if (t.destination?.id) return t.destination.id
  const norm = normalizeCounterparty(t.destination?.name)
  return norm ? `name:${norm}` : null
}

export function displayDestName(t: Transfer): string {
  if (t.destination?.id) return t.destination.name || '—'
  return normalizeCounterparty(t.destination?.name) || t.destination?.name || '—'
}

function isExplicitRetry(t: Transfer): boolean {
  return t.direction === 'MONEY_OUT' && /\bretry\b/i.test(t.destination?.name || '')
}

export interface RetryFilterResult {
  kept: Transfer[]
  explicitRetryCount: number
  explicitRetryAmountCents: number
  silentRetryCount: number
}

export function dropRetries(transfers: Transfer[]): RetryFilterResult {
  const explicit = transfers.filter(isExplicitRetry)
  const kept = transfers.filter((t) => !isExplicitRetry(t))

  const groups = new Map<string, Transfer[]>()
  for (const t of kept) {
    if (t.direction !== 'MONEY_OUT') continue
    if (!t.source?.id) continue
    const destKey = destinationKey(t) || (t.destination?.name || '')
    const key = `${t.source.id}|${destKey}|${t.amountInCents}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  const silentRetryIds = new Set<string>()
  for (const group of Array.from(groups.values())) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    for (let i = 1; i < sorted.length; i++) {
      const gapDays = (new Date(sorted[i].createdAt).getTime() - new Date(sorted[i - 1].createdAt).getTime()) / DAY_MS
      if (gapDays < 7) silentRetryIds.add(sorted[i].id)
    }
  }

  return {
    kept: kept.filter((t) => !silentRetryIds.has(t.id)),
    explicitRetryCount: explicit.length,
    explicitRetryAmountCents: explicit.reduce((s, t) => s + t.amountInCents, 0),
    silentRetryCount: silentRetryIds.size,
  }
}

export function flattenTransfers(transfersByAccount: TransfersByAccount[]): Transfer[] {
  const seen = new Set<string>()
  const all: Transfer[] = []
  for (const { transfers } of transfersByAccount) {
    for (const t of transfers) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      all.push(t)
    }
  }
  return all
}

export function transfersFor(accountId: string, transfersByAccount: TransfersByAccount[]): Transfer[] {
  return transfersByAccount.find((x) => x.accountId === accountId)?.transfers ?? []
}

export function totalCashOnHand(accounts: Account[]): number {
  return accounts
    .filter((a) => (a.type === 'POD' || a.type === 'INCOME_SOURCE') && a.balance?.balanceInCents != null && !a.deletedAt)
    .reduce((s, a) => s + (a.balance?.balanceInCents ?? 0), 0)
}

export function monthCoverageAndPL(
  opAccount: Account | null,
  opTransfers: Transfer[],
  allTransfers: Transfer[],
  incomeSource: Account | null,
  transfersByAccount: TransfersByAccount[],
  categoryMap: CategoryMap,
  scheduled: ScheduledOutflow[] = [],
) {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const daysInMonth = (monthEnd.getTime() - monthStart.getTime()) / DAY_MS
  const dayOfMonth = (now.getTime() - monthStart.getTime()) / DAY_MS
  const monthFraction = Math.max(0.01, dayOfMonth / daysInMonth)
  const daysRemainingFrac = 1 - monthFraction

  const inMonth = (t: Transfer) => {
    const ts = new Date(t.createdAt).getTime()
    return ts >= monthStart.getTime() && ts < monthEnd.getTime()
  }

  const isPayrollDest = (t: Transfer) =>
    categoryMap[displayDestName(t)] === 'payroll' || /\bgusto\b/i.test(displayDestName(t))
  const isCardPaymentDest = (t: Transfer) =>
    categoryMap[displayDestName(t)] === 'credit-card' || /\bamex\b/i.test(displayDestName(t))

  let baselinePayroll = 0
  let baselineAmex = 0
  let baselineMonths = 0
  for (let i = 1; i <= 3; i++) {
    const ms = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const me = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1))
    const inBaselineMonth = (t: Transfer) => {
      const ts = new Date(t.createdAt).getTime()
      return ts >= ms.getTime() && ts < me.getTime()
    }
    const payrollM = opTransfers.filter((t) => t.status === 'COMPLETE' && t.source?.id === opAccount?.id && inBaselineMonth(t) && isPayrollDest(t)).reduce((s, t) => s + t.amountInCents, 0)
    const amexM = opTransfers.filter((t) => t.status === 'COMPLETE' && t.source?.id === opAccount?.id && inBaselineMonth(t) && isCardPaymentDest(t)).reduce((s, t) => s + t.amountInCents, 0)
    baselinePayroll += payrollM
    baselineAmex += amexM
    baselineMonths += 1
  }
  const typicalPayrollPerMonth = baselineMonths ? Math.round(baselinePayroll / baselineMonths) : 0
  const typicalAmexPerMonth = baselineMonths ? Math.round(baselineAmex / baselineMonths) : 0

  const paidPayroll = opTransfers.filter((t) => t.status === 'COMPLETE' && t.source?.id === opAccount?.id && inMonth(t) && isPayrollDest(t)).reduce((s, t) => s + t.amountInCents, 0)
  const paidAmex = opTransfers.filter((t) => t.status === 'COMPLETE' && t.source?.id === opAccount?.id && inMonth(t) && isCardPaymentDest(t)).reduce((s, t) => s + t.amountInCents, 0)

  // If the user entered scheduled payroll outflows for the remaining days of
  // the current month, trust those numbers over the historical baseline.
  const scheduledPayrollRemainingCents = scheduled
    .filter((s) => s.category === 'payroll')
    .filter((s) => {
      const t = new Date(s.date).getTime()
      return t >= now.getTime() && t < monthEnd.getTime()
    })
    .reduce((sum, s) => sum + s.amountCents, 0)
  const remainingPayroll = scheduledPayrollRemainingCents > 0
    ? scheduledPayrollRemainingCents
    : Math.max(0, typicalPayrollPerMonth - paidPayroll)
  const remainingAmex = Math.max(0, typicalAmexPerMonth - paidAmex)
  const totalRemainingObligationsCents = remainingPayroll + remainingAmex

  const opBalance = opAccount?.balance?.balanceInCents ?? 0

  let expectedIncomeRemainingCents = 0
  if (incomeSource && opAccount) {
    const incomeTransfers = (transfersByAccount.find((x) => x.accountId === incomeSource.id)?.transfers || []).filter((t) =>
      t.status === 'COMPLETE' && t.direction === 'INTERNAL' && t.destination?.id === opAccount.id
    )
    let baselineIncome = 0
    for (let i = 1; i <= 3; i++) {
      const ms = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      const me = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1))
      baselineIncome += incomeTransfers.filter((t) => {
        const ts = new Date(t.createdAt).getTime()
        return ts >= ms.getTime() && ts < me.getTime()
      }).reduce((s, t) => s + t.amountInCents, 0)
    }
    const typicalPerMonth = baselineIncome / 3
    const receivedThisMonth = incomeTransfers.filter(inMonth).reduce((s, t) => s + t.amountInCents, 0)
    expectedIncomeRemainingCents = Math.max(0, Math.round(typicalPerMonth - receivedThisMonth))
  }

  const availableCents = opBalance + expectedIncomeRemainingCents
  const coverageCushionCents = availableCents - totalRemainingObligationsCents

  let coverageStatus: 'green' | 'yellow' | 'red' = 'green'
  if (coverageCushionCents < 0) coverageStatus = 'red'
  else if (coverageCushionCents < typicalPayrollPerMonth * 0.25) coverageStatus = 'yellow'

  const realInThisMonth = allTransfers.filter((t) => t.status === 'COMPLETE' && t.direction === 'MONEY_IN' && inMonth(t)).reduce((s, t) => s + t.amountInCents, 0)
  const realOutThisMonth = allTransfers.filter((t) => t.status === 'COMPLETE' && t.direction === 'MONEY_OUT' && inMonth(t)).reduce((s, t) => s + t.amountInCents, 0)

  let baselineRealIn = 0
  let baselineRealOut = 0
  for (let i = 1; i <= 3; i++) {
    const ms = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const me = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1))
    baselineRealIn += allTransfers.filter((t) => t.status === 'COMPLETE' && t.direction === 'MONEY_IN' && new Date(t.createdAt).getTime() >= ms.getTime() && new Date(t.createdAt).getTime() < me.getTime()).reduce((s, t) => s + t.amountInCents, 0)
    baselineRealOut += allTransfers.filter((t) => t.status === 'COMPLETE' && t.direction === 'MONEY_OUT' && new Date(t.createdAt).getTime() >= ms.getTime() && new Date(t.createdAt).getTime() < me.getTime()).reduce((s, t) => s + t.amountInCents, 0)
  }
  const projectedRestIn = Math.round((baselineRealIn / 3) * daysRemainingFrac)
  const projectedRestOut = Math.round((baselineRealOut / 3) * daysRemainingFrac)
  const projectedMonthIn = realInThisMonth + projectedRestIn
  const projectedMonthOut = realOutThisMonth + projectedRestOut
  const projectedMonthNet = projectedMonthIn - projectedMonthOut

  let plStatus: 'green' | 'yellow' | 'red' = 'green'
  if (projectedMonthNet < 0) plStatus = 'red'
  else if (projectedMonthNet < (baselineRealIn / 3) * 0.05) plStatus = 'yellow'

  return {
    monthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    dayOfMonth: Math.floor(dayOfMonth) + 1,
    daysInMonth: Math.round(daysInMonth),
    coverage: {
      status: coverageStatus,
      cushionCents: coverageCushionCents,
      availableCents,
      opBalanceCents: opBalance,
      expectedIncomeRemainingCents,
      remainingObligationsCents: totalRemainingObligationsCents,
      remainingPayrollCents: remainingPayroll,
      remainingAmexCents: remainingAmex,
      paidPayrollCents: paidPayroll,
      paidAmexCents: paidAmex,
      typicalPayrollCents: typicalPayrollPerMonth,
      typicalAmexCents: typicalAmexPerMonth,
    },
    pl: {
      status: plStatus,
      projectedNetCents: projectedMonthNet,
      projectedInCents: projectedMonthIn,
      projectedOutCents: projectedMonthOut,
      actualInCents: realInThisMonth,
      actualOutCents: realOutThisMonth,
      projectedRestInCents: projectedRestIn,
      projectedRestOutCents: projectedRestOut,
    },
  }
}

export function netFlow30dReal(allTransfers: Transfer[]) {
  const cutoff = Date.now() - 30 * DAY_MS
  let inflow = 0
  let outflow = 0
  for (const t of allTransfers) {
    if (t.status !== 'COMPLETE') continue
    if (new Date(t.createdAt).getTime() < cutoff) continue
    if (t.direction === 'MONEY_IN') inflow += t.amountInCents
    else if (t.direction === 'MONEY_OUT') outflow += t.amountInCents
  }
  return { inflowCents: inflow, outflowCents: outflow, netCents: inflow - outflow }
}

export function operationsRunway(opAccount: Account | null, opTransfers: Transfer[], lookbackDays = 60) {
  if (!opAccount?.balance) return null
  const cutoff = Date.now() - lookbackDays * DAY_MS
  let totalOut = 0
  for (const t of opTransfers) {
    if (t.status !== 'COMPLETE') continue
    if (new Date(t.createdAt).getTime() < cutoff) continue
    if (t.direction !== 'MONEY_OUT') continue
    if (t.source?.id !== opAccount.id) continue
    totalOut += t.amountInCents
  }
  const dailyOut = totalOut / lookbackDays
  const balance = opAccount.balance.balanceInCents ?? 0
  const daysRunway = dailyOut > 0 ? balance / dailyOut : Infinity
  return {
    currentBalanceCents: balance,
    dailyOutCents: Math.round(dailyOut),
    daysOfRunway: dailyOut > 0 ? Math.round(daysRunway) : null,
    basis: `${lookbackDays}-day external out only`,
  }
}

export function monthlyPace(opAccount: Account | null, opTransfers: Transfer[]) {
  if (!opAccount) return null
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const dayOfMonth = now.getUTCDate()
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()

  let thisMonthOut = 0
  const monthlySums: Record<string, number> = {}
  for (const t of opTransfers) {
    if (t.status !== 'COMPLETE') continue
    if (t.direction !== 'MONEY_OUT') continue
    if (t.source?.id !== opAccount.id) continue
    const ts = new Date(t.createdAt)
    if (ts >= monthStart) thisMonthOut += t.amountInCents
    else {
      const k = ymKey(ts)
      monthlySums[k] = (monthlySums[k] || 0) + t.amountInCents
    }
  }

  const completeMonths: number[] = []
  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    completeMonths.push(monthlySums[ymKey(d)] || 0)
  }
  const typicalMonthly = mean(completeMonths.filter((x) => x > 0))
  const monthFraction = dayOfMonth / daysInMonth
  const expectedByNow = typicalMonthly * monthFraction
  const paceRatio = expectedByNow > 0 ? thisMonthOut / expectedByNow : null
  const projectedMonthEnd = monthFraction > 0 ? thisMonthOut / monthFraction : 0

  return {
    thisMonthOutCents: thisMonthOut,
    dayOfMonth,
    daysInMonth,
    typicalMonthlyCents: Math.round(typicalMonthly),
    expectedByNowCents: Math.round(expectedByNow),
    paceRatio,
    projectedMonthEndCents: Math.round(projectedMonthEnd),
  }
}

export function creditCardEarmark(creditCardPods: Account[], opAccount: Account | null, opTransfers: Transfer[]) {
  const totalSetAside = creditCardPods.reduce((s, a) => s + (a.balance?.balanceInCents || 0), 0)
  const now = new Date()
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const cardIds = new Set(creditCardPods.map((a) => a.id))
  let lastMonthFunded = 0
  if (opAccount) {
    for (const t of opTransfers) {
      if (t.status !== 'COMPLETE') continue
      if (t.source?.id !== opAccount.id) continue
      if (!t.destination?.id || !cardIds.has(t.destination.id)) continue
      const ts = new Date(t.createdAt)
      if (ts >= lastMonthStart && ts < lastMonthEnd) lastMonthFunded += t.amountInCents
    }
  }
  return {
    totalSetAsideCents: totalSetAside,
    lastMonthFundedCents: lastMonthFunded,
    cardCount: creditCardPods.length,
    cards: creditCardPods.map((c) => ({ name: c.name, balanceCents: c.balance?.balanceInCents ?? 0 })),
  }
}

interface ExpectedOut {
  name: string; type: string; direction: string; cadence: string
  avgAmountCents: number; nextExpectedDate: string; lastSeen: string
  isScheduled?: boolean
}
interface ExpectedIn { name: string; amountCents: number; expectedDate: string }

export function operationsForecast30d(
  opAccount: Account | null,
  opTransfers: Transfer[],
  transfersByAccount: TransfersByAccount[],
  incomeSource: Account | null,
  lookbackDays = 90,
  scheduled: ScheduledOutflow[] = [],
) {
  if (!opAccount) return null
  const cutoff = Date.now() - lookbackDays * DAY_MS

  const opOut = opTransfers.filter((t) =>
    t.status === 'COMPLETE' && new Date(t.createdAt).getTime() >= cutoff && t.source?.id === opAccount.id && destinationKey(t)
  )
  const outGroups = new Map<string, { name: string; type: string; direction: string; ts: number[]; amts: number[] }>()
  for (const t of opOut) {
    const k = destinationKey(t)!
    if (!outGroups.has(k)) outGroups.set(k, { name: displayDestName(t), type: t.destination?.type || 'EXTERNAL', direction: t.direction, ts: [], amts: [] })
    outGroups.get(k)!.ts.push(new Date(t.createdAt).getTime())
    outGroups.get(k)!.amts.push(t.amountInCents)
  }

  const expectedOut: ExpectedOut[] = []
  for (const g of Array.from(outGroups.values())) {
    if (g.ts.length < 2) continue
    const sorted = [...g.ts].sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / DAY_MS)
    const avgGap = mean(gaps)
    const cadence = detectCadence(avgGap)
    if (!cadence) continue
    const lastTs = sorted.at(-1)!
    const nextTs = lastTs + avgGap * DAY_MS
    if (nextTs - Date.now() > 35 * DAY_MS) continue
    expectedOut.push({
      name: g.name, type: g.type, direction: g.direction, cadence: cadence.name,
      avgAmountCents: Math.round(mean(g.amts)),
      nextExpectedDate: new Date(nextTs).toISOString(),
      lastSeen: new Date(lastTs).toISOString(),
    })
  }
  expectedOut.sort((a, b) => new Date(a.nextExpectedDate).getTime() - new Date(b.nextExpectedDate).getTime())

  // Merge in user-entered scheduled outflows due in the next 30 days. If the
  // user scheduled a payroll, suppress the baseline-detected Gusto/payroll
  // entry to avoid double-counting.
  const now30 = Date.now() + 30 * DAY_MS
  const scheduled30 = scheduled.filter((s) => {
    const t = new Date(s.date).getTime()
    return t >= Date.now() - DAY_MS && t < now30
  })
  if (scheduled30.some((s) => s.category === 'payroll')) {
    for (let i = expectedOut.length - 1; i >= 0; i--) {
      if (/\bgusto\b|payroll/i.test(expectedOut[i].name)) expectedOut.splice(i, 1)
    }
  }
  for (const s of scheduled30) {
    expectedOut.push({
      name: s.label,
      type: 'SCHEDULED',
      direction: 'MONEY_OUT',
      cadence: 'one-time',
      avgAmountCents: s.amountCents,
      nextExpectedDate: s.date,
      lastSeen: s.date,
      isScheduled: true,
    })
  }
  expectedOut.sort((a, b) => new Date(a.nextExpectedDate).getTime() - new Date(b.nextExpectedDate).getTime())

  let expectedInCents = 0
  const expectedIn: ExpectedIn[] = []
  if (incomeSource) {
    const incomeTransfers = transfersFor(incomeSource.id, transfersByAccount).filter((t) =>
      t.status === 'COMPLETE' && t.direction === 'INTERNAL' && t.destination?.id === opAccount.id && new Date(t.createdAt).getTime() >= cutoff
    )
    if (incomeTransfers.length >= 2) {
      const sorted = incomeTransfers.map((t) => new Date(t.createdAt).getTime()).sort((a, b) => a - b)
      const gaps: number[] = []
      for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / DAY_MS)
      const avgGap = mean(gaps)
      const avgAmount = mean(incomeTransfers.map((t) => t.amountInCents))
      const lastTs = sorted.at(-1)!
      let count = 0
      let cursor = lastTs
      while (cursor + avgGap * DAY_MS < Date.now() + 30 * DAY_MS) {
        cursor += avgGap * DAY_MS
        if (cursor > Date.now()) {
          count++
          expectedIn.push({ name: 'Income → Operations', amountCents: Math.round(avgAmount), expectedDate: new Date(cursor).toISOString() })
        }
      }
      expectedInCents = Math.round(avgAmount * count)
    }
  }

  const expectedOutTotal = expectedOut.reduce((s, x) => s + x.avgAmountCents, 0)
  const currentBal = opAccount.balance?.balanceInCents ?? 0
  const projected = currentBal + expectedInCents - expectedOutTotal

  let status: 'green' | 'yellow' | 'red' = 'green'
  if (projected < 0) status = 'red'
  else if (projected < expectedOutTotal * 0.25) status = 'yellow'

  return {
    currentBalanceCents: currentBal,
    expectedOutCents: expectedOutTotal,
    expectedInCents,
    projectedBalanceCents: projected,
    status,
    expectedOut: expectedOut.slice(0, 12),
    expectedIn,
  }
}

export interface MonthlyPLPoint { month: string; label: string; incomeCents: number; outflowCents: number; netCents: number }
export function monthlyPL12(allTransfers: Transfer[]): MonthlyPLPoint[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    months.push(ymKey(d))
  }
  const totals: Record<string, { income: number; outflow: number }> = Object.fromEntries(months.map((m) => [m, { income: 0, outflow: 0 }]))
  for (const t of allTransfers) {
    if (t.status !== 'COMPLETE') continue
    const k = ymKey(t.createdAt)
    if (!(k in totals)) continue
    if (t.direction === 'MONEY_IN') totals[k].income += t.amountInCents
    else if (t.direction === 'MONEY_OUT') totals[k].outflow += t.amountInCents
  }
  return months.map((m) => ({
    month: m, label: ymLabel(m),
    incomeCents: totals[m].income, outflowCents: totals[m].outflow,
    netCents: totals[m].income - totals[m].outflow,
  }))
}

export function operationsBreakdown(opAccount: Account | null, opTransfers: Transfer[], categoryMap: CategoryMap, lookbackDays = 90) {
  if (!opAccount) return { totalCents: 0, byCategory: [], byDestination: [] }
  const cutoff = Date.now() - lookbackDays * DAY_MS
  const out = opTransfers.filter((t) =>
    t.status === 'COMPLETE' && t.source?.id === opAccount.id && destinationKey(t) &&
    new Date(t.createdAt).getTime() >= cutoff && (t.direction === 'MONEY_OUT' || t.direction === 'INTERNAL')
  )

  const byCat = new Map<string, number>()
  const byDest = new Map<string, number>()
  let total = 0
  for (const t of out) {
    total += t.amountInCents
    const cat = categorize(t, categoryMap)
    byCat.set(cat, (byCat.get(cat) || 0) + t.amountInCents)
    const d = displayDestName(t)
    byDest.set(d, (byDest.get(d) || 0) + t.amountInCents)
  }
  const byCategory = Array.from(byCat.entries())
    .map(([category, amountCents]) => ({ category, amountCents, pct: total > 0 ? amountCents / total : 0 }))
    .sort((a, b) => b.amountCents - a.amountCents)
  const byDestination = Array.from(byDest.entries())
    .map(([name, amountCents]) => ({ name, amountCents, pct: total > 0 ? amountCents / total : 0 }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 12)
  return { totalCents: total, byCategory, byDestination }
}

export interface ObligationRow {
  podName: string; destName: string; destType: string; direction: string; cadence: string
  avgAmountCents: number; lastSeen: string; nextExpectedDate: string; annualizedCents: number
}
export function recurringObligations(transfersByAccount: TransfersByAccount[], accounts: Account[], lookbackDays = 90): ObligationRow[] {
  const cutoff = Date.now() - lookbackDays * DAY_MS
  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  const rows: ObligationRow[] = []
  for (const { accountId, transfers } of transfersByAccount) {
    const account = accountMap.get(accountId)
    if (!account || account.type !== 'POD' || account.deletedAt) continue
    const outs = transfers.filter((t) =>
      t.status === 'COMPLETE' && t.source?.id === accountId && destinationKey(t) &&
      new Date(t.createdAt).getTime() >= cutoff && (t.direction === 'MONEY_OUT' || t.direction === 'INTERNAL')
    )
    const groups = new Map<string, { name: string; type: string; direction: string; ts: number[]; amts: number[] }>()
    for (const t of outs) {
      const k = destinationKey(t)!
      if (!groups.has(k)) groups.set(k, { name: displayDestName(t), type: t.destination?.type || 'EXTERNAL', direction: t.direction, ts: [], amts: [] })
      groups.get(k)!.ts.push(new Date(t.createdAt).getTime())
      groups.get(k)!.amts.push(t.amountInCents)
    }
    for (const g of Array.from(groups.values())) {
      if (g.ts.length < 3) continue
      const sorted = [...g.ts].sort((a, b) => a - b)
      const gaps: number[] = []
      for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / DAY_MS)
      const avgGap = mean(gaps)
      const cadence = detectCadence(avgGap)
      if (!cadence) continue
      const lastTs = sorted.at(-1)!
      const nextTs = lastTs + avgGap * DAY_MS
      rows.push({
        podName: account.name, destName: g.name, destType: g.type, direction: g.direction,
        cadence: cadence.name, avgAmountCents: Math.round(mean(g.amts)),
        lastSeen: new Date(lastTs).toISOString(), nextExpectedDate: new Date(nextTs).toISOString(),
        annualizedCents: Math.round(mean(g.amts) * cadence.daysPerYear),
      })
    }
  }
  return rows.sort((a, b) => new Date(a.nextExpectedDate).getTime() - new Date(b.nextExpectedDate).getTime())
}

export function ownerPayView(ownerPay: Account | null, ownerPayTransfers: Transfer[], categoryMap: CategoryMap) {
  if (!ownerPay) return null
  const now = new Date()
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    months.push(ymKey(d))
  }
  const monthlyOut: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]))
  const monthlyIn: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]))
  for (const t of ownerPayTransfers) {
    if (t.status !== 'COMPLETE') continue
    const k = ymKey(t.createdAt)
    if (!(k in monthlyOut)) continue
    if (t.source?.id === ownerPay.id) monthlyOut[k] += t.amountInCents
    if (t.destination?.id === ownerPay.id) monthlyIn[k] += t.amountInCents
  }

  const cutoff30 = Date.now() - 30 * DAY_MS
  let in30 = 0
  let out30 = 0
  for (const t of ownerPayTransfers) {
    if (t.status !== 'COMPLETE') continue
    if (new Date(t.createdAt).getTime() < cutoff30) continue
    if (t.source?.id === ownerPay.id) out30 += t.amountInCents
    if (t.destination?.id === ownerPay.id) in30 += t.amountInCents
  }

  const cutoff90 = Date.now() - 90 * DAY_MS
  const out90 = ownerPayTransfers.filter((t) =>
    t.status === 'COMPLETE' && t.source?.id === ownerPay.id && destinationKey(t) && new Date(t.createdAt).getTime() >= cutoff90
  )
  const byDest = new Map<string, number>()
  const byCat = new Map<string, number>()
  let total90 = 0
  for (const t of out90) {
    total90 += t.amountInCents
    byDest.set(displayDestName(t), (byDest.get(displayDestName(t)) || 0) + t.amountInCents)
    const cat = categorize(t, categoryMap)
    byCat.set(cat, (byCat.get(cat) || 0) + t.amountInCents)
  }

  const outGroups = new Map<string, { name: string; type: string; ts: number[]; amts: number[] }>()
  for (const t of out90) {
    const k = destinationKey(t)!
    if (!outGroups.has(k)) outGroups.set(k, { name: displayDestName(t), type: t.destination?.type || 'EXTERNAL', ts: [], amts: [] })
    outGroups.get(k)!.ts.push(new Date(t.createdAt).getTime())
    outGroups.get(k)!.amts.push(t.amountInCents)
  }
  const recurring: { name: string; cadence: string; avgAmountCents: number; annualizedCents: number }[] = []
  for (const g of Array.from(outGroups.values())) {
    if (g.ts.length < 3) continue
    const sorted = [...g.ts].sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / DAY_MS)
    const avgGap = mean(gaps)
    const cadence = detectCadence(avgGap)
    if (!cadence) continue
    const avgAmount = Math.round(mean(g.amts))
    recurring.push({ name: g.name, cadence: cadence.name, avgAmountCents: avgAmount, annualizedCents: Math.round(avgAmount * cadence.daysPerYear) })
  }
  recurring.sort((a, b) => b.annualizedCents - a.annualizedCents)

  return {
    currentBalanceCents: ownerPay.balance?.balanceInCents ?? 0,
    netFlow30dCents: in30 - out30,
    in30Cents: in30,
    out30Cents: out30,
    monthlyTrend: months.map((m) => ({ month: m, label: ymLabel(m), inCents: monthlyIn[m], outCents: monthlyOut[m], netCents: monthlyIn[m] - monthlyOut[m] })),
    total90Cents: total90,
    topDestinations: Array.from(byDest.entries()).map(([name, amountCents]) => ({ name, amountCents, pct: total90 > 0 ? amountCents / total90 : 0 })).sort((a, b) => b.amountCents - a.amountCents).slice(0, 8),
    byCategory: Array.from(byCat.entries()).map(([category, amountCents]) => ({ category, amountCents, pct: total90 > 0 ? amountCents / total90 : 0 })).sort((a, b) => b.amountCents - a.amountCents),
    recurring,
  }
}

export interface AnomalyRow {
  podName: string; week: string; sumCents: number; baselineCents: number; ratio: number; driverName: string; driverAmountCents: number
}
export function perPodAnomalies(transfersByAccount: TransfersByAccount[], accounts: Account[], lookbackDays = 90): AnomalyRow[] {
  const cutoff = Date.now() - lookbackDays * DAY_MS
  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  const result: AnomalyRow[] = []

  for (const { accountId, transfers } of transfersByAccount) {
    const account = accountMap.get(accountId)
    if (!account || account.type !== 'POD' || account.deletedAt) continue
    const outs = transfers.filter((t) =>
      t.status === 'COMPLETE' && t.source?.id === accountId && t.direction === 'MONEY_OUT' && new Date(t.createdAt).getTime() >= cutoff
    )
    if (outs.length < 5) continue

    const buckets = new Map<string, { sum: number; ts: Transfer[] }>()
    for (const t of outs) {
      const wk = startOfIsoWeek(t.createdAt).toISOString().slice(0, 10)
      if (!buckets.has(wk)) buckets.set(wk, { sum: 0, ts: [] })
      const b = buckets.get(wk)!
      b.sum += t.amountInCents
      b.ts.push(t)
    }
    const weeks = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b))
    for (let i = 0; i < weeks.length; i++) {
      const [wk, info] = weeks[i]
      const trailing = weeks.slice(Math.max(0, i - 8), i).map(([, x]) => x.sum)
      if (trailing.length < 4) continue
      const baseline = mean(trailing)
      if (baseline <= 0) continue
      const ratio = info.sum / baseline
      if (ratio > 3) {
        const topT = info.ts.slice().sort((a, b) => b.amountInCents - a.amountInCents)[0]
        result.push({
          podName: account.name, week: wk, sumCents: info.sum, baselineCents: Math.round(baseline), ratio,
          driverName: topT ? displayDestName(topT) : '—', driverAmountCents: topT?.amountInCents ?? 0,
        })
      }
    }
  }
  return result.sort((a, b) => b.week.localeCompare(a.week) || b.ratio - a.ratio)
}

export function yoyByDestination(allTransfers: Transfer[], topN = 8) {
  const now = Date.now()
  const yearMs = 365 * DAY_MS
  const moneyOut = allTransfers.filter((t) => t.direction === 'MONEY_OUT' && t.status === 'COMPLETE')
  const groups = new Map<string, { destId: string; name: string | null | undefined; current: number; prior: number }>()
  for (const t of moneyOut) {
    if (!t.destination?.id) continue
    const age = now - new Date(t.createdAt).getTime()
    let bucket: 'current' | 'prior'
    if (age < yearMs) bucket = 'current'
    else if (age < 2 * yearMs) bucket = 'prior'
    else continue
    const key = t.destination.id
    if (!groups.has(key)) groups.set(key, { destId: key, name: t.destination.name, current: 0, prior: 0 })
    groups.get(key)![bucket] += t.amountInCents
  }
  return Array.from(groups.values()).sort((a, b) => b.current - a.current).slice(0, topN)
}

export function incomeDistribution(transfersByAccount: TransfersByAccount[], incomeSource: Account | null, lookbackDays = 180) {
  if (!incomeSource) return null
  const cutoff = Date.now() - lookbackDays * 86400000
  const incomeTransfers = (transfersByAccount.find((x) => x.accountId === incomeSource.id)?.transfers || []).filter((t) =>
    t.status === 'COMPLETE' && t.direction === 'INTERNAL' && t.source?.id === incomeSource.id && t.destination?.id && new Date(t.createdAt).getTime() >= cutoff
  )

  const distribution = new Map<string, { podId: string; podName: string | null | undefined; totalCents: number; count: number }>()
  for (const t of incomeTransfers) {
    const k = t.destination!.id!
    if (!distribution.has(k)) distribution.set(k, { podId: k, podName: t.destination!.name, totalCents: 0, count: 0 })
    const d = distribution.get(k)!
    d.totalCents += t.amountInCents
    d.count += 1
  }
  const grand = Array.from(distribution.values()).reduce((s, x) => s + x.totalCents, 0)
  const rows = Array.from(distribution.values()).map((x) => ({ ...x, ratioPct: grand > 0 ? x.totalCents / grand : 0 })).sort((a, b) => b.ratioPct - a.ratioPct)

  return {
    lookbackDays,
    totalDistributedCents: grand,
    transferCount: incomeTransfers.length,
    podRatios: rows,
    sampleSizeAdequate: grand > 100000 && incomeTransfers.length >= 5,
  }
}

// ─── Debt paydown analysis ────────────────────────────────────────────────

function monthsToPayoff(balanceCents: number, monthlyPaymentCents: number, monthlyRate: number): number {
  if (monthlyPaymentCents <= balanceCents * monthlyRate) return Infinity
  if (monthlyRate === 0) return Math.ceil(balanceCents / monthlyPaymentCents)
  return Math.ceil(-Math.log(1 - (balanceCents * monthlyRate) / monthlyPaymentCents) / Math.log(1 + monthlyRate))
}

function totalInterest(balanceCents: number, monthlyPaymentCents: number, monthlyRate: number): number {
  const months = monthsToPayoff(balanceCents, monthlyPaymentCents, monthlyRate)
  if (!Number.isFinite(months)) return Infinity
  return Math.max(0, Math.round(monthlyPaymentCents * months - balanceCents))
}

interface DebtEnriched extends DebtInput {
  monthlyRate: number; monthlyInterestCents: number; minMonths: number; interestAtMinCents: number
}

function enrichDebts(rawDebts: DebtInput[]): DebtEnriched[] {
  return rawDebts.map((d) => {
    const monthlyRate = (d.aprPct / 100) / 12
    const monthlyInterestCents = Math.round(d.balanceCents * monthlyRate)
    const minMonths = d.minPaymentCents > 0 ? monthsToPayoff(d.balanceCents, d.minPaymentCents, monthlyRate) : Infinity
    const interestAtMin = d.minPaymentCents > 0 ? totalInterest(d.balanceCents, d.minPaymentCents, monthlyRate) : Infinity
    return { ...d, monthlyRate, monthlyInterestCents, minMonths, interestAtMinCents: interestAtMin }
  })
}

function simulatePaydown(debts: DebtEnriched[], extraPerMonth: number, ordering: DebtEnriched[]) {
  const totalMin = debts.reduce((s, d) => s + d.minPaymentCents, 0)
  const state = ordering.map((d) => ({ ...d, remaining: d.balanceCents }))
  let totalInterestPaid = 0
  let months = 0
  const monthlyBudget = totalMin + extraPerMonth
  while (state.some((d) => d.remaining > 0) && months < 600) {
    months++
    let budgetLeft = monthlyBudget
    for (const d of state) {
      if (d.remaining > 0) {
        const interest = d.remaining * d.monthlyRate
        d.remaining += interest
        totalInterestPaid += interest
      }
    }
    for (const d of state) {
      if (d.remaining > 0) {
        const pay = Math.min(d.minPaymentCents, d.remaining, budgetLeft)
        d.remaining -= pay
        budgetLeft -= pay
      }
    }
    for (const d of state) {
      if (d.remaining > 0 && budgetLeft > 0) {
        const pay = Math.min(budgetLeft, d.remaining)
        d.remaining -= pay
        budgetLeft -= pay
      }
    }
  }
  return { months, totalInterestCents: Math.round(totalInterestPaid) }
}

function summarizeGroup(debts: DebtEnriched[]) {
  if (!debts.length) return null
  const avalanche = [...debts].sort((a, b) => b.aprPct - a.aprPct)
  const snowball = [...debts].sort((a, b) => a.balanceCents - b.balanceCents)
  const totalBalance = debts.reduce((s, d) => s + d.balanceCents, 0)
  const totalMin = debts.reduce((s, d) => s + d.minPaymentCents, 0)
  const totalInterestMonthly = debts.reduce((s, d) => s + d.monthlyInterestCents, 0)
  return {
    debts,
    totalBalanceCents: totalBalance,
    totalMinPaymentCents: totalMin,
    totalMonthlyInterestCents: totalInterestMonthly,
    annualInterestBurdenCents: totalInterestMonthly * 12,
    avalancheOrder: avalanche.map((d) => d.name),
    snowballOrder: snowball.map((d) => d.name),
    scenarios: {
      minOnly: { extraCents: 0, ...simulatePaydown(debts, 0, avalanche) },
      plus500: { extraCents: 50000, ...simulatePaydown(debts, 50000, avalanche) },
      plus1000: { extraCents: 100000, ...simulatePaydown(debts, 100000, avalanche) },
      plus2000: { extraCents: 200000, ...simulatePaydown(debts, 200000, avalanche) },
    },
  }
}

export function analyzeDebts(debtsConfig: DebtsConfig | null) {
  if (!debtsConfig?.debts) return null
  const all = enrichDebts(debtsConfig.debts)
  const business = all.filter((d) => (d.kind || 'business') === 'business')
  const personal = all.filter((d) => d.kind === 'personal')
  return {
    asOfDate: debtsConfig.asOfDate,
    all,
    business: summarizeGroup(business),
    personal: summarizeGroup(personal),
    combinedTotalBalanceCents: all.reduce((s, d) => s + d.balanceCents, 0),
    combinedMonthlyInterestCents: all.reduce((s, d) => s + d.monthlyInterestCents, 0),
    combinedAnnualInterestCents: all.reduce((s, d) => s + d.monthlyInterestCents, 0) * 12,
  }
}

// ─── AR aging analysis ────────────────────────────────────────────────────

export function analyzeAr(arSnapshot: ArSnapshot | null) {
  if (!arSnapshot) return null
  const buckets = arSnapshot.bucketTotalsCents || {}
  const atRisk = buckets['91 or more days past due'] || 0
  const total = arSnapshot.totalOpenCents || 0
  const likelyCollectable = total - atRisk
  const topCustomers = Object.entries(arSnapshot.byCustomer || {})
    .map(([name, info]) => ({ name, ...info }))
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 15)
  const stale = topCustomers
    .filter((c) => (c.byBucketCents?.['91 or more days past due'] || 0) > 0)
    .map((c) => ({ name: c.name, atRiskCents: c.byBucketCents!['91 or more days past due'], invoiceCount: c.invoiceCount, oldest: c.oldestInvoiceDate }))
    .sort((a, b) => b.atRiskCents - a.atRiskCents)
  return {
    asOfDate: arSnapshot.asOfDate,
    totalOpenCents: total,
    atRiskCents: atRisk,
    likelyCollectableCents: likelyCollectable,
    bucketTotalsCents: buckets,
    topCustomers,
    staleCustomers: stale,
    invoiceCount: arSnapshot.invoiceCount,
  }
}

// ─── Action recommendations ───────────────────────────────────────────────

export interface Action { priority: number; severity: string; title: string; why: string; action: string }

export function generateActions(ctx: {
  qb: QbSnapshot | null
  debts: ReturnType<typeof analyzeDebts>
  ar: ReturnType<typeof analyzeAr>
  empowerLiveBalanceCents: number | null
}): Action[] {
  const actions: Action[] = []
  const { qb, debts, ar, empowerLiveBalanceCents } = ctx

  const bookCents = qb?.balanceSheet?.empowerBusinessCheckingCents
  const liveCents = empowerLiveBalanceCents
  if (liveCents != null && liveCents < 0) {
    actions.push({
      priority: 1, severity: 'red',
      title: `Clear ${formatUSD(-liveCents)} overdraft on Empower Business Checking`,
      why: 'Live bank balance is negative — the next ACH pull will bounce. Transfer in immediately.',
      action: `Move at least ${formatUSD(-liveCents + 50000)} from Operations or Owner's Pay into Empower Business Checking today.`,
    })
  } else if (bookCents != null && bookCents < 0 && liveCents != null && liveCents >= 0) {
    actions.push({
      priority: 6, severity: 'gray',
      title: 'QuickBooks is behind the bank on Empower Business Checking',
      why: `QB books show ${formatUSD(bookCents)} but the live bank balance is ${formatUSD(liveCents)}. Not an overdraft — just unreconciled deposits/transactions in QB.`,
      action: 'Reconcile Empower Business Checking in QuickBooks so the books match the bank. No money movement needed.',
    })
  } else if (bookCents != null && bookCents < 0 && liveCents == null) {
    actions.push({
      priority: 6, severity: 'gray',
      title: `QuickBooks shows Empower Business Checking at ${formatUSD(bookCents)} (book balance)`,
      why: `This is from the QB snapshot as of ${qb?.asOfDate || 'the last export'}, not a live balance. Verify against your actual bank balance before acting — it may just be unreconciled timing.`,
      action: 'Check the live Empower balance. Only move money if the bank itself shows negative.',
    })
  }

  if (debts?.business?.debts.length) {
    const top = [...debts.business.debts].sort((a, b) => b.monthlyInterestCents - a.monthlyInterestCents)[0]
    actions.push({
      priority: 2, severity: 'yellow',
      title: `Pay down ${top.name} first (highest interest cost)`,
      why: `Costs you ${formatUSD(top.monthlyInterestCents)}/month in interest at ${top.aprPct}% APR. Total business debt interest: ${formatUSD(debts.business.totalMonthlyInterestCents)}/mo (${formatUSD(debts.business.annualInterestBurdenCents)}/yr).`,
      action: `Avalanche order (highest APR first): ${debts.business.avalancheOrder.join(' → ')}. See debt paydown widget below for time-to-zero estimates.`,
    })
  }

  if (ar && ar.staleCustomers.length > 0) {
    const top3 = ar.staleCustomers.slice(0, 3)
    const top3Sum = top3.reduce((s, c) => s + c.atRiskCents, 0)
    actions.push({
      priority: 3, severity: 'yellow',
      title: `Chase ${top3.length} customers who owe ${formatUSD(top3Sum)} (90+ days past due)`,
      why: `Out of $${(ar.atRiskCents / 100).toFixed(0)} stale AR, ${top3.length} customers account for ${formatUSD(top3Sum)} (${Math.round(top3Sum / ar.atRiskCents * 100)}%). High concentration = a few targeted calls go far.`,
      action: `Call (in order): ${top3.map((c) => c.name + ' (' + formatUSD(c.atRiskCents) + ')').join(', ')}. If they won't pay after 60 days of effort, consider writing off and stopping new work.`,
    })
  }

  if (ar && qb) {
    const collectable = ar.likelyCollectableCents
    const totalCashCents = qb.balanceSheet?.bankAccountsTotalCents || 0
    if (collectable > totalCashCents * 1.5) {
      actions.push({
        priority: 4, severity: 'green',
        title: `Collect ${formatUSD(collectable)} in non-stale AR to multiply your cash position`,
        why: `You have ${formatUSD(totalCashCents)} in bank accounts but ${formatUSD(collectable)} in invoices that should pay (excluding 91+ stale). Collecting this is the biggest single cash-flow lever available.`,
        action: 'Send reminders to all 1-30 and 31-60 day buckets. For 61-90, call directly.',
      })
    }
  }

  if (ar && qb) {
    const collectable = ar.likelyCollectableCents
    const liabilities = qb.balanceSheet?.totalLiabilitiesCents || 0
    const lostAr = ar.atRiskCents
    if (lostAr > 0) {
      actions.push({
        priority: 5, severity: 'gray',
        title: `Worst-case: if ${formatUSD(lostAr)} of stale AR is never paid`,
        why: `Realistic collectable AR (${formatUSD(collectable)}) + current cash (${formatUSD(qb.balanceSheet?.bankAccountsTotalCents || 0)}) = ${formatUSD(collectable + (qb.balanceSheet?.bankAccountsTotalCents || 0))}. Total liabilities = ${formatUSD(liabilities)}.`,
        action: lostAr > liabilities * 0.3
          ? `Write off the ${formatUSD(lostAr)} and stop sending invoices to those customers. Tighten payment terms on new contracts (net 15 or upfront deposit for >$2k jobs).`
          : 'Manageable scenario — your collectable AR plus cash exceeds liabilities. Stale AR is a write-off, not a crisis.',
      })
    }
  }

  return actions.sort((a, b) => a.priority - b.priority)
}

function formatUSD(cents: number): string {
  const dollars = (cents || 0) / 100
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function rulesHealth(rules: Rule[], lastExecs: RuleLastExecution[]) {
  const execMap = new Map(lastExecs.map((e) => [e.ruleId, e.lastExecution]))
  return rules.map((r) => ({
    id: r.id,
    name: r.name || r.description || `Unnamed rule · ${r.id.slice(0, 6)}`,
    status: r.status,
    isSupported: r.isSupported,
    lastExecution: execMap.get(r.id) || null,
  }))
}

export function recentActivityByDestination(allTransfers: Transfer[], categoryMap: CategoryMap, lookbackDays = 90) {
  const cutoff = Date.now() - lookbackDays * 86400000
  const groups = new Map<string, Transfer[]>()
  for (const t of allTransfers) {
    if (t.status !== 'COMPLETE') continue
    if (new Date(t.createdAt).getTime() < cutoff) continue
    if (t.direction === 'MONEY_IN') continue
    const name = displayDestName(t)
    if (!name || name === '—') continue
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name)!.push(t)
  }
  const rows = []
  for (const [name, transfers] of Array.from(groups.entries())) {
    transfers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const total = transfers.reduce((s, t) => s + t.amountInCents, 0)
    const explicit = categoryMap[name]
    const category = explicit || (transfers[0].direction === 'INTERNAL' ? 'transfer-out' : 'untagged')
    rows.push({
      name, category, categorized: !!explicit,
      transferCount: transfers.length, totalCents: total,
      recent: transfers.slice(0, 6).map((t) => ({ date: t.createdAt.slice(0, 10), amountCents: t.amountInCents, sourceName: t.source?.name || '—', direction: t.direction })),
    })
  }
  return rows.sort((a, b) => Number(a.categorized) - Number(b.categorized) || b.totalCents - a.totalCents)
}

// ─── Next payroll lookup ─────────────────────────────────────────────────
// Returns the next upcoming payroll: prefers a user-entered scheduled entry,
// falls back to the baseline-detected Gusto/payroll cadence in the forecast.

export interface NextPayroll {
  date: string
  amountCents: number
  source: 'scheduled' | 'baseline'
}

export function nextPayroll(
  scheduled: ScheduledOutflow[],
  expectedOut: { name: string; nextExpectedDate: string; avgAmountCents: number }[],
): NextPayroll | null {
  const upcomingScheduled = scheduled
    .filter((s) => s.category === 'payroll' && new Date(s.date).getTime() > Date.now() - DAY_MS)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
  if (upcomingScheduled) {
    return { date: upcomingScheduled.date, amountCents: upcomingScheduled.amountCents, source: 'scheduled' }
  }
  const baseline = expectedOut.find((o) => /\bgusto\b|payroll/i.test(o.name))
  if (baseline) {
    return { date: baseline.nextExpectedDate, amountCents: baseline.avgAmountCents, source: 'baseline' }
  }
  return null
}
