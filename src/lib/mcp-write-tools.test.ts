// src/lib/mcp-write-tools.test.ts
//
// Regression lock for Autotask resource assignment, reproduced live on
// 2026-07-29 against the production instance.
//
// WHAT WENT WRONG: autotask_create_ticket exposed assignedResourceID but not
// assignedResourceRoleID, and autotask_assign_ticket PATCHed the resource alone.
// Autotask rejects either with HTTP 500 and:
//
//   "Data violation: When assigning a Resource, you must assign both a
//    assignedResourceID and assignedResourceRoleID."
//
// so assignment through the connector failed 100% of the time — and the 500 was
// classified as a server error, which told the caller to retry.
//
// These tests assert the READ-BACK (what Autotask actually stored), not the
// HTTP status, because success-shaped output on failure is what let the IT Glue
// folder defect survive twelve days.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// autotask-write.ts reads AUTOTASK_API_BASE_URL at MODULE LOAD, so it has to be
// set before the import below — hence vi.hoisted rather than beforeEach.
vi.hoisted(() => {
  process.env.AUTOTASK_API_BASE_URL = 'https://webservices15.autotask.net/atservicesrest'
})

// The tools resolve the signed-in tech and read tickets through AutotaskClient;
// writes go out through autotask-write's own fetch. Both are mocked so nothing
// opens a socket.
const getResourceByEmail = vi.fn()
const getTicket = vi.fn()
const getTicketAssignment = vi.fn()
const getTicketResolution = vi.fn()
const getTicketNoteByNoteId = vi.fn()
const getTicketCoreFields = vi.fn()
const getCompanyLocations = vi.fn()
const picklistLabelMap = vi.fn()

vi.mock('@/lib/autotask', () => ({
  AutotaskClient: class {
    getResourceByEmail = getResourceByEmail
    getTicket = getTicket
    getTicketAssignment = getTicketAssignment
    getTicketResolution = getTicketResolution
    getTicketNoteByNoteId = getTicketNoteByNoteId
    getTicketCoreFields = getTicketCoreFields
    getCompanyLocations = getCompanyLocations
    picklistLabelMap = picklistLabelMap
  },
  getAutotaskTicketUrl: (id: string) => `https://ww15.autotask.net/ticket/${id}`,
}))

import { registerWriteTools, verifyNoteEdit } from './mcp-write-tools'
import { DEFAULT_ASSIGNED_RESOURCE_ROLE_ID, applyAssignedResourceRole } from './autotask-write'
import { __setCapabilityFetcher, clearCapabilityCache } from '@/lib/connector/autotask-capability'

const ENGINEER = 29683355
const HELP_DESK = 29683464
const LOW_VOLTAGE = 29683465 // never a default — cabling role, wrong rate

type Handler = (args: Record<string, unknown>, extra: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>

const AUTH = { authInfo: { extra: { email: 'kurtis@triplecitiestech.com' } } }

/**
 * Pull the envelope out of `Error: <message>\n\n{"failure":…}`.
 *
 * Anchored on the JSON block, not the first `{` — the message itself quotes the
 * vendor's JSON error body, which is exactly the case this defect involved.
 */
function parseEnvelope(text: string): Record<string, unknown> {
  const start = text.indexOf('{\n  "failure"')
  expect(start, `no failure envelope in: ${text}`).toBeGreaterThan(-1)
  return JSON.parse(text.slice(start)).failure as Record<string, unknown>
}

function harness() {
  const tools = new Map<string, { config: Record<string, unknown>; handler: Handler }>()
  const server = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTool(name: string, config: any, handler: Handler) {
      tools.set(name, { config, handler })
    },
  }
  registerWriteTools(server)
  return {
    description: (n: string) => String(tools.get(n)!.config.description),
    schema: (n: string) => tools.get(n)!.config.inputSchema as Record<string, unknown>,
    async ok(n: string, args: Record<string, unknown>) {
      const res = await tools.get(n)!.handler(args, AUTH)
      expect(res.isError, `${n} returned an error: ${res.content[0]?.text}`).toBeFalsy()
      return JSON.parse(res.content[0].text)
    },
    async failure(n: string, args: Record<string, unknown>) {
      const res = await tools.get(n)!.handler(args, AUTH)
      expect(res.isError, `${n} was expected to FAIL but returned success`).toBe(true)
      return parseEnvelope(res.content[0].text)
    },
  }
}

/** Bodies of the Autotask writes issued during a test. */
function writeBodies() {
  return vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string))
}

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** The real 500 Autotask answers when the resource/role pair is half-supplied. */
const DATA_VIOLATION = jsonResponse(500, {
  errors: ['Data violation: When assigning a Resource, you must assign both a assignedResourceID and assignedResourceRoleID.'],
})

