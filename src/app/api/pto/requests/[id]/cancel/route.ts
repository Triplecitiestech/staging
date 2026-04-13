import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { cancelRequest } from '@/lib/pto/service'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email || !session.user.role || !session.user.staffId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const existing = await prisma.timeOffRequest.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = existing.employeeStaffId === session.user.staffId
  const canApprove = hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides)

  // Employees can cancel their own PENDING request. Approvers can cancel any.
  if (!canApprove) {
    if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Only PENDING requests can be cancelled by employees' },
        { status: 400 }
      )
    }
  }

  try {
    const result = await cancelRequest({
      requestId: id,
      actorStaffId: session.user.staffId,
      actorEmail: session.user.email,
      actorName: session.user.name ?? session.user.email,
    })
    return NextResponse.json({ ok: true, request: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
