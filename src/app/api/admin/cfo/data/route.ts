import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'
import { buildDashboard, getCachedSnapshot } from '@/lib/cfo/build'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Returns the cached dashboard snapshot (fast). Builds inline if no snapshot
// exists yet or when ?refresh=1 is passed. Gated by the CFO access check.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await canAccessCfoDashboard(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const refresh = request.nextUrl.searchParams.get('refresh') === '1'

  try {
    let snapshot = refresh ? null : await getCachedSnapshot()
    if (!snapshot) {
      snapshot = await buildDashboard()
    }
    return NextResponse.json(snapshot)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cfo/data] build failed:', msg)
    // This route is gated to finance staff, so surfacing the real cause is
    // safe and saves a logs round-trip when something is misconfigured.
    return NextResponse.json({ error: `Failed to load CFO dashboard data: ${msg}` }, { status: 502 })
  }
}
