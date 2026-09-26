import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AutotaskClient, type TicketSearchFilters, type TicketSearchResult } from '@/lib/autotask'
import { runSearchTickets, TRUNCATED_AGGREGATE_MESSAGE, type TicketSearchClient } from './ticket-search-tool'
import { aggregateTickets, projectTicketFields, TICKET_GROUP_BY } from './ticket-search-shape'

// ── helpers ─────────────────────────────────────────────────────────────────

type Row = TicketSearchResult['tickets'][number]

function row(id: number, extra: Partial<Row> = {}): Row {
  return {
    id,
    ticketNumber: `T20260901.${String(id).padStart(4, '0')}`,
    title: `Ticket ${id}`,
    status: 1,
    priority: 2,
    queueID: 29682833,
    companyID: 100,
    assignedResourceID: 500,
    createDate: '2026-09-01T00:00:00Z',
    lastActivityDate: '2026-09-02T00:00:00Z',
    serviceLevelAgreementID: 2,
    ticketUrl: `https://example.test/ticket/${id}`,
    ...extra,
  } as Row
}

const SAMPLE: Row[] = [
  row(1, { companyID: 100, status: 1, priority: 1, queueID: 5, assignedResourceID: 500 }),
  row(2, { companyID: 100, status: 8, priority: 2, queueID: 5, assignedResourceID: 501 }),
  row(3, { companyID: 200, status: 8, priority: 2, queueID: 8, assignedResourceID: 501 }),
  row(4, { companyID: 100, status: 52, priority: 3, queueID: 8, assignedResourceID: undefined as unknown as number }),
  row(5, { companyID: 300, status: 8, priority: 2, queueID: 5, assignedResourceID: 500 }),
]

function fakeClient(opts: { tickets?: Row[]; truncated?: boolean; namesFail?: boolean } = {}) {
  const tickets = opts.tickets ?? SAMPLE
  const calls: TicketSearchFilters[] = []
  const client: TicketSearchClient & { calls: TicketSearchFilters[]; lookupNames: ReturnType<typeof vi.fn>; picklistLabelMap: ReturnType<typeof vi.fn> } = {
    calls,
    searchTickets: async (f) => { calls.push(f); return { count: tickets.length, truncated: opts.truncated ?? false, tickets } },
    picklistLabelMap: vi.fn(async (_entity: string, field: string) => {
      const maps: Record<string, Map<number, string>> = {
        status: new Map([[1, 'New'], [8, 'In Progress'], [52, 'Complete - No Notify']]),
        priority: new Map([[1, 'High'], [2, 'Medium'], [3, 'Low']]),
        queueID: new Map([[5, 'Client Portal'], [8, 'Monitoring Alert']]),
      }
      return maps[field] ?? new Map()
    }),
    lookupNames: vi.fn(async (kind: 'company' | 'resource') => {
      if (opts.namesFail) throw new Error('Companies query failed')
      return kind === 'company'
        ? new Map([[100, 'EZ Red'], [200, 'Tri-Bros'], [300, 'C4ISR']])
        : new Map([[500, 'Kurtis Florance'], [501, 'Ghenel Bacalla']])
    }),
  }
  return client
}

const decorate = {
  row: <T extends { id?: number; lastActivityDate?: string | null }>(t: T) => ({ ...t, activityGap: true }) as T,
  advisory: (n: number) => `advisory for ${n}`,
}

const FILTERS: TicketSearchFilters = { openOnly: true, from: new Date('2020-01-01'), companyId: undefined, status: [1, 8], priority: 2, queueId: 5, assignedResourceId: 500, dateField: 'createDate', max: 2000 }

// ── default path: unchanged ─────────────────────────────────────────────────

describe('autotask_search_tickets default path (no new params)', () => {
  it('returns the exact pre-existing envelope and forwards filters untouched', async () => {
    const c = fakeClient()
    const out = await runSearchTickets(c, FILTERS, {}, decorate)
    // The old inline handler body, reproduced verbatim:
    const res = { count: SAMPLE.length, truncated: false, tickets: SAMPLE }
    const legacy = { ...res, activityGapAdvisory: decorate.advisory(res.tickets.length), tickets: res.tickets.map(decorate.row) }
    expect(out).toEqual(legacy)
    expect(Object.keys(out as object)).toEqual(['count', 'truncated', 'tickets', 'activityGapAdvisory'].filter((k) => k in legacy))
    expect(c.calls[0]).toEqual(FILTERS)
    expect(c.calls[0].includeFields).toBeUndefined()
    expect(c.lookupNames).not.toHaveBeenCalled()
  })

  it('treats empty fields[] and count_only:false as the default path', async () => {
    const c = fakeClient()
    const out = (await runSearchTickets(c, FILTERS, { count_only: false, fields: [] }, decorate)) as { tickets: unknown[] }
    expect(out.tickets).toHaveLength(SAMPLE.length)
    expect(c.calls[0].includeFields).toBeUndefined()
  })
})

// ── count_only ──────────────────────────────────────────────────────────────

