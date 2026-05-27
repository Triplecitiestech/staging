/**
 * Dashboard build orchestrator. Ported from the standalone tool's build.mjs,
 * but returns a JSON summary (consumed by the React UI) instead of rendering
 * HTML, and reads config/snapshots from Postgres instead of local files.
 *
 * Live QuickBooks pulls are deferred to a later increment; QB/AR data comes
 * from stored snapshots when present, and the dashboard degrades gracefully
 * when they're absent.
 */

import {
  listAccounts, getAccountDetails, getAllTransfers, listRules, getRulesLastExecutions,
} from './sequence-client'
import {
  flattenTransfers, dropRetries, transfersFor, totalCashOnHand, netFlow30dReal,
  operationsRunway, monthlyPace, creditCardEarmark, operationsForecast30d,
  monthlyPL12, operationsBreakdown, recurringObligations, perPodAnomalies,
  yoyByDestination, rulesHealth, ownerPayView, recentActivityByDestination,
  monthCoverageAndPL, analyzeDebts, analyzeAr, generateActions, incomeDistribution,
  nextPayroll,
} from './compute'
import { summarizeRoles } from './roles'
import { buildCategoryMap } from './categories'
import { getCategoryOverrides, getDebts, getQbSnapshot, getArSnapshot, setSetting, getSetting, getTransfersCache, saveTransfersCache, getScheduledOutflows } from './store'
import { isConnected as qbConnected } from './qb-auth'
import { getBalanceSheet, getProfitAndLoss, getAgedReceivableDetail } from './qb-client'
import { parseBalanceSheet, parseProfitAndLoss, parseAgedReceivableDetail } from './qb-parse'
import type { QbSnapshot, ArSnapshot, Transfer, TransfersByAccount, Account } from './types'

const DAY = 86_400_000
const FULL_LOOKBACK_DAYS = 730   // 24 months — the analytics window
const FULL_REFRESH_DAYS = 30     // cache older than this triggers a full re-sync
const OVERLAP_DAYS = 30          // overlap window on delta fetch to catch status updates

/**
 * Fetch transfers using a delta strategy:
 *   - First run (no cache, or cache older than FULL_REFRESH_DAYS): full 24-month pull.
 *   - Subsequent runs: pull only from (cache.syncedAt - OVERLAP_DAYS) to now,
 *     then merge into the cached set (fresh transfers win — captures status
 *     transitions like PENDING → COMPLETE). Transfers older than the analytics
 *     window are trimmed. Drops accounts that no longer exist in Sequence.
 *
 * This keeps us well inside Sequence's 100 req/min limit on every run except
 * the very first / occasional full re-sync, per their guidance.
 */
async function getTransfersDelta(accounts: Account[], log: (msg: string) => void): Promise<TransfersByAccount[]> {
  const cache = await getTransfersCache()
  const now = new Date()
  const cacheAgeMs = cache ? now.getTime() - new Date(cache.syncedAt).getTime() : Infinity
  const useDelta = !!cache && cacheAgeMs < FULL_REFRESH_DAYS * DAY

  const fromDate = useDelta
    ? new Date(new Date(cache!.syncedAt).getTime() - OVERLAP_DAYS * DAY)
    : new Date(now.getTime() - FULL_LOOKBACK_DAYS * DAY)
  const fromIso = fromDate.toISOString()
  const toIso = now.toISOString()
  log(useDelta ? `Delta fetch from ${fromIso} (cache age ${Math.round(cacheAgeMs / DAY)}d)` : `Full 24-month fetch from ${fromIso}`)

  const fresh = await getAllTransfers(accounts, fromIso, toIso)

  const minKeep = now.getTime() - FULL_LOOKBACK_DAYS * DAY
  const cachedByAccount = new Map(cache?.byAccount.map((b) => [b.accountId, b.transfers]) ?? [])

  const merged: TransfersByAccount[] = accounts.map((acc) => {
    const map = new Map<string, Transfer>()
    for (const t of cachedByAccount.get(acc.id) ?? []) {
      if (new Date(t.createdAt).getTime() >= minKeep) map.set(t.id, t)
    }
    for (const t of fresh.find((b) => b.accountId === acc.id)?.transfers ?? []) {
      if (new Date(t.createdAt).getTime() >= minKeep) map.set(t.id, t) // fresh overwrites cached
    }
    return { accountId: acc.id, transfers: Array.from(map.values()) }
  })

  const totalCached = Array.from(cachedByAccount.values()).reduce((s, a) => s + a.length, 0)
  const totalFresh = fresh.reduce((s, a) => s + a.transfers.length, 0)
  const totalMerged = merged.reduce((s, a) => s + a.transfers.length, 0)
  log(`Transfers: ${totalCached} cached + ${totalFresh} fresh → ${totalMerged} merged`)

  await saveTransfersCache({ syncedAt: toIso, byAccount: merged })
  return merged
}

