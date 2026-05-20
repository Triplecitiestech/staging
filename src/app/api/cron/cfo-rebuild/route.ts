/**
 * CFO dashboard rebuild cron.
 *
 * GET /api/cron/cfo-rebuild
 * Authorization: Bearer <CRON_SECRET>  (set automatically by Vercel Cron)
 *
 * Rebuilds and caches the dashboard snapshot so the page loads instantly and
 * doesn't hit the Sequence API on every view. Returns 200 with { transient }
 * for connection/timeout errors so Vercel doesn't flag the cron as failed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkSecretAuth } from '@/lib/api-auth'
import { classifyError } from '@/lib/resilience'
import { buildDashboard } from '@/lib/cfo/build'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const denied = checkSecretAuth(request)
  if (denied) return denied

  try {
    const snapshot = await buildDashboard()
    return NextResponse.json({ ok: true, builtAt: snapshot.builtAt, durationSeconds: snapshot.durationSeconds })
  } catch (err) {
    const classified = classifyError(err)
    if (classified.isTransient) {
      console.warn('[cron/cfo-rebuild] transient failure, will retry next run:', classified.message)
      return NextResponse.json({ ok: false, transient: true, error: classified.message }, { status: 200 })
    }
    console.error('[cron/cfo-rebuild] permanent failure:', classified.message)
    return NextResponse.json({ ok: false, error: classified.message }, { status: 500 })
  }
}
