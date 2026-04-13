/**
 * PTO workflow service.
 *
 * High-level operations that coordinate our DB, Gusto, MS Graph, and email.
 * These are called from API routes.
 */

import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { getActiveConnection } from '@/lib/gusto/connection'
import {
  adjustEmployeeBalance,
  getEmployeeBalances,
  listEmployeeTimeOffActivities,
} from '@/lib/gusto/client'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getHrGroupMembers,
} from '@/lib/graph-tct'
import {
  generateApprovalNotificationEmail,
  generateDenialNotificationEmail,
  generateHrApprovalEmail,
  generateSubmittedConfirmationEmail,
} from '@/lib/email-templates/pto'
import type { PtoKind } from './types'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = process.env.PTO_FROM_EMAIL || 'HumanResources@triplecitiestech.com'
const FROM_NAME = process.env.PTO_FROM_NAME || 'Triple Cities Tech HR'
const SHARED_CALENDAR = process.env.PTO_CALENDAR_MAILBOX || 'timeoff@triplecitiestech.com'
const FALLBACK_APPROVER = process.env.PTO_APPROVER_FALLBACK_EMAIL || 'kurtis@triplecitiestech.com'

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function sendEmail(params: {
  to: string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}) {
  if (!resend) {
    console.warn('[pto] RESEND_API_KEY not set; skipping email', params.subject)
    return { ok: false, error: 'resend_not_configured' }
  }
  if (params.to.length === 0) return { ok: false, error: 'no_recipients' }
  try {
    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo ?? FROM_EMAIL,
    })
    if (result.error) return { ok: false, error: result.error.message }
    return { ok: true, id: result.data?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Notify approvers (HR group + fallback) after submission
// ---------------------------------------------------------------------------

async function resolveApproverEmails(): Promise<string[]> {
  const set = new Set<string>()
  try {
    const members = await getHrGroupMembers()
    for (const m of members) if (m.mail) set.add(m.mail.toLowerCase())
  } catch (err) {
    console.warn('[pto] Failed to resolve HR group; using fallback:', err)
  }
  if (FALLBACK_APPROVER) set.add(FALLBACK_APPROVER.toLowerCase())
  return Array.from(set)
}

export async function notifyApprovers(requestId: string): Promise<void> {
  const req = await prisma.timeOffRequest.findUnique({
    where: { id: requestId },
    include: { mapping: true },
  })
  if (!req) return

  // Fetch supporting context: balances + recent requests
  let balances: Array<{ policyName: string; balanceHours: number }> = []
  try {
    const conn = await getActiveConnection()
    if (conn?.companyUuid) {
      const b = await getEmployeeBalances(conn.companyUuid, req.gustoEmployeeUuid)
      balances = b.map((x) => ({ policyName: x.policyName, balanceHours: x.balanceHours }))
    }
  } catch (err) {
    console.warn('[pto] Could not fetch balances for HR notification:', err)
  }

  const recent = await prisma.timeOffRequest.findMany({
    where: { employeeStaffId: req.employeeStaffId, NOT: { id: req.id } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { kind: true, startDate: true, endDate: true, status: true },
  })

  const { subject, html, text } = generateHrApprovalEmail({
    employeeName: req.employeeName,
    employeeEmail: req.employeeEmail,
    kind: req.kind,
    startDate: ymd(req.startDate),
    endDate: ymd(req.endDate),
    totalHours: Number(req.totalHours),
    notes: req.notes,
    coverage: req.coverage,
    balances,
    recentRequests: recent.map((r) => ({
      kind: r.kind,
      startDate: ymd(r.startDate),
      endDate: ymd(r.endDate),
      status: r.status,
    })),
    reviewUrl: `${baseUrl()}/admin/pto/${req.id}`,
  })

  const approvers = await resolveApproverEmails()
  const send = await sendEmail({ to: approvers, subject, html, text, replyTo: req.employeeEmail })

  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { approversNotifiedAt: new Date() },
  })
  await prisma.timeOffAuditLog.create({
    data: {
      requestId: req.id,
      actorEmail: 'system',
      action: 'notify_approvers',
      details: { recipients: approvers, result: send },
    },
  })
}

