/**
 * GET /api/admin/ai-usage/tracker-test
 *
 * Five-stage round-trip health check for the AI usage tracker. Lets an
 * operator answer "is the tracker working?" with one URL hit instead of
 * waiting 30 days for the meter to converge. Each stage isolates one
 * possible failure mode and surfaces the real Postgres error (not the
 * silent catch in trackApiUsage that hid the original problem for weeks):
 *
 *   1. probe       — does the api_usage_logs table exist + which columns
 *   2. cleanup     — can we delete? (tests write + the test-row janitor)
 *   3. insert      — can we write a fresh row? (the actual tracker path)
 *   4. read-back   — can we read what we just wrote? (verifies durability)
 *   5. recent      — per-feature counts in the last 24h, so the operator
 *                    can see whether compliance/SOC/etc. rows are
 *                    actually landing
 *
 * Auth-gated to any signed-in staff session. Test rows go in under
 * provider='internal' so they don't pollute the meter (which filters to
 * provider IN ('anthropic','openai')).
 *
 * INTENDED TO BE TEMPORARY — delete this route once tracking health is
 * confirmed and the convergence window has elapsed.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import type { PrismaClient } from '@prisma/client'

export const dynamic = 'force-dynamic'

const TEST_PROVIDER = 'internal'
const TEST_FEATURE = '_tracker_health_check'

type Sql = PrismaClient & {
  $queryRawUnsafe: (q: string, ...args: unknown[]) => Promise<unknown[]>
  $executeRawUnsafe: (q: string, ...args: unknown[]) => Promise<number>
}

function describeError(err: unknown): { name?: string; message: string; stack?: string } | string {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack?.slice(0, 800) }
  }
  return String(err)
}

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ ok: false, stage: 'auth', error: 'Unauthorized' }, { status: 401 })
  }

  const { prisma } = await import('@/lib/prisma')
  const db = prisma as unknown as Sql
  const startedAt = new Date().toISOString()
  const out: Record<string, unknown> = { startedAt }

  // ── Stage 1: probe ────────────────────────────────────────────────────
  try {
    const cols = (await db.$queryRawUnsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'api_usage_logs'
      ORDER BY ordinal_position
    `)) as Array<{ column_name: string; data_type: string }>
    out.tableExists = cols.length > 0
    out.columns = cols.map((c) => c.column_name)
    if (cols.length === 0) {
      return NextResponse.json({ ok: false, stage: 'probe', ...out }, { status: 500 })
    }
  } catch (err) {
    out.probeError = describeError(err)
    return NextResponse.json({ ok: false, stage: 'probe', ...out }, { status: 500 })
  }

  // ── Stage 2: cleanup of stale test rows ───────────────────────────────
  try {
    const deleted = await db.$executeRawUnsafe(
      `DELETE FROM api_usage_logs WHERE feature = $1 AND "createdAt" < NOW() - INTERVAL '1 hour'`,
      TEST_FEATURE,
    )
    out.cleanupDeleted = deleted
  } catch (err) {
    out.cleanupError = describeError(err)
  }

  // ── Stage 3: synthetic insert ─────────────────────────────────────────
  // Bypass trackApiUsage so the real Postgres error propagates instead of
  // being swallowed by the catch block we just hardened.
  const sentinel = `probe_${Date.now()}`
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO api_usage_logs (id, provider, feature, model, "inputTokens", "outputTokens", "totalTokens", "costCents", "durationMs", "statusCode", error, metadata, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, 1, 1, 2, 0, 0, 200, NULL, $4::jsonb, NOW())`,
      TEST_PROVIDER,
      TEST_FEATURE,
      'tracker-test',
      JSON.stringify({ sentinel }),
    )
    out.insertOk = true
  } catch (err) {
    out.insertError = describeError(err)
    return NextResponse.json({ ok: false, stage: 'insert', ...out }, { status: 500 })
  }

  // ── Stage 4: read-back ────────────────────────────────────────────────
  try {
    const rows = (await db.$queryRawUnsafe(
      `SELECT id, provider, feature, "inputTokens", "outputTokens", "costCents", "createdAt", metadata
       FROM api_usage_logs
       WHERE feature = $1 AND metadata->>'sentinel' = $2
       LIMIT 1`,
      TEST_FEATURE,
      sentinel,
    )) as Array<Record<string, unknown>>
    out.readBackOk = rows.length === 1
    out.readBack = rows[0] ?? null
  } catch (err) {
    out.readBackError = describeError(err)
  }

  // ── Stage 5: recent feature activity ──────────────────────────────────
  // This is the answer to "is the tracker actually capturing compliance
  // calls?". If compliance_* rows show up here with recent last_seen
  // timestamps, the tracker works; the meter just needs more convergence
  // time. If they're absent while SOC/blog rows are landing, tracking is
  // broken for compliance specifically.
  try {
    const recent = (await db.$queryRawUnsafe(`
      SELECT
        feature,
        provider,
        COUNT(*)::int AS calls,
        ROUND(SUM("costCents")::numeric, 2) AS cost_cents,
        MAX("createdAt")::text AS last_seen
      FROM api_usage_logs
      WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
      GROUP BY feature, provider
      ORDER BY last_seen DESC
      LIMIT 100
    `)) as Array<Record<string, unknown>>
    out.recent24h = recent.map((r) => ({
      feature: r.feature,
      provider: r.provider,
      calls: Number(r.calls ?? 0),
      costCents: Number(r.cost_cents ?? 0),
      costUsd: Number(r.cost_cents ?? 0) / 100,
      lastSeen: r.last_seen,
    }))
  } catch (err) {
    out.recentError = describeError(err)
  }

  return NextResponse.json({ ok: true, ...out })
}
