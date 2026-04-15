import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { overtimeRouteErrorResponse } from '@/lib/overtime/route-errors'
import { notifyOvertimeIntakeTeam, notifyOvertimeSubmitter } from '@/lib/overtime/service'
import type { OvertimeRequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

function toYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * GET /api/overtime/requests
 *   Default: caller's own requests
 *   ?scope=all (overtime_intake or approve_overtime): all requests
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const scope = request.nextUrl.searchParams.get('scope')
    const status = request.nextUrl.searchParams.get('status') as OvertimeRequestStatus | null
    const canApprove = hasPermission(session.user.role, 'approve_overtime', session.user.permissionOverrides)
    const canIntake = hasPermission(session.user.role, 'overtime_intake', session.user.permissionOverrides)
    const isAllScope = scope === 'all' && (canApprove || canIntake)
    const where = isAllScope
      ? status ? { status } : {}
      : { employeeStaffId: session.user.staffId }

    const rows = await prisma.overtimeRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { workDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    })
    return NextResponse.json({
      requests: rows.map((r) => ({
        id: r.id,
        employeeStaffId: r.employeeStaffId,
        employeeName: r.employeeName,
        employeeEmail: r.employeeEmail,
        workDate: toYmd(r.workDate),
        startTime: r.startTime,
        estimatedHours: Number(r.estimatedHours),
        reason: r.reason,
        status: r.status,
        intakeByName: r.intakeByName,
        intakeAt: r.intakeAt?.toISOString() ?? null,
        intakeSkipped: r.intakeSkipped,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reviewedByName: r.reviewedByName,
        managerNotes: r.managerNotes,
        actualHoursWorked: r.actualHoursWorked ? Number(r.actualHoursWorked) : null,
        payrollRecordedAt: r.payrollRecordedAt?.toISOString() ?? null,
        payrollRecordedByName: r.payrollRecordedByName,
        createdAt: r.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    return overtimeRouteErrorResponse(err)
  }
}

/**
 * POST /api/overtime/requests
 * Body: { workDate (YYYY-MM-DD), startTime?, estimatedHours, reason }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const workDate = typeof body.workDate === 'string' ? body.workDate : null
    if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return NextResponse.json({ error: 'workDate must be YYYY-MM-DD' }, { status: 400 })
    }
    const startTime = typeof body.startTime === 'string' && body.startTime.trim()
      ? body.startTime.trim().slice(0, 50)
      : null
    const hrs = Number.parseFloat(String(body.estimatedHours))
    if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) {
      return NextResponse.json({ error: 'estimatedHours must be between 0 and 24' }, { status: 400 })
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    const created = await prisma.overtimeRequest.create({
      data: {
        employeeStaffId: session.user.staffId,
        employeeEmail: session.user.email,
        employeeName: session.user.name ?? session.user.email,
        workDate: new Date(`${workDate}T00:00:00.000Z`),
        startTime,
        estimatedHours: hrs,
        reason: reason.slice(0, 4000),
        status: 'PENDING_INTAKE',
      },
    })
    await prisma.overtimeAuditLog.create({
      data: {
        requestId: created.id,
        actorStaffId: session.user.staffId,
        actorEmail: session.user.email,
        actorName: session.user.name ?? null,
        action: 'submitted',
        details: { workDate, startTime, estimatedHours: hrs, reason } as never,
      },
    })

    notifyOvertimeIntakeTeam(created.id).catch((err) => console.error('[overtime] notifyIntake failed:', err))
    notifyOvertimeSubmitter(created.id).catch((err) => console.error('[overtime] notifySubmitter failed:', err))

    return NextResponse.json({ ok: true, id: created.id })
  } catch (err) {
    return overtimeRouteErrorResponse(err)
  }
}
