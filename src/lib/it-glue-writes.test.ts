import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ItGlueClient } from './it-glue'

// Focused tests for the newer IT Glue write paths: publish (verb fallback +
// verification read-back), related items, and the attachment size guard.

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/vnd.api+json' } })
}

function client() {
  return new ItGlueClient({ apiKey: 'test-key' })
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

describe('publishDocument', () => {
  it('publishes via POST and verifies published-at flipped', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {})) // POST /publish
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: { id: '1', attributes: { 'published-at': '2026-07-08T00:00:00Z', draft: false } } }))
    const res = await client().publishDocument('1')
    expect(res).toMatchObject({ published: true, methodUsed: 'POST', publishedAt: '2026-07-08T00:00:00Z' })
    const firstCall = vi.mocked(fetch).mock.calls[0]
    expect(firstCall[0]).toContain('/documents/1/publish')
    expect((firstCall[1] as RequestInit).method).toBe('POST')
  })

  it('falls back to PATCH when POST /publish is rejected with 404/405', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(405, {})) // POST rejected
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {})) // PATCH /publish
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: { id: '1', attributes: { 'published-at': '2026-07-08T00:00:00Z' } } }))
    const res = await client().publishDocument('1')
    expect(res.methodUsed).toBe('PATCH')
    expect(res.published).toBe(true)
  })

  it('reports published:false when the read-back still shows a draft — never fakes success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: { id: '1', attributes: { 'published-at': null, draft: true } } }))
    const res = await client().publishDocument('1')
    expect(res.published).toBe(false)
    expect(res.draft).toBe(true)
  })

  it('propagates non-404/405 publish failures instead of falling back', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(500, {}))
    await expect(client().publishDocument('1')).rejects.toThrow(/500/)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })
})

describe('createRelatedItem', () => {
  it('POSTs the JSON:API related_items shape to the source path', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(201, { data: { id: 'ri-1' } }))
    await client().createRelatedItem({ sourceType: 'documents', sourceId: '24236262', destinationType: 'Document', destinationId: '24150412', notes: 'SOP set' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/documents/24236262/relationships/related_items')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.data.attributes).toEqual({ destination_id: 24150412, destination_type: 'Document', notes: 'SOP set' })
  })
})

describe('uploadAttachment', () => {
  it('rejects payloads over the 10 MB decoded cap without calling the API', async () => {
    const oversized = 'A'.repeat(15 * 1024 * 1024) // ~11 MB decoded
    await expect(client().uploadAttachment({ resourceType: 'documents', resourceId: '1', fileName: 'big.png', base64Content: oversized }))
      .rejects.toThrow(/10 MB/)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('POSTs base64 content in the documented attachment shape', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(201, { data: { id: 'att-1' } }))
    await client().uploadAttachment({ resourceType: 'documents', resourceId: '1', fileName: 'shot.png', base64Content: 'aGVsbG8=' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/documents/1/relationships/attachments')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.data.attributes.attachment).toEqual({ content: 'aGVsbG8=', file_name: 'shot.png' })
  })
})