beforeEach(() => {
  process.env.AUTOTASK_API_BASE_URL = 'https://webservices15.autotask.net/atservicesrest'
  process.env.AUTOTASK_WRITE_USERNAME = 'write@example.com'
  process.env.AUTOTASK_WRITE_SECRET = 'secret-value-not-real'
  process.env.AUTOTASK_WRITE_INTEGRATION_CODE = 'code'
  getResourceByEmail.mockReset().mockResolvedValue({ id: 1234 })
  getTicket.mockReset().mockResolvedValue({ id: 555, ticketNumber: 'T20260729.0001' })
  getTicketAssignment.mockReset()
  getTicketNoteByNoteId.mockReset()
  getTicketCoreFields.mockReset()
  getCompanyLocations.mockReset().mockResolvedValue([])
  // The live picklist on this instance: 1 is the CUSTOMER-VISIBLE state and
  // there is no id 3 — see the AutotaskTicketNote docblock.
  picklistLabelMap.mockReset().mockResolvedValue(
    new Map([
      [1, 'All Autotask Users'],
      [2, 'Internal Project Team'],
      [4, 'Internal & Co-Managed'],
    ])
  )
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

// ---------------------------------------------------------------------------
// The pairing rule, enforced in the writer so no call site can skip it
// ---------------------------------------------------------------------------

describe('applyAssignedResourceRole', () => {
  it('adds the Engineer role when a resource is supplied without one', () => {
    expect(applyAssignedResourceRole({ assignedResourceID: 29683305 }))
      .toEqual({ assignedResourceID: 29683305, assignedResourceRoleID: ENGINEER })
  })

  it('defaults to Engineer, never Low/High Voltage Technician', () => {
    expect(DEFAULT_ASSIGNED_RESOURCE_ROLE_ID).toBe(ENGINEER)
    expect(DEFAULT_ASSIGNED_RESOURCE_ROLE_ID).not.toBe(LOW_VOLTAGE)
  })

  it('leaves an explicitly supplied role alone', () => {
    expect(applyAssignedResourceRole({ assignedResourceID: 1, assignedResourceRoleID: HELP_DESK }))
      .toEqual({ assignedResourceID: 1, assignedResourceRoleID: HELP_DESK })
  })

  it('does not attach a role when no resource is being set', () => {
    expect(applyAssignedResourceRole({ status: 5 })).toEqual({ status: 5 })
  })

  it('does not attach a role when the assignment is being CLEARED', () => {
    // Autotask has no role to pair with "nobody"; sending one would break unassign.
    expect(applyAssignedResourceRole({ assignedResourceID: null })).toEqual({ assignedResourceID: null })
  })
})

// ---------------------------------------------------------------------------
// autotask_assign_ticket
// ---------------------------------------------------------------------------

describe('autotask_assign_ticket sends the required pair', () => {
  it('PATCHes resource AND role, defaulting the role to Engineer', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { itemId: 555 }))
    getTicketAssignment.mockResolvedValue({ assignedResourceID: 29683305, assignedResourceRoleID: ENGINEER })

    const out = await harness().ok('autotask_assign_ticket', { ticketId: 555, resourceId: 29683305 })

    expect(writeBodies()[0]).toMatchObject({ id: 555, assignedResourceID: 29683305, assignedResourceRoleID: ENGINEER })
    expect(out).toMatchObject({ assignmentVerified: true, roleDefaulted: true, assignment: { assignedResourceRoleID: ENGINEER } })
  })

  it('honours an explicit role', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { itemId: 555 }))
    getTicketAssignment.mockResolvedValue({ assignedResourceID: 29683305, assignedResourceRoleID: HELP_DESK })

    const out = await harness().ok('autotask_assign_ticket', { ticketId: 555, resourceId: 29683305, assignedResourceRoleID: HELP_DESK })

    expect(writeBodies()[0].assignedResourceRoleID).toBe(HELP_DESK)
    expect(out.roleDefaulted).toBe(false)
  })

  it('VERIFIES by read-back: an accepted PATCH that did not stick is a failure, not a success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { itemId: 555 })) // Autotask said 200…
    getTicketAssignment.mockResolvedValue({ assignedResourceID: null, assignedResourceRoleID: null }) // …but nothing changed

    const failure = await harness().failure('autotask_assign_ticket', { ticketId: 555, resourceId: 29683305 })

    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(String(failure.message)).toContain('Do NOT report this ticket as assigned')
    expect(failure.details).toMatchObject({ ticketId: 555, requested: { resourceId: 29683305, roleId: ENGINEER } })
  })

  it('treats a role mismatch as unverified too', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { itemId: 555 }))
    getTicketAssignment.mockResolvedValue({ assignedResourceID: 29683305, assignedResourceRoleID: LOW_VOLTAGE })

    const failure = await harness().failure('autotask_assign_ticket', { ticketId: 555, resourceId: 29683305, assignedResourceRoleID: ENGINEER })
    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
  })

  it('exposes assignedResourceRoleID in its schema and names the valid roles', () => {
    const h = harness()
    expect(Object.keys(h.schema('autotask_assign_ticket'))).toContain('assignedResourceRoleID')
    const d = h.description('autotask_assign_ticket')
    expect(d).toContain('29683355')
    expect(d).toMatch(/Do NOT use Low\/High Voltage Technician/)
  })
})

// ---------------------------------------------------------------------------
// autotask_create_ticket
// ---------------------------------------------------------------------------

const CREATE_ARGS = { companyID: 42, title: 'Printer offline', queueID: 8, status: 1, priority: 2 }

describe('autotask_create_ticket sends the required pair', () => {
  it('POSTs the role alongside the resource, defaulted to Engineer', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { itemId: 555 }))
    getTicketAssignment.mockResolvedValue({ assignedResourceID: 29683305, assignedResourceRoleID: ENGINEER })

    const out = await harness().ok('autotask_create_ticket', { ...CREATE_ARGS, assignedResourceID: 29683305 })

    expect(writeBodies()[0]).toMatchObject({ assignedResourceID: 29683305, assignedResourceRoleID: ENGINEER })
    expect(out).toMatchObject({
      id: 555,
      assignmentVerified: true,
      assignmentRequested: { assignedResourceID: 29683305, assignedResourceRoleID: ENGINEER, roleDefaulted: true },
    })
  })

  it('sends NO assignment fields when no resource was requested', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { itemId: 555 }))

    const out = await harness().ok('autotask_create_ticket', CREATE_ARGS)

    expect(writeBodies()[0].assignedResourceRoleID).toBeUndefined()
    expect(out.assignmentVerified).toBeUndefined()
    expect(getTicketAssignment).not.toHaveBeenCalled()
  })

  it('reports the ticket AND an unverified assignment when the resource did not stick', async () => {
    // The ticket exists, so this is not a failure — but it must not read as
    // "assigned" either.
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { itemId: 555 }))
    getTicketAssignment.mockResolvedValue({ assignedResourceID: null, assignedResourceRoleID: null })

    const out = await harness().ok('autotask_create_ticket', { ...CREATE_ARGS, assignedResourceID: 29683305 })

    expect(out.id).toBe(555)
    expect(out.assignmentVerified).toBe(false)
    expect(String(out.assignmentNote)).toContain('do not report it as assigned')
  })

  it('exposes assignedResourceRoleID in its schema', () => {
    expect(Object.keys(harness().schema('autotask_create_ticket'))).toContain('assignedResourceRoleID')
  })
})

