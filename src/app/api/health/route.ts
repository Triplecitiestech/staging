import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { withTimeout } from '@/lib/resilience'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public, unauthenticated health check for external uptime monitoring
 * (UptimeRobot, etc.).
 *
 * A plain homepage 200 only proves Vercel's edge served HTML — it does NOT
 * prove the backend works. This endpoint verifies the database is actually
 * reachable, which is the shared dependency behind the marketing site, the
 * admin portal, the customer portal, and every API route. If the DB is down,
 * the customer portal cannot load a company or a session, so this doubles as
 * the portal's backend readiness check.
 *
 * Exposes NO secrets, credentials, connection strings, or customer data —
 * only up/down booleans, a latency number, and a short error label.
 *
 *   GET /api/health
 *     200  { status: "ok",       checks: { database: { ok: true,  latencyMs } } }
 *     503  { status: "degraded", checks: { database: { ok: false, error } } }
 *
 * Monitor with a Keyword check for the string "ok" (and treat 503 as down).
 */
export async function GET() {
  const startedAt = Date.now()

  let dbOk = false
  let dbLatencyMs: number | null = null
  let dbError: string | null = null

  try {
    const pool = getPool()
    const t0 = Date.now()
    // 5s ceiling so a hung/overloaded DB can't hold the serverless function open.
    await withTimeout(() => pool.query('SELECT 1'), 5000, 'health:db')
    dbLatencyMs = Date.now() - t0
    dbOk = true
  } catch (err) {
    // Keep the message short and generic — never surface connection internals.
    const msg = err instanceof Error ? err.message : 'database unreachable'
    dbError = msg.length > 160 ? `${msg.slice(0, 160)}…` : msg
  }

  const healthy = dbOk
  const body = {
    status: healthy ? 'ok' : 'degraded',
    checks: {
      database: dbOk
        ? { ok: true, latencyMs: dbLatencyMs }
        : { ok: false, error: dbError },
    },
    checkDurationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
