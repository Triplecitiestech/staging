// src/lib/mcp-itglue-tools.test.ts
//
// Regression lock for the IT Glue folder-move defect reproduced live on
// 2026-07-29 (doc 24227609, org 6942365, target folder 6255494) and twelve days
// earlier on doc 24262329 → folder 5301326.
//
// WHAT WENT WRONG: itglue_move_document PATCHed document_folder_id, IT Glue
// dropped the attribute and answered 200, and the tool reported
// `moved:false` — success-shaped output with no error. The caller could not
// tell "IT Glue refused" from "the connector is broken" from "it worked", so
// the same call was retried across two sessions and the folder never changed.
//
// THE RULE THESE TESTS ENFORCE: assert the READ-BACK, never the HTTP status,
// and never return a success shape when nothing happened.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// searchDocIndex talks to Postgres. Mocked so these tests exercise the tool's
// own archived handling rather than the index, and so nothing opens a socket.
// Returning null is the "org not indexed" branch, which is the path that does
// the filtering in JS against live IT Glue rows.
const searchDocIndex = vi.fn()
vi.mock('@/lib/itglue-doc-index', () => ({
  searchDocIndex: (...a: unknown[]) => searchDocIndex(...a),
  TCT_ORG_ID: '2374967',
}))

import { registerItGlueTools } from './mcp-itglue-tools'

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>

function harness() {
  const tools = new Map<string, { config: Record<string, unknown>; handler: Handler }>()
  const server = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTool(name: string, config: any, handler: Handler) {
      tools.set(name, { config, handler })
    },
  }
  registerItGlueTools(server)
  return {
    names: [...tools.keys()],
    description: (n: string) => String(tools.get(n)!.config.description),
    /** Raw MCP result — these tests care about the failure shape. */
    async raw(n: string, args: Record<string, unknown> = {}) {
      return tools.get(n)!.handler(args)
    },
    /** The failure envelope a caller sees. */
    async failure(n: string, args: Record<string, unknown> = {}) {
      const res = await tools.get(n)!.handler(args)
      expect(res.isError, `${n} was expected to FAIL but returned success`).toBe(true)
      // Anchored on the JSON block, not the first `{` — messages quote vendor
      // bodies and document titles that can contain braces.
      const text = res.content[0].text
      const start = text.indexOf('{\n  "failure"')
      expect(start, `no failure envelope in: ${text}`).toBeGreaterThan(-1)
      return JSON.parse(text.slice(start)).failure as Record<string, unknown>
    },
    async ok(n: string, args: Record<string, unknown> = {}) {
      const res = await tools.get(n)!.handler(args)
      expect(res.isError, `${n} returned an error: ${res.content[0]?.text}`).toBeFalsy()
      return JSON.parse(res.content[0].text)
    },
  }
}

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/vnd.api+json' } })
}

/** A document as IT Glue returns it, sitting in `folder`. */
function doc(id: string, name: string, folder: number | null) {
  return { data: { id, type: 'documents', attributes: { name, 'document-folder-id': folder } } }
}

/** Every PATCH/POST/DELETE issued during a test — a move must issue none. */
function writeCalls() {
  return vi.mocked(fetch).mock.calls.filter(([, init]) => {
    const method = (init as RequestInit | undefined)?.method ?? 'GET'
    return method !== 'GET'
  })
}

beforeEach(() => {
  process.env.IT_GLUE_CONNECTOR_API_KEY = 'test-key'
  searchDocIndex.mockReset().mockResolvedValue(null)
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.IT_GLUE_CONNECTOR_API_KEY
})

// ---------------------------------------------------------------------------
// itglue_move_document
// ---------------------------------------------------------------------------

