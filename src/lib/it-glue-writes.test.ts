import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ItGlueClient } from './it-glue'

// Focused tests for the newer IT Glue write paths: publish (verb fallback +
// verification read-back), related items, the attachment size guard, and
// document folders (list/create/move).

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

describe('getDocumentFolders', () => {
  const folder = (id: string, name: string, parentId: number | null = null) => ({
    id, type: 'document-folders',
    attributes: { name, 'organization-id': 1, 'parent-id': parentId, 'ancestor-ids': parentId ? [parentId] : [] },
  })

  it('GETs the org-nested folders route and returns all folders', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: [folder('10', 'AI Services'), folder('11', 'Sub', 10)] }))
    const res = await client().getDocumentFolders('6942365')
    expect(res).toHaveLength(2)
    expect(res[1].attributes['parent-id']).toBe(10)
    const url = String(vi.mocked(fetch).mock.calls[0][0])
    expect(url).toContain('/organizations/6942365/relationships/document_folders')
    expect(url).not.toContain('filter[parent_id]') // omitted filter = ALL folders
  })

  it('passes filter[parent_id] through when scoping to a parent', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: [] }))
    await client().getDocumentFolders('6942365', { parentId: '0' })
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('filter[parent_id]=0')
  })

  it('pages past a full page and stops on the short one', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => folder(String(i), `F${i}`))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: fullPage }))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: [folder('9999', 'Last')] }))
    const res = await client().getDocumentFolders('1')
    expect(res).toHaveLength(1001)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('page[number]=2')
  })
})

describe('createDocumentFolder', () => {
  it('POSTs the JSON:API document-folders shape to the org-nested route', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(201, { data: { id: '42', attributes: { name: 'AI Services', 'parent-id': null } } }))
    const res = await client().createDocumentFolder({ organizationId: '6942365', name: 'AI Services' })
    expect(res.id).toBe('42')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/organizations/6942365/relationships/document_folders')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.data.type).toBe('document-folders')
    expect(body.data.attributes).toEqual({ name: 'AI Services' })
  })

  it('includes parent_id as a number when nesting', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(201, { data: { id: '43', attributes: { name: 'Sub', 'parent-id': 42 } } }))
    await client().createDocumentFolder({ organizationId: 1, name: 'Sub', parentId: '42' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body.data.attributes).toEqual({ name: 'Sub', parent_id: 42 })
  })
})

describe('updateDocument (folder moves)', () => {
  it('PATCHes document_folder_id as a number when moving into a folder', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: { id: '24323685', attributes: { name: 'AI Services - X', 'document-folder-id': 42 } } }))
    const doc = await client().updateDocument('24323685', { documentFolderId: '42' })
    expect(doc.attributes['document-folder-id']).toBe(42)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/documents/24323685')
    expect((init as RequestInit).method).toBe('PATCH')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.data.attributes).toEqual({ document_folder_id: 42 })
  })

  it('PATCHes document_folder_id null when moving back to the org root', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { data: { id: '1', attributes: { 'document-folder-id': null } } }))
    await client().updateDocument('1', { documentFolderId: null })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body.data.attributes).toEqual({ document_folder_id: null })
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
