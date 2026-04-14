/**
 * PTO workflow service — two-stage approval pipeline.
 *
 * Flow:
 *   1. Employee submits request → status = PENDING_INTAKE
 *      → notifyIntakeTeam() emails intake assignees (e.g. Rio)
 *   2. Intake person opens the request and fills in context (last time off,
 *      current balance from Gusto, coverage confirmation, notes) then forwards
 *      → status = PENDING_APPROVAL
 *      → notifyFinalApprovers() emails final approvers (e.g. Kurtis)
 *   3. Final approver approves or denies
 *      → status = APPROVED / DENIED
 *      → approved path: calendar event on shared mailbox + invite on employee
 *      → employee notified either way
 *   4. After approval, HR marks the PTO as "entered in Gusto" manually
 *      (closes the loop).
 *
 * Bypass: a user with both `pto_intake` and `approve_pto` (or just
 *   approve_pto acting via /skip-intake) can jump from PENDING_INTAKE
 *   straight to PENDING_APPROVAL or approve without intake.
 *
 * Live Gusto sync is intentionally NOT wired into this flow. Gusto
 * Direct-API access is closed to new partners; all Gusto balance /
 * write-back is manual until access opens.
 */

import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getHrGroupMembers,
} from '@/lib/graph-tct'
import {
  generateApprovalNotificationEmail,
  generateCoverageRequestEmail,
  generateCoverageResponseEmail,
  generateDenialNotificationEmail,
  generateIntakeAssignedEmail,
  generateHrApprovalEmail,
  generateSubmittedConfirmationEmail,
} from '@/lib/email-templates/pto'
import crypto from 'crypto'
import type { PtoKind } from './types'
import type { StaffRole } from '@prisma/client'
import { hasPermission, parseOverrides } from '@/lib/permissions'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = process.env.PTO_FROM_EMAIL || 'HumanResources@triplecitiestech.com'
const FROM_NAME = process.env.PTO_FROM_NAME || 'Triple Cities Tech HR'
const SHARED_CALENDAR = process.env.PTO_CALENDAR_MAILBOX || 'timeoff@triplecitiestech.com'
const FALLBACK_APPROVER = process.env.PTO_APPROVER_FALLBACK_EMAIL || 'kurtis@triplecitiestech.com'
const INTAKE_FALLBACK_EMAIL = process.env.PTO_INTAKE_FALLBACK_EMAIL // optional

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
// Recipient resolution
// ---------------------------------------------------------------------------

/** Staff users with a specific permission (includes role + per-user overrides). */
async function staffEmailsWithPermission(permission: 'pto_intake' | 'approve_pto'): Promise<string[]> {
  const staff = await prisma.staffUser.findMany({
    where: { isActive: true },
    select: { email: true, role: true, permissionOverrides: true },
  })
  const out = new Set<string>()
  for (const s of staff) {
    if (hasPermission(s.role as StaffRole, permission, parseOverrides(s.permissionOverrides))) {
      if (s.email) out.add(s.email.toLowerCase())
    }
  }
  return Array.from(out)
}

/**
 * Intake recipients: staff with pto_intake permission. Falls back to the HR
 * M365 group + PTO_INTAKE_FALLBACK_EMAIL if no one has the permission yet.
 */
async function resolveIntakeEmails(): Promise<string[]> {
  const set = new Set<string>()
  const staffEmails = await staffEmailsWithPermission('pto_intake')
  for (const e of staffEmails) set.add(e)
  if (set.size === 0) {
    try {
      const members = await getHrGroupMembers()
      for (const m of members) if (m.mail) set.add(m.mail.toLowerCase())
    } catch (err) {
      console.warn('[pto] HR group lookup failed for intake:', err)
    }
  }
  if (INTAKE_FALLBACK_EMAIL) set.add(INTAKE_FALLBACK_EMAIL.toLowerCase())
  return Array.from(set)
}

/**
 * Final-approver recipients: staff with approve_pto permission. Falls back
 * to the HR group + PTO_APPROVER_FALLBACK_EMAIL.
 */