// ---------------------------------------------------------------------------
// The data violation itself: never TRANSIENT, never "retry"
// ---------------------------------------------------------------------------

describe('a Data violation 500 is not a retryable server error', () => {
  it('classifies the real Autotask response as PRECONDITION_FAILED with the vendor rule quoted', async () => {
    // Reaching this means something got past the pairing default (e.g. a future
    // required field). The caller must still never be told to retry.
    vi.mocked(fetch).mockResolvedValueOnce(DATA_VIOLATION)

    const failure = await harness().failure('autotask_assign_ticket', { ticketId: 555, resourceId: 29683305 })

    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(failure.reasonCode).not.toBe('TRANSIENT')
    expect(failure.fixableBy).not.toBe('retry')
    expect(String(failure.remediation)).toContain('you must assign both a assignedResourceID and assignedResourceRoleID')
    expect(String(failure.remediation)).not.toMatch(/wait briefly and retry/i)
    expect(failure.details).toMatchObject({ retryable: false })
  })
})

// ---------------------------------------------------------------------------
// autotask_update_ticket_note
// ---------------------------------------------------------------------------
//
// The connector could create notes but not edit them, so every correction became
// another note and tickets accumulated unreadable stacks of them. Autotask does
// support the edit (live entityInformation 2026-08-10: TicketNotes.canUpdate
// true; description/title/publish isReadOnly false; canDelete FALSE).
//
// Two properties carry the risk and are locked here:
//   1. a PARTIAL write must send only the fields the caller passed, because a
//      body carrying an unsupplied field could blank a colleague's text;
//   2. an accepted PATCH that did not stick must FAIL, not read as success —
//      the IT Glue folder-move defect survived twelve days on success-shaped
//      output for a write the vendor silently dropped.

const NOTE_ID = 91001
const NOTE_TICKET = 34648

/** The note as it stands before an edit: internal, with the original text. */
function existingNote(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    ticketID: NOTE_TICKET,
    title: 'Internal note',
    description: 'Replaced the swtich in rack 2.',
    noteType: 1,
    publish: 2,
    lastActivityDate: '2026-08-10T12:00:00',
    ...overrides,
  }
}

/** PATCH bodies issued during a test, paired with the URL they went to. */
function patchCalls() {
  return vi.mocked(fetch).mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit).method,
    body: JSON.parse((init as RequestInit).body as string),
    headers: (init as RequestInit).headers as Record<string, string>,
  }))
}

describe('verifyNoteEdit compares REQUESTED against LIVE, not before against after', () => {
  it('reports a landed edit as changed', () => {
    const out = verifyNoteEdit({ description: 'fixed' }, { description: 'typo' }, { description: 'fixed' })
    expect(out.mismatches).toEqual([])
    expect(out.changedFields).toEqual(['description'])
    expect(out.unchangedFields).toEqual([])
  })

  it('treats a value that did not stick as a mismatch', () => {
    const out = verifyNoteEdit({ description: 'fixed' }, { description: 'typo' }, { description: 'typo' })
    expect(out.mismatches).toEqual([{ field: 'description', requested: 'fixed', actual: 'typo' }])
    expect(out.changedFields).toEqual([])
  })

  it('counts re-sending an identical value as unchanged, not as a failure', () => {
    // The end state is what the caller asked for, so this is a success — but the
    // response must not claim an edit happened.
    const out = verifyNoteEdit({ title: 'Same' }, { title: 'Same' }, { title: 'Same' })
    expect(out.mismatches).toEqual([])
    expect(out.unchangedFields).toEqual(['title'])
    expect(out.changedFields).toEqual([])
  })

  it('tolerates line-ending translation but nothing else', () => {
    // \r\n for \n is a transport difference; flagging it would return
    // PRECONDITION_FAILED on a perfect write and teach the reader to ignore the flag.
    expect(verifyNoteEdit({ description: 'a\nb' }, {}, { description: 'a\r\nb' }).mismatches).toEqual([])
    // Trailing whitespace is NOT normalized away — a real truncation still fails.
    expect(verifyNoteEdit({ description: 'a b' }, {}, { description: 'ab' }).mismatches).toHaveLength(1)
  })

  it('fails closed when the read-back omits the field entirely', () => {
    const out = verifyNoteEdit({ description: 'fixed' }, { description: 'typo' }, {})
    expect(out.mismatches).toEqual([{ field: 'description', requested: 'fixed', actual: null }])
  })

  it('ignores fields the caller never supplied', () => {
    const out = verifyNoteEdit({ description: 'fixed' }, existingNote(), { ...existingNote(), description: 'fixed' })
    expect(out.mismatches).toEqual([])
    expect(out.changedFields).toEqual(['description'])
  })
})

