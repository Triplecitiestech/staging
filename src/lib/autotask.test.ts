import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AutotaskClient } from '@/lib/autotask'

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response
}

const sampleTicket = {
  id: 1,
  ticketNumber: 'T20260101.0001',
  title: 'Test ticket',
  status: 1,
  priority: 2,
  createDate: '2026-01-01T00:00:00Z',
}

describe('AutotaskClient', () => {
  const originalEnv = process.env
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AUTOTASK_API_USERNAME: 'api-user@example.com',
      AUTOTASK_API_SECRET: 'test-secret',
      AUTOTASK_API_INTEGRATION_CODE: 'test-code',
      AUTOTASK_API_BASE_URL: 'https://webservices6.autotask.net/ATServicesRest',
    }
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('sends includeFields on ticket queries to limit payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [sampleTicket] }))

    const client = new AutotaskClient()
    const tickets = await client.getCompanyTickets(123, 30)

    expect(tickets).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://webservices6.autotask.net/ATServicesRest/v1.0/Tickets/query')
    const body = JSON.parse(init.body)
    expect(body.filter).toBeDefined()
    expect(body.includeFields).toEqual(expect.arrayContaining(['id', 'ticketNumber', 'status', 'lastActivityDate']))
  })

  it('retries transient failures (429) and succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ errors: ['rate limited'] }, 429))
      .mockResolvedValueOnce(jsonResponse({ items: [sampleTicket] }))

    const client = new AutotaskClient()
    const ticket = await client.getTicket(1)

    expect(ticket?.id).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry permanent errors (404)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ errors: ['not found'] }, 404))

    const client = new AutotaskClient()
    await expect(client.getTicket(1)).rejects.toThrow('404')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('follows nextPageUrl and concatenates pages', async () => {
    const page2Url = 'https://webservices6.autotask.net/ATServicesRest/v1.0/Tickets/query?page=2'
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [sampleTicket], pageDetails: { count: 2, requestCount: 1, nextPageUrl: page2Url } }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ ...sampleTicket, id: 2 }] }))

    const client = new AutotaskClient()
    const tickets = await client.getCompanyTickets(123, 30)

    expect(tickets.map(t => t.id)).toEqual([1, 2])
    expect(fetchMock.mock.calls[1][0]).toBe(page2Url)
    expect(fetchMock.mock.calls[1][1].method).toBe('GET')
  })

  it('throws on a failed page instead of silently returning a truncated set', async () => {
    const page2Url = 'https://webservices6.autotask.net/ATServicesRest/v1.0/Tickets/query?page=2'
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [sampleTicket], pageDetails: { count: 2, requestCount: 1, nextPageUrl: page2Url } }))
      .mockResolvedValueOnce(jsonResponse({ errors: ['bad request'] }, 400))

    const client = new AutotaskClient()
    await expect(client.getCompanyTickets(123, 30)).rejects.toThrow(
      'Autotask pagination for Tickets failed after 1 records'
    )
    // 400 is permanent — page fetch is not retried
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries transient PATCH failures (idempotent writes)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ errors: ['internal error'] }, 500))
      .mockResolvedValueOnce(jsonResponse({ itemId: 1 }))

    const client = new AutotaskClient()
    await expect(client.patchTicket(1, { status: 5 })).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry POST creates even on transient failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ errors: ['internal error'] }, 500))

    const client = new AutotaskClient()
    await expect(
      client.createTimeEntry({ taskID: 1, resourceID: 2, dateWorked: '2026-01-01', hoursWorked: 1 })
    ).rejects.toThrow('500')
    // A duplicate time entry is worse than a surfaced failure
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