describe('itglue_move_document fails hard instead of reporting moved:false', () => {
  it('returns UPSTREAM_UNSUPPORTED / fixableBy vendor for the live repro case', async () => {
    // doc 24227609 "TCT Documentation Standard (START HERE)" → folder 6255494
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, doc('24227609', 'TCT Documentation Standard (START HERE)', null)))

    const failure = await harness().failure('itglue_move_document', { documentId: '24227609', documentFolderId: '6255494' })

    expect(failure.ok).toBe(false)
    expect(failure.reasonCode).toBe('UPSTREAM_UNSUPPORTED')
    expect(failure.fixableBy).toBe('vendor')
    expect(failure.surface).toBe('itglue')
    // The vendor's own words are the evidence — an uncited vendor-limitation
    // claim is exactly what this envelope exists to prevent.
    expect(String(failure.evidence)).toContain('Not permitted in PUT/PATCH, optional in POST')
    // And the caller is told the two things that DO work.
    expect(String(failure.remediation)).toMatch(/IT Glue.*Move/s)
    expect(String(failure.remediation)).toContain('itglue_create_document')
  })

  it('never claims moved:true and never emits a success shape', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, doc('24262329', 'Domotz - Deployment', null)))
    const res = await harness().raw('itglue_move_document', { documentId: '24262329', documentFolderId: '5301326' })

    expect(res.isError).toBe(true)
    // The old output shape is gone: no `moved` key to be read as a soft failure.
    expect(res.content[0].text).not.toMatch(/"moved"\s*:/)
  })

  it('issues NO write to IT Glue — the PATCH that 200s and does nothing is not attempted', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, doc('24227609', 'Doc', null)))
    await harness().failure('itglue_move_document', { documentId: '24227609', documentFolderId: '6255494' })
    expect(writeCalls()).toEqual([])
  })

  it('reports the document\'s CURRENT folder so the user can be told where it actually is', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, doc('24227609', 'Doc', 5301326)))
    const failure = await harness().failure('itglue_move_document', { documentId: '24227609', documentFolderId: '6255494' })
    expect(failure.details).toMatchObject({
      documentId: '24227609',
      requestedDocumentFolderId: '6255494',
      currentDocumentFolderId: 5301326,
      alreadyInRequestedFolder: false,
    })
  })

  it('says so plainly when the document is ALREADY in the requested folder', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, doc('24227609', 'Doc', 6255494)))
    const failure = await harness().failure('itglue_move_document', { documentId: '24227609', documentFolderId: '6255494' })
    expect(String(failure.message)).toContain('ALREADY in that folder')
    expect(failure.details).toMatchObject({ alreadyInRequestedFolder: true })
  })

  it('still fails cleanly when the document cannot even be read', async () => {
    // The verdict is about the API's capability, not about this document, so an
    // unreadable document must not soften or change the reason code.
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { errors: [{ title: 'Not found' }] }))
    const failure = await harness().failure('itglue_move_document', { documentId: '999', documentFolderId: '6255494' })
    expect(failure.reasonCode).toBe('UPSTREAM_UNSUPPORTED')
    expect(failure.details).toMatchObject({ currentDocumentFolderId: null })
  })

  it('warns in its own description that it does not work', async () => {
    const d = harness().description('itglue_move_document')
    expect(d).toMatch(/DOES NOT WORK/)
    expect(d).toMatch(/itglue_create_document/)
  })
})

// ---------------------------------------------------------------------------
// itglue_rename_document
// ---------------------------------------------------------------------------

describe('itglue_rename_document no longer swallows documentFolderId', () => {
  it('refuses the whole call BEFORE renaming when a folder is requested', async () => {
    const failure = await harness().failure('itglue_rename_document', {
      documentId: '24227609',
      name: 'TCT Documentation Standard (START HERE)',
      documentFolderId: '6255494',
    })

    expect(failure.reasonCode).toBe('UPSTREAM_UNSUPPORTED')
    expect(failure.fixableBy).toBe('vendor')
    expect(failure.details).toMatchObject({ renameApplied: false, rejectedDocumentFolderId: '6255494' })
    // Fail-closed: no partial write, so the caller is never left guessing which
    // half landed.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('renames when no folder is requested, and VERIFIES the new title by read-back', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, doc('24227609', 'New Title', null))) // PATCH
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, doc('24227609', 'New Title', null))) // GET read-back

    const out = await harness().ok('itglue_rename_document', { documentId: '24227609', name: 'New Title' })

    expect(out).toMatchObject({ name: 'New Title', renamed: true })
    const patched = JSON.parse((writeCalls()[0][1] as RequestInit).body as string)
    expect(patched.data.attributes).toEqual({ name: 'New Title' }) // no folder attribute
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2) // write + read-back
  })

  it('fails when the read-back shows the OLD title — a 200 is not proof', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, doc('24227609', 'Stale Title', null))) // PATCH "succeeds"
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, doc('24227609', 'Stale Title', null))) // but nothing changed

    const failure = await harness().failure('itglue_rename_document', { documentId: '24227609', name: 'New Title' })
    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(failure.details).toMatchObject({ requestedName: 'New Title', actualName: 'Stale Title' })
  })
})

