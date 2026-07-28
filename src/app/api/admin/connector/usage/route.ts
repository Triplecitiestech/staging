// src/app/api/admin/connector/usage/route.ts
//
// Owner-facing read of the MCP connector's usage telemetry, for
// /admin/connector/usage. Staff session required, same as the rest of /admin.
//
// Reads two tables, both raw pg via the shared getPool():
//   connector_tool_calls    — one row per tool call (src/lib/connector/telemetry.ts)
//   connector_staged_writes — the existing human-approval audit trail
//
// A brand-new deploy has neither the telemetry table (it is created by
// /api/migrations/run, which an operator POSTs after deploy) nor any rows, so
// every section degrades to empty with an explicit flag rather than 500ing.

import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import { getPool } from '@/lib/db-pool'
import {
  parseUsageWindow,
  usageWindowHours,
  UNATTRIBUTED_ACTOR,
  type ActorUsage,
  type ConnectorUsagePayload,
  type FailureGroup,
  type RefusalGroup,
  type ResponseWeight,
  type StagedWriteCounts,
  type UsageSummary,
  type WriteCall,
} from '@/lib/connector/usage-metrics'
import type { CallOutcome, ErrorClass, RefusalKind } from '@/lib/connector/telemetry'

export const dynamic = 'force-dynamic'

/** Most recent write calls listed individually; the count is always exact. */
const WRITE_ROW_LIMIT = 200
const REFUSAL_GROUP_LIMIT = 25
const RESPONSE_WEIGHT_LIMIT = 15
const ACTOR_LIMIT = 50

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Postgres undefined_table — the migration has not been POSTed yet. */
function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  if (code === '42P01') return true
  const message = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist/i.test(message)
}

interface QueryResult<T> {
  rows: T[]
  missingTable: boolean
}

