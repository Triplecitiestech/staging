/**
 * Gusto REST API client.
 *
 * Handles:
 *   - Automatic token refresh (including retry on 401)
 *   - Rate-limit awareness (200 req/min soft limit)
 *   - Timeouts and exponential backoff for transient errors
 *   - Typed methods for the endpoints we actually use
 *
 * Endpoints:
 *   GET  /v1/me                                                    (session info)
 *   GET  /v1/companies/{id}/employees                              (list employees)
 *   GET  /v1/employees/{employee_uuid}                             (employee detail)
 *   GET  /v1/employees/{employee_uuid}/time_off_activities         (historical TO)
 *   GET  /v1/companies/{id}/time_off_policies                      (list policies)
 *   PUT  /v1/time_off_policies/{policy_uuid}/balance               (adjust balance)
 *   GET  /v1/time_off_policies/{policy_uuid}                       (policy + balances)
 */

import { withRetry } from '@/lib/resilience'
import { getGustoApiBase } from './config'
import {
  getValidAccessToken,
  refreshConnection,
  type ActiveConnection,
} from './connection'

// ---------------------------------------------------------------------------
// Types (subset we use)
// ---------------------------------------------------------------------------

export interface GustoCompanyInfo {
  uuid: string
  name: string
  trade_name?: string
  ein?: string
}

export interface GustoEmployee {
  uuid: string
  first_name: string
  last_name: string
  email: string | null           // personal / login email
  work_email: string | null       // work email
  terminated: boolean
  department?: string | null
  jobs?: Array<{ uuid: string; title: string; primary: boolean }>
}

export interface GustoTimeOffPolicy {
  uuid: string
  name: string
  policy_type: string             // e.g. 'vacation' | 'sick'
  accrual_method?: string
  is_active: boolean
  employees?: Array<{
    uuid: string
    balance: string               // decimal string, hours
  }>
}

export interface GustoTimeOffActivity {
  uuid: string
  employee_uuid: string
  policy_uuid: string | null
  policy_name: string | null
  status: string                  // e.g. 'approved' | 'pending' | 'taken'
  hours: string                   // decimal string
  start_date: string              // YYYY-MM-DD
  end_date: string                // YYYY-MM-DD
  reason: string | null
  created_at: string
}

export interface GustoMe {
  uuid: string
  email: string
  roles?: {
    payroll_admin?: {
      companies?: Array<{ uuid: string; name: string }>
    }
  }
}

// ---------------------------------------------------------------------------
// Low-level fetch with auth + refresh-on-401
// ---------------------------------------------------------------------------

async function gustoFetch<T>(
  conn: ActiveConnection,
  path: string,
  init?: RequestInit,
  retryOn401 = true
): Promise<{ data: T; conn: ActiveConnection }> {
  const url = path.startsWith('http') ? path : `${getGustoApiBase(conn.environment)}${path}`

  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${conn.accessToken}`,
      'Content-Type': 'application/json',
      'X-Gusto-API-Version': process.env.GUSTO_API_VERSION || '2026-02-01',
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(30_000),
  })

  if (res.status === 401 && retryOn401) {
    const refreshed = await refreshConnection(conn)
    return gustoFetch<T>(refreshed, path, init, false)
  }

  if (res.status === 429) {
    throw new Error('Gusto rate limit exceeded (429). Retry after a short delay.')
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gusto ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${text}`)
  }

  if (res.status === 204) return { data: undefined as T, conn }
  const text = await res.text()
  if (!text) return { data: undefined as T, conn }
  return { data: JSON.parse(text) as T, conn }
}

async function gustoGet<T>(conn: ActiveConnection, path: string): Promise<T> {
  const result = await withRetry(() => gustoFetch<T>(conn, path), {
    maxRetries: 2,
    baseDelayMs: 500,
  })
  return result.data
}

