import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { cancelOvertimeRequest } from '@/lib/overtime/service'
import { overtimeRouteErrorResponse } from '@/lib/overtime/route-errors'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const existing = await prisma.overtimeRequest.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const isOwner = existing.employeeStaffId === session.user.staffId
    const canApprove = hasPermission(session.user.role, 'approve_overtime', session.user.permissionOverrides)
    if (!canApprove) {
      if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (existing.status !== 'PENDING_INTAKE' && existing.status !== 'PENDING_APPROVAL') {
        return NextResponse.json(
          { error: 'Only pending requests can be cancelled by employees' },
          { status: 400 }
        )
      }
    }
    try {
      const result = await cancelOvertimeRequest({
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