// ---------------------------------------------------------------------------
// itglue_create_document — the only API-supported placement
// ---------------------------------------------------------------------------

describe('itglue_create_document is where folder placement has to happen', () => {
  it('tells the caller create is the ONLY chance to set the folder', async () => {
    const d = harness().description('itglue_create_document')
    expect(d).toMatch(/ONLY chance to set it/i)
  })

  it('sends document_folder_id on the create POST', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(201, doc('9', 'SOP', 6255494)))                       // POST /documents
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(201, { data: { id: 's1', attributes: {} } }))          // POST section

    await harness().ok('itglue_create_document', { organizationId: '6942365', name: 'SOP', html: '<p>x</p>', documentFolderId: '6255494' })

    const body = JSON.parse((writeCalls()[0][1] as RequestInit).body as string)
    expect(body.data.attributes.document_folder_id).toBe(6255494)
  })
})


// ---------------------------------------------------------------------------
// Archived documents
// ---------------------------------------------------------------------------
//
// IT Glue carries a native `archived` attribute. Before it was surfaced, an
// archived SOP came back from search indistinguishable from a live one, so a
// technician could open, follow or edit a stale procedure with nothing on
// screen saying so.
//
// The contract these tests pin, on all three reads:
//   · every returned document carries `archived`
//   · archived documents are EXCLUDED by default
//   · includeArchived:true returns them, tagged
//
// Exclusion-by-default is the half that matters most: it is the behaviour a
// caller gets without knowing the flag exists.

/** A document list page as IT Glue returns it, `archived` included. */
function docPage(rows: { id: string; name: string; archived?: boolean }[], meta?: Record<string, unknown>) {
  return {
    data: rows.map((r) => ({
      id: r.id,
      type: 'documents',
      attributes: {
        name: r.name,
        'document-folder-id': null,
        'resource-url': `https://tct.itglue.com/docs/${r.id}`,
        'updated-at': '2026-08-01T00:00:00Z',
        archived: r.archived === true,
      },
    })),
    meta: meta ?? { 'total-count': rows.length, 'total-pages': 1, 'current-page': 1 },
  }
}

const MIXED = [
  { id: '100', name: 'VPN Setup (current)' },
  { id: '101', name: 'VPN Setup (old)', archived: true },
]

describe('itglue_org_documents — archived', () => {
  it('excludes archived documents by default and says how many it dropped', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, docPage(MIXED)))

    const res = await harness().ok('itglue_org_documents', { organizationId: '6942365' })

    expect(res.documents.map((d: { id: string }) => d.id)).toEqual(['100'])
    expect(res.archivedExcluded).toBe(1)
    expect(res.includeArchived).toBe(false)
  })

  it('returns archived documents tagged when asked', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, docPage(MIXED)))

    const res = await harness().ok('itglue_org_documents', { organizationId: '6942365', includeArchived: true })

    expect(res.documents).toHaveLength(2)
    expect(res.includeArchived).toBe(true)
    expect(res.archivedExcluded).toBe(0)
    // Every row carries the flag, so the archived one is identifiable.
    const archived = res.documents.find((d: { id: string }) => d.id === '101')
    expect(archived.attributes.archived).toBe(true)
    const live = res.documents.find((d: { id: string }) => d.id === '100')
    expect(live.attributes.archived).toBe(false)
  })

  it('warns that IT Glue meta counts still include archived rows', () => {
    // A filtered page can return fewer than pageSize; without this the caller
    // reads a short page as "end of results" and stops paging early.
    const d = harness().description('itglue_org_documents')
    expect(d).toMatch(/meta counts come from IT Glue and include archived/)
  })
})

