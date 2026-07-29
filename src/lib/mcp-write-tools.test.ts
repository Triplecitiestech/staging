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

vi.mock('@/lib/autotask', () => ({
  AutotaskClient: class {
    getResourceByEmail = getResourceByEmail
    getTicket = getTicket
    getTicketAssignment = getTicketAssignment
    getTicketResolution = getTicketResolution
  },
  getAutotaskTicketUrl: (id: string) => `https://ww15.autotask.net/ticket/${id}`,
}))

import { registerWriteTools } from './mcp-write-tools'
import { DEFAULT_ASSIGNED_RESOURCE_ROLE_ID, applyAssignedResourceRole } from './autotask-write'

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
