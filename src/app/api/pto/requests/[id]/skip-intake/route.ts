import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { skipIntake } from '@/lib/pto/service'
import { ptoRouteErrorResponse } from '@/lib/pto/route-errors'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pto/requests/[id]/skip-intake
 *
 * Final approver bypasses the HR intake step (e.g. when Rio is unavailable).
 * Transitions PENDING_INTAKE → PENDING_APPROVAL without capturing intake data.
 * Only users with approve_pto may skip.
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
      const result = await skipIntake({
        requestId: id,
        actorStaffId: session.user.staffId,
        actorEmail: session.user.email,
        actorName: session.user.name ?? session.user.email,
      })
      return NextResponse.json({ ok: true, request: result })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to skip intake' },
        { status: 400 }
      )
    }
  } catch (err) {
    return ptoRouteErrorResponse(err)
  }
}