async function gustoPut<T, B extends object>(
  conn: ActiveConnection,
  path: string,
  body: B
): Promise<T> {
  const result = await withRetry(
    () =>
      gustoFetch<T>(conn, path, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    { maxRetries: 2, baseDelayMs: 500 }
  )
  return result.data
}

// ---------------------------------------------------------------------------
// High-level helpers
// ---------------------------------------------------------------------------

/** Get the OAuth'd user's Gusto profile (includes companies they admin) */
export async function getMe(): Promise<GustoMe> {
  const conn = await getValidAccessToken()
  return gustoGet<GustoMe>(conn, '/v1/me')
}

/** Get the first/primary company for this OAuth connection */
export async function getPrimaryCompany(): Promise<GustoCompanyInfo | null> {
  const me = await getMe()
  const companies = me.roles?.payroll_admin?.companies ?? []
  const primary = companies[0]
  if (!primary) return null
  return { uuid: primary.uuid, name: primary.name }
}

/** List all active employees for a company */
export async function listEmployees(companyUuid: string): Promise<GustoEmployee[]> {
  const conn = await getValidAccessToken()
  const all: GustoEmployee[] = []
  // Gusto uses page/per pagination. Cap at 10 pages (1000 employees) defensively.
  for (let page = 1; page <= 10; page++) {
    const data = await gustoGet<GustoEmployee[]>(
      conn,
      `/v1/companies/${companyUuid}/employees?page=${page}&per=100`
    )
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 100) break
  }
  return all
}

/** List time-off policies for a company (includes employee balances when expanded) */
export async function listTimeOffPolicies(companyUuid: string): Promise<GustoTimeOffPolicy[]> {
  const conn = await getValidAccessToken()
  return gustoGet<GustoTimeOffPolicy[]>(conn, `/v1/companies/${companyUuid}/time_off_policies`)
}

/** Fetch a single policy with its current employee balances */
export async function getTimeOffPolicy(policyUuid: string): Promise<GustoTimeOffPolicy> {
  const conn = await getValidAccessToken()
  return gustoGet<GustoTimeOffPolicy>(conn, `/v1/time_off_policies/${policyUuid}`)
}

/** Get an employee's historical time-off activities */
export async function listEmployeeTimeOffActivities(
  employeeUuid: string
): Promise<GustoTimeOffActivity[]> {
  const conn = await getValidAccessToken()
  try {
    return await gustoGet<GustoTimeOffActivity[]>(
      conn,
      `/v1/employees/${employeeUuid}/time_off_activities`
    )
  } catch (err) {
    // Endpoint may 404 on demo; treat as empty
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('(404)')) return []
    throw err
  }
}

/**
 * Compute an employee's per-policy balance by collecting all company policies
 * that include the employee. Returns the subset of policies they're enrolled in
 * along with their current balance in hours.
 */
export interface EmployeeBalance {
  policyUuid: string
  policyName: string
  policyType: string
  balanceHours: number
}

export async function getEmployeeBalances(
  companyUuid: string,
  employeeUuid: string
): Promise<EmployeeBalance[]> {
  const policies = await listTimeOffPolicies(companyUuid)
  const result: EmployeeBalance[] = []
  for (const p of policies) {
    if (!p.is_active) continue
    const row = p.employees?.find((e) => e.uuid === employeeUuid)
    if (!row) continue
    const num = Number.parseFloat(row.balance)
    result.push({
      policyUuid: p.uuid,
      policyName: p.name,
      policyType: p.policy_type,
      balanceHours: Number.isFinite(num) ? num : 0,
    })
  }
  return result
}

/**
 * Adjust an employee's balance on a specific policy.
 * Called when a PTO request is approved (decrement by hours used).
 * Gusto PUT /v1/time_off_policies/{uuid}/balance expects:
 *   { employees: [{ uuid, balance }] }  // balance is absolute, not delta
 *
 * We fetch current balance, compute new balance (current - hoursUsed),
 * then PUT the new absolute value.
 */
export async function adjustEmployeeBalance(params: {
  policyUuid: string
  employeeUuid: string
  hoursUsed: number
}): Promise<{ previousBalance: number; newBalance: number }> {
  const { policyUuid, employeeUuid, hoursUsed } = params
  const conn = await getValidAccessToken()

  // Fetch current balance
  const policy = await gustoGet<GustoTimeOffPolicy>(conn, `/v1/time_off_policies/${policyUuid}`)
  const current = policy.employees?.find((e) => e.uuid === employeeUuid)
  const previous = current ? Number.parseFloat(current.balance) : 0
  const next = Math.max(0, Number((previous - hoursUsed).toFixed(2)))

  await gustoPut(conn, `/v1/time_off_policies/${policyUuid}/balance`, {
    employees: [{ uuid: employeeUuid, balance: next.toFixed(2) }],
  })

  return { previousBalance: previous, newBalance: next }
}

/** Verify connection by calling /v1/me */
export async function verifyConnection(): Promise<{
  email: string
  primaryCompany: GustoCompanyInfo | null
}> {
  const me = await getMe()
  const companies = me.roles?.payroll_admin?.companies ?? []
  return {
    email: me.email,
    primaryCompany: companies[0] ? { uuid: companies[0].uuid, name: companies[0].name } : null,
  }
}
