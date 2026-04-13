import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { completeIntake } from '@/lib/pto/service'
import { ptoRouteErrorResponse } from '@/lib/pto/route-errors'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pto/requests/[id]/intake
 *
 * Completes stage-1 intake for a PTO request. Transitions the request from
 * PENDING_INTAKE → PENDING_APPROVAL and notifies final approvers.
 *
 * Body: {
 *   lastTimeOffNotes?: string
 *   balanceNotes?: string
 *   coverageConfirmed?: boolean
 *   coverageNotes?: string
 *   additionalNotes?: string
 * }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Anyone with intake OR final-approval permission can complete intake.
    const canIntake =
      hasPermission(session.user.role, 'pto_intake', session.user.permissionOverrides) ||
      hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides)
    if (!canIntake) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const lastTimeOffNotes = typeof body?.lastTimeOffNotes === 'string' ? body.lastTimeOffNotes.slice(0, 2000) : null
    const balanceNotes = typeof body?.balanceNotes === 'string' ? body.balanceNotes.slice(0, 2000) : null
    const coverageConfirmed = typeof body?.coverageConfirmed === 'boolean' ? body.coverageConfirmed : null
    const coverageNotes = typeof body?.coverageNotes === 'string' ? body.coverageNotes.slice(0, 2000) : null
    const additionalNotes = typeof body?.additionalNotes === 'string' ? body.additionalNotes.slice(0, 4000) : null

    try {
      const result = await completeIntake({
        requestId: id,
        actorStaffId: session.user.staffId,
        actorEmail: session.user.email,
        actorName: session.user.name ?? session.user.email,
        lastTimeOffNotes,
        balanceNotes,
        coverageConfirmed,
        coverageNotes,
        additionalNotes,
      })
      return NextResponse.json({ ok: true, request: result })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to complete intake' },
        { status: 400 }
      )
    }
  } catch (err) {
    return ptoRouteErrorResponse(err)
  }
}
