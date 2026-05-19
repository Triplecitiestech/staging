import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { recordReactiveOvertime } from '@/lib/overtime/service'
import { overtimeRouteErrorResponse } from '@/lib/overtime/route-errors'

export const dynamic = 'force-dynamic'

/**
 * POST /api/overtime/requests/[id]/record
 *
 * HR records a reactive (notification-flow) overtime entry. Moves the
 * request to RECORDED or FLAGGED_FOR_REVIEW. HR cannot deny reactive OT —
 * the work was performed and must be paid.
 *
 * Body: {
 *   hrNotes?: string | null,
 *   actualHoursWorked?: number | null,
 *   flagForCeoReview?: boolean,
 *   flagReason?: string,
 *   payrollLogged?: boolean
 * }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const canRecord =
      hasPermission(session.user.role, 'overtime_intake', session.user.permissionOverrides) ||
      hasPermission(session.user.role, 'approve_overtime', session.user.permissionOverrides)
    if (!canRecord) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const hrNotes = typeof body?.hrNotes === 'string' ? body.hrNotes.trim().slice(0, 2000) : null
    const actualHoursRaw = body?.actualHoursWorked
    const actualHoursWorked =
      typeof actualHoursRaw === 'number' && Number.isFinite(actualHoursRaw)
        ? actualHoursRaw
        : typeof actualHoursRaw === 'string' && actualHoursRaw.trim()
          ? Number.parseFloat(actualHoursRaw)
          : null
    const flagForCeoReview = body?.flagForCeoReview === true
    const flagReason = typeof body?.flagReason === 'string' ? body.flagReason.trim().slice(0, 1000) : ''
    if (flagForCeoReview && !flagReason) {
      return NextResponse.json(
        { error: 'flagReason is required when flagForCeoReview is true' },
        { status: 400 }
      )
    }
    const payrollLogged = body?.payrollLogged === true

    try {
      const result = await recordReactiveOvertime({
        requestId: id,
        actorStaffId: session.user.staffId,
        actorEmail: session.user.email,
        actorName: session.user.name ?? session.user.email,
        hrNotes,
        actualHoursWorked,
        flagForCeoReview,
        flagReason: flagForCeoReview ? flagReason : null,
        payrollLogged,
      })
      return NextResponse.json({ ok: true, request: result })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to record' },
        { status: 400 }
      )
    }
  } catch (err) {
    return overtimeRouteErrorResponse(err)
  }
}
