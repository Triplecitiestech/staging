import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { skipOvertimeIntake } from '@/lib/overtime/service'
import { overtimeRouteErrorResponse } from '@/lib/overtime/route-errors'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!hasPermission(session.user.role, 'approve_overtime', session.user.permissionOverrides)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    try {
      const result = await skipOvertimeIntake({
        requestId: id,
        actorStaffId: session.user.staffId,
        actorEmail: session.user.email,
        actorName: session.user.name ?? session.user.email,
      })
      return NextResponse.json({ ok: true, request: result })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
    }
  } catch (err) {
    return overtimeRouteErrorResponse(err)
  }
}