async function resolveApproverEmails(): Promise<string[]> {
  const set = new Set<string>()
  const staffEmails = await staffEmailsWithPermission('approve_pto')
  for (const e of staffEmails) set.add(e)
  if (set.size === 0) {
    try {
      const members = await getHrGroupMembers()
      for (const m of members) if (m.mail) set.add(m.mail.toLowerCase())
    } catch (err) {
      console.warn('[pto] HR group lookup failed for approvers:', err)
    }
  }
  if (FALLBACK_APPROVER) set.add(FALLBACK_APPROVER.toLowerCase())
  return Array.from(set)
}

// ---------------------------------------------------------------------------
// Notification: submitter + intake team (stage 1)
// ---------------------------------------------------------------------------

export async function notifySubmitter(requestId: string): Promise<void> {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: requestId } })
  if (!req) return
  const { subject, html, text } = generateSubmittedConfirmationEmail({
    employeeName: req.employeeName,
    kind: req.kind,
    startDate: ymd(req.startDate),
    endDate: ymd(req.endDate),
    totalHours: Number(req.totalHours),
    requestUrl: `${baseUrl()}/admin/pto/${req.id}`,
  })
  await sendEmail({ to: [req.employeeEmail], subject, html, text })
  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { submitterNotifiedAt: new Date() },
  })
}

// ---------------------------------------------------------------------------
// Coverage: issue a token + send the accept/decline email
// ---------------------------------------------------------------------------

export function generateCoverageToken(): string {
  return crypto.randomBytes(24).toString('base64url')
}

export async function sendCoverageRequest(requestId: string): Promise<void> {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: requestId } })
  if (!req) return
  if (!req.coverageStaffEmail || !req.coverageStaffName) return
  if (!req.coverageToken) return

  const { subject, html, text } = generateCoverageRequestEmail({
    employeeName: req.employeeName,
    employeeEmail: req.employeeEmail,
    covererName: req.coverageStaffName,
    kind: req.kind,
    startDate: ymd(req.startDate),
    endDate: ymd(req.endDate),
    totalHours: Number(req.totalHours),
    notes: req.notes,
    respondUrl: `${baseUrl()}/pto/coverage/${encodeURIComponent(req.coverageToken)}`,
  })

  const send = await sendEmail({
    to: [req.coverageStaffEmail],
    subject,
    html,
    text,
    replyTo: req.employeeEmail,
  })

  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { coverageRequestSentAt: new Date() },
  })
  await prisma.timeOffAuditLog.create({
    data: {
      requestId: req.id,
      actorEmail: 'system',
      action: 'coverage_request_sent',
      details: { to: req.coverageStaffEmail, result: send } as never,
    },
  })
}

export async function notifyCoverageResponse(requestId: string): Promise<void> {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: requestId } })
  if (!req || !req.coverageResponse) return

  const recipients = await resolveIntakeEmails()
  // Also include the requesting employee so they know
  if (req.employeeEmail) recipients.push(req.employeeEmail.toLowerCase())
  const unique = Array.from(new Set(recipients))

  const { subject, html, text } = generateCoverageResponseEmail({
    employeeName: req.employeeName,
    covererName: req.coverageStaffName ?? 'Covering teammate',
    response: req.coverageResponse === 'accepted' ? 'accepted' : 'declined',
    responseNotes: req.coverageResponseNotes,
    kind: req.kind,
    startDate: ymd(req.startDate),
    endDate: ymd(req.endDate),
    reviewUrl: `${baseUrl()}/admin/pto/${req.id}`,
  })

  await sendEmail({ to: unique, subject, html, text })
}

export async function notifyIntakeTeam(requestId: string): Promise<void> {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: requestId } })
  if (!req) return

  const { subject, html, text } = generateIntakeAssignedEmail({
    employeeName: req.employeeName,
    employeeEmail: req.employeeEmail,
    kind: req.kind,
    startDate: ymd(req.startDate),
    endDate: ymd(req.endDate),
    totalHours: Number(req.totalHours),
    notes: req.notes,
    coverage: req.coverage,
    reviewUrl: `${baseUrl()}/admin/pto/${req.id}`,
  })

  const recipients = await resolveIntakeEmails()
  const send = await sendEmail({ to: recipients, subject, html, text, replyTo: req.employeeEmail })

  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { intakeNotifiedAt: new Date() },
  })
  await prisma.timeOffAuditLog.create({
    data: {
      requestId: req.id,
      actorEmail: 'system',
      action: 'notify_intake',
      details: { recipients, result: send } as never,
    },
  })
}

