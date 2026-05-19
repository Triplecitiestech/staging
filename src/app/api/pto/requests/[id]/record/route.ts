import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { recordNotificationRequest } from '@/lib/pto/service'
import { ptoRouteErrorResponse } from '@/lib/pto/route-errors'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pto/requests/[id]/record
 *
 * HR records a notification-flow PTO (sick / bereavement / family
 * emergency / same-day medical). Moves the request to its terminal status:
 * RECORDED_PAID, RECORDED_UNPAID, or FLAGGED_FOR_REVIEW.
 *
 * Body: {
 *   paidOrUnpaid: 'paid' | 'unpaid',     // HR manual selection (no Gusto lookup)
 *   hrNotes?: string | null,
 *   flagForCeoReview?: boolean,           // surfaces in CEO dashboard, doesn't block
 *   flagReason?: string,                  // required if flagForCeoReview is true
 *   gustoLogged?: boolean                 // true if HR has separately logged in Gusto
 * }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const canRecord =
      hasPermission(session.user.role, 'pto_intake', session.user.permissionOverrides) ||
      hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides)
    if (!canRecord) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const paidOrUnpaid = body?.paidOrUnpaid === 'unpaid' ? 'unpaid' : 'paid'
    const hrNotes = typeof body?.hrNotes === 'string' ? body.hrNotes.trim().slice(0, 2000) : null
    const flagForCeoReview = body?.flagForCeoReview === true
    const flagReason = typeof body?.flagReason === 'string' ? body.flagReason.trim().slice(0, 1000) : ''
    if (flagForCeoReview && !flagReason) {
      return NextResponse.json(
        { error: 'flagReason is required when flagForCeoReview is true' },
        { status: 400 }
      )
    }
    const gustoLogged = body?.gustoLogged === true

    try {
      const result = await recordNotificationRequest({
        requestId: id,
        actorStaffId: session.user.staffId,
        actorEmail: session.user.email,
        actorName: session.user.name ?? session.user.email,
        paidOrUnpaid,
        hrNotes,
        flagForCeoReview,
        flagReason: flagForCeoReview ? flagReason : null,
        gustoLogged,
      })
      return NextResponse.json({ ok: true, request: result })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to record' },
        { status: 400 }
      )
    }
  } catch (err) {
    return ptoRouteErrorResponse(err)
  }
}
