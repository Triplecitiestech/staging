import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { overtimeRouteErrorResponse } from '@/lib/overtime/route-errors'
import {
  notifyOvertimeIntakeTeam,
  notifyOvertimeSubmitter,
  notifyReactiveOvertimeSubmitted,
} from '@/lib/overtime/service'
import {
  OT_CATEGORIES,
  REACTIVE_REASONS,
  PLANNED_OT_BUFFER_MS,
  REACTIVE_OT_LATE_WINDOW_MS,
  isPlannedOt,
} from '@/lib/overtime/types'
import type { OvertimeFlowType, OvertimeRequestStatus } from '@prisma/client'

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
    const flowTypeFilter = request.nextUrl.searchParams.get('flowType') as OvertimeFlowType | null
    const canApprove = hasPermission(session.user.role, 'approve_overtime', session.user.permissionOverrides)
    const canIntake = hasPermission(session.user.role, 'overtime_intake', session.user.permissionOverrides)
    const isAllScope = scope === 'all' && (canApprove || canIntake)
    const where: Record<string, unknown> = isAllScope ? {} : { employeeStaffId: session.user.staffId }
    if (isAllScope && status) where.status = status
    if (flowTypeFilter) where.flowType = flowTypeFilter

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
        endTime: r.endTime,
        estimatedHours: Number(r.estimatedHours),
        flowType: r.flowType,
        otCategory: r.otCategory,
        reactiveReason: r.reactiveReason,
        incidentContext: r.incidentContext,
        lateSubmission: r.lateSubmission,
        lateReason: r.lateReason,
        flagForCeoReview: r.flagForCeoReview,
        flagReason: r.flagReason,
        ceoAcknowledgedAt: r.ceoAcknowledgedAt?.toISOString() ?? null,
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
 *
 * Two flows determined by start time:
 *   - APPROVAL (planned): start_time > now+30min. Requires ot_category +
 *     estimated_hours. Goes through HR intake → CEO approval.
 *   - NOTIFICATION (reactive): otherwise. Requires reactive_reason,
 *     incident_context (≥30 chars), end_time. HR records — cannot be denied.
 *
 * Body (planned):
 *   { workDate, startTime?, estimatedHours, reason, otCategory, otCategoryOther? }
 *
 * Body (reactive):
 *   { workDate, startTime, endTime, actualHours, reactiveReason, incidentContext,
 *     reactiveReasonOther?, lateReason? }
 *
 * For backwards compatibility, if no flowType-distinguishing fields are sent
 * but estimatedHours + reason are present, default to legacy approval-flow
 * behavior so existing clients don't break.
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
    const endTime = typeof body.endTime === 'string' && body.endTime.trim()
      ? body.endTime.trim().slice(0, 50)
      : null

    // ---- Flow determination -----------------------------------------------
    // Approach: client passes flowType explicitly. If not, default behavior
    // is approval (backwards compatible with the old single-CTA form).
    const explicitFlow = body.flowType === 'NOTIFICATION' ? 'NOTIFICATION' : 'APPROVAL'

    // Build an actual start time (UTC midnight on workDate, + parsed startTime
    // if we can; else just workDate noon as a coarse anchor). This is only
    // used for the planned-vs-reactive timing check.
    const startAt = parseStartAt(workDate, startTime)
    const now = new Date()
    const computedPlanned = isPlannedOt(startAt, now)

    const flowType: 'APPROVAL' | 'NOTIFICATION' = explicitFlow
    if (explicitFlow === 'APPROVAL' && !computedPlanned) {
      // Caller said "planned" but the start time is already past / inside
      // the 30-min buffer. Reject — caller should resubmit as reactive.
      return NextResponse.json(
        {
          error: 'planned_ot_requires_future_start',
          message: `Planned OT must start at least ${PLANNED_OT_BUFFER_MS / 60000} minutes in the future. To log overtime that has already happened, use the reactive form.`,
        },
        { status: 400 }
      )
    }

    // ---- Common required fields -------------------------------------------
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason && flowType === 'APPROVAL') {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    // ---- Planned (APPROVAL) flow ------------------------------------------
    if (flowType === 'APPROVAL') {
      const hrs = Number.parseFloat(String(body.estimatedHours))
      if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) {
        return NextResponse.json({ error: 'estimatedHours must be between 0 and 24' }, { status: 400 })
      }

      let otCategory = typeof body.otCategory === 'string' ? body.otCategory.trim() : ''
      if (!otCategory) {
        return NextResponse.json({ error: 'otCategory is required for planned OT' }, { status: 400 })
      }
      if (!(OT_CATEGORIES as readonly string[]).includes(otCategory)) {
        return NextResponse.json(
          { error: `otCategory must be one of: ${OT_CATEGORIES.join(', ')}` },
          { status: 400 }
        )
      }
      // "Other" requires a free-text qualifier
      if (otCategory === 'Other') {
        const other = typeof body.otCategoryOther === 'string' ? body.otCategoryOther.trim() : ''
        if (!other) {
          return NextResponse.json(
            { error: 'otCategoryOther is required when otCategory is "Other"' },
            { status: 400 }
          )
        }
        otCategory = `Other: ${other.slice(0, 120)}`
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
          flowType: 'APPROVAL',
          otCategory: otCategory.slice(0, 200),
        },
      })
      await prisma.overtimeAuditLog.create({
        data: {
          requestId: created.id,
          actorStaffId: session.user.staffId,
          actorEmail: session.user.email,
          actorName: session.user.name ?? null,
          action: 'submitted',
          details: { flowType, workDate, startTime, estimatedHours: hrs, reason, otCategory } as never,
        },
      })

      notifyOvertimeIntakeTeam(created.id).catch((err) =>
        console.error('[overtime] notifyIntake failed:', err)
      )
      notifyOvertimeSubmitter(created.id).catch((err) =>
        console.error('[overtime] notifySubmitter failed:', err)
      )
      return NextResponse.json({ ok: true, id: created.id, flowType: 'APPROVAL' })
    }

    // ---- Reactive (NOTIFICATION) flow -------------------------------------
    let reactiveReason = typeof body.reactiveReason === 'string' ? body.reactiveReason.trim() : ''
    if (!reactiveReason) {
      return NextResponse.json({ error: 'reactiveReason is required for reactive OT' }, { status: 400 })
    }
    if (!(REACTIVE_REASONS as readonly string[]).includes(reactiveReason)) {
      return NextResponse.json(
        { error: `reactiveReason must be one of: ${REACTIVE_REASONS.join(', ')}` },
        { status: 400 }
      )
    }
    if (reactiveReason === 'Other') {
      const other = typeof body.reactiveReasonOther === 'string' ? body.reactiveReasonOther.trim() : ''
      if (!other) {
        return NextResponse.json(
          { error: 'reactiveReasonOther is required when reactiveReason is "Other"' },
          { status: 400 }
        )
      }
      reactiveReason = `Other: ${other.slice(0, 120)}`
    }

    const incidentContext = typeof body.incidentContext === 'string' ? body.incidentContext.trim() : ''
    if (incidentContext.length < 30) {
      return NextResponse.json(
        { error: 'incidentContext must be at least 30 characters — describe the customer, what happened, and the outcome.' },
        { status: 400 }
      )
    }
    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: 'startTime and endTime are required for reactive OT' },
        { status: 400 }
      )
    }

    const actualHours = Number.parseFloat(String(body.actualHours))
    if (!Number.isFinite(actualHours) || actualHours <= 0 || actualHours > 24) {
      return NextResponse.json({ error: 'actualHours must be between 0 and 24' }, { status: 400 })
    }

    // End time check: end must be in the past (or "now" — within a small
    // grace), and submission must be within 24h or marked late.
    const actualEndAt = parseEndAt(workDate, endTime)
    const ageMs = now.getTime() - actualEndAt.getTime()
    if (ageMs < -5 * 60 * 1000) {
      return NextResponse.json(
        { error: 'Reactive OT can only be logged for work that has already happened.' },
        { status: 400 }
      )
    }

    const lateSubmission = ageMs > REACTIVE_OT_LATE_WINDOW_MS
    const lateReason = typeof body.lateReason === 'string' ? body.lateReason.trim().slice(0, 1000) : ''
    if (lateSubmission && !lateReason) {
      return NextResponse.json(
        {
          error: 'late_reason_required',
          message: `Reactive OT submitted more than 24 hours after end_time requires a lateReason.`,
          ageHours: Math.floor(ageMs / (60 * 60 * 1000)),
        },
        { status: 400 }
      )
    }

    const created = await prisma.overtimeRequest.create({
      data: {
        employeeStaffId: session.user.staffId,
        employeeEmail: session.user.email,
        employeeName: session.user.name ?? session.user.email,
        workDate: new Date(`${workDate}T00:00:00.000Z`),
        startTime,
        endTime,
        // For reactive, estimatedHours = actualHours (no estimate phase)
        estimatedHours: actualHours,
        actualHoursWorked: actualHours,
        actualStartAt: parseStartAt(workDate, startTime),
        actualEndAt,
        reason: reason ? reason.slice(0, 4000) : incidentContext.slice(0, 4000),
        status: 'PENDING_INTAKE',
        flowType: 'NOTIFICATION',
        reactiveReason: reactiveReason.slice(0, 200),
        incidentContext: incidentContext.slice(0, 4000),
        lateSubmission,
        lateReason: lateSubmission ? lateReason : null,
      },
    })
    await prisma.overtimeAuditLog.create({
      data: {
        requestId: created.id,
        actorStaffId: session.user.staffId,
        actorEmail: session.user.email,
        actorName: session.user.name ?? null,
        action: 'submitted',
        details: {
          flowType,
          workDate,
          startTime,
          endTime,
          actualHours,
          reactiveReason,
          lateSubmission,
        } as never,
      },
    })

    notifyReactiveOvertimeSubmitted(created.id).catch((err) =>
      console.error('[overtime] notifyReactive failed:', err)
    )
    return NextResponse.json({ ok: true, id: created.id, flowType: 'NOTIFICATION', lateSubmission })
  } catch (err) {
    return overtimeRouteErrorResponse(err)
  }
}

/**
 * Parse a free-form startTime like "5:00 PM" or "17:00" into a Date anchored
 * on the workDate. Falls back to midnight UTC if parsing fails.
 */
function parseStartAt(workDate: string, startTime: string | null): Date {
  return parseTimeOnDate(workDate, startTime)
}

function parseEndAt(workDate: string, endTime: string | null): Date {
  return parseTimeOnDate(workDate, endTime)
}

function parseTimeOnDate(workDate: string, time: string | null): Date {
  const base = new Date(`${workDate}T00:00:00.000Z`)
  if (!time) return base
  const t = time.trim().toUpperCase()
  // Try patterns: "17:00", "5:00 PM", "5 PM", "5:00PM"
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/)
  if (!m) return base
  let hour = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const ampm = m[3]
  if (ampm === 'PM' && hour < 12) hour += 12
  if (ampm === 'AM' && hour === 12) hour = 0
  if (hour > 23 || min > 59) return base
  base.setUTCHours(hour, min, 0, 0)
  return base
}