// ---------------------------------------------------------------------------
// Notification: final approvers (stage 2)
// ---------------------------------------------------------------------------

export async function notifyFinalApprovers(requestId: string): Promise<void> {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: requestId } })
  if (!req) return

  // Employee's recent request history for context
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
    coverageApproval: req.coverageStaffEmail
      ? {
          staffName: req.coverageStaffName,
          staffEmail: req.coverageStaffEmail,
          response: req.coverageResponse,
          responseNotes: req.coverageResponseNotes,
          respondedAt: req.coverageRespondedAt?.toISOString() ?? null,
        }
      : null,
    intake: {
      byName: req.intakeByName ?? null,
      lastTimeOffNotes: req.intakeLastTimeOffNotes ?? null,
      balanceNotes: req.intakeBalanceNotes ?? null,
      coverageConfirmed: req.intakeCoverageConfirmed ?? null,
      coverageNotes: req.intakeCoverageNotes ?? null,
      additionalNotes: req.intakeAdditionalNotes ?? null,
      skipped: req.intakeSkipped,
    },
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
      details: { recipients: approvers, result: send } as never,
    },
  })
}

// ---------------------------------------------------------------------------
// Intake (stage 1 completion)
// ---------------------------------------------------------------------------

export interface IntakeParams {
  requestId: string
  actorStaffId: string
  actorEmail: string
  actorName: string
  lastTimeOffNotes?: string | null
  balanceNotes?: string | null
  coverageConfirmed?: boolean | null
  coverageNotes?: string | null
  additionalNotes?: string | null
}

export async function completeIntake(p: IntakeParams) {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: p.requestId } })
  if (!req) throw new Error('Request not found')
  if (req.status !== 'PENDING_INTAKE' && req.status !== 'PENDING') {
    throw new Error(`Request is already ${req.status}`)
  }

  const updated = await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: {
      status: 'PENDING_APPROVAL',
      intakeByStaffId: p.actorStaffId,
      intakeByName: p.actorName,
      intakeAt: new Date(),
      intakeLastTimeOffNotes: p.lastTimeOffNotes ?? null,
      intakeBalanceNotes: p.balanceNotes ?? null,
      intakeCoverageConfirmed: p.coverageConfirmed ?? null,
      intakeCoverageNotes: p.coverageNotes ?? null,
      intakeAdditionalNotes: p.additionalNotes ?? null,
      intakeSkipped: false,
    },
  })

  await prisma.timeOffAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: p.actorStaffId,
      actorEmail: p.actorEmail,
      actorName: p.actorName,
      action: 'intake_completed',
      details: {
        coverageConfirmed: p.coverageConfirmed,
        balanceNotes: p.balanceNotes,
      } as never,
    },
  })

  notifyFinalApprovers(req.id).catch((err) =>
    console.error('[pto] notifyFinalApprovers failed:', err)
  )

  return prisma.timeOffRequest.findUnique({ where: { id: updated.id } })
}

/** Final approver bypasses intake: jumps from PENDING_INTAKE to PENDING_APPROVAL */
export async function skipIntake(params: {
  requestId: string
  actorStaffId: string
  actorEmail: string
  actorName: string
}) {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: params.requestId } })
  if (!req) throw new Error('Request not found')
  if (req.status !== 'PENDING_INTAKE' && req.status !== 'PENDING') {
    throw new Error(`Cannot skip intake — request is ${req.status}`)
  }

  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { status: 'PENDING_APPROVAL', intakeSkipped: true },
  })
  await prisma.timeOffAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: params.actorStaffId,
      actorEmail: params.actorEmail,
      actorName: params.actorName,
      action: 'intake_skipped',
    },
  })
  return prisma.timeOffRequest.findUnique({ where: { id: req.id } })
}

