import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkSecretAuth } from '@/lib/api-auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'
import { buildDashboard } from '@/lib/cfo/build'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Rebuilds the cached dashboard snapshot. Authorized either by the cron/
// migration secret (Authorization: Bearer …, used by the scheduled job) or by
// a logged-in staff user who passes the CFO access check (manual refresh).
export async function POST(request: NextRequest) {
  const secretDenied = checkSecretAuth(request)
  if (secretDenied) {
    const session = await auth()
    if (!session || !(await canAccessCfoDashboard(session))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const snapshot = await buildDashboard()
    return NextResponse.json({ ok: true, builtAt: snapshot.builtAt, durationSeconds: snapshot.durationSeconds })
  } catch (err) {
    console.error('[cfo/rebuild] build failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Rebuild failed' }, { status: 502 })
  }
}