describe('autotask_update_ticket_note partial update', () => {
  it('PATCHes ONLY description when only description was passed', async () => {
    getTicketNoteByNoteId
      .mockResolvedValueOnce(existingNote())
      .mockResolvedValueOnce(existingNote({ description: 'Replaced the switch in rack 2.' }))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { itemId: NOTE_ID }))

    const out = await harness().ok('autotask_update_ticket_note', {
      noteId: NOTE_ID,
      description: 'Replaced the switch in rack 2.',
    })

    const [call] = patchCalls()
    expect(call.method).toBe('PATCH')
    // Only id + the one supplied field. A title or publish key here could blank
    // or flip something the caller never mentioned.
    expect(call.body).toEqual({ id: NOTE_ID, description: 'Replaced the switch in rack 2.' })
    expect(Object.keys(call.body).sort()).toEqual(['description', 'id'])
    expect(call.body.ticketID).toBeUndefined()
    // Attributed to the signed-in tech, like every other impersonated write.
    expect(call.headers.ImpersonationResourceId).toBe('1234')

    expect(out).toMatchObject({
      editVerified: true,
      noteId: NOTE_ID,
      ticketId: NOTE_TICKET,
      requestedFields: ['description'],
      changedFields: ['description'],
      publishChanged: false,
    })
    expect(out.note.description).toBe('Replaced the switch in rack 2.')
  })

  it('addresses the note through its ticket, resolved from the note itself', async () => {
    getTicketNoteByNoteId
      .mockResolvedValueOnce(existingNote())
      .mockResolvedValueOnce(existingNote({ title: 'Corrected title' }))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))

    await harness().ok('autotask_update_ticket_note', { noteId: NOTE_ID, title: 'Corrected title' })

    // The caller passes no ticketId; it comes from the pre-read.
    expect(patchCalls()[0].url).toContain(`Tickets/${NOTE_TICKET}/Notes`)
    expect(getTicketNoteByNoteId).toHaveBeenCalledWith(NOTE_ID)
  })

  it('reports a no-op edit as unchanged rather than as an edit that happened', async () => {
    getTicketNoteByNoteId.mockResolvedValueOnce(existingNote()).mockResolvedValueOnce(existingNote())
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))

    const out = await harness().ok('autotask_update_ticket_note', {
      noteId: NOTE_ID,
      description: 'Replaced the swtich in rack 2.',
    })

    expect(out.editVerified).toBe(true)
    expect(out.unchangedFields).toEqual(['description'])
    expect(out.changedFields).toEqual([])
    expect(String(out.unchangedNote)).toContain('did not actually change')
  })

  it('rejects a call that changes nothing, without contacting Autotask', async () => {
    const failure = await harness().failure('autotask_update_ticket_note', { noteId: NOTE_ID })

    expect(failure.reasonCode).toBe('INVALID_INPUT')
    expect(String(failure.message)).toContain('at least one of description, title or publish')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    expect(getTicketNoteByNoteId).not.toHaveBeenCalled()
  })

  it('refuses an unknown note id and never writes', async () => {
    getTicketNoteByNoteId.mockResolvedValueOnce(null)

    const failure = await harness().failure('autotask_update_ticket_note', { noteId: 404404, description: 'x' })

    expect(failure.reasonCode).toBe('INVALID_INPUT')
    expect(String(failure.remediation)).toContain('autotask_ticket_notes')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})

describe('autotask_update_ticket_note publish changes', () => {
  it('states the before and after labels when a note becomes CUSTOMER-VISIBLE', async () => {
    // publish 2 (Internal Project Team) → 1 ("All Autotask Users", which is the
    // customer-visible state on this instance).
    getTicketNoteByNoteId
      .mockResolvedValueOnce(existingNote({ publish: 2 }))
      .mockResolvedValueOnce(existingNote({ publish: 1 }))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))

    const out = await harness().ok('autotask_update_ticket_note', { noteId: NOTE_ID, publish: 1 })

    expect(patchCalls()[0].body).toEqual({ id: NOTE_ID, publish: 1 })
    expect(out.publishChanged).toBe(true)
    expect(out.publishBefore).toMatchObject({ publish: 2, publishLabel: 'Internal Project Team' })
    expect(out.publishAfter).toMatchObject({ publish: 1, publishLabel: 'All Autotask Users' })
    expect(out.publishBefore.visibility.scope).toBe('internal')
    expect(out.publishAfter.visibility.scope).toBe('customer_visible')
    expect(String(out.publishChangeNote)).toContain('VISIBILITY CHANGED')
    expect(String(out.publishChangeNote)).toContain('NOW CUSTOMER-VISIBLE')
  })

  it('states the reverse transition too, when a note is pulled back to internal', async () => {
    getTicketNoteByNoteId
      .mockResolvedValueOnce(existingNote({ publish: 1 }))
      .mockResolvedValueOnce(existingNote({ publish: 2 }))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))

    const out = await harness().ok('autotask_update_ticket_note', { noteId: NOTE_ID, publish: 2 })

    expect(out.publishChanged).toBe(true)
    expect(String(out.publishChangeNote)).toContain('NO LONGER CUSTOMER-VISIBLE')
  })

  it('edits text and visibility together, sending both and neither more', async () => {
    getTicketNoteByNoteId
      .mockResolvedValueOnce(existingNote({ publish: 2 }))
      .mockResolvedValueOnce(existingNote({ publish: 1, description: 'Customer-safe wording.' }))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))

    const out = await harness().ok('autotask_update_ticket_note', {
      noteId: NOTE_ID,
      description: 'Customer-safe wording.',
      publish: 1,
    })

    expect(patchCalls()[0].body).toEqual({ id: NOTE_ID, description: 'Customer-safe wording.', publish: 1 })
    expect(out.changedFields).toEqual(['description', 'publish'])
    expect(out.publishChanged).toBe(true)
  })
})

