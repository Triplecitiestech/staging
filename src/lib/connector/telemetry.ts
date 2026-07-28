// src/lib/connector/telemetry.ts
//
// Per-call usage telemetry for the MCP connector.
//
// WHY THIS EXISTS: the connector is 126 tools used by the whole team from
// Claude chat / Code / Cowork. Before this, the only durable record of connector
// activity was `connector_staged_writes` (config changes only) — so there was no
// way to answer "who is using this", "what is failing", "what is it refusing to
// do", or "which tools are context-expensive". Refusals matter most: a tool that
// keeps declining (kill switch off, vendor not configured, approval required) is
// UNMET DEMAND, not breakage, and it is invisible in vendor logs.
//
// WHERE IT HOOKS: nowhere near the 126 tools. `recordingServer()` in
// capability-registry.ts already proxies every registerTool call; it now also
// wraps each HANDLER with `instrumentToolHandler()` from this module. One hook,
// no per-tool logging to drift, and a tool added tomorrow is measured for free.
//
// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY — NOT A LIMITATION TO WORK AROUND
//
// Tool ARGUMENTS and RESPONSE BODIES are never persisted. Arguments carry
// Autotask ticket contents, employee names and client data; a table of them
// would be a confidentiality breach and a liability, and it would sit outside
// every vendor's own retention controls.
//
// The schema enforces this rather than trusting the code: `TELEMETRY_COLUMNS`
// below is the complete column list, the INSERT is generated from it, and there
// is NO free-text column that could hold an argument, a response, or even an
// error message (error messages routinely quote ticket subjects and file names).
// Only names, classifications, outcomes, timings and sizes are stored. The
// response is measured — `responseByteSize()` — and scanned in memory for
// refusal markers; only the resulting enum leaves this module.
// ─────────────────────────────────────────────────────────────────────────────
//
// FAILURE POSTURE (copied from api-usage-tracker.ts): telemetry is
// fire-and-forget and swallows its own errors. A failed insert must never fail,
// delay or alter a tool call — the connector runs on Vercel serverless with
// maxDuration 60, so nothing here is allowed onto the blocking path.

import { classifyError } from '@/lib/resilience'
// Type-only import: erased at compile time, so capability-registry.ts can import
// this module without a runtime cycle.
import type { Access, RiskClass } from './capability-registry'

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

/** What happened on one tool call. */
export type CallOutcome = 'success' | 'refusal' | 'failure'

/**
 * Failure buckets, mapped from the shared `classifyError()` in resilience.ts —
 * deliberately NOT a second classifier of its own.
 */
export type ErrorClass = 'auth' | 'rate_limit' | 'vendor_unavailable' | 'bad_input' | 'other'

/**
 * Why the connector declined. A refusal is a call the connector deliberately
 * would not or could not complete — demand signal, not breakage:
 *   approval_required — the staged-write gate (nothing was written by design)
 *   kill_switch       — CONNECTOR_*_WRITES_ENABLED is off
 *   not_configured    — the vendor's credentials/env are missing
 */
export type RefusalKind = 'approval_required' | 'kill_switch' | 'not_configured'

export interface ToolCallTelemetry {
  toolName: string
  /** Signed-in technician, from the OAuth token. Null when unattributed. */
  actorEmail: string | null
  vendor: string
  access: Access
  risk: RiskClass
  /** Subject to the human staged-approval gate. */
  staged: boolean
  outcome: CallOutcome
  errorClass: ErrorClass | null
  refusalKind: RefusalKind | null
  durationMs: number
  /**
   * Size of the serialized response in BYTES. A context-weight proxy only —
   * not a token count, and never converted to dollars (the connector makes zero
   * Anthropic API calls, so it contributes nothing to that bill).
   */
  responseBytes: number
}

/** Per-tool classification, read from TOOL_FACTS by the caller. */
export interface ToolTelemetryFacts {
  vendor: string
  access: Access
  risk: RiskClass
  staged: boolean
}

// ---------------------------------------------------------------------------
// Response measurement + marker scanning (in memory; nothing persisted)
// ---------------------------------------------------------------------------

