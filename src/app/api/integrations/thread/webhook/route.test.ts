import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Contract tests for the Thread Automation URL webhook.
//
// Thread's docs (https://docs.getthread.com/article/7vxm10v3zj-magic-agents-
// automation-url) define both sides of the contract this route must honor:
// a bare POST with { intent_name, intent_fields, meta_data } and NO auth
// headers, answered with 200 { success: 200, message } — `message` is relayed
// to the customer verbatim, so the form link must be inside it.
// ---------------------------------------------------------------------------

interface Call {
  sql: string
  params: unknown[]
}

const db: { handler: (sql: string, params: unknown[]) => unknown[]; calls: Call[] } = {
  handler: () => [],
  calls: [],
}

vi.mock('@/lib/db-pool', () => ({
  getPool: () => ({
    connect: async () => ({
      query: async (sql: string, params?: unknown[]) => {
        db.calls.push({ sql, params: params ?? [] })
        return { rows: db.handler(sql, params ?? []), rowCount: 0 }
      },
      release: () => {},
    }),
  }),
}))

const ACME = { id: 'c-acme', slug: 'acme', displayName: 'Acme Manufacturing' }

/** Rows for a DB where Acme exists with Autotask company ID 789. */
function acmeDb(sql: string, params: unknown[]): unknown[] {
  if (sql.includes('"autotaskCompanyId"')) return params[0] === '789' ? [ACME] : []
  if (sql.includes('FROM companies') || sql.includes('company_contacts')) return []
  return []
}

function makeRequest(url: string, body: unknown) {
  const u = new URL(url)
  return {
    nextUrl: u,
    headers: { get: () => null },
    json: async () => body,
  } as never
}

/** A payload exactly shaped like Thread's documented Automation URL POST. */
function threadPayload(overrides: Record<string, unknown> = {}) {
  return {
    intent_name: 'New Employee Onboarding',
    intent_fields: { 'Employee Name': 'John Smith' },
    meta_data: {
      ticket_id: 4721,
      ticket_board_name: 'Service Board',
      ticket_board_id: 1,
      contact_id: 456,
      contact_name: 'Jane Manager',
      contact_email: 'jane@acme.com',
      company_id: '789',
      company_name: 'Acme Manufacturing',
      company_types: ['Managed'],
    },
    ...overrides,
  }
}

const WEBHOOK = 'https://www.triplecitiestech.com/api/integrations/thread/webhook'
const originalEnv = process.env

beforeEach(() => {
  vi.resetModules()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  db.handler = acmeDb
  db.calls = []
  process.env = {
    ...originalEnv,
    THREAD_AUTOMATION_KEY: 'url-key',
    NEXT_PUBLIC_BASE_URL: 'https://www.triplecitiestech.com',
  }
})

afterEach(() => {
  process.env = originalEnv
  vi.restoreAllMocks()
})

describe('POST /api/integrations/thread/webhook', () => {
  it('rejects a request with a wrong ?key= (401)', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeRequest(`${WEBHOOK}?key=wrong&type=onboarding`, threadPayload()))
    expect(res.status).toBe(401)
    expect(db.calls).toHaveLength(0)
  })

  it('FAILS CLOSED with 401 when THREAD_AUTOMATION_KEY is unset', async () => {
    process.env = { ...originalEnv, THREAD_AUTOMATION_KEY: undefined }
    const { POST } = await import('./route')
    const res = await POST(makeRequest(`${WEBHOOK}?key=url-key&type=onboarding`, threadPayload()))
    expect(res.status).toBe(401)
  })

  it('returns the exact Thread response contract with the link in the message', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeRequest(`${WEBHOOK}?key=url-key&type=onboarding`, threadPayload()))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(Object.keys(json).sort()).toEqual(['message', 'success'])
    expect(json.success).toBe(200)
    expect(json.message).toContain('https://www.triplecitiestech.com/form/')
    expect(json.message).toContain('John Smith')
  })

  it('resolves the company by meta_data.company_id and stores Thread metadata on the link', async () => {
    const { POST } = await import('./route')
    await POST(makeRequest(`${WEBHOOK}?key=url-key&type=onboarding`, threadPayload()))

    const insert = db.calls.find((c) => c.sql.includes('INSERT INTO form_links'))
    expect(insert).toBeDefined()
    expect(insert!.params[0]).toBe('c-acme')
    expect(insert!.params[1]).toBe('onboarding')
    expect(insert!.params[4]).toBe('thread')
    // pre_fill from intent_fields ("Employee Name" → first/last)
    expect(JSON.parse(insert!.params[3] as string)).toEqual({
      first_name: 'John',
      last_name: 'Smith',
    })
    // source_meta keeps the Thread chat-ticket ID — the future merge key
    const meta = JSON.parse(insert!.params[7] as string)
    expect(meta.ticketId).toBe(4721)
    expect(meta.companyId).toBe('789')
  })

  it('returns 404 not_configured when company_id is unknown (no fuzzy fallback)', async () => {
    const { POST } = await import('./route')
    const payload = threadPayload({
      meta_data: {
        ticket_id: 1,
        company_id: '424242',
        company_name: 'Acme Manufacturing',
        contact_email: 'jane@nowhere.example',
      },
    })
    // A row exists ONLY behind the fuzzy displayName ILIKE — it must not be
    // picked because an exact identifier (company_id) was supplied.
    db.handler = (sql) => {
      if (sql.includes('company_contacts')) return []
      if (sql.includes('LIKE')) return [ACME]
      return []
    }
    const res = await POST(makeRequest(`${WEBHOOK}?key=url-key&type=onboarding`, payload))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_configured' })
  })

  it('infers the form type from intent_name when ?type= is absent', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      makeRequest(
        `${WEBHOOK}?key=url-key`,
        threadPayload({ intent_name: 'Employee Offboarding Request' })
      )
    )
    expect(res.status).toBe(200)
    const insert = db.calls.find((c) => c.sql.includes('INSERT INTO form_links'))
    expect(insert!.params[1]).toBe('offboarding')
  })

  it('returns 400 when the form type cannot be determined', async () => {
    const { POST } = await import('./route')
    const res = await POST(
      makeRequest(`${WEBHOOK}?key=url-key`, threadPayload({ intent_name: 'General Question' }))
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('type=onboarding')
  })
})
