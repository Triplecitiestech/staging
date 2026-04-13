import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET /api/pto/requests/[id] — returns request detail + audit log */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email || !session.user.role || !session.user.staffId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const req = await prisma.timeOffRequest.findUnique({
    where: { id },
    include: {
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 100 },
    },
  })
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = req.employeeStaffId === session.user.staffId
  const canApprove = hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides)
  if (!isOwner && !canApprove) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    request: {
      id: req.id,
      employeeStaffId: req.employeeStaffId,
      employeeName: req.employeeName,
      employeeEmail: req.employeeEmail,
      gustoEmployeeUuid: req.gustoEmployeeUuid,
      kind: req.kind,
      gustoPolicyUuid: req.gustoPolicyUuid,
      gustoPolicyName: req.gustoPolicyName,
      startDate: toYmd(req.startDate),
      endDate: toYmd(req.endDate),
      totalHours: Number(req.totalHours),
      hoursPerDay: req.hoursPerDay,
      notes: req.notes,
      coverage: req.coverage,
      status: req.status,
      reviewedByName: req.reviewedByName,
      reviewedAt: req.reviewedAt?.toISOString() ?? null,
      managerNotes: req.managerNotes,
      gustoSyncStatus: req.gustoSyncStatus,
      gustoSyncError: req.gustoSyncError,
      graphSyncStatus: req.graphSyncStatus,
      graphSyncError: req.graphSyncError,
      createdAt: req.createdAt.toISOString(),
    },
    auditLogs: req.auditLogs.map((a) => ({
      id: a.id,
      actorEmail: a.actorEmail,
      actorName: a.actorName,
      action: a.action,
      details: a.details,
      severity: a.severity,
      createdAt: a.createdAt.toISOString(),
    })),
  })
}

function toYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