describe('itglue_search_documents — archived', () => {
  it('excludes archived matches by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, docPage(MIXED)))

    const res = await harness().ok('itglue_search_documents', { organizationId: '6942365', query: 'VPN' })

    expect(res.source).toBe('live-name')
    expect(res.documents.map((d: { id: string }) => d.id)).toEqual(['100'])
    expect(res.documents[0].archived).toBe(false)
    expect(res.archivedExcluded).toBe(1)
  })

  it('includes and tags archived matches when asked', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, docPage(MIXED)))

    const res = await harness().ok('itglue_search_documents', {
      organizationId: '6942365', query: 'VPN', includeArchived: true,
    })

    expect(res.matchCount).toBe(2)
    expect(res.documents.find((d: { id: string }) => d.id === '101').archived).toBe(true)
    expect(res.documents.find((d: { id: string }) => d.id === '100').archived).toBe(false)
  })

  it('passes includeArchived through to the index path rather than filtering after it', async () => {
    // The indexed path filters in SQL. If the flag were dropped here, archived
    // docs would leak for indexed orgs only — the subtlest version of this bug.
    searchDocIndex.mockResolvedValueOnce([
      { id: '100', name: 'VPN Setup (current)', documentFolderId: null, url: null, updatedAt: null, archived: false },
    ])

    const res = await harness().ok('itglue_search_documents', { organizationId: '6942365', query: 'VPN' })

    expect(res.source).toBe('index')
    expect(searchDocIndex).toHaveBeenCalledWith('6942365', 'VPN', { includeArchived: false })
    expect(res.documents[0].archived).toBe(false)
  })

  it('asks the index for archived rows when includeArchived is true', async () => {
    searchDocIndex.mockResolvedValueOnce([
      { id: '101', name: 'VPN Setup (old)', documentFolderId: null, url: null, updatedAt: null, archived: true },
    ])

    const res = await harness().ok('itglue_search_documents', {
      organizationId: '6942365', query: 'VPN', includeArchived: true,
    })

    expect(searchDocIndex).toHaveBeenCalledWith('6942365', 'VPN', { includeArchived: true })
    expect(res.documents[0].archived).toBe(true)
  })
})

describe('itglue_global_search — archived', () => {
  it('excludes archived documents in every org it searches', async () => {
    // TCT SOP org, then the customer org.
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, docPage(MIXED)))
      .mockResolvedValueOnce(jsonResponse(200, docPage([{ id: '200', name: 'VPN Notes', archived: true }])))

    const res = await harness().ok('itglue_global_search', { query: 'VPN', organizationId: '6942365' })

    expect(res.orgsSearched).toEqual(['2374967', '6942365'])
    expect(res.results[0].documents.map((d: { id: string }) => d.id)).toEqual(['100'])
    // The customer org's only match is archived, so it filters to empty rather
    // than surfacing a stale doc as if it were current.
    expect(res.results[1].documents).toEqual([])
    expect(res.results[1].archivedExcluded).toBe(1)
  })

  it('includes and tags archived documents per org when asked', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, docPage(MIXED)))
      .mockResolvedValueOnce(jsonResponse(200, docPage([{ id: '200', name: 'VPN Notes', archived: true }])))

    const res = await harness().ok('itglue_global_search', {
      query: 'VPN', organizationId: '6942365', includeArchived: true,
    })

    expect(res.results[0].documents).toHaveLength(2)
    expect(res.results[1].documents[0].archived).toBe(true)
  })
})

describe('all three document reads advertise the archived contract', () => {
  it.each(['itglue_org_documents', 'itglue_search_documents', 'itglue_global_search'])(
    '%s documents exclusion-by-default and the flag',
    (tool) => {
      const d = harness().description(tool)
      expect(d).toMatch(/ARCHIVED documents are EXCLUDED by default/)
      expect(d).toMatch(/includeArchived=true/)
      expect(d).toMatch(/archived/)
    },
  )
})