/**
 * Byte size of the response as it goes over the wire. Returns 0 for anything
 * unmeasurable (circular structures, undefined) rather than throwing.
 */
export function responseByteSize(result: unknown): number {
  if (result === null || result === undefined) return 0
  try {
    const json = JSON.stringify(result)
    if (typeof json !== 'string') return 0
    return Buffer.byteLength(json, 'utf8')
  } catch {
    return 0
  }
}

/**
 * Concatenated text of an MCP tool result, for marker matching ONLY. The string
 * is local to this call and is never stored or logged. Capped because refusal
 * markers live in short messages and a multi-megabyte read should not be
 * re-scanned.
 */
const MARKER_SCAN_LIMIT = 32_768

function resultText(result: unknown): string {
  const content = (result as { content?: unknown } | null | undefined)?.content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  let length = 0
  for (const block of content) {
    const text = (block as { text?: unknown } | null)?.text
    if (typeof text !== 'string') continue
    parts.push(text)
    length += text.length
    if (length >= MARKER_SCAN_LIMIT) break
  }
  return parts.join('\n').slice(0, MARKER_SCAN_LIMIT)
}

// Markers are matched ONLY against error-path text (or the structural stage
// rule below), which keeps a successful read whose data happens to contain
// "not configured" from being miscounted as a refusal.
const KILL_SWITCH_MARKERS: RegExp[] = [
  /\bwrites are disabled\b/i,
  /\brecord writes are disabled\b/i,
  /CONNECTOR_[A-Z0-9_]*ENABLED/,
  /\bkill switch\b/i,
]

const NOT_CONFIGURED_MARKERS: RegExp[] = [
  /\bis not configured\b/i,
  /\bare not configured\b/i,
  /\bnot configured\b/i,
  /\bnot_configured\b/i,
]

const APPROVAL_MARKERS: RegExp[] = [
  /\bmust approve\b/i,
  /\bnot approved yet\b/i,
  /\bpending_approval\b/i,
  /\bawaiting approval\b/i,
  /NOTHING (?:has been|is) written/i,
  /\brequires? (?:human )?approval\b/i,
]

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text))
}

/**
 * A successful call to a `*_stage_config_write` tool IS a gate response: it
 * writes nothing and hands back an approval URL. Recognised structurally so the
 * count survives any rewording of the note.
 */
