import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { getMappingForStaffId } from '@/lib/pto/mapping'
import { computeTotalHours, validateHoursPerDay } from '@/lib/pto/hours'
import { notifyApprovers, notifySubmitter } from '@/lib/pto/service'
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
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reviewedByName: r.reviewedByName,
        managerNotes: r.managerNotes,
        createdAt: r.createdAt.toISOString(),
        gustoSyncStatus: r.gustoSyncStatus,
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

    const mapping = await getMappingForStaffId(session.user.staffId)
    if (!mapping) {
      return NextResponse.json(
        {
          error:
            'Your account is not yet mapped to Gusto. Contact an admin to link your staff profile to your Gusto employee.',
          code: 'not_mapped',
        },
        { status: 409 }
      )
    }

    const gustoPolicyUuid = typeof body.gustoPolicyUuid === 'string' ? body.gustoPolicyUuid : null
    const gustoPolicyName = typeof body.gustoPolicyName === 'string' ? body.gustoPolicyName : null

    const created = await prisma.timeOffRequest.create({
      data: {
        mappingId: mapping.id,
        employeeStaffId: session.user.staffId,
        employeeEmail: session.user.email,
        employeeName: session.user.name ?? session.user.email,
        gustoEmployeeUuid: mapping.gustoEmployeeUuid,
        kind: kind as TimeOffRequestKind,
        gustoPolicyUuid,
        gustoPolicyName,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        endDate: new Date(`${endDate}T00:00:00.000Z`),
        hoursPerDay: hoursPerDay as never,
        totalHours: total,
        notes,
        coverage,
        status: 'PENDING',
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
    notifyApprovers(created.id).catch((err) => console.error('[pto] notifyApprovers failed:', err))
    notifySubmitter(created.id).catch((err) => console.error('[pto] notifySubmitter failed:', err))

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
