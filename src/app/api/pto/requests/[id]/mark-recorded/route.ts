import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { markRecordedInGusto } from '@/lib/pto/service'
import { ptoRouteErrorResponse } from '@/lib/pto/route-errors'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pto/requests/[id]/mark-recorded
 *
 * HR confirms (or un-confirms) that the approved PTO has been entered into
 * Gusto manually. Only intake or approver staff can toggle this.
 *
 * Body: { recorded: boolean }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const canMark =
      hasPermission(session.user.role, 'pto_intake', session.user.permissionOverrides) ||
      hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides)
    if (!canMark) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const recorded = body?.recorded === false ? false : true

    try {
      const result = await markRecordedInGusto({
        requestId: id,
        actorStaffId: session.user.staffId,
        actorEmail: session.user.email,
        actorName: session.user.name ?? session.user.email,
        recorded,
      })
      return NextResponse.json({ ok: true, request: result })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to update' },
        { status: 400 }
      )
    }
  } catch (err) {
    return ptoRouteErrorResponse(err)
  }
}
