import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { getMappingForStaffId } from '@/lib/pto/mapping'
import { computeTotalHours, validateHoursPerDay } from '@/lib/pto/hours'
import {
  generateCoverageToken,
  notifyIntakeTeam,
  notifySubmitter,
  sendCoverageRequest,
} from '@/lib/pto/service'
import { ptoRouteErrorResponse } from '@/lib/pto/route-errors'
import type { PtoKind } from '@/lib/pto/types'
import type { TimeOffRequestKind, TimeOffRequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const VALID_KINDS: PtoKind[] = ['VACATION', 'SICK', 'PERSONAL', 'BEREAVEMENT', 'JURY_DUTY', 'UNPAID', 'OTHER']

/**
 * GET /api/pto/requests
 *   - default: returns the caller's own requests
 *   - ?scope=all (requires approve_pto): returns all requests, optionally filtered by ?status=
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const scope = request.nextUrl.searchParams.get('scope')
    const status = request.nextUrl.searchParams.get('status') as TimeOffRequestStatus | null
    const canApprove = hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides)

    const isAllScope = scope === 'all' && canApprove
    const where = isAllScope
      ? status
        ? { status }
        : {}
      : { employeeStaffId: session.user.staffId }

    const rows = await prisma.timeOffRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    })

    return NextResponse.json({
      requests: rows.map((r) => ({
        id: r.id,
        employeeStaffId: r.employeeStaffId,
        employeeName: r.employeeName,
        employeeEmail: r.employeeEmail,
        kind: r.kind,
        startDate: toYmd(r.startDate),
        endDate: toYmd(r.endDate),
        totalHours: Number(r.totalHours),
        notes: r.notes,
        coverage: r.coverage,
        status: r.status,
        intakeByName: r.intakeByName,
        intakeAt: r.intakeAt?.toISOString() ?? null,
        intakeSkipped: r.intakeSkipped,
        coverageStaffName: r.coverageStaffName,
        coverageResponse: r.coverageResponse,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reviewedByName: r.reviewedByName,
        managerNotes: r.managerNotes,
        gustoRecordedAt: r.gustoRecordedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        graphSyncStatus: r.graphSyncStatus,
      })),
    })
  } catch (err) {
    return ptoRouteErrorResponse(err)
  }
}

/**
 * POST /api/pto/requests
 * Body: { kind, startDate, endDate, hoursPerDay?, notes?, coverage?, gustoPolicyUuid?, gustoPolicyName? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email || !session.user.role || !session.user.staffId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

    const kind = (typeof body.kind === 'string' ? body.kind : 'VACATION').toUpperCase() as PtoKind
    if (!VALID_KINDS.includes(kind)) {
      return NextResponse.json({ error: `Invalid kind. Allowed: ${VALID_KINDS.join(', ')}` }, { status: 400 })
    }
    const startDate = typeof body.startDate === 'string' ? body.startDate : null
    const endDate = typeof body.endDate === 'string' ? body.endDate : null
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: 'startDate and endDate must be YYYY-MM-DD' }, { status: 400 })
    }
    if (endDate < startDate) {
      return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 })
    }

    const hoursPerDay = validateHoursPerDay(startDate, endDate, body.hoursPerDay)
    const total = computeTotalHours(startDate, endDate, hoursPerDay)
    if (total <= 0) {
      return NextResponse.json({ error: 'Total hours is zero — adjust the date range or hours' }, { status: 400 })
    }
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null
    const coverage = typeof body.coverage === 'string' && body.coverage.trim() ? body.coverage.trim().slice(0, 2000) : null

    // Coverage staff picker: employee can select a teammate who will cover
    const coverageStaffId = typeof body.coverageStaffId === 'string' && body.coverageStaffId ? body.coverageStaffId : null

    let coverageStaff: { id: string; name: string; email: string } | null = null
    if (coverageStaffId) {
      const staff = await prisma.staffUser.findUnique({
        where: { id: coverageStaffId },
        select: { id: true, name: true, email: true, isActive: true },
      }).catch(() => null)
      if (staff && staff.isActive) {
        if (staff.id === session.user.staffId) {
          return NextResponse.json({ error: 'You cannot pick yourself as coverage' }, { status: 400 })
        }
        coverageStaff = { id: staff.id, name: staff.name, email: staff.email }
      }
    }

    // Gusto mapping is optional — if it exists we tag the request with the
    // employee UUID so future live-sync can target the right Gusto employee,
    // but it's no longer required for request submission.
    const mapping = await getMappingForStaffId(session.user.staffId)

    const coverageToken = coverageStaff ? generateCoverageToken() : null

    const created = await prisma.timeOffRequest.create({
      data: {
        mappingId: mapping?.id ?? null,
        employeeStaffId: session.user.staffId,
        employeeEmail: session.user.email,
        employeeName: session.user.name ?? session.user.email,
        gustoEmployeeUuid: mapping?.gustoEmployeeUuid ?? null,
        kind: kind as TimeOffRequestKind,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        endDate: new Date(`${endDate}T00:00:00.000Z`),
        hoursPerDay: hoursPerDay as never,
        totalHours: total,
        notes,
        coverage,
        coverageStaffId: coverageStaff?.id ?? null,
        coverageStaffName: coverageStaff?.name ?? null,
        coverageStaffEmail: coverageStaff?.email ?? null,
        coverageResponse: coverageStaff ? 'pending' : null,
        coverageToken,
        status: 'PENDING_INTAKE',
      },
    })

    await prisma.timeOffAuditLog.create({
      data: {
        requestId: created.id,
        actorStaffId: session.user.staffId,
        actorEmail: session.user.email,
        actorName: session.user.name ?? null,
        action: 'submitted',
        details: { total, kind, startDate, endDate, hoursPerDay },
      },
    })

    // Fire-and-forget notifications
    notifyIntakeTeam(created.id).catch((err) => console.error('[pto] notifyIntakeTeam failed:', err))
    notifySubmitter(created.id).catch((err) => console.error('[pto] notifySubmitter failed:', err))
    if (coverageStaff) {
      sendCoverageRequest(created.id).catch((err) =>
        console.error('[pto] sendCoverageRequest failed:', err)
      )
    }

    return NextResponse.json({ ok: true, id: created.id })
  } catch (err) {
    return ptoRouteErrorResponse(err)
  }
}

function toYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