function enrichPl(qb: QbSnapshot | null): QbSnapshot | null {
  if (qb?.pl && qb.monthsInPeriod) {
    qb.pl.avgMonthlyNetCents = Math.round((qb.pl.netIncomeCents ?? 0) / qb.monthsInPeriod)
    qb.pl.avgMonthlyGrossCents = Math.round((qb.pl.grossProfitCents ?? 0) / qb.monthsInPeriod)
    qb.pl.grossMarginPct = qb.pl.incomeCents && qb.pl.incomeCents > 0 ? (qb.pl.grossProfitCents ?? 0) / qb.pl.incomeCents : null
  }
  return qb
}

// Prefer LIVE QuickBooks when connected; fall back to stored JSON snapshots so
// the dashboard never breaks (pre-connection, or if QB is unreachable).
async function loadQbAndAr(log: (msg: string) => void): Promise<{ qb: QbSnapshot | null; arSnapshot: ArSnapshot | null; qbSource: 'live' | 'snapshot' | 'none' }> {
  if (await qbConnected()) {
    try {
      log('QuickBooks connected — pulling live reports...')
      const now = new Date()
      const startDate = `${now.getUTCFullYear() - 1}-01-01`
      const endDate = now.toISOString().slice(0, 10)
      const [bsRaw, plRaw, arRaw] = await Promise.all([
        getBalanceSheet(endDate),
        getProfitAndLoss(startDate, endDate),
        getAgedReceivableDetail(endDate),
      ])
      const monthsInPeriod = Math.max(1, Math.round(((now.getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10)
      const qb = enrichPl({
        asOfDate: endDate,
        periodLabel: `${startDate} – ${endDate} (live)`,
        monthsInPeriod,
        source: 'live',
        pl: parseProfitAndLoss(plRaw),
        balanceSheet: parseBalanceSheet(bsRaw),
      })
      return { qb, arSnapshot: parseAgedReceivableDetail(arRaw), qbSource: 'live' }
    } catch (e) {
      log(`Live QB fetch failed (${e instanceof Error ? e.message : String(e)}) — falling back to snapshots`)
    }
  }
  const [storedQb, storedAr] = await Promise.all([getQbSnapshot(), getArSnapshot()])
  return { qb: enrichPl(storedQb), arSnapshot: storedAr, qbSource: storedQb ? 'snapshot' : 'none' }
}

export interface DashboardData {
  refreshedAt: string
  meta: {
    accountCount: number
    transferCount90d: number
    transferCount24mo: number
    ruleCount: number
    untaggedCount: number
    categorizedCount: number
    totalDestinations: number
    retriesDropped: number
    retriesDroppedAmountCents: number
    qbSource: 'live' | 'snapshot' | 'none'
  }
  totalCashCents: number
  empowerLiveBalanceCents: number | null
  monthly: ReturnType<typeof monthCoverageAndPL>
  netFlow: ReturnType<typeof netFlow30dReal>
  runway: ReturnType<typeof operationsRunway>
  pace: ReturnType<typeof monthlyPace>
  cards: ReturnType<typeof creditCardEarmark>
  opsForecast: ReturnType<typeof operationsForecast30d>
  monthlyPL: ReturnType<typeof monthlyPL12>
  opsBreakdown: ReturnType<typeof operationsBreakdown>
  obligations: ReturnType<typeof recurringObligations>
  anomalies: ReturnType<typeof perPodAnomalies>
  yoy: ReturnType<typeof yoyByDestination>
  rules: ReturnType<typeof rulesHealth>
  ownerPay: ReturnType<typeof ownerPayView>
  activityByDest: ReturnType<typeof recentActivityByDestination>
  incomeSplit: ReturnType<typeof incomeDistribution>
  debts: ReturnType<typeof analyzeDebts>
  ar: ReturnType<typeof analyzeAr>
  qb: QbSnapshot | null
  nextPayroll: ReturnType<typeof nextPayroll>
  actions: ReturnType<typeof generateActions>
}

export interface CachedSnapshot {
  builtAt: string
  durationSeconds: number
  data: DashboardData
}

const SNAPSHOT_KEY = 'dashboard'

export async function getCachedSnapshot(): Promise<CachedSnapshot | null> {
  return getSetting<CachedSnapshot>(SNAPSHOT_KEY)
}

export async function buildDashboard(log: (msg: string) => void = () => {}): Promise<CachedSnapshot> {
  const t0 = Date.now()

  log('Fetching accounts...')
  const accountsList = await listAccounts()
  const [accounts, rules] = await Promise.all([getAccountDetails(accountsList), listRules()])
  log(`Got ${accounts.length} accounts, ${rules.length} rules`)

  const rawByAccount = await getTransfersDelta(accounts, log)
  const rawTransfers = flattenTransfers(rawByAccount)

  const retryFiltered = dropRetries(rawTransfers)
  const allTransfers = retryFiltered.kept
  const keptIds = new Set(allTransfers.map((t) => t.id))
  const transfersByAccount = rawByAccount.map(({ accountId, transfers }) => ({
    accountId,
    transfers: transfers.filter((t) => keptIds.has(t.id)),
  }))

  const lastExecs = await getRulesLastExecutions(rules)
  const roles = summarizeRoles(accounts)

  // Category overrides live in the DB; merge in any newly-seen destinations.
  const storedCategories = (await getCategoryOverrides()) ?? {}
  const cats = buildCategoryMap(allTransfers, storedCategories, 90)
  if (cats.added > 0) await saveMergedCategories(cats.map)

  const opTransfers = roles.operations ? transfersFor(roles.operations.id, transfersByAccount) : []
  const ownerPayTransfers = roles.ownerPay ? transfersFor(roles.ownerPay.id, transfersByAccount) : []

  const { qb, arSnapshot, qbSource } = await loadQbAndAr(log)
  const debtsConfig = await getDebts()
  const scheduledCfg = await getScheduledOutflows()
  const scheduled = scheduledCfg?.items ?? []

  const empowerLiveBalanceCents = roles.empowerChecking?.balance?.balanceInCents ?? null
  const opsForecastValue = operationsForecast30d(roles.operations, opTransfers, transfersByAccount, roles.incomeSource, 90, scheduled)
  const ar = analyzeAr(arSnapshot)
  const debts = analyzeDebts(debtsConfig)

  const data: DashboardData = {
    refreshedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
    meta: {
      accountCount: accounts.length,
      transferCount90d: allTransfers.filter((t) => new Date(t.createdAt).getTime() >= Date.now() - 90 * 86400000).length,
      transferCount24mo: allTransfers.length,
      ruleCount: rules.length,
      untaggedCount: cats.untagged.length,
      categorizedCount: cats.totalDestinations - cats.untagged.length,
      totalDestinations: cats.totalDestinations,
      retriesDropped: retryFiltered.explicitRetryCount + retryFiltered.silentRetryCount,
      retriesDroppedAmountCents: retryFiltered.explicitRetryAmountCents,
      qbSource,
    },
    totalCashCents: totalCashOnHand(accounts),
    empowerLiveBalanceCents,
    monthly: monthCoverageAndPL(roles.operations, opTransfers, allTransfers, roles.incomeSource, transfersByAccount, cats.map, scheduled),
    netFlow: netFlow30dReal(allTransfers),
    runway: operationsRunway(roles.operations, opTransfers, 60),
    pace: monthlyPace(roles.operations, opTransfers),
    cards: creditCardEarmark(roles.creditCardPods, roles.operations, opTransfers),
    opsForecast: opsForecastValue,
    nextPayroll: nextPayroll(scheduled, opsForecastValue?.expectedOut ?? []),
    monthlyPL: monthlyPL12(allTransfers),
    opsBreakdown: operationsBreakdown(roles.operations, opTransfers, cats.map, 90),
    obligations: recurringObligations(transfersByAccount, accounts, 90),
    anomalies: perPodAnomalies(transfersByAccount, accounts, 90),
    yoy: yoyByDestination(allTransfers, 8),
    rules: rulesHealth(rules, lastExecs),
    ownerPay: ownerPayView(roles.ownerPay, ownerPayTransfers, cats.map),
    activityByDest: recentActivityByDestination(allTransfers, cats.map, 90),
    incomeSplit: incomeDistribution(transfersByAccount, roles.incomeSource, 180),
    debts,
    ar,
    qb,
    actions: generateActions({ qb, debts, ar, empowerLiveBalanceCents }),
  }

  const durationSeconds = parseFloat(((Date.now() - t0) / 1000).toFixed(1))
  const snapshot: CachedSnapshot = { builtAt: new Date().toISOString(), durationSeconds, data }
  await setSetting(SNAPSHOT_KEY, snapshot)
  log(`Done in ${durationSeconds}s`)
  return snapshot
}

async function saveMergedCategories(map: Record<string, string>): Promise<void> {
  await setSetting('destination_categories', map)
}
