import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { denyOvertimeRequest } from '@/lib/overtime/service'
import { overtimeRouteErrorResponse } from '@/lib/overtime/route-errors'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!hasPermission(session.user.role, 'approve_overtime', session.user.permissionOverrides)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const managerNotes = typeof body?.managerNotes === 'string' ? body.managerNotes.slice(0, 2000) : null
    try {
      const result = await denyOvertimeRequest({
        requestId: id,
        reviewerStaffId: session.user.staffId,
        reviewerEmail: session.user.email,
        reviewerName: session.user.name ?? session.user.email,
        managerNotes,
      })
      return NextResponse.json({ ok: true, request: result })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
    }
  } catch (err) {
    return overtimeRouteErrorResponse(err)
  }
}
