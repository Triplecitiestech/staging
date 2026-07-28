// src/lib/connector/telemetry.test.ts
//
// What these tests protect:
//   1. A call IS recorded — tool name, actor, outcome, duration, size.
//   2. A call's ARGUMENTS and RESPONSE are NOT recorded. This is the whole
//      privacy posture of the feature (tool args carry Autotask ticket contents,
//      employee names and client data), so it is pinned structurally — the
//      column list itself is asserted, not just the values of one sample call.
//   3. A failing telemetry write cannot fail, or change, the tool call.
//   4. Refusals (staged gate, kill switch, not configured) are counted
//      separately from real failures — they are demand signal, not breakage.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const query = vi.fn()
let getPoolImpl: () => { query: typeof query } = () => ({ query })

vi.mock('@/lib/db-pool', () => ({
  getPool: () => getPoolImpl(),
}))

import {
  classifyToolResult,
  flushTelemetry,
  instrumentToolHandler,
  responseByteSize,
  toErrorClass,
  TELEMETRY_COLUMNS,
  type ToolTelemetryFacts,
} from './telemetry'
import { recordingServer, type ToolRegisteringServer } from './capability-registry'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const READ_FACTS: ToolTelemetryFacts = {
  vendor: 'Autotask PSA (Kaseya)',
  access: 'read',
  risk: 'read',
  staged: false,
}

const STAGE_FACTS: ToolTelemetryFacts = {
  vendor: 'Autotask PSA (Kaseya)',
  access: 'write',
  risk: 'low-risk write',
  staged: true,
}

/** An MCP success result. */
function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

/** An MCP error result, exactly as the connector's `fail()` helper builds it. */
function mcpError(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
}

const AUTH_EXTRA = { authInfo: { extra: { email: 'Tech@TripleCitiesTech.com' } } }

/** Row values keyed by column name, in TELEMETRY_COLUMNS order. */
function recordedRow(callIndex = 0): Record<string, unknown> {
  const call = query.mock.calls[callIndex]
  expect(call, 'expected a telemetry insert').toBeTruthy()
  const values = call[1] as unknown[]
  expect(values).toHaveLength(TELEMETRY_COLUMNS.length)
  return Object.fromEntries(TELEMETRY_COLUMNS.map((col, i) => [col, values[i]]))
}