export async function notifySubmitter(requestId: string): Promise<void> {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: requestId } })
  if (!req) return
  const { subject, html, text } = generateSubmittedConfirmationEmail({
    employeeName: req.employeeName,
    kind: req.kind,
    startDate: ymd(req.startDate),
    endDate: ymd(req.endDate),
    totalHours: Number(req.totalHours),
    requestUrl: `${baseUrl()}/admin/pto/my-requests`,
  })
  await sendEmail({ to: [req.employeeEmail], subject, html, text })
  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { submitterNotifiedAt: new Date() },
  })
}

// ---------------------------------------------------------------------------
// Approval workflow
// ---------------------------------------------------------------------------

export interface ApproveParams {
  requestId: string
  reviewerStaffId: string
  reviewerEmail: string
  reviewerName: string
  managerNotes?: string | null
}

export async function approveRequest(p: ApproveParams) {
  const req = await prisma.timeOffRequest.findUnique({
    where: { id: p.requestId },
    include: { mapping: true },
  })
  if (!req) throw new Error('Request not found')
  if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status}`)

  // 1. Update DB status
  const updated = await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: {
      status: 'APPROVED',
      reviewedByStaffId: p.reviewerStaffId,
      reviewedByName: p.reviewerName,
      reviewedAt: new Date(),
      managerNotes: p.managerNotes ?? null,
    },
  })

  await prisma.timeOffAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: p.reviewerStaffId,
      actorEmail: p.reviewerEmail,
      actorName: p.reviewerName,
      action: 'approved',
      details: { managerNotes: p.managerNotes ?? null },
    },
  })

  // 2. Gusto balance adjustment (best-effort; doesn't block approval)
  await syncApprovalToGusto(updated.id)

  // 3. Calendar sync (best-effort)
  await syncApprovalToCalendar(updated.id)

  // 4. Notify employee
  const reloaded = await prisma.timeOffRequest.findUnique({ where: { id: updated.id } })
  if (reloaded) {
    const { subject, html, text } = generateApprovalNotificationEmail({
      employeeName: reloaded.employeeName,
      kind: reloaded.kind,
      startDate: ymd(reloaded.startDate),
      endDate: ymd(reloaded.endDate),
      totalHours: Number(reloaded.totalHours),
      managerNotes: reloaded.managerNotes,
      managerName: p.reviewerName,
      requestUrl: `${baseUrl()}/admin/pto/my-requests`,
    })
    await sendEmail({ to: [reloaded.employeeEmail], subject, html, text })
    await prisma.timeOffRequest.update({
      where: { id: reloaded.id },
      data: { employeeNotifiedAt: new Date() },
    })
  }

  return prisma.timeOffRequest.findUnique({ where: { id: updated.id } })
}

export interface DenyParams {
  requestId: string
  reviewerStaffId: string
  reviewerEmail: string
  reviewerName: string
  managerNotes?: string | null
}

export async function denyRequest(p: DenyParams) {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: p.requestId } })
  if (!req) throw new Error('Request not found')
  if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status}`)

  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: {
      status: 'DENIED',
      reviewedByStaffId: p.reviewerStaffId,
      reviewedByName: p.reviewerName,
      reviewedAt: new Date(),
      managerNotes: p.managerNotes ?? null,
    },
  })
  await prisma.timeOffAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: p.reviewerStaffId,
      actorEmail: p.reviewerEmail,
      actorName: p.reviewerName,
      action: 'denied',
      details: { managerNotes: p.managerNotes ?? null },
    },
  })

  const { subject, html, text } = generateDenialNotificationEmail({
    employeeName: req.employeeName,
    kind: req.kind,
    startDate: ymd(req.startDate),
    endDate: ymd(req.endDate),
    totalHours: Number(req.totalHours),
    managerNotes: p.managerNotes ?? null,
    managerName: p.reviewerName,
    requestUrl: `${baseUrl()}/admin/pto/my-requests`,
  })
  await sendEmail({ to: [req.employeeEmail], subject, html, text })
  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { employeeNotifiedAt: new Date() },
  })

  return prisma.timeOffRequest.findUnique({ where: { id: req.id } })
}