describe('count_only', () => {
  it('returns only { count, truncated } with every filter applied and a lean fetch', async () => {
    const c = fakeClient()
    const out = await runSearchTickets(c, FILTERS, { count_only: true }, decorate)
    expect(out).toEqual({ count: 5, truncated: false })
    const { includeFields, ...forwarded } = c.calls[0]
    expect(forwarded).toEqual(FILTERS)
    expect(includeFields).toEqual(expect.arrayContaining(['id', 'companyID', 'status']))
  })

  it('takes precedence over group_by and fields', async () => {
    const out = await runSearchTickets(fakeClient(), FILTERS, { count_only: true, group_by: 'company', fields: ['title'] }, decorate)
    expect(out).toEqual({ count: 5, truncated: false })
  })

  it('reports truncated:true when the fetch truncated', async () => {
    const out = await runSearchTickets(fakeClient({ truncated: true }), FILTERS, { count_only: true }, decorate)
    expect(out).toEqual({ count: 5, truncated: true })
  })

  it('equals the group_by total for the same filters', async () => {
    const count = (await runSearchTickets(fakeClient(), FILTERS, { count_only: true }, decorate)) as { count: number }
    const grouped = (await runSearchTickets(fakeClient(), FILTERS, { group_by: 'company' }, decorate)) as { total: number; groups: Array<{ count: number }> }
    expect(grouped.total).toBe(count.count)
    expect(grouped.groups.reduce((s, g) => s + g.count, 0)).toBe(count.count)
  })
})

// ── group_by ────────────────────────────────────────────────────────────────

describe('group_by', () => {
  it('company: resolves names, sorts by count desc, reports total', async () => {
    const c = fakeClient()
    const out = await runSearchTickets(c, FILTERS, { group_by: 'company' }, decorate)
    expect(out).toEqual({
      groupBy: 'company', total: 5, truncated: false, groupCount: 3,
      groups: [
        { id: 100, name: 'EZ Red', count: 3 },
        { id: 300, name: 'C4ISR', count: 1 },
        { id: 200, name: 'Tri-Bros', count: 1 },
      ],
    })
    expect(c.lookupNames).toHaveBeenCalledWith('company', expect.arrayContaining([100, 200, 300]))
    const { includeFields, ...forwarded } = c.calls[0]
    expect(forwarded).toEqual(FILTERS)
    expect(includeFields).toBeDefined()
  })

  it('status / priority / queue resolve through the live Tickets picklist', async () => {
    for (const [groupBy, field] of [['status', 'status'], ['priority', 'priority'], ['queue', 'queueID']] as const) {
      const c = fakeClient()
      const out = (await runSearchTickets(c, FILTERS, { group_by: groupBy }, decorate)) as { groups: Array<{ name: string }> }
      expect(c.picklistLabelMap).toHaveBeenCalledWith('Tickets', field)
      expect(out.groups.every((g) => !g.name.startsWith('(unknown'))).toBe(true)
    }
  })

  it('status groups are correct', async () => {
    const out = (await runSearchTickets(fakeClient(), FILTERS, { group_by: 'status' }, decorate)) as { groups: unknown[] }
    expect(out.groups).toEqual([
      { id: 8, name: 'In Progress', count: 3 },
      { id: 52, name: 'Complete - No Notify', count: 1 },
      { id: 1, name: 'New', count: 1 },
    ])
  })

  it('assignedResource resolves resource names and labels unassigned tickets', async () => {
    const c = fakeClient()
    const out = (await runSearchTickets(c, FILTERS, { group_by: 'assignedResource' }, decorate)) as { groups: unknown[] }
    expect(c.lookupNames).toHaveBeenCalledWith('resource', expect.arrayContaining([500, 501]))
    expect(out.groups).toEqual([
      { id: 501, name: 'Ghenel Bacalla', count: 2 },
      { id: 500, name: 'Kurtis Florance', count: 2 },
      { id: null, name: '(unassigned)', count: 1 },
    ])
  })

  it('NEVER aggregates a truncated fetch', async () => {
    const c = fakeClient({ truncated: true })
    const out = await runSearchTickets(c, FILTERS, { group_by: 'company' }, decorate)
    expect(out).toEqual({ groupBy: 'company', total: 5, truncated: true, groupCount: 0, groups: [], message: TRUNCATED_AGGREGATE_MESSAGE })
    expect(c.lookupNames).not.toHaveBeenCalled()
  })

  it('a failed name lookup still returns correct counts, flagged, never fails the read', async () => {
    const out = (await runSearchTickets(fakeClient({ namesFail: true }), FILTERS, { group_by: 'company' }, decorate)) as { groups: Array<{ name: string; count: number }>; nameLookupError: string }
    expect(out.nameLookupError).toContain('Companies query failed')
    expect(out.groups.map((g) => g.count)).toEqual([3, 1, 1])
    expect(out.groups[0].name).toBe('(unknown id 100)')
  })

  it('accepts exactly the five documented dimensions', () => {
    expect([...TICKET_GROUP_BY]).toEqual(['company', 'status', 'priority', 'queue', 'assignedResource'])
  })
})

// ── fields ──────────────────────────────────────────────────────────────────