function isStageGateSuccess(toolName: string, staged: boolean): boolean {
  return staged && /_stage_config_write$/.test(toolName)
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface ResultClassification {
  outcome: CallOutcome
  errorClass: ErrorClass | null
  refusalKind: RefusalKind | null
  responseBytes: number
}

/** Map the shared classifier's categories onto the dashboard's buckets. */
export function toErrorClass(message: string): ErrorClass {
  const { category } = classifyError(new Error(message))
  switch (category) {
    case 'auth':
      return 'auth'
    case 'rate_limit':
      return 'rate_limit'
    case 'timeout':
    case 'connection':
    case 'server_error':
      return 'vendor_unavailable'
    case 'validation':
      return 'bad_input'
    default:
      return 'other'
  }
}

/**
 * Decide what one call was. Pure — no I/O, no persistence — so the refusal /
 * failure split is unit-testable.
 *
 * `thrown` is set when the handler threw instead of returning an MCP error
 * result; both paths land in the same buckets.
 */
export function classifyToolResult(opts: {
  toolName: string
  result?: unknown
  thrown?: unknown
  staged?: boolean
}): ResultClassification {
  const { toolName, result, thrown, staged = false } = opts

  if (thrown !== undefined) {
    const message = thrown instanceof Error ? thrown.message : String(thrown)
    const refusalKind = refusalFrom(message)
    return refusalKind
      ? { outcome: 'refusal', errorClass: null, refusalKind, responseBytes: 0 }
      : { outcome: 'failure', errorClass: toErrorClass(message), refusalKind: null, responseBytes: 0 }
  }

  const responseBytes = responseByteSize(result)
  const isError = (result as { isError?: unknown } | null | undefined)?.isError === true
  const text = resultText(result)

  if (isError) {
    const refusalKind = refusalFrom(text)
    return refusalKind
      ? { outcome: 'refusal', errorClass: null, refusalKind, responseBytes }
      : { outcome: 'failure', errorClass: toErrorClass(text), refusalKind: null, responseBytes }
  }

  // Successful call. The one refusal that arrives as a SUCCESS is the staged
  // gate: the tool did exactly what it promises (stage, write nothing) and the
  // caller was told to go get a human.
  if (isStageGateSuccess(toolName, staged) || matches(APPROVAL_MARKERS, text)) {
    return { outcome: 'refusal', errorClass: null, refusalKind: 'approval_required', responseBytes }
  }

  return { outcome: 'success', errorClass: null, refusalKind: null, responseBytes }
}

function refusalFrom(text: string): RefusalKind | null {
  if (!text) return null
  if (matches(KILL_SWITCH_MARKERS, text)) return 'kill_switch'
  if (matches(NOT_CONFIGURED_MARKERS, text)) return 'not_configured'
  if (matches(APPROVAL_MARKERS, text)) return 'approval_required'
  return null
}

// ---------------------------------------------------------------------------
// Persistence (raw pg — NOT Prisma, same as the rest of the connector tables)
// ---------------------------------------------------------------------------

/**
 * The COMPLETE column list. There is deliberately no column for arguments,
 * response bodies or error messages — see the privacy note at the top of this
 * file. The INSERT is generated from this array, and telemetry.test.ts pins it,
 * so a future column cannot be added without a reviewer seeing it.
 */
export const TELEMETRY_COLUMNS = [
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
] as const

export const TELEMETRY_TABLE = 'connector_tool_calls'

const INSERT_SQL = `INSERT INTO ${TELEMETRY_TABLE} (${TELEMETRY_COLUMNS.join(', ')}) VALUES (${TELEMETRY_COLUMNS.map(
  (_, i) => `$${i + 1}`
).join(', ')})`

type InsertValue = string | number | boolean | null

/** Values in TELEMETRY_COLUMNS order. */
function insertValues(row: ToolCallTelemetry): InsertValue[] {
  return [
    row.toolName,
    row.actorEmail,
    row.vendor,
    row.access,
    row.risk,
    row.staged,
    row.outcome,
    row.errorClass,
    row.refusalKind,
    Math.max(0, Math.round(row.durationMs)),
    Math.max(0, Math.round(row.responseBytes)),
    process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12) : null,
  ]
}

// The table is created by /api/migrations/run, which an operator POSTs after
// deploy. Until then every insert fails the same way; logged once per isolate
// so a missing migration is visible without flooding the function logs.
let loggedMissingTable = false

/**
 * Insert one row. Never throws — the caller is a tool handler that must not be
 * affected by telemetry in any way.
 */
export async function writeToolCallTelemetry(row: ToolCallTelemetry): Promise<void> {
  try {
    // Dynamic import so the pg pool is only touched when a call is actually
    // recorded; keeps capability-registry importable in a plain unit test.
    const { getPool } = await import('@/lib/db-pool')
    await getPool().query(INSERT_SQL, insertValues(row))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const missingTable = /relation .* does not exist|42P01/i.test(message)
    if (missingTable) {
      if (loggedMissingTable) return
      loggedMissingTable = true
    }
    // Compact and PII-free: tool name + classification only, never the row's
    // actor or any response detail.
    console.warn(
      JSON.stringify({
        level: 'warn',
        operation: 'connector.telemetry.insert_failed',
        tool: row.toolName,
        outcome: row.outcome,
        reason: message.slice(0, 300),
        hint: missingTable
          ? 'POST /api/migrations/run to create connector_tool_calls (logged once per instance)'
          : undefined,
      })
    )
  }
}

// In-flight writes, so tests (and any future caller that wants to drain before
// shutdown) can wait for them without the hot path ever awaiting.
const inFlight = new Set<Promise<void>>()

/**
 * Vercel exposes waitUntil through its request context, so a background insert
 * can outlive the response without adding `@vercel/functions` as a dependency.
 * Absent locally and in tests → plain fire-and-forget.
 */