beforeEach(() => {
  query.mockReset()
  query.mockResolvedValue({ rows: [] })
  getPoolImpl = () => ({ query })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// 1. It records the call
// ---------------------------------------------------------------------------

describe('telemetry records the call', () => {
  it('captures tool name, actor, outcome, duration and response size', async () => {
    const handler = instrumentToolHandler(
      'autotask_get_ticket',
      READ_FACTS,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 12))
        return ok({ id: 123, title: 'Printer offline' })
      }
    )

    const result = await handler({ ticketId: 123 }, AUTH_EXTRA)
    await flushTelemetry()

    expect(query).toHaveBeenCalledTimes(1)
    const row = recordedRow()

    expect(row.tool_name).toBe('autotask_get_ticket')
    // Normalised to lowercase so per-technician grouping cannot split one
    // person across two casings of their own address.
    expect(row.actor_email).toBe('tech@triplecitiestech.com')
    expect(row.vendor).toBe('Autotask PSA (Kaseya)')
    expect(row.access).toBe('read')
    expect(row.risk).toBe('read')
    expect(row.outcome).toBe('success')
    expect(row.error_class).toBeNull()
    expect(row.refusal_kind).toBeNull()
    expect(row.duration_ms).toBeGreaterThanOrEqual(1)
    expect(row.duration_ms).toBeLessThan(60_000)
    expect(row.response_bytes).toBeGreaterThan(0)

    // The handler's own result is returned untouched.
    expect(result).toEqual(ok({ id: 123, title: 'Printer offline' }))
  })

  it('records an unattributed call rather than dropping it', async () => {
    const handler = instrumentToolHandler('autotask_list_roles', READ_FACTS, async () => ok([]))
    await handler({}, {})
    await flushTelemetry()

    expect(recordedRow().actor_email).toBeNull()
  })

  it('is wired centrally through recordingServer, not per tool', async () => {
    // The proof that a new tool is measured for free: nothing below mentions
    // telemetry, and the classification comes from the shared TOOL_FACTS.
    const handlers: Record<string, (...args: unknown[]) => unknown> = {}
    const target: ToolRegisteringServer = {
      registerTool: (name, _config, handler) => {
        handlers[name] = handler
        return undefined
      },
    }
    const { server } = recordingServer(target)

    server.registerTool(
      'unifi_restart_device',
      { description: 'Restart one device.', inputSchema: {} },
      async () => ok({ restarted: true })
    )

    await handlers.unifi_restart_device({ deviceId: 'abc' }, AUTH_EXTRA)
    await flushTelemetry()

    const row = recordedRow()
    expect(row.tool_name).toBe('unifi_restart_device')
    expect(row.vendor).toBe('UniFi / Ubiquiti')
    expect(row.access).toBe('write')
    expect(row.risk).toBe('destructive')
    expect(row.outcome).toBe('success')
  })

  it('leaves the registered tool name and result identical', async () => {
    const names: string[] = []
    const handlers: Array<(...args: unknown[]) => unknown> = []
    const { server } = recordingServer({
      registerTool: (name, _config, handler) => {
        names.push(name)
        handlers.push(handler)
        return { enabled: true }
      },
    } as ToolRegisteringServer)

    const registration = server.registerTool(
      'autotask_get_company',
      { description: 'x', inputSchema: {} },
      async (args: { companyId: number }) => ok({ id: args.companyId })
    )

    expect(names).toEqual(['autotask_get_company'])
    expect(registration).toEqual({ enabled: true })
    expect(await handlers[0]({ companyId: 7 }, AUTH_EXTRA)).toEqual(ok({ id: 7 }))
  })
})

// ---------------------------------------------------------------------------
// 2. It records nothing resembling arguments or response content
// ---------------------------------------------------------------------------

describe('telemetry never persists arguments or response bodies', () => {
  const ARG_MARKER = 'ARG_MARKER_employee_ssn_and_ticket_body'
  const RESPONSE_MARKER = 'RESPONSE_MARKER_client_confidential_payload'

  it('writes neither the arguments nor the response, only size', async () => {
    const handler = instrumentToolHandler(
      'autotask_add_internal_note',
      { vendor: 'Autotask PSA (Kaseya)', access: 'write', risk: 'low-risk write', staged: false },
      // Deliberately hostile: echoes the arguments straight back into the
      // response, so a leak in either direction shows up in one assertion.
      async (args: unknown) => ok({ echo: args, secret: RESPONSE_MARKER })
    )

    await handler(
      { ticketId: 555, note: ARG_MARKER, contactEmail: 'client@example.com' },
      AUTH_EXTRA
    )
    await flushTelemetry()

    const [sql, values] = query.mock.calls[0]
    const persisted = JSON.stringify([sql, values])

    expect(persisted).not.toContain(ARG_MARKER)
    expect(persisted).not.toContain(RESPONSE_MARKER)
    expect(persisted).not.toContain('client@example.com')
    expect(persisted).not.toContain('echo')
    // The size IS recorded — that is the context-weight proxy the dashboard uses.
    expect(recordedRow().response_bytes).toBeGreaterThan(0)
  })

  it('pins the complete column list — no column can hold a payload', () => {
    // Structural, not behavioural: adding an argument/response column requires
    // changing this list, which a reviewer sees in the diff.
    expect([...TELEMETRY_COLUMNS]).toEqual([
      'tool_name',
      'actor_email',
      'vendor',
      'access',
      'risk',
      'staged',
      'outcome',
      'error_class',
      'refusal_kind',
      'duration_ms',
      'response_bytes',
      'build_commit',
    ])

    const forbidden = [
      'args',
      'arguments',
      'params',
      'parameters',
      'input',
      'payload',
      'request',
      'request_body',
      'response',
      'response_body',
      'body',
      'content',
      'text',
      'result',
      'output',
      'message',
      'error_message',
      'error_detail',
      'notes',
    ]
    for (const col of TELEMETRY_COLUMNS) {
      expect(forbidden, `column "${col}" could carry customer data`).not.toContain(col)
    }
  })

  it('does not persist the error MESSAGE, only its class', async () => {
    // Vendor error strings quote ticket subjects, file names and user names.
    const handler = instrumentToolHandler('autotask_get_ticket', READ_FACTS, async () =>
      mcpError('404 Not Found: ticket "Payroll export for Jane Doe" is missing')
    )

    await handler({ ticketId: 1 }, AUTH_EXTRA)
    await flushTelemetry()

    const persisted = JSON.stringify(query.mock.calls[0])
    expect(persisted).not.toContain('Jane Doe')
    expect(persisted).not.toContain('Payroll export')
    expect(recordedRow().error_class).toBe('bad_input')
  })
})