// ---------------------------------------------------------------------------
// Final approve / deny (stage 2)
// ---------------------------------------------------------------------------

function ensureApprovable(status: string) {
  if (status === 'PENDING_APPROVAL' || status === 'PENDING_INTAKE' || status === 'PENDING') return
  throw new Error(`Request is already ${status}`)
}

export interface ApproveParams {
  requestId: string
  reviewerStaffId: string
  reviewerEmail: string
  reviewerName: string
  managerNotes?: string | null
}

export async function approveRequest(p: ApproveParams) {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: p.requestId } })
  if (!req) throw new Error('Request not found')
  ensureApprovable(req.status)

  // If still in intake, mark it skipped so the audit trail is clear
  const extraIntakeFields =
    req.status === 'PENDING_INTAKE' || req.status === 'PENDING'
      ? { intakeSkipped: true }
      : {}

  const updated = await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: {
      status: 'APPROVED',
      reviewedByStaffId: p.reviewerStaffId,
      reviewedByName: p.reviewerName,
      reviewedAt: new Date(),
      managerNotes: p.managerNotes ?? null,
      ...extraIntakeFields,
    },
  })

  await prisma.timeOffAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: p.reviewerStaffId,
      actorEmail: p.reviewerEmail,
      actorName: p.reviewerName,
      action: 'approved',
      details: {
        managerNotes: p.managerNotes ?? null,
        bypassedIntake: req.status !== 'PENDING_APPROVAL',
      } as never,
    },
  })

  // Calendar sync (best-effort)
  await syncApprovalToCalendar(updated.id)

  // Notify employee
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
      requestUrl: `${baseUrl()}/admin/pto/${reloaded.id}`,
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
  ensureApprovable(req.status)

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
      details: { managerNotes: p.managerNotes ?? null } as never,
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
    requestUrl: `${baseUrl()}/admin/pto/${req.id}`,
  })
  await sendEmail({ to: [req.employeeEmail], subject, html, text })
  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: { employeeNotifiedAt: new Date() },
  })

  return prisma.timeOffRequest.findUnique({ where: { id: req.id } })
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

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
      details: { wasApproved } as never,
    },
  })

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
// Post-approval: mark PTO as entered in Gusto manually
// ---------------------------------------------------------------------------

export async function markRecordedInGusto(params: {
  requestId: string
  actorStaffId: string
  actorEmail: string
  actorName: string
  recorded: boolean
}) {
  const req = await prisma.timeOffRequest.findUnique({ where: { id: params.requestId } })
  if (!req) throw new Error('Request not found')
  if (req.status !== 'APPROVED') throw new Error('Only approved requests can be marked as recorded')

  await prisma.timeOffRequest.update({
    where: { id: req.id },
    data: params.recorded
      ? {
          gustoRecordedAt: new Date(),
          gustoRecordedByStaffId: params.actorStaffId,
          gustoRecordedByName: params.actorName,
        }
      : {
          gustoRecordedAt: null,
          gustoRecordedByStaffId: null,
          gustoRecordedByName: null,
        },
  })
  await prisma.timeOffAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: params.actorStaffId,
      actorEmail: params.actorEmail,
      actorName: params.actorName,
      action: params.recorded ? 'marked_recorded_in_gusto' : 'unmarked_recorded_in_gusto',
    },
  })
  return prisma.timeOffRequest.findUnique({ where: { id: req.id } })
}

// ---------------------------------------------------------------------------
// Calendar sync (approval)
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

    const sharedEvent = await createCalendarEvent({
      calendarOwner: SHARED_CALENDAR,
      subject,
      body: bodyHtml,
      startDate: startYmd,
      endDate: endYmd,
      isAllDay: true,
      categories: ['PTO', req.kind],
    })

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
        details: { sharedEventId: sharedEvent.id, inviteEventId } as never,
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
        details: { error: msg } as never,
      },
    })
  }
}

export async function retrySyncs(requestId: string): Promise<void> {
  await syncApprovalToCalendar(requestId)
}

// Re-export kind for route convenience
export type { PtoKind }
