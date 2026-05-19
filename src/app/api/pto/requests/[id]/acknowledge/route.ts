import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { acknowledgeFlaggedRequest } from '@/lib/pto/service'
import { ptoRouteErrorResponse } from '@/lib/pto/route-errors'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pto/requests/[id]/acknowledge
 *
 * CEO marks a flagged notification-flow PTO request as acknowledged.
 * Closes the flag in the CEO dashboard. Does not change the recorded
 * status — the PTO has already been logged.
 *
 * Requires approve_pto permission (CEO role).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    try {
      const result = await acknowledgeFlaggedRequest({
        requestId: id,
        actorStaffId: session.user.staffId,
        actorEmail: session.user.email,
        actorName: session.user.name ?? session.user.email,
      })
      return NextResponse.json({ ok: true, request: result })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to acknowledge' },
        { status: 400 }
      )
    }
  } catch (err) {
    return ptoRouteErrorResponse(err)
  }
}