// ---------------------------------------------------------------------------
// 3. A broken telemetry write cannot break the tool call
// ---------------------------------------------------------------------------

describe('telemetry failures are absorbed', () => {
  it('returns the tool result normally when the insert rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    query.mockRejectedValue(new Error('remaining connection slots are reserved'))

    const handler = instrumentToolHandler('autotask_get_ticket', READ_FACTS, async () =>
      ok({ id: 42 })
    )

    await expect(handler({ ticketId: 42 }, AUTH_EXTRA)).resolves.toEqual(ok({ id: 42 }))
    await flushTelemetry()
    // Diagnosable in Vercel logs, but never raised to the caller.
    expect(warn).toHaveBeenCalled()
  })

  it('returns the tool result normally when the pool itself throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getPoolImpl = () => {
      throw new Error('DATABASE_URL missing')
    }

    const handler = instrumentToolHandler('autotask_get_ticket', READ_FACTS, async () =>
      ok({ id: 43 })
    )

    await expect(handler({ ticketId: 43 }, AUTH_EXTRA)).resolves.toEqual(ok({ id: 43 }))
    await flushTelemetry()
    expect(warn).toHaveBeenCalled()
  })

  it('re-throws a handler error unchanged, and still records it', async () => {
    const boom = new Error('502 Bad Gateway from Autotask')
    const handler = instrumentToolHandler('autotask_get_ticket', READ_FACTS, async () => {
      throw boom
    })

    await expect(handler({ ticketId: 44 }, AUTH_EXTRA)).rejects.toBe(boom)
    await flushTelemetry()

    const row = recordedRow()
    expect(row.outcome).toBe('failure')
    expect(row.error_class).toBe('vendor_unavailable')
    expect(row.response_bytes).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 4. Refusals are not failures
// ---------------------------------------------------------------------------

describe('refusals are classified separately from failures', () => {
  it('counts a successful staged-write gate response as a refusal', async () => {
    const handler = instrumentToolHandler(
      'autotask_stage_config_write',
      STAGE_FACTS,
      async () =>
        ok({
          stagedWriteId: 'abc',
          status: 'pending_approval',
          note: 'NOTHING has been written. A staff member must approve this at https://example.com/admin/connector/staged-writes',
        })
    )

    await handler({ area: 'ticket_categories' }, AUTH_EXTRA)
    await flushTelemetry()

    const row = recordedRow()
    expect(row.outcome).toBe('refusal')
    expect(row.refusal_kind).toBe('approval_required')
    expect(row.error_class).toBeNull()
  })

  it('classifies the real refusal texts the connector emits', () => {
    const cases: Array<[string, string, string]> = [
      [
        'kill_switch',
        'autotask_stage_config_write',
        'Config writes are disabled: set CONNECTOR_CONFIG_WRITES_ENABLED=true in Vercel env vars to enable the staged-write gate. Read tools are unaffected.',
      ],
      [
        'kill_switch',
        'unifi_restart_device',
        'UniFi writes are disabled: set CONNECTOR_UNIFI_WRITES_ENABLED=true in Vercel env vars to enable them.',
      ],
      [
        'kill_switch',
        'hr_er_log_append',
        'HR record writes are disabled. Set CONNECTOR_HR_WRITES_ENABLED=true once the app registration is in place.',
      ],
      [
        'not_configured',
        'datto_rmm_account',
        'Datto RMM is not configured: set DATTO_RMM_API_URL, DATTO_RMM_API_KEY and DATTO_RMM_API_SECRET in the environment.',
      ],
      [
        'not_configured',
        'itglue_search_orgs',
        'IT Glue is not configured: set IT_GLUE_CONNECTOR_API_KEY (or IT_GLUE_API_KEY) in the environment.',
      ],
      [
        'approval_required',
        'autotask_execute_staged_write',
        'Not approved yet. A staff member must approve it first at https://example.com/admin/connector/staged-writes.',
      ],
      [
        'approval_required',
        'unifi_execute_staged_write',
        "Cannot execute: staged write is 'pending_approval'.",
      ],
    ]

    for (const [expectedKind, toolName, message] of cases) {
      const viaResult = classifyToolResult({ toolName, result: mcpError(message) })
      expect(viaResult.outcome, message).toBe('refusal')
      expect(viaResult.refusalKind, message).toBe(expectedKind)
      expect(viaResult.errorClass, message).toBeNull()

      // A thrown error takes the same path — several of these throw rather than
      // returning an isError result, depending on the tool module.
      const viaThrow = classifyToolResult({ toolName, thrown: new Error(message) })
      expect(viaThrow.outcome, message).toBe('refusal')
      expect(viaThrow.refusalKind, message).toBe(expectedKind)
    }
  })

  it('still calls a genuine vendor error a failure, bucketed by class', () => {
    const cases: Array<[string, string]> = [
      ['auth', 'Autotask API error 401 Unauthorized'],
      ['auth', 'Forbidden: the API user lacks permission'],
      ['rate_limit', 'Request failed: 429 rate limit exceeded'],
      ['vendor_unavailable', 'Autotask API error 503 Service Unavailable'],
      ['vendor_unavailable', 'The operation was aborted due to timeout'],
      ['bad_input', 'Autotask API error 400: dueDateTime is required'],
      ['other', 'Something entirely unexpected happened'],
    ]

    for (const [expected, message] of cases) {
      const c = classifyToolResult({ toolName: 'autotask_create_ticket', result: mcpError(message) })
      expect(c.outcome, message).toBe('failure')
      expect(c.refusalKind, message).toBeNull()
      expect(c.errorClass, message).toBe(expected)
      expect(toErrorClass(message), message).toBe(expected)
    }
  })

  it('does not mistake a successful read whose DATA mentions "not configured" for a refusal', () => {
    // The false positive that would make refusal counts meaningless: an IT Glue
    // configuration list, or a Datto audit, legitimately contains that phrase.
    const c = classifyToolResult({
      toolName: 'itglue_org_configurations',
      result: ok([{ name: 'SW-CORE-01', notes: 'Uplink not configured yet' }]),
    })
    expect(c.outcome).toBe('success')
    expect(c.refusalKind).toBeNull()
  })

  it('measures response size without keeping the response', () => {
    expect(responseByteSize(ok({ a: 1 }))).toBeGreaterThan(0)
    expect(responseByteSize(null)).toBe(0)
    expect(responseByteSize(undefined)).toBe(0)
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(responseByteSize(circular)).toBe(0)
  })
})
