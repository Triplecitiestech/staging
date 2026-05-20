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
  isoDaysAgo,
} from './compute'
import { summarizeRoles } from './roles'
import { buildCategoryMap } from './categories'
import { getCategoryOverrides, getDebts, getQbSnapshot, getArSnapshot, setSetting, getSetting } from './store'

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

  const fromIso = isoDaysAgo(730)
  const toIso = new Date().toISOString()
  log('Fetching transfers (24mo)...')
  const rawByAccount = await getAllTransfers(accounts, fromIso, toIso)
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

  const [qb, arSnapshot] = await Promise.all([getQbSnapshot(), getArSnapshot()])
  const debtsConfig = await getDebts()

  const empowerLiveBalanceCents = roles.empowerChecking?.balance?.balanceInCents ?? null
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
      qbSource: qb ? 'snapshot' : 'none',
    },
    totalCashCents: totalCashOnHand(accounts),
    empowerLiveBalanceCents,
    monthly: monthCoverageAndPL(roles.operations, opTransfers, allTransfers, roles.incomeSource, transfersByAccount, cats.map),
    netFlow: netFlow30dReal(allTransfers),
    runway: operationsRunway(roles.operations, opTransfers, 60),
    pace: monthlyPace(roles.operations, opTransfers),
    cards: creditCardEarmark(roles.creditCardPods, roles.operations, opTransfers),
    opsForecast: operationsForecast30d(roles.operations, opTransfers, transfersByAccount, roles.incomeSource, 90),
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
