import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { overtimeRouteErrorResponse } from '@/lib/overtime/route-errors'

export const dynamic = 'force-dynamic'

function toYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const req = await prisma.overtimeRequest.findUnique({
      where: { id },
      include: { auditLogs: { orderBy: { createdAt: 'desc' }, take: 100 } },
    })
    if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isOwner = req.employeeStaffId === session.user.staffId
    const canApprove = hasPermission(session.user.role, 'approve_overtime', session.user.permissionOverrides)
    const canIntake = hasPermission(session.user.role, 'overtime_intake', session.user.permissionOverrides)
    if (!isOwner && !canApprove && !canIntake) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      request: {
        id: req.id,
        employeeStaffId: req.employeeStaffId,
        employeeName: req.employeeName,
        employeeEmail: req.employeeEmail,
        workDate: toYmd(req.workDate),
        startTime: req.startTime,
        estimatedHours: Number(req.estimatedHours),
        reason: req.reason,
        status: req.status,
        intakeByStaffId: req.intakeByStaffId,
        intakeByName: req.intakeByName,
        intakeAt: req.intakeAt?.toISOString() ?? null,
        intakeNotes: req.intakeNotes,
        intakeSkipped: req.intakeSkipped,
        reviewedByName: req.reviewedByName,
        reviewedAt: req.reviewedAt?.toISOString() ?? null,
        managerNotes: req.managerNotes,
        actualHoursWorked: req.actualHoursWorked ? Number(req.actualHoursWorked) : null,
        payrollRecordedAt: req.payrollRecordedAt?.toISOString() ?? null,
        payrollRecordedByName: req.payrollRecordedByName,
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
  } catch (err) {
    return overtimeRouteErrorResponse(err)
  }
}