describe('fields', () => {
  it('keeps only requested fields plus id / ticketNumber / ticketUrl, and adds companyName', async () => {
    const out = (await runSearchTickets(fakeClient(), FILTERS, { fields: ['title', 'status', 'notARealField'] }, decorate)) as {
      count: number; truncated: boolean; activityGapAdvisory: string; tickets: Array<Record<string, unknown>>
    }
    expect(out.count).toBe(5)
    expect(out.truncated).toBe(false)
    expect(out.activityGapAdvisory).toBe('advisory for 5')
    for (const t of out.tickets) {
      expect(Object.keys(t).sort()).toEqual(['companyName', 'id', 'status', 'ticketNumber', 'ticketUrl', 'title'])
    }
    expect(out.tickets[0].companyName).toBe('EZ Red')
    expect(out.tickets[2].companyName).toBe('Tri-Bros')
  })

  it('can request the decorated activityGap and SLA fields explicitly', async () => {
    const out = (await runSearchTickets(fakeClient(), FILTERS, { fields: ['activityGap', 'serviceLevelAgreementID'] }, decorate)) as { tickets: Array<Record<string, unknown>> }
    expect(out.tickets[0].activityGap).toBe(true)
    expect(out.tickets[0].serviceLevelAgreementID).toBe(2)
  })

  it('fetches the full field set (fields may name SLA columns) and forwards filters untouched', async () => {
    const c = fakeClient()
    await runSearchTickets(c, FILTERS, { fields: ['title'] }, decorate)
    expect(c.calls[0]).toEqual(FILTERS)
  })

  it('company-name lookup failure degrades to null names with the error reported', async () => {
    const out = (await runSearchTickets(fakeClient({ namesFail: true }), FILTERS, { fields: ['title'] }, decorate)) as { tickets: Array<Record<string, unknown>>; nameLookupError: string }
    expect(out.tickets[0].companyName).toBeNull()
    expect(out.nameLookupError).toContain('Companies query failed')
  })
})

// ── pure helpers ────────────────────────────────────────────────────────────

describe('pure helpers', () => {
  it('aggregateTickets is deterministic on ties (name, then id)', () => {
    const r = aggregateTickets([{ companyID: 2 }, { companyID: 1 }], 'company', new Map([[1, 'B'], [2, 'A']]), false)
    expect(r.groups.map((g) => g.name)).toEqual(['A', 'B'])
  })
  it('projectTicketFields never drops the linkable trio', () => {
    expect(projectTicketFields({ id: 1, ticketNumber: 'T1', ticketUrl: 'u', title: 'x' }, [])).toEqual({ id: 1, ticketNumber: 'T1', ticketUrl: 'u' })
  })
})

// ── real AutotaskClient: pagination/truncation + name lookup ────────────────

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body } as unknown as Response
}

describe('AutotaskClient integration (fetch mocked)', () => {
  const originalEnv = process.env
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    process.env = { ...originalEnv, AUTOTASK_API_USERNAME: 'u', AUTOTASK_API_SECRET: 's', AUTOTASK_API_INTEGRATION_CODE: 'c', AUTOTASK_API_BASE_URL: 'https://webservices14.autotask.net/ATServicesRest' }
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { process.env = originalEnv; vi.unstubAllGlobals() })

  it('searchTickets sends the lean includeFields for count/group reads, and the default set otherwise', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ id: 1, companyID: 100 }], pageDetails: { nextPageUrl: null } }))
    const client = new AutotaskClient()
    await client.searchTickets({ openOnly: true, includeFields: ['companyID'] })
    const lean = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(lean.includeFields).toEqual(['id', 'companyID'])
    fetchMock.mockClear()
    await client.searchTickets({ openOnly: true })
    const full = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(full.includeFields).toEqual(expect.arrayContaining(['serviceLevelAgreementID', 'firstResponseDueDateTime', 'lastActivityDate']))
  })

  it('a truncated real fetch (max reached) is reported and never aggregated', async () => {
    const items = [1, 2, 3, 4].map((id) => ({ id, companyID: 100 }))
    fetchMock.mockResolvedValue(jsonResponse({ items, pageDetails: { nextPageUrl: null } }))
    const client = new AutotaskClient()
    const out = await runSearchTickets(client, { openOnly: true, max: 2 }, { group_by: 'company' }, decorate)
    expect(out).toMatchObject({ truncated: true, groups: [], groupCount: 0 })
    const count = await runSearchTickets(client, { openOnly: true, max: 2 }, { count_only: true }, decorate)
    expect(count).toEqual({ count: 2, truncated: true })
  })

  it('lookupNames queries by id list with two fields and caches the result', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ id: 910001, companyName: 'Cache Co' }], pageDetails: { nextPageUrl: null } }))
    const client = new AutotaskClient()
    const first = await client.lookupNames('company', [910001])
    expect(first.get(910001)).toBe('Cache Co')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.filter).toEqual([{ op: 'in', field: 'id', value: [910001] }])
    expect(body.includeFields).toEqual(['id', 'companyName'])
    fetchMock.mockClear()
    const second = await client.lookupNames('company', [910001])
    expect(second.get(910001)).toBe('Cache Co')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