export async function cancelRequest(params: {
  requestId: string
  actorStaffId: string
  actorEmail: string
  actorName: string
}) {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: params.requestId } })
  if (!req) throw new Error('Request not found')
  if (req.status === 'CANCELLED') return req

  const wasApproved = req.status === 'APPROVED'

  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { status: 'CANCELLED' },
  })
  await prisma.timeOffAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: params.actorStaffId,
      actorEmail: params.actorEmail,
      actorName: params.actorName,
      action: 'cancelled',
      details: { wasApproved },
    },
  })

  // Remove calendar events if the request had been approved
  if (wasApproved) {
    if (req.graphEventId) {
      try {
        await deleteCalendarEvent(SHARED_CALENDAR, req.graphEventId)
      } catch (err) {
        console.warn('[pto] Failed to delete shared calendar event on cancel:', err)
      }
    }
    if (req.graphInviteEventId) {
      try {
        await deleteCalendarEvent(req.employeeEmail, req.graphInviteEventId)
      } catch (err) {
        console.warn('[pto] Failed to delete employee invite on cancel:', err)
      }
    }
  }

  return prisma.timeOffRequest.findUnique({ where: { id: req.id } })
}

// ---------------------------------------------------------------------------
// Gusto sync
// ---------------------------------------------------------------------------