describe('autotask_update_ticket_note read-back mismatch is a FAILURE, not a success', () => {
  it('returns PRECONDITION_FAILED when Autotask accepts the PATCH but the value did not stick', async () => {
    getTicketNoteByNoteId
      .mockResolvedValueOnce(existingNote()) // before
      .mockResolvedValueOnce(existingNote()) // after: Autotask said 200, nothing changed
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { itemId: NOTE_ID }))

    const failure = await harness().failure('autotask_update_ticket_note', {
      noteId: NOTE_ID,
      description: 'Replaced the switch in rack 2.',
    })

    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(failure.reasonCode).not.toBe('TRANSIENT')
    expect(String(failure.message)).toContain('Do NOT report this note as corrected')
    expect(String(failure.remediation)).not.toMatch(/wait briefly and retry/i)
    expect(failure.details).toMatchObject({
      noteId: NOTE_ID,
      ticketId: NOTE_TICKET,
      mismatches: [{ field: 'description', requested: 'Replaced the switch in rack 2.', actual: 'Replaced the swtich in rack 2.' }],
    })
  })

  it('names the fields that DID land, so a partial edit is not hidden', async () => {
    getTicketNoteByNoteId
      .mockResolvedValueOnce(existingNote({ publish: 2 }))
      // Title took; publish was dropped.
      .mockResolvedValueOnce(existingNote({ publish: 2, title: 'Corrected title' }))
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))

    const failure = await harness().failure('autotask_update_ticket_note', {
      noteId: NOTE_ID,
      title: 'Corrected title',
      publish: 1,
    })

    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(String(failure.message)).toContain('partially edited')
    expect(failure.details).toMatchObject({ changedFields: ['title'] })
  })

  it('fails rather than succeeding when the note cannot be re-read at all', async () => {
    getTicketNoteByNoteId.mockResolvedValueOnce(existingNote()).mockResolvedValueOnce(null)
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}))

    const failure = await harness().failure('autotask_update_ticket_note', { noteId: NOTE_ID, description: 'x' })

    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(String(failure.message)).toContain('nothing about the edit is confirmed')
  })
})

describe('autotask_update_ticket_note contract', () => {
  it('exposes noteId required and the three optional fields', () => {
    const schema = harness().schema('autotask_update_ticket_note')
    expect(Object.keys(schema).sort()).toEqual(['description', 'noteId', 'publish', 'title'])
  })

  it('never advertises a delete, and says it cannot notify', () => {
    // TicketNotes.canDelete is false; a tool implying otherwise would be faking it.
    const d = harness().description('autotask_update_ticket_note')
    expect(d).toContain('canDelete false')
    expect(d).toMatch(/does NOT notify anyone and CANNOT/)
    expect(d).toMatch(/no GET-and-merge/i)
  })
})


// ---------------------------------------------------------------------------
// autotask_update_ticket — general field correction
// ---------------------------------------------------------------------------
//
// Built 2026-08-27 after ticket 35432 (T20260827.0018) arrived from inbound
// email with companyID 0 and had to be re-parented by hand in the Autotask UI.
//
// The rule these tests define is the one the whole surface keeps re-learning:
// an accepted PATCH is not a done PATCH. Every assertion below is about what
// the READ-BACK reports, never about the HTTP status of the write.

// Live entityInformation for the fields this tool exposes. All nine report
// isReadOnly false and isQueryable true on this instance — pulled from the real
// Tickets metadata before the tool was written.
const TICKETS_SNAPSHOT = {
  fields: [
    { name: 'id', isQueryable: true, isReadOnly: true },
    { name: 'companyID', isQueryable: true, isReadOnly: false },
    { name: 'contactID', isQueryable: true, isReadOnly: false },
    { name: 'title', isQueryable: true, isReadOnly: false },
    { name: 'description', isQueryable: true, isReadOnly: false },
    { name: 'queueID', isQueryable: true, isReadOnly: false },
    { name: 'priority', isQueryable: true, isReadOnly: false },
    { name: 'ticketType', isQueryable: true, isReadOnly: false },
    { name: 'dueDateTime', isQueryable: true, isReadOnly: false },
    { name: 'contractID', isQueryable: true, isReadOnly: false },
    { name: 'companyLocationID', isQueryable: true, isReadOnly: false },
    // Read-only on the live instance — deliberately NOT a parameter.
    { name: 'completedDate', isQueryable: true, isReadOnly: true },
    { name: 'lastActivityDate', isQueryable: true, isReadOnly: true },
  ],
}

/** The state ticket 35432 actually arrived in: unmapped company. */
const UNMAPPED = {
  id: 35432, companyID: 0, companyLocationID: 285, contactID: null, title: 'Printer offline',
  description: 'Sent from the front desk', queueID: 8, priority: 2,
  ticketType: 1, dueDateTime: '2026-08-28T17:00:00Z', contractID: null,
}

/** The same ticket carrying the previous company's contact and contract. */
const WITH_STALE_LINKS = { ...UNMAPPED, contactID: 30683671, contractID: 29683617 }

/** Locations as CompanyLocations returns them for the company being moved TO. */
const NEW_COMPANY_LOCATIONS = [
  { id: 900, name: 'Warehouse', isPrimary: false, isActive: true },
  { id: 901, name: 'Head office', isPrimary: true, isActive: true },
]

