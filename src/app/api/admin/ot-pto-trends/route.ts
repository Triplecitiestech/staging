import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { buildTrendsData } from '@/lib/pto/trends'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/ot-pto-trends
 *
 * Returns the CEO dashboard data: reactive-OT ratios, sick-day usage,
 * open flags, late submissions, and short-notice PTO trends.
 *
 * Requires either approve_pto or approve_overtime (i.e. CEO-level access).
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const canView =
      hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides) ||
      hasPermission(session.user.role, 'approve_overtime', session.user.permissionOverrides)
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await buildTrendsData()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load trends' },
      { status: 500 }
    )
  }
}