export async function syncApprovalToGusto(requestId: string): Promise<void> {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: requestId } })
  if (!req) return
  if (req.status !== 'APPROVED') return
  if (req.gustoSyncStatus === 'ok') return

  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { gustoSyncStatus: 'pending', gustoSyncAttempts: req.gustoSyncAttempts + 1 },
  })

  try {
    // We can only write to Gusto if a policy UUID is associated with the request.
    if (!req.gustoPolicyUuid) {
      await prisma.timeOffRequest.update({
        where: { id: req.id },
        data: {
          gustoSyncStatus: 'skipped',
          gustoSyncError: 'No Gusto policy associated with request',
        },
      })
      return
    }

    const result = await adjustEmployeeBalance({
      policyUuid: req.gustoPolicyUuid,
      employeeUuid: req.gustoEmployeeUuid,
      hoursUsed: Number(req.totalHours),
    })

    await prisma.timeOffRequest.update({
      where: { id: req.id },
      data: {
        gustoSyncStatus: 'ok',
        gustoSyncError: null,
        gustoBalanceAdjustmentAt: new Date(),
      },
    })
    await prisma.timeOffAuditLog.create({
      data: {
        requestId: req.id,
        actorEmail: 'system',
        action: 'gusto_sync',
        details: { ...result, hoursUsed: Number(req.totalHours) },
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.timeOffRequest.update({
      where: { id: req.id },
      data: { gustoSyncStatus: 'error', gustoSyncError: msg },
    })
    await prisma.timeOffAuditLog.create({
      data: {
        requestId: req.id,
        actorEmail: 'system',
        action: 'gusto_sync',
        severity: 'error',
        details: { error: msg },
      },
    })
  }
}

// ---------------------------------------------------------------------------
// Calendar sync
// ---------------------------------------------------------------------------

export async function syncApprovalToCalendar(requestId: string): Promise<void> {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: requestId } })
  if (!req) return
  if (req.status !== 'APPROVED') return
  if (req.graphSyncStatus === 'ok') return

  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { graphSyncStatus: 'pending', graphSyncAttempts: req.graphSyncAttempts + 1 },
  })

  try {
    const startYmd = ymd(req.startDate)
    const endYmd = ymd(req.endDate)
    const subject = `${req.employeeName} — PTO (${req.kind})`
    const bodyHtml = `<p><strong>${req.employeeName}</strong> (${req.employeeEmail}) is out on ${req.kind.toLowerCase()} leave.</p>
<p>Total: ${Number(req.totalHours).toFixed(2)} hrs</p>
${req.notes ? `<p><em>Notes:</em> ${req.notes}</p>` : ''}
${req.coverage ? `<p><em>Shift coverage:</em> ${req.coverage}</p>` : ''}
<p>Managed via the Triple Cities Tech time-off system.</p>`

    // 1. Shared PTO calendar event (no attendees)
    const sharedEvent = await createCalendarEvent({
      calendarOwner: SHARED_CALENDAR,
      subject,
      body: bodyHtml,
      startDate: startYmd,
      endDate: endYmd,
      isAllDay: true,
      categories: ['PTO', req.kind],
    })

    // 2. Employee calendar invite on their own mailbox
    let inviteEventId: string | null = null
    try {
      const inviteEvent = await createCalendarEvent({
        calendarOwner: req.employeeEmail,
        subject: `Out of office — ${req.kind}`,
        body: bodyHtml,
        startDate: startYmd,
        endDate: endYmd,
        isAllDay: true,
        categories: ['PTO'],
      })
      inviteEventId = inviteEvent.id
    } catch (inviteErr) {
      console.warn('[pto] Could not create invite on employee mailbox:', inviteErr)
    }

    await prisma.timeOffRequest.update({
      where: { id: req.id },
      data: {
        graphEventId: sharedEvent.id,
        graphInviteEventId: inviteEventId,
        graphSyncStatus: 'ok',
        graphSyncError: null,
      },
    })
    await prisma.timeOffAuditLog.create({
      data: {
        requestId: req.id,
        actorEmail: 'system',
        action: 'calendar_sync',
        details: { sharedEventId: sharedEvent.id, inviteEventId },
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.timeOffRequest.update({
      where: { id: req.id },
      data: { graphSyncStatus: 'error', graphSyncError: msg },
    })
    await prisma.timeOffAuditLog.create({
      data: {
        requestId: req.id,
        actorEmail: 'system',
        action: 'calendar_sync',
        severity: 'error',
        details: { error: msg },
      },
    })
  }
}

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

export async function retrySyncs(requestId: string): Promise<void> {
  await syncApprovalToGusto(requestId)
  await syncApprovalToCalendar(requestId)
}

// ---------------------------------------------------------------------------
// Dashboard helpers
// ---------------------------------------------------------------------------

export async function getEmployeeContext(staffUserId: string) {
  const mapping = await prisma.ptoEmployeeMapping.findUnique({ where: { staffUserId } })
  const conn = await getActiveConnection()

  let balances: Array<{
    policyUuid: string
    policyName: string
    policyType: string
    balanceHours: number
  }> = []
  let activities: Array<{ start_date: string; end_date: string; hours: string; status: string; policy_name: string | null }> = []

  if (mapping && conn?.companyUuid) {
    try {
      balances = await getEmployeeBalances(conn.companyUuid, mapping.gustoEmployeeUuid)
    } catch (err) {
      console.warn('[pto] balance fetch failed:', err)
    }
    try {
      const raw = await listEmployeeTimeOffActivities(mapping.gustoEmployeeUuid)
      activities = raw.map((a) => ({
        start_date: a.start_date,
        end_date: a.end_date,
        hours: a.hours,
        status: a.status,
        policy_name: a.policy_name,
      }))
    } catch (err) {
      console.warn('[pto] activity fetch failed:', err)
    }
  }

  const requests = await prisma.timeOffRequest.findMany({
    where: { employeeStaffId: staffUserId },
    orderBy: { createdAt: 'desc' },
    take: 25,
  })

  return { mapping, balances, activities, requests, gustoConnected: !!conn }
}

export async function logAudit(params: {
  requestId: string
  actorStaffId?: string | null
  actorEmail: string
  actorName?: string | null
  action: string
  details?: Record<string, unknown>
  severity?: string
}) {
  await prisma.timeOffAuditLog.create({
    data: {
      requestId: params.requestId,
      actorStaffId: params.actorStaffId ?? null,
      actorEmail: params.actorEmail,
      actorName: params.actorName ?? null,
      action: params.action,
      details: (params.details ?? {}) as never,
      severity: params.severity ?? 'info',
    },
  })
}

// Re-export kind for route convenience
export type { PtoKind }