async function safeQuery<T>(sql: string, params: unknown[]): Promise<QueryResult<T>> {
  try {
    const { rows } = await getPool().query(sql, params)
    return { rows: rows as T[], missingTable: false }
  } catch (err) {
    if (isMissingTable(err)) return { rows: [], missingTable: true }
    throw err
  }
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function iso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

// ---------------------------------------------------------------------------
// Row shapes returned by the SQL below
// ---------------------------------------------------------------------------

interface SummaryRow {
  calls: number
  reads: number
  writes: number
  successes: number
  refusals: number
  failures: number
  actors: number
  tools: number
  total_bytes: number
  avg_duration_ms: number
}

interface ActorRow {
  actor_email: string | null
  calls: number
  reads: number
  writes: number
  refusals: number
  failures: number
  vendors: string[]
  last_call_at: Date | null
}

interface ActorToolRow {
  actor_email: string | null
  tool_name: string
  calls: number
}

interface WriteRow {
  id: string
  called_at: Date | null
  actor_email: string | null
  tool_name: string
  vendor: string
  risk: string
  staged: boolean
  outcome: string
  error_class: string | null
  refusal_kind: string | null
  duration_ms: number
  response_bytes: number
}

interface FailureRow {
  error_class: string
  calls: number
  last_at: Date | null
}

interface FailureToolRow {
  error_class: string
  tool_name: string
  calls: number
}

interface RefusalRow {
  tool_name: string
  vendor: string
  calls: number
  last_at: Date | null
  approval_required: number
  kill_switch: number
  not_configured: number
  actors: number
}

interface WeightRow {
  tool_name: string
  vendor: string
  calls: number
  median_bytes: number
  p95_bytes: number
  max_bytes: number
  total_bytes: number
}

interface StagedRow {
  status: string
  calls: number
}

// `called_at >= NOW() - (hours × 1 hour)` — parameterised, never interpolated.
const WINDOW_CLAUSE = "called_at >= NOW() - ($1::int * INTERVAL '1 hour')"

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return apiError('Unauthorized', reqId, 401)
    }

    const windowKey = parseUsageWindow(new URL(request.url).searchParams.get('window'))
    const hours = usageWindowHours(windowKey)
    const params = [hours]

    const [summaryQ, actorQ, actorToolQ, writeQ, failureQ, failureToolQ, refusalQ, weightQ] =
      await Promise.all([
        safeQuery<SummaryRow>(
          `SELECT COUNT(*)::int AS calls,
                  COUNT(*) FILTER (WHERE access = 'read')::int AS reads,
                  COUNT(*) FILTER (WHERE access = 'write')::int AS writes,
                  COUNT(*) FILTER (WHERE outcome = 'success')::int AS successes,
                  COUNT(*) FILTER (WHERE outcome = 'refusal')::int AS refusals,
                  COUNT(*) FILTER (WHERE outcome = 'failure')::int AS failures,
                  COUNT(DISTINCT actor_email)::int AS actors,
                  COUNT(DISTINCT tool_name)::int AS tools,
                  COALESCE(SUM(response_bytes), 0)::float8 AS total_bytes,
                  COALESCE(AVG(duration_ms), 0)::float8 AS avg_duration_ms
             FROM connector_tool_calls
            WHERE ${WINDOW_CLAUSE}`,
          params
        ),

        // NULL actor_email groups on its own (every NULL lands in one GROUP BY
        // bucket) and is labelled '(unattributed)' in JS — no interpolation.
        safeQuery<ActorRow>(
          `SELECT actor_email,
                  COUNT(*)::int AS calls,
                  COUNT(*) FILTER (WHERE access = 'read')::int AS reads,
                  COUNT(*) FILTER (WHERE access = 'write')::int AS writes,
                  COUNT(*) FILTER (WHERE outcome = 'refusal')::int AS refusals,
                  COUNT(*) FILTER (WHERE outcome = 'failure')::int AS failures,
                  ARRAY_AGG(DISTINCT vendor) AS vendors,
                  MAX(called_at) AS last_call_at
             FROM connector_tool_calls
            WHERE ${WINDOW_CLAUSE}
            GROUP BY 1
            ORDER BY calls DESC
            LIMIT ${ACTOR_LIMIT}`,
          params
        ),

        safeQuery<ActorToolRow>(
          `SELECT actor_email,
                  tool_name,
                  COUNT(*)::int AS calls
             FROM connector_tool_calls
            WHERE ${WINDOW_CLAUSE}
            GROUP BY 1, 2
            ORDER BY calls DESC`,
          params
        ),

        // Writes itemised — reads are broad by design, writes change customer
        // systems, so every one is listed with who ran it.
        safeQuery<WriteRow>(
          `SELECT id, called_at, actor_email, tool_name, vendor, risk, staged,
                  outcome, error_class, refusal_kind, duration_ms, response_bytes
             FROM connector_tool_calls
            WHERE ${WINDOW_CLAUSE} AND access = 'write'
            ORDER BY called_at DESC
            LIMIT ${WRITE_ROW_LIMIT}`,
          params
        ),

        safeQuery<FailureRow>(
          `SELECT COALESCE(error_class, 'other') AS error_class,
                  COUNT(*)::int AS calls,
                  MAX(called_at) AS last_at
             FROM connector_tool_calls
            WHERE ${WINDOW_CLAUSE} AND outcome = 'failure'
            GROUP BY 1
            ORDER BY calls DESC`,
          params
        ),

        safeQuery<FailureToolRow>(
          `SELECT COALESCE(error_class, 'other') AS error_class,
                  tool_name,
                  COUNT(*)::int AS calls
             FROM connector_tool_calls
            WHERE ${WINDOW_CLAUSE} AND outcome = 'failure'
            GROUP BY 1, 2
            ORDER BY calls DESC`,
          params
        ),

        // Refusals grouped by tool = a ranked list of what the team wanted and
        // did not get.
        safeQuery<RefusalRow>(
          `SELECT tool_name,
                  MIN(vendor) AS vendor,
                  COUNT(*)::int AS calls,
                  MAX(called_at) AS last_at,
                  COUNT(*) FILTER (WHERE refusal_kind = 'approval_required')::int AS approval_required,
                  COUNT(*) FILTER (WHERE refusal_kind = 'kill_switch')::int AS kill_switch,
                  COUNT(*) FILTER (WHERE refusal_kind = 'not_configured')::int AS not_configured,
                  COUNT(DISTINCT actor_email)::int AS actors
             FROM connector_tool_calls
            WHERE ${WINDOW_CLAUSE} AND outcome = 'refusal'
            GROUP BY 1
            ORDER BY calls DESC
            LIMIT ${REFUSAL_GROUP_LIMIT}`,
          params
        ),

        // Response weight: median + p95 bytes per tool. A context-weight proxy,
        // never a token count and never a dollar figure.
        safeQuery<WeightRow>(
          `SELECT tool_name,
                  MIN(vendor) AS vendor,
                  COUNT(*)::int AS calls,
                  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_bytes::float8) AS median_bytes,
                  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_bytes::float8) AS p95_bytes,
                  MAX(response_bytes)::float8 AS max_bytes,
                  COALESCE(SUM(response_bytes), 0)::float8 AS total_bytes
             FROM connector_tool_calls
            WHERE ${WINDOW_CLAUSE}
            GROUP BY 1
            ORDER BY p95_bytes DESC, median_bytes DESC
            LIMIT ${RESPONSE_WEIGHT_LIMIT}`,
          params
        ),
      ])

    // Staged writes: pending/approved are the LIVE queue (actionable regardless
    // of age); the terminal states are counted inside the selected window.
    const [stagedLiveQ, stagedWindowQ] = await Promise.all([
      safeQuery<StagedRow>(
        `SELECT "status", COUNT(*)::int AS calls
           FROM "connector_staged_writes"
          WHERE "status" IN ('pending_approval', 'approved')
          GROUP BY 1`,
        []
      ),
      safeQuery<StagedRow>(
        `SELECT "status", COUNT(*)::int AS calls
           FROM "connector_staged_writes"
          WHERE "stagedAt" >= NOW() - ($1::int * INTERVAL '1 hour')
          GROUP BY 1`,
        params
      ),
    ])

    const summaryRow = summaryQ.rows[0]
    const summary: UsageSummary = {
      calls: num(summaryRow?.calls),
      reads: num(summaryRow?.reads),
      writes: num(summaryRow?.writes),
      successes: num(summaryRow?.successes),
      refusals: num(summaryRow?.refusals),
      failures: num(summaryRow?.failures),
      actors: num(summaryRow?.actors),
      tools: num(summaryRow?.tools),
      totalBytes: num(summaryRow?.total_bytes),
      avgDurationMs: num(summaryRow?.avg_duration_ms),
    }

    // Top tools per technician, assembled from the already-sorted actor×tool
    // counts — no window function, and the row set is bounded by tools × actors.
    const topToolsByActor = new Map<string, Array<{ toolName: string; calls: number }>>()
    for (const row of actorToolQ.rows) {
      const actor = str(row.actor_email, UNATTRIBUTED_ACTOR)
      const list = topToolsByActor.get(actor) ?? []
      if (list.length < 5) list.push({ toolName: row.tool_name, calls: num(row.calls) })
      topToolsByActor.set(actor, list)
    }

    const byActor: ActorUsage[] = actorQ.rows.map((row) => {
      const actor = str(row.actor_email, UNATTRIBUTED_ACTOR)
      return {
        actor,
        calls: num(row.calls),
        reads: num(row.reads),
        writes: num(row.writes),
        refusals: num(row.refusals),
        failures: num(row.failures),
        vendors: textArray(row.vendors).sort(),
        topTools: topToolsByActor.get(actor) ?? [],
        lastCallAt: iso(row.last_call_at),
      }
    })

    const writes: WriteCall[] = writeQ.rows.map((row) => ({
      id: str(row.id),
      calledAt: iso(row.called_at),
      actor: str(row.actor_email, UNATTRIBUTED_ACTOR),
      toolName: str(row.tool_name),
      vendor: str(row.vendor),
      risk: str(row.risk),
      staged: row.staged === true,
      outcome: str(row.outcome, 'success') as CallOutcome,
      errorClass: (row.error_class as ErrorClass | null) ?? null,
      refusalKind: (row.refusal_kind as RefusalKind | null) ?? null,
      durationMs: num(row.duration_ms),
      responseBytes: num(row.response_bytes),
    }))

    const failureToolsByClass = new Map<string, Array<{ toolName: string; calls: number }>>()
    for (const row of failureToolQ.rows) {
      const list = failureToolsByClass.get(row.error_class) ?? []
      if (list.length < 5) list.push({ toolName: row.tool_name, calls: num(row.calls) })
      failureToolsByClass.set(row.error_class, list)
    }

    const failures: FailureGroup[] = failureQ.rows.map((row) => ({
      errorClass: str(row.error_class, 'other') as ErrorClass,
      calls: num(row.calls),
      lastAt: iso(row.last_at),
      tools: failureToolsByClass.get(row.error_class) ?? [],
    }))

    const refusals: RefusalGroup[] = refusalQ.rows.map((row) => ({
      toolName: str(row.tool_name),
      vendor: str(row.vendor),
      calls: num(row.calls),
      lastAt: iso(row.last_at),
      approvalRequired: num(row.approval_required),
      killSwitch: num(row.kill_switch),
      notConfigured: num(row.not_configured),
      actors: num(row.actors),
    }))

    const responseWeight: ResponseWeight[] = weightQ.rows.map((row) => ({
      toolName: str(row.tool_name),
      vendor: str(row.vendor),
      calls: num(row.calls),
      medianBytes: num(row.median_bytes),
      p95Bytes: num(row.p95_bytes),
      maxBytes: num(row.max_bytes),
      totalBytes: num(row.total_bytes),
    }))

    const liveCounts = new Map(stagedLiveQ.rows.map((r) => [r.status, num(r.calls)]))
    const windowCounts = new Map(stagedWindowQ.rows.map((r) => [r.status, num(r.calls)]))
    const stagedWrites: StagedWriteCounts = {
      pendingApproval: liveCounts.get('pending_approval') ?? 0,
      approved: liveCounts.get('approved') ?? 0,
      executed: windowCounts.get('executed') ?? 0,
      rejected: windowCounts.get('rejected') ?? 0,
      drifted: windowCounts.get('drifted') ?? 0,
      failed: windowCounts.get('failed') ?? 0,
      cancelled: windowCounts.get('cancelled') ?? 0,
      expired: windowCounts.get('expired') ?? 0,
    }

    const payload: ConnectorUsagePayload = {
      window: windowKey,
      since: new Date(Date.now() - hours * 3_600_000).toISOString(),
      generatedAt: new Date().toISOString(),
      telemetryTableMissing: summaryQ.missingTable,
      stagedWritesTableMissing: stagedLiveQ.missingTable,
      summary,
      byActor,
      writes,
      failures,
      refusals,
      responseWeight,
      stagedWrites,
    }

    return apiOk({ usage: payload }, reqId)
  } catch (error) {
    // Never a 200 with empty data — the dashboard must be able to tell "no
    // connector activity" apart from "this query failed".
    const message = error instanceof Error ? error.message : 'Failed to load connector usage'
    console.error('[connector-usage] query failed', message)
    return apiError(message, reqId, 500)
  }
}
