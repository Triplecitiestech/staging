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

describe('getDocumentFolders', () => {
  it('GETs the org document_folders relationship and returns the folders', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {
      data: [
        { id: '10', attributes: { name: 'AI Services', 'parent-id': null } },
        { id: '11', attributes: { name: 'Runbooks', 'parent-id': 10 } },
      ],
      meta: { 'total-pages': 1 },
    }))
    const folders = await client().getDocumentFolders('6942365')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/organizations/6942365/relationships/document_folders')
    expect(folders).toHaveLength(2)
    expect(folders[0]).toMatchObject({ id: '10', attributes: { name: 'AI Services', 'parent-id': null } })
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1) // single page (total-pages=1)
  })

  it('pages through when meta reports more than one page', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: [{ id: '1', attributes: { name: 'A', 'parent-id': null } }], meta: { 'total-pages': 2 } }))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: [{ id: '2', attributes: { name: 'B', 'parent-id': null } }] }))
    const folders = await client().getDocumentFolders('6942365')
    expect(folders.map((f) => f.id)).toEqual(['1', '2'])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })
})

describe('createDocumentFolder', () => {
  it('POSTs the documented document-folders shape to the org relationship (top-level)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(201, { data: { id: '99', attributes: { name: 'AI Services', 'parent-id': null } } }))
    const folder = await client().createDocumentFolder({ organizationId: '6942365', name: 'AI Services' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/organizations/6942365/relationships/document_folders')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.data.type).toBe('document-folders')
    expect(body.data.attributes).toEqual({ name: 'AI Services', restricted: false }) // no parent-id when top-level
    expect(folder.id).toBe('99')
  })

  it('includes a numeric parent-id when nesting under a parent folder', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(201, { data: { id: '100', attributes: { name: 'Child', 'parent-id': 99 } } }))
    await client().createDocumentFolder({ organizationId: '6942365', name: 'Child', parentId: '99' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body.data.attributes).toEqual({ name: 'Child', restricted: false, 'parent-id': 99 })
  })
})

describe('updateDocument (move)', () => {
  it('PATCHes document_folder_id as a number when moving into a folder', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: { id: '24323685', attributes: { name: 'AI Services - Intake', 'document-folder-id': 99 } } }))
    await client().updateDocument('24323685', { documentFolderId: '99' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/documents/24323685')
    expect((init as RequestInit).method).toBe('PATCH')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.data.attributes).toEqual({ document_folder_id: 99 })
  })

  it('PATCHes document_folder_id to null when moving to the org root', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: { id: '1', attributes: { 'document-folder-id': null } } }))
    await client().updateDocument('1', { documentFolderId: null })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body.data.attributes).toEqual({ document_folder_id: null })
  })
})
