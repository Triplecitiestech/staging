/**
 * Sequence (getsequence.io) banking API client. Ported from the standalone
 * tool's api.mjs. Read-only: accounts, transfers, rules.
 *
 * Every external fetch carries an AbortSignal.timeout per project rules.
 * Retries 429 / 5xx with exponential backoff, honoring Retry-After.
 */

import type { Account, Transfer, TransfersByAccount, Rule, RuleLastExecution } from './types'

const BASE = 'https://api.getsequence.io/platform/v1'
const MAX_CONCURRENCY = 3
const MAX_RETRIES = 4
const REQUEST_TIMEOUT_MS = 30_000

function authHeaders(): Record<string, string> {
  const token = process.env.SEQUENCE_API_TOKEN
  if (!token) throw new Error('SEQUENCE_API_TOKEN missing from environment')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function apiGet<T = unknown>(path: string): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response
    try {
      res = await fetch(BASE + path, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (e) {
      lastErr = e
      await sleep(Math.min(8000, 500 * 2 ** attempt))
      continue
    }
    if (res.ok) {
      const json = (await res.json()) as { data: T }
      return json.data
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(8000, 500 * 2 ** attempt)
      lastErr = new Error(`GET ${path} → ${res.status} (retrying after ${backoff}ms)`)
      await sleep(backoff)
      continue
    }
    const body = await res.text()
    throw new Error(`GET ${path} → ${res.status}: ${body.slice(0, 200)}`)
  }
  throw lastErr instanceof Error ? lastErr : new Error(`GET ${path} failed after ${MAX_RETRIES} retries`)
}

async function paginate<T = unknown>(path: string, pageSize = 50): Promise<T[]> {
  const items: T[] = []
  let page = 1
  while (true) {
    const sep = path.includes('?') ? '&' : '?'
    const data = await apiGet<{ items?: T[] }>(`${path}${sep}page=${page}&pageSize=${pageSize}`)
    const batch = data?.items ?? []
    items.push(...batch)
    if (batch.length < pageSize) break
    page += 1
    if (page > 200) break
  }
  return items
}

async function mapLimited<I, O>(items: I[], limit: number, fn: (item: I, i: number) => Promise<O>): Promise<O[]> {
  const out = new Array<O>(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return out
}

export async function listAccounts(): Promise<Account[]> {
  return paginate<Account>('/accounts')
}

export async function getAccountDetails(accounts: Account[]): Promise<Account[]> {
  return mapLimited(accounts, MAX_CONCURRENCY, async (a) => {
    try {
      return await apiGet<Account>(`/accounts/${a.id}`)
    } catch {
      return { ...a, balance: null }
    }
  })
}

export async function getTransfersForAccount(accountId: string, fromIso?: string, toIso?: string): Promise<Transfer[]> {
  const qs: string[] = []
  if (fromIso) qs.push(`from=${encodeURIComponent(fromIso)}`)
  if (toIso) qs.push(`to=${encodeURIComponent(toIso)}`)
  const path = `/accounts/${accountId}/transfers${qs.length ? '?' + qs.join('&') : ''}`
  return paginate<Transfer>(path)
}

export async function getAllTransfers(accounts: Account[], fromIso?: string, toIso?: string): Promise<TransfersByAccount[]> {
  return mapLimited(accounts, MAX_CONCURRENCY, async (a) => {
    try {
      return { accountId: a.id, transfers: await getTransfersForAccount(a.id, fromIso, toIso) }
    } catch {
      return { accountId: a.id, transfers: [] }
    }
  })
}

export async function listRules(): Promise<Rule[]> {
  return paginate<Rule>('/rules')
}

export async function getRulesLastExecutions(rules: Rule[]): Promise<RuleLastExecution[]> {
  return mapLimited(rules, MAX_CONCURRENCY, async (r) => {
    try {
      const data = await apiGet<{ items?: unknown[] }>(`/rules/${r.id}/executions?page=1&pageSize=1`)
      return { ruleId: r.id, lastExecution: data?.items?.[0] ?? null }
    } catch {
      return { ruleId: r.id, lastExecution: null }
    }
  })
}
