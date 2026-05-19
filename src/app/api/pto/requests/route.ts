import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { getMappingForStaffId } from '@/lib/pto/mapping'
import { computeTotalHours, validateHoursPerDay } from '@/lib/pto/hours'
import {
  generateCoverageToken,
  notifyIntakeTeam,
  notifyNotificationIntake,
  notifySubmitter,
  sendCoverageRequest,
} from '@/lib/pto/service'
import { flowForKind } from '@/lib/pto/types'
import { ptoRouteErrorResponse } from '@/lib/pto/route-errors'
import type { PtoKind } from '@/lib/pto/types'
import type { TimeOffFlowType, TimeOffRequestKind, TimeOffRequestStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const VALID_KINDS: PtoKind[] = [
  'VACATION',
  'SICK',
  'PERSONAL',
  'BEREAVEMENT',
  'JURY_DUTY',
  'UNPAID',
  'OTHER',
  'FAMILY_EMERGENCY',
  'SAME_DAY_MEDICAL',
]

// Approval-flow PTO must be submitted at least 2 weeks before the start date,
// or the user must mark it as a short-notice override with a reason.
const TWO_WEEK_NOTICE_DAYS = 14

// Notification-flow PTO can backfill up to 7 days (someone home sick all
// week may not submit Monday). Beyond that requires manual HR entry.
const NOTIFICATION_BACKFILL_DAYS = 7

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
    const flowTypeFilter = request.nextUrl.searchParams.get('flowType') as TimeOffFlowType | null
    const canApprove = hasPermission(session.user.role, 'approve_pto', session.user.permissionOverrides)
    const canIntake = hasPermission(session.user.role, 'pto_intake', session.user.permissionOverrides)

    // HR-staff (intake or final approver) can see all requests via scope=all
    const isAllScope = scope === 'all' && (canApprove || canIntake)
    const where: Record<string, unknown> = isAllScope
      ? {}
      : { employeeStaffId: session.user.staffId }
    if (isAllScope && status) where.status = status
    if (flowTypeFilter) where.flowType = flowTypeFilter

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
        flowType: r.flowType,
        startDate: toYmd(r.startDate),
        endDate: toYmd(r.endDate),
        totalHours: Number(r.totalHours),
        notes: r.notes,
        coverage: r.coverage,
        status: r.status,
        overrideShortNotice: r.overrideShortNotice,
        overrideReason: r.overrideReason,
        paidOrUnpaid: r.paidOrUnpaid,
        flagForCeoReview: r.flagForCeoReview,
        flagReason: r.flagReason,
        ceoAcknowledgedAt: r.ceoAcknowledgedAt?.toISOString() ?? null,
        intakeByName: r.intakeByName,
        intakeAt: r.intakeAt?.toISOString() ?? null,
        intakeSkipped: r.intakeSkipped,
        coverageStaffName: r.coverageStaffName,
        coverageResponse: r.coverageResponse,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reviewedByName: r.reviewedByName,
        managerNotes: r.managerNotes,
        gustoRecordedAt: r.gustoRecordedAt?.toISOString() ?? null,
        gustoLoggedAt: r.gustoLoggedAt?.toISOString() ?? null,
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
 * Body: {
 *   kind, startDate, endDate, hoursPerDay?, notes?, coverage?, coverageStaffId?,
 *   overrideShortNotice?, overrideReason?
 * }
 *
 * The kind determines the flow:
 *   APPROVAL     — vacation, personal, jury duty, planned unpaid, other.
 *                  Goes through HR intake → CEO approval.
 *   NOTIFICATION — sick, bereavement, family emergency, same-day medical.
 *                  Goes straight to PENDING_INTAKE (waiting on HR to record).
 *                  No reliever required; cannot be denied.
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
    const flowType = flowForKind(kind)

    const startDate = typeof body.startDate === 'string' ? body.startDate : null
    const endDate = typeof body.endDate === 'string' ? body.endDate : null
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: 'startDate and endDate must be YYYY-MM-DD' }, { status: 400 })
    }
    if (endDate < startDate) {
      return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 })
    }

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const startUtc = new Date(`${startDate}T00:00:00.000Z`)
    const daysUntilStart = Math.floor((startUtc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    // Approval flow: enforce 2-week notice unless override is set.
    const overrideShortNotice = !!body.overrideShortNotice
    const overrideReason = typeof body.overrideReason === 'string' ? body.overrideReason.trim() : ''
    if (flowType === 'APPROVAL' && daysUntilStart < TWO_WEEK_NOTICE_DAYS) {
      if (!overrideShortNotice || !overrideReason) {
        return NextResponse.json(
          {
            error: 'short_notice_override_required',
            message: `Planned PTO must be submitted at least ${TWO_WEEK_NOTICE_DAYS} days in advance. To override, set overrideShortNotice=true and provide overrideReason.`,
            daysUntilStart,
          },
          { status: 400 }
        )
      }
    }

    // Notification flow: must not be in the future, and not more than 7 days back.
    if (flowType === 'NOTIFICATION') {
      if (daysUntilStart > 0) {
        return NextResponse.json(
          { error: 'Sick / bereavement / emergency time off cannot be reported in advance. Use the "Request planned time off" form instead.' },
          { status: 400 }
        )
      }
      if (daysUntilStart < -NOTIFICATION_BACKFILL_DAYS) {
        return NextResponse.json(
          { error: `Notification PTO can only backfill up to ${NOTIFICATION_BACKFILL_DAYS} days. For older entries, please ask HR to record manually.` },
          { status: 400 }
        )
      }
    }

    const hoursPerDay = validateHoursPerDay(startDate, endDate, body.hoursPerDay)
    const total = computeTotalHours(startDate, endDate, hoursPerDay)
    if (total <= 0) {
      return NextResponse.json({ error: 'Total hours is zero — adjust the date range or hours' }, { status: 400 })
    }
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null
    const coverage = typeof body.coverage === 'string' && body.coverage.trim() ? body.coverage.trim().slice(0, 2000) : null

    // Coverage staff picker: only used by the approval flow.
    const coverageStaffId =
      flowType === 'APPROVAL' && typeof body.coverageStaffId === 'string' && body.coverageStaffId
        ? body.coverageStaffId
        : null

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
        flowType,
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
        overrideShortNotice: flowType === 'APPROVAL' && overrideShortNotice,
        overrideReason:
          flowType === 'APPROVAL' && overrideShortNotice && overrideReason
            ? overrideReason.slice(0, 1000)
            : null,
        // Both flows start in PENDING_INTAKE — the notification flow's
        // intake step is HR recording, not gathering approval context.
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
        details: {
          total,
          kind,
          flowType,
          startDate,
          endDate,
          hoursPerDay,
          overrideShortNotice: flowType === 'APPROVAL' && overrideShortNotice,
          overrideReason: flowType === 'APPROVAL' && overrideShortNotice ? overrideReason : null,
        },
      },
    })

    // Route notifications per flow.
    if (flowType === 'APPROVAL') {
      notifyIntakeTeam(created.id).catch((err) => console.error('[pto] notifyIntakeTeam failed:', err))
      notifySubmitter(created.id).catch((err) => console.error('[pto] notifySubmitter failed:', err))
      if (coverageStaff) {
        sendCoverageRequest(created.id).catch((err) =>
          console.error('[pto] sendCoverageRequest failed:', err)
        )
      }
    } else {
      // Notification flow: FYI to HR only — no submitter confirmation needed
      // (they already see it in the UI; no decision is pending).
      notifyNotificationIntake(created.id).catch((err) =>
        console.error('[pto] notifyNotificationIntake failed:', err)
      )
    }

    return NextResponse.json({ ok: true, id: created.id, flowType })
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
