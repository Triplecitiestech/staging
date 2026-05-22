/**
 * QuickBooks Online API client — authenticated report calls. Ported from the
 * standalone tool's qb-client.mjs, with a fetch timeout added.
 */

import { getAccessToken } from './qb-auth'
import type { QbReport } from './qb-parse'

const BASE: Record<string, string> = {
  sandbox: 'https://sandbox-quickbooks.api.intuit.com',
  production: 'https://quickbooks.api.intuit.com',
}
const MINOR_VERSION = 75
const REQUEST_TIMEOUT_MS = 30_000

async function qbGet(path: string): Promise<QbReport> {
  const { accessToken, realmId, env } = await getAccessToken()
  const base = BASE[env] || BASE.sandbox
  const sep = path.includes('?') ? '&' : '?'
  const url = `${base}/v3/company/${realmId}${path}${sep}minorversion=${MINOR_VERSION}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    // Capture intuit_tid for traceability — Intuit support uses it to trace requests.
    const tid = res.headers.get('intuit_tid') || 'n/a'
    throw new Error(`QB GET ${path} → ${res.status} (intuit_tid=${tid}): ${(await res.text()).slice(0, 300)}`)
  }
  return res.json() as Promise<QbReport>
}

export function getReport(name: string, params: Record<string, string> = {}): Promise<QbReport> {
  const qs = new URLSearchParams(params).toString()
  return qbGet(`/reports/${name}${qs ? '?' + qs : ''}`)
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

export function getBalanceSheet(asOf?: string): Promise<QbReport> {
  return getReport('BalanceSheet', { as_of_date: asOf || ymd(new Date()) })
}

export function getProfitAndLoss(startDate: string, endDate?: string): Promise<QbReport> {
  return getReport('ProfitAndLoss', {
    start_date: startDate,
    end_date: endDate || ymd(new Date()),
    accounting_method: 'Accrual',
  })
}

export function getAgedReceivableDetail(asOf?: string): Promise<QbReport> {
  return getReport('AgedReceivableDetail', { report_date: asOf || ymd(new Date()) })
}