describe('autotask_update_ticket', () => {
  beforeEach(() => {
    __setCapabilityFetcher(async () => TICKETS_SNAPSHOT)
    clearCapabilityCache()
  })
  afterEach(() => {
    __setCapabilityFetcher(null)
    clearCapabilityCache()
  })

  it('re-parents a ticket and proves the stored companyID by read-back', async () => {
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 294, companyLocationID: 901 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { itemId: 35432 }))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    expect(res.updateVerified).toBe(true)
    expect(res.changedFields).toEqual(['companyID'])
    expect(res.ticket.companyID).toBe(294)
    // Only what was asked for, PLUS the location the company change requires —
    // still no GET-and-merge: no title, description or queue appears here.
    expect(writeBodies()).toEqual([{ id: 35432, companyID: 294, companyLocationID: 901 }])
  })

  it('FAILS the call when the write does not stick, instead of trusting the 200', async () => {
    // Autotask accepts the PATCH and stores nothing — the exact shape that let
    // the IT Glue folder-move defect survive twelve days reporting success.
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 0 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { itemId: 35432 }))

    const failure = await harness().failure('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(String(failure.message)).toContain('does not show companyID')
    expect(String(failure.message)).toContain('Do NOT report this ticket as updated')
    expect((failure.details as Record<string, unknown>).mismatches).toEqual([
      { field: 'companyID', requested: 294, actual: 0 },
    ])
  })

  it('reports a partially applied write rather than a flat failure', async () => {
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      // title landed, companyID did not.
      .mockResolvedValueOnce({ ...UNMAPPED, title: 'Front desk printer offline' })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const failure = await harness().failure('autotask_update_ticket', {
      ticketId: 35432, companyID: 294, title: 'Front desk printer offline',
    })

    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(String(failure.message)).toContain('title DID change')
    expect(String(failure.message)).toContain('partially updated')
  })

  it('rejects a call that supplies only ticketId, before contacting Autotask', async () => {
    const failure = await harness().failure('autotask_update_ticket', { ticketId: 35432 })

    expect(failure.reasonCode).toBe('INVALID_INPUT')
    expect(String(failure.message)).toContain('Nothing was written')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    expect(getTicketCoreFields).not.toHaveBeenCalled()
  })

  it('rejects an unknown ticket id without writing', async () => {
    getTicketCoreFields.mockResolvedValueOnce(null)

    const failure = await harness().failure('autotask_update_ticket', { ticketId: 999999, companyID: 294 })

    expect(failure.reasonCode).toBe('INVALID_INPUT')
    expect(String(failure.remediation)).toMatch(/ticket NUMBER/)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('does not claim an edit for a value the ticket already held', async () => {
    getTicketCoreFields
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 294 })
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 294 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    expect(res.changedFields).toEqual([])
    expect(res.unchangedFields).toEqual(['companyID'])
    expect(res.unchangedNote).toMatch(/already held the requested value/)
    // No re-parent warning fired, because nothing was re-parented.
    expect(res.reparentedNote).toBeUndefined()
    // And the location is left completely alone: no lookup, nothing in the PATCH.
    expect(getCompanyLocations).not.toHaveBeenCalled()
    expect(writeBodies()).toEqual([{ id: 35432, companyID: 294 }])
    expect(res.companyLocation.source).toBe('untouched')
  })

  it('warns that a companyID change re-parents the ticket, and names the site move', async () => {
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 294, companyLocationID: 901 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    expect(res.reparentedNote).toMatch(/RE-PARENTED/)
    expect(res.reparentedNote).toMatch(/notification recipients/)
    expect(res.reparentedNote).toMatch(/TELL THE USER/)
    // The location move is not a footnote: it is the reason the re-parent used
    // to fail outright, so the note the technician reads verbatim must say it.
    expect(res.reparentedNote).toMatch(/companyLocationID went from 285 to 901/)
  })

  it('warns that a contactID change moves who Autotask emails', async () => {
    getTicketCoreFields
      .mockResolvedValueOnce({ ...UNMAPPED, contactID: 11 })
      .mockResolvedValueOnce({ ...UNMAPPED, contactID: 22 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, contactID: 22 })

    expect(res.contactChangeNote).toMatch(/NOTIFICATION RECIPIENT CHANGED/)
    expect(res.contactChangeNote).toMatch(/stops emailing the previous one/)
  })

  // -------------------------------------------------------------------------
  // The site location, and why a re-parent could not work without it
  // -------------------------------------------------------------------------
  //
  // Reproduced live on 2026-08-28 against ticket 35437 (company 423 → 437):
  //
  //   PATCH Tickets 500 {"errors":["The companyLocationID[285] cannot be
  //   associated with the Ticket. The CompanyLocation must belong to the
  //   Ticket's, ConfigurationItem's, or the Contact's Company."]}
  //
  // Autotask stamps companyLocationID at create time; it belongs to the old
  // company and blocks the entire PATCH. So EVERY real re-parent failed — the
  // one case this tool was built for. These lock the fix.

  it('carries the new company\'s PRIMARY location in the same PATCH', async () => {
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 294, companyLocationID: 901 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    // One PATCH, both fields. Two calls would leave the ticket rejected on the
    // first and the location orphaned if the second never ran.
    expect(writeBodies()).toEqual([{ id: 35432, companyID: 294, companyLocationID: 901 }])
    // The primary, not merely the first row — 900 comes back first.
    expect(res.companyLocation).toMatchObject({ before: 285, after: 901, source: 'new_company_primary' })
    expect(getCompanyLocations).toHaveBeenCalledWith(294)
  })

  it('CLEARS the location when the new company declares no active primary', async () => {
    // The field is isRequired false on live entityInformation, so an empty site
    // is legal. It is also the honest answer: picking a non-primary location
    // would be a guess stamped on a customer record.
    getCompanyLocations.mockResolvedValue([
      { id: 900, name: 'Warehouse', isPrimary: false, isActive: true },
      { id: 902, name: 'Closed office', isPrimary: true, isActive: false },
    ])
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 294, companyLocationID: null })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    expect(writeBodies()).toEqual([{ id: 35432, companyID: 294, companyLocationID: null }])
    expect(res.companyLocation).toMatchObject({ after: null, source: 'cleared_no_primary' })
    // An inactive primary is not a primary.
    expect(res.companyLocation.sourceMeaning).toMatch(/no active primary/)
  })

  it('a location the CALLER supplied wins, and is strictly verified like any other field', async () => {
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 294, companyLocationID: 900 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', {
      ticketId: 35432, companyID: 294, companyLocationID: 900,
    })

    expect(writeBodies()).toEqual([{ id: 35432, companyID: 294, companyLocationID: 900 }])
    // No lookup at all — the caller already answered the question.
    expect(getCompanyLocations).not.toHaveBeenCalled()
    expect(res.companyLocation.source).toBe('caller')
    expect(res.changedFields).toEqual(expect.arrayContaining(['companyID', 'companyLocationID']))
  })

  it('FAILS when a caller-supplied location does not stick', async () => {
    // The strict half of the split: what the caller asked for is verified, so a
    // dropped location is a failure, not an observation.
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 294, companyLocationID: 285 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const failure = await harness().failure('autotask_update_ticket', {
      ticketId: 35432, companyID: 294, companyLocationID: 900,
    })

    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(String(failure.message)).toContain('companyLocationID')
  })

  it('reports a location Autotask re-stamped itself WITHOUT failing the re-parent', async () => {
    // The soft half: this tool chose the location, the caller did not ask for
    // it, and the company change — what was actually requested — did land.
    // Failing the whole call here would be the verifier crying wolf.
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 294, companyLocationID: 900 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    expect(res.updateVerified).toBe(true)
    expect(res.companyLocation.after).toBe(900)
    expect(res.companyLocation.divergedNote).toMatch(/Autotask set the location itself/)
  })

  // A stale CONTACT is the majority case, not an edge case: a mis-filed
  // inbound ticket almost always has one. Live on 2026-08-28, re-parenting a
  // ticket that carried one failed with
  //   {"errors":["Data violation: contactID is not associated to the companyID
  //    or its Parent Company.."]}
  // and a stale contract failed the same way with
  //   {"errors":["contractID [29683617] is not associated to companyID [423]
  //    or its parent."]}
  // — so fixing only the location would have left the re-parent broken for
  // most of the tickets this tool exists to correct.

  it('CLEARS a stale contact in the same PATCH as the re-parent', async () => {
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    getTicketCoreFields
      .mockResolvedValueOnce(WITH_STALE_LINKS)
      .mockResolvedValueOnce({ ...WITH_STALE_LINKS, companyID: 294, companyLocationID: 901, contactID: null })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    // One PATCH: two calls would leave the first rejected, since Autotask
    // refuses the company change while the old contact is attached. And NO
    // contractID — see the retraction test below.
    expect(writeBodies()).toEqual([
      { id: 35432, companyID: 294, companyLocationID: 901, contactID: null },
    ])
    expect(res.clearedOnReparent).toEqual([
      { field: 'contactID', was: 30683671, why: expect.stringContaining('previous company') },
    ])
    // Clearing a contact changes who gets emailed; that must not be silent.
    expect(res.clearedOnReparentNote).toMatch(/who Autotask emails/)
    expect(res.reparentedNote).toMatch(/contactID was CLEARED \(was 30683671, confirmed by read-back\)/)
  })

  // ---------------------------------------------------------------------
  // RETRACTION, live 2026-08-28. This tool briefly cleared contractID too,
  // on the belief that a stale contract blocks a re-parent the way a stale
  // contact does. It does not. That belief came from a DIFFERENT test —
  // setting a FOREIGN contractID explicitly, which Autotask does reject —
  // and was never checked against the case it described. The re-parent
  // succeeds with the contract in place, and the null is silently ignored.
  // ---------------------------------------------------------------------

  it('does NOT send a contractID on re-parent, and warns the ticket kept a stale one', async () => {
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    const before = { ...UNMAPPED, contractID: 29683617 }
    getTicketCoreFields
      .mockResolvedValueOnce(before)
      // Autotask keeps the contract — this is what it actually did.
      .mockResolvedValueOnce({ ...before, companyID: 294, companyLocationID: 901 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    // No futile write: a null here does nothing, and sending one implies an
    // intent that silently fails.
    expect(writeBodies()).toEqual([{ id: 35432, companyID: 294, companyLocationID: 901 }])
    expect(res.staleContract).toMatchObject({ contractId: 29683617, previousCompanyId: 0, clearable: false })
    expect(res.staleContractNote).toMatch(/STILL CARRIES THE PREVIOUS COMPANY'S CONTRACT/)
    expect(res.staleContractNote).toMatch(/cannot clear it/)
    // The retracted behaviour must not come back under another name.
    expect(res.clearedOnReparent).toBeUndefined()
  })

  it('reports a clear that did NOT stick as failed, never as done', async () => {
    // The defect this tool shipped on 2026-08-28: clearedOnReparent was built
    // from what the PATCH SENT, so it announced a clear Autotask had ignored —
    // success-shaped output on failure, in the code written to prevent it.
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    getTicketCoreFields
      .mockResolvedValueOnce(WITH_STALE_LINKS)
      // contactID comes back UNCHANGED despite the null.
      .mockResolvedValueOnce({ ...WITH_STALE_LINKS, companyID: 294, companyLocationID: 901 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    expect(res.clearedOnReparent).toBeUndefined()
    expect(res.failedToClear).toEqual([{ field: 'contactID', was: 30683671, stillReads: 30683671 }])
    expect(res.reparentedNote).toMatch(/contactID could NOT be cleared — Autotask kept 30683671/)
  })

  it('does NOT clear or warn about a contact or contract the caller supplied', async () => {
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    getTicketCoreFields
      .mockResolvedValueOnce(WITH_STALE_LINKS)
      .mockResolvedValueOnce({ ...WITH_STALE_LINKS, companyID: 294, companyLocationID: 901, contactID: 55, contractID: 66 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', {
      ticketId: 35432, companyID: 294, contactID: 55, contractID: 66,
    })

    expect(writeBodies()).toEqual([
      { id: 35432, companyID: 294, contactID: 55, contractID: 66, companyLocationID: 901 },
    ])
    expect(res.clearedOnReparent).toBeUndefined()
    // The caller gave the new company its own contract, so there is nothing stale.
    expect(res.staleContract).toBeUndefined()
    // Caller-supplied, so strictly verified rather than merely observed.
    expect(res.changedFields).toEqual(expect.arrayContaining(['contactID', 'contractID']))
  })

  it('leaves contact and contract alone when the company is not changing', async () => {
    getTicketCoreFields
      .mockResolvedValueOnce(WITH_STALE_LINKS)
      .mockResolvedValueOnce({ ...WITH_STALE_LINKS, title: 'Renamed' })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, title: 'Renamed' })

    expect(writeBodies()).toEqual([{ id: 35432, title: 'Renamed' }])
    expect(res.clearedOnReparent).toBeUndefined()
    // No company change means no stale anything — the links are still correct.
    expect(res.staleContract).toBeUndefined()
  })

  it('adds no clearing or contract wording when there was nothing stale', async () => {
    getCompanyLocations.mockResolvedValue(NEW_COMPANY_LOCATIONS)
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce({ ...UNMAPPED, companyID: 294, companyLocationID: 901 })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    expect(res.clearedOnReparent).toBeUndefined()
    expect(res.staleContract).toBeUndefined()
    expect(res.reparentedNote).not.toMatch(/CLEARED|STILL CARRIES/)
  })

  it('accepts an explicit null to clear the location on its own', async () => {
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce({ ...UNMAPPED, companyLocationID: null })
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const res = await harness().ok('autotask_update_ticket', { ticketId: 35432, companyLocationID: null })

    expect(writeBodies()).toEqual([{ id: 35432, companyLocationID: null }])
    expect(res.changedFields).toEqual(['companyLocationID'])
  })

  it('fails closed when the ticket cannot be read back at all', async () => {
    getTicketCoreFields
      .mockResolvedValueOnce(UNMAPPED)
      .mockResolvedValueOnce(null)
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    const failure = await harness().failure('autotask_update_ticket', { ticketId: 35432, companyID: 294 })

    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(String(failure.message)).toContain('nothing about the change is confirmed')
  })

  it('sends every supplied field, and only those', async () => {
    const after = {
      ...UNMAPPED, companyID: 294, contactID: 22, title: 'x', description: 'y',
      queueID: 9, priority: 1, ticketType: 2, dueDateTime: '2026-09-01T12:00:00Z', contractID: 77,
    }
    getTicketCoreFields.mockResolvedValueOnce(UNMAPPED).mockResolvedValueOnce(after)
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}))

    await harness().ok('autotask_update_ticket', {
      ticketId: 35432, companyID: 294, contactID: 22, title: 'x', description: 'y',
      queueID: 9, priority: 1, ticketType: 2, dueDateTime: '2026-09-01T12:00:00Z', contractID: 77,
    })

    expect(writeBodies()).toEqual([{
      id: 35432, companyID: 294, contactID: 22, title: 'x', description: 'y',
      queueID: 9, priority: 1, ticketType: 2, dueDateTime: '2026-09-01T12:00:00Z', contractID: 77,
      // Plus the one field the company change forces — the mocked company has
      // no locations at all here, so it is a clear.
      companyLocationID: null,
    }])
  })
})

