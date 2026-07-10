import { describe, it, expect, vi } from 'vitest'
import {
  resolveFormCompany,
  createFormLink,
  type Queryable,
  type FormCompanyRef,
} from '@/lib/form-links'

// ---------------------------------------------------------------------------
// Stub pg client — records every query and answers rows via a handler.
// ---------------------------------------------------------------------------

interface Call {
  sql: string
  params: unknown[]
}

function stubClient(handler: (sql: string, params: unknown[]) => unknown[] = () => []) {
  const calls: Call[] = []
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] })
      return { rows: handler(sql, params ?? []), rowCount: 0 }
    }),
  }
  return { client: client as unknown as Queryable, calls }
}

const ACME: FormCompanyRef = { id: 'c-acme', slug: 'acme', displayName: 'Acme Manufacturing' }
const OTHER: FormCompanyRef = { id: 'c-other', slug: 'other-co', displayName: 'Other Co' }

describe('resolveFormCompany', () => {
  it('resolves by autotaskCompanyId first (primary key)', async () => {
    const { client, calls } = stubClient((sql, params) =>
      sql.includes('"autotaskCompanyId"') && params[0] === '789' ? [ACME] : []
    )
    const result = await resolveFormCompany(client, {
      autotaskCompanyId: '789',
      companyName: 'Something Else Entirely',
    })
    expect(result).toEqual(ACME)
    expect(calls).toHaveLength(1)
  })

  it('coerces a numeric autotaskCompanyId to the stored string form', async () => {
    const { client } = stubClient((sql, params) =>
      sql.includes('"autotaskCompanyId"') && params[0] === '789' ? [ACME] : []
    )
    const result = await resolveFormCompany(client, { autotaskCompanyId: 789 })
    expect(result).toEqual(ACME)
  })

  it('falls back to exact slug when the Autotask ID misses', async () => {
    const { client } = stubClient((sql, params) => {
      if (sql.includes('"autotaskCompanyId"')) return []
      if (sql.includes('WHERE slug = $1') && params[0] === 'acme') return [ACME]
      return []
    })
    const result = await resolveFormCompany(client, {
      autotaskCompanyId: '999',
      companySlug: 'ACME',
    })
    expect(result).toEqual(ACME)
  })

  it('falls back to exact display name (case-insensitive)', async () => {
    const { client } = stubClient((sql, params) => {
      if (sql.includes('LOWER("displayName") = $1') && params[0] === 'acme manufacturing')
        return [ACME]
      return []
    })
    const result = await resolveFormCompany(client, { companyName: 'ACME Manufacturing' })
    expect(result).toEqual(ACME)
  })

  it('tries the lowered company name as a slug', async () => {
    const { client } = stubClient((sql, params) => {
      if (sql.includes('WHERE slug = $1') && params[0] === 'acme') return [ACME]
      return []
    })
    const result = await resolveFormCompany(client, { companyName: 'acme' })
    expect(result).toEqual(ACME)
  })

  it('resolves by email domain via active contacts', async () => {
    const { client, calls } = stubClient((sql, params) => {
      if (sql.includes('company_contacts') && params[0] === '%@acme.com') return [ACME]
      return []
    })
    const result = await resolveFormCompany(client, { email: 'manager@ACME.com' })
    expect(result).toEqual(ACME)
    expect(calls.some((c) => c.sql.includes('"isActive" = true'))).toBe(true)
  })

  it('refuses an ambiguous email domain (two companies match)', async () => {
    const { client } = stubClient((sql) =>
      sql.includes('company_contacts') ? [ACME, OTHER] : []
    )
    const result = await resolveFormCompany(client, { emailDomain: 'shared.com' })
    expect(result).toBeNull()
  })

  it('uses fuzzy display name only as a last resort', async () => {
    const { client } = stubClient((sql, params) => {
      if (sql.includes('LIKE $1') && params[0] === '%acme%' && !sql.includes('company_contacts'))
        return [ACME]
      return []
    })
    const result = await resolveFormCompany(client, { companyName: 'Acme' })
    expect(result).toEqual(ACME)
  })

  it('refuses an ambiguous fuzzy match', async () => {
    const { client } = stubClient((sql) =>
      sql.includes('LIKE $1') && !sql.includes('company_contacts') ? [ACME, OTHER] : []
    )
    const result = await resolveFormCompany(client, { companyName: 'co' })
    expect(result).toBeNull()
  })

  it('NEVER fuzzy-matches when an exact identifier was supplied but missed', async () => {
    const { client, calls } = stubClient(() => [])
    const result = await resolveFormCompany(client, {
      autotaskCompanyId: '999',
      companyName: 'Acme',
    })
    expect(result).toBeNull()
    // Exact name lookups are allowed; the fuzzy ILIKE must never run.
    expect(calls.some((c) => c.sql.includes('LIKE'))).toBe(false)
  })

  it('returns null (→ 404 not_configured) when nothing matches', async () => {
    const { client } = stubClient(() => [])
    const result = await resolveFormCompany(client, {
      autotaskCompanyId: '1',
      companySlug: 'x',
      companyName: 'y',
      email: 'z@z.com',
    })
    expect(result).toBeNull()
  })
})

describe('createFormLink', () => {
  it('inserts a link and returns a tokenized URL', async () => {
    const { client, calls } = stubClient()
    const before = Date.now()
    const link = await createFormLink(client, {
      companyId: 'c-acme',
      type: 'onboarding',
      baseUrl: 'https://www.triplecitiestech.com/',
      preFill: { first_name: 'John', last_name: 'Smith' },
      expiresInMinutes: 60,
      source: 'thread',
      createdBy: 'thread',
      sourceMeta: { ticketId: 12345 },
    })

    expect(link.token).toMatch(/^[0-9a-f]{64}$/)
    expect(link.url).toBe(`https://www.triplecitiestech.com/form/${link.token}`)
    const expiresMs = new Date(link.expiresAt).getTime()
    expect(expiresMs).toBeGreaterThanOrEqual(before + 59 * 60 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(Date.now() + 61 * 60 * 1000)

    // Backfills request_id/source_meta columns before writing (live tables
    // may predate them), then inserts with the Thread metadata attached.
    expect(calls.filter((c) => c.sql.includes('ADD COLUMN IF NOT EXISTS'))).toHaveLength(2)
    const insert = calls.find((c) => c.sql.includes('INSERT INTO form_links'))
    expect(insert).toBeDefined()
    expect(insert!.params[0]).toBe('c-acme')
    expect(insert!.params[1]).toBe('onboarding')
    expect(JSON.parse(insert!.params[3] as string)).toEqual({ first_name: 'John', last_name: 'Smith' })
    expect(insert!.params[4]).toBe('thread')
    expect(JSON.parse(insert!.params[7] as string)).toEqual({ ticketId: 12345 })
  })

  it('stores NULL pre_fill and source_meta when empty', async () => {
    const { client, calls } = stubClient()
    await createFormLink(client, {
      companyId: 'c-acme',
      type: 'offboarding',
      baseUrl: 'https://example.test',
    })
    const insert = calls.find((c) => c.sql.includes('INSERT INTO form_links'))
    expect(insert!.params[3]).toBeNull()
    expect(insert!.params[7]).toBeNull()
  })
})