function platformWaitUntil(): ((p: Promise<unknown>) => void) | null {
  try {
    const ctx = (globalThis as unknown as Record<symbol, unknown>)[
      Symbol.for('@vercel/request-context')
    ] as { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined
    const fn = ctx?.get?.()?.waitUntil
    return typeof fn === 'function' ? fn : null
  } catch {
    return null
  }
}

/**
 * Fire-and-forget record. Returns void immediately: no awaiting, no throwing,
 * no effect on the caller.
 */
export function recordToolCall(row: ToolCallTelemetry): void {
  try {
    const promise = writeToolCallTelemetry(row).catch(() => {})
    inFlight.add(promise)
    void promise.finally(() => inFlight.delete(promise))
    const waitUntil = platformWaitUntil()
    if (waitUntil) {
      try {
        waitUntil(promise)
      } catch {
        /* platform declined to extend the invocation — still fire-and-forget */
      }
    }
  } catch {
    // Even constructing the write must not surface to the tool call.
  }
}

/** Await in-flight telemetry writes. Used by tests; safe to call anywhere. */
export async function flushTelemetry(): Promise<void> {
  await Promise.allSettled([...inFlight])
}

/** How many telemetry writes are still in flight. */
export function pendingTelemetryWrites(): number {
  return inFlight.size
}

// ---------------------------------------------------------------------------
// Handler instrumentation (the single hook)
// ---------------------------------------------------------------------------

/**
 * Pull the signed-in technician's email out of the MCP `extra` argument.
 *
 * Reads ONLY `authInfo.extra.email` (set by verifyConnectorToken). The handler
 * arguments themselves are passed straight through to the real handler and are
 * never copied, inspected or stored.
 */
function actorEmailFrom(args: unknown[]): string | null {
  for (const arg of args) {
    if (!arg || typeof arg !== 'object') continue
    const email = (arg as { authInfo?: { extra?: { email?: unknown } } }).authInfo?.extra?.email
    if (typeof email === 'string' && email.trim()) return email.trim().toLowerCase()
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (...args: any[]) => any

/**
 * Wrap one tool handler so the call is timed, classified and recorded. The
 * wrapper is variadic and returns the handler's own result unchanged: the MCP
 * SDK dispatches `handler(args, extra)` or `handler(extra)` depending on
 * whether the tool declares an inputSchema, and neither behaviour changes here.
 * A thrown error is recorded and re-thrown untouched.
 */
export function instrumentToolHandler<H extends AnyHandler>(
  toolName: string,
  facts: ToolTelemetryFacts,
  handler: H
): H {
  // Task-capable handlers are objects-with-methods rather than plain callables
  // (SDK `createTask`). registerTool never produces one, but wrapping such a
  // handler would drop the method — so leave it alone instead.
  if (typeof handler !== 'function' || 'createTask' in handler) return handler

  const wrapped = async (...args: unknown[]) => {
    const startedAt = Date.now()
    let actorEmail: string | null = null
    try {
      actorEmail = actorEmailFrom(args)
    } catch {
      /* identity is best-effort; never block the call */
    }

    try {
      const result = await handler(...args)
      emit({ toolName, facts, actorEmail, startedAt, result })
      return result
    } catch (err) {
      emit({ toolName, facts, actorEmail, startedAt, thrown: err })
      throw err
    }
  }

  return wrapped as unknown as H
}

function emit(opts: {
  toolName: string
  facts: ToolTelemetryFacts
  actorEmail: string | null
  startedAt: number
  result?: unknown
  thrown?: unknown
}): void {
  try {
    const { toolName, facts, actorEmail, startedAt, result, thrown } = opts
    const classification = classifyToolResult({
      toolName,
      ...(thrown !== undefined ? { thrown } : { result }),
      staged: facts.staged,
    })
    recordToolCall({
      toolName,
      actorEmail,
      vendor: facts.vendor,
      access: facts.access,
      risk: facts.risk,
      staged: facts.staged,
      durationMs: Date.now() - startedAt,
      ...classification,
    })
  } catch {
    // Classification is best-effort. Losing one telemetry row is always
    // preferable to affecting the tool call.
  }
}