describe('autotask_update_ticket contract', () => {
  it('exposes ticketId plus exactly the ten live-writable fields', () => {
    const schema = harness().schema('autotask_update_ticket')
    expect(Object.keys(schema).sort()).toEqual([
      'companyID', 'companyLocationID', 'contactID', 'contractID', 'description',
      'dueDateTime', 'priority', 'queueID', 'ticketId', 'ticketType', 'title',
    ])
  })

  it('exposes NO parameter for a field the live entityInformation reports read-only', () => {
    // These are isReadOnly true on the live instance. A parameter for one would
    // be accepted from the caller and silently dropped by Autotask — the exact
    // false-capability failure autotask_capability_check exists to prevent.
    const schema = harness().schema('autotask_update_ticket')
    for (const readOnly of [
      'id', 'createDate', 'completedDate', 'lastActivityDate', 'creatorResourceID',
      'firstResponseDateTime', 'resolvedDateTime', 'serviceLevelAgreementHasBeenMet',
    ]) {
      expect(schema, `${readOnly} is read-only and must not be settable`).not.toHaveProperty(readOnly)
    }
  })

  it('carries both visibility warnings and the no-merge guarantee', () => {
    const d = harness().description('autotask_update_ticket')
    expect(d).toMatch(/companyID RE-PARENTS THE TICKET/)
    expect(d).toMatch(/contactID CHANGES WHO AUTOTASK EMAILS/)
    expect(d).toMatch(/NO GET-and-merge/i)
    expect(d).toMatch(/PRECONDITION_FAILED/)
  })
})
