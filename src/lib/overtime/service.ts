/**
 * Overtime workflow service. Mirrors the PTO two-stage pipeline but
 * without coverage / calendar steps and with payroll-recorded as the
 * close-out instead of Gusto-recorded.
 */

import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { hasPermission, parseOverrides } from '@/lib/permissions'
import type { StaffRole } from '@prisma/client'
import { getHrGroupMembers } from '@/lib/graph-tct'
import {
  generateOvertimeApprovalRequestEmail,
  generateOvertimeApprovedEmail,
  generateOvertimeDeniedEmail,
  generateOvertimeIntakeAssignedEmail,
  generateOvertimeSubmittedEmail,
} from '@/lib/email-templates/overtime'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = process.env.PTO_FROM_EMAIL || 'HumanResources@triplecitiestech.com'
const FROM_NAME = process.env.PTO_FROM_NAME || 'Triple Cities Tech HR'
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
  if (!resend) return { ok: false, error: 'resend_not_configured' }
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

async function staffEmailsWithPermission(permission: 'overtime_intake' | 'approve_overtime'): Promise<string[]> {
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

async function resolveIntakeEmails(): Promise<string[]> {
  const set = new Set<string>()
  const direct = await staffEmailsWithPermission('overtime_intake')
  for (const e of direct) set.add(e)
  if (set.size === 0) {
    try {
      const members = await getHrGroupMembers()
      for (const m of members) if (m.mail) set.add(m.mail.toLowerCase())
    } catch {
      /* ignore */
    }
  }
  return Array.from(set)
}

async function resolveApproverEmails(): Promise<string[]> {
  const set = new Set<string>()
  const direct = await staffEmailsWithPermission('approve_overtime')
  for (const e of direct) set.add(e)
  if (set.size === 0) {
    try {
      const members = await getHrGroupMembers()
      for (const m of members) if (m.mail) set.add(m.mail.toLowerCase())
    } catch {
      /* ignore */
    }
  }
  if (FALLBACK_APPROVER) set.add(FALLBACK_APPROVER.toLowerCase())
  return Array.from(set)
}

// ---------------------------------------------------------------------------

export async function notifyOvertimeSubmitter(requestId: string): Promise<void> {
  const req = await prisma.overtimeRequest.findUnique({ where: { id: requestId } })
  if (!req) return
  const { subject, html, text } = generateOvertimeSubmittedEmail({
    employeeName: req.employeeName,
    workDate: ymd(req.workDate),
    startTime: req.startTime,
    estimatedHours: Number(req.estimatedHours),
    reason: req.reason,
    requestUrl: `${baseUrl()}/admin/overtime/${req.id}`,
  })
  await sendEmail({ to: [req.employeeEmail], subject, html, text })
  await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: { submitterNotifiedAt: new Date() },
  })
}

export async function notifyOvertimeIntakeTeam(requestId: string): Promise<void> {
  const req = await prisma.overtimeRequest.findUnique({ where: { id: requestId } })
  if (!req) return
  const { subject, html, text } = generateOvertimeIntakeAssignedEmail({
    employeeName: req.employeeName,
    employeeEmail: req.employeeEmail,
    workDate: ymd(req.workDate),
    startTime: req.startTime,
    estimatedHours: Number(req.estimatedHours),
    reason: req.reason,
    reviewUrl: `${baseUrl()}/admin/overtime/${req.id}`,
  })
  const recipients = await resolveIntakeEmails()
  const send = await sendEmail({ to: recipients, subject, html, text, replyTo: req.employeeEmail })
  await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: { intakeNotifiedAt: new Date() },
  })
  await prisma.overtimeAuditLog.create({
    data: {
      requestId: req.id,
      actorEmail: 'system',
      action: 'notify_intake',
      details: { recipients, result: send } as never,
    },
  })
}

export async function notifyOvertimeFinalApprovers(requestId: string): Promise<void> {
  const req = await prisma.overtimeRequest.findUnique({ where: { id: requestId } })
  if (!req) return
  const { subject, html, text } = generateOvertimeApprovalRequestEmail({
    employeeName: req.employeeName,
    employeeEmail: req.employeeEmail,
    workDate: ymd(req.workDate),
    startTime: req.startTime,
    estimatedHours: Number(req.estimatedHours),
    reason: req.reason,
    intake: {
      byName: req.intakeByName,
      notes: req.intakeNotes,
      skipped: req.intakeSkipped,
    },
    reviewUrl: `${baseUrl()}/admin/overtime/${req.id}`,
  })
  const approvers = await resolveApproverEmails()
  const send = await sendEmail({ to: approvers, subject, html, text, replyTo: req.employeeEmail })
  await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: { approversNotifiedAt: new Date() },
  })
  await prisma.overtimeAuditLog.create({
    data: {
      requestId: req.id,
      actorEmail: 'system',
      action: 'notify_approvers',
      details: { recipients: approvers, result: send } as never,
    },
  })
}

// ---------------------------------------------------------------------------
// Workflow actions
// ---------------------------------------------------------------------------

function ensureApprovable(status: string) {
  if (status === 'PENDING_APPROVAL' || status === 'PENDING_INTAKE') return
  throw new Error(`Request is already ${status}`)
}

export async function completeOvertimeIntake(p: {
  requestId: string
  actorStaffId: string
  actorEmail: string
  actorName: string
  notes: string | null
}) {
  const req = await prisma.overtimeRequest.findUnique({ where: { id: p.requestId } })
  if (!req) throw new Error('Request not found')
  if (req.status !== 'PENDING_INTAKE') throw new Error(`Request is already ${req.status}`)

  const updated = await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: {
      status: 'PENDING_APPROVAL',
      intakeByStaffId: p.actorStaffId,
      intakeByName: p.actorName,
      intakeAt: new Date(),
      intakeNotes: p.notes,
      intakeSkipped: false,
    },
  })
  await prisma.overtimeAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: p.actorStaffId,
      actorEmail: p.actorEmail,
      actorName: p.actorName,
      action: 'intake_completed',
      details: { notes: p.notes } as never,
    },
  })
  notifyOvertimeFinalApprovers(req.id).catch((err) =>
    console.error('[overtime] notifyFinalApprovers failed:', err)
  )
  return prisma.overtimeRequest.findUnique({ where: { id: updated.id } })
}

export async function skipOvertimeIntake(p: {
  requestId: string
  actorStaffId: string
  actorEmail: string
  actorName: string
}) {
  const req = await prisma.overtimeRequest.findUnique({ where: { id: p.requestId } })
  if (!req) throw new Error('Request not found')
  if (req.status !== 'PENDING_INTAKE') throw new Error(`Cannot skip — request is ${req.status}`)
  await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: { status: 'PENDING_APPROVAL', intakeSkipped: true },
  })
  await prisma.overtimeAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: p.actorStaffId,
      actorEmail: p.actorEmail,
      actorName: p.actorName,
      action: 'intake_skipped',
    },
  })
  return prisma.overtimeRequest.findUnique({ where: { id: req.id } })
}

export async function approveOvertimeRequest(p: {
  requestId: string
  reviewerStaffId: string
  reviewerEmail: string
  reviewerName: string
  managerNotes: string | null
}) {
  const req = await prisma.overtimeRequest.findUnique({ where: { id: p.requestId } })
  if (!req) throw new Error('Request not found')
  ensureApprovable(req.status)

  const extras = req.status === 'PENDING_INTAKE' ? { intakeSkipped: true } : {}
  const updated = await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: {
      status: 'APPROVED',
      reviewedByStaffId: p.reviewerStaffId,
      reviewedByName: p.reviewerName,
      reviewedAt: new Date(),
      managerNotes: p.managerNotes,
      ...extras,
    },
  })
  await prisma.overtimeAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: p.reviewerStaffId,
      actorEmail: p.reviewerEmail,
      actorName: p.reviewerName,
      action: 'approved',
      details: { managerNotes: p.managerNotes } as never,
    },
  })
  const { subject, html, text } = generateOvertimeApprovedEmail({
    employeeName: req.employeeName,
    workDate: ymd(req.workDate),
    startTime: req.startTime,
    estimatedHours: Number(req.estimatedHours),
    managerName: p.reviewerName,
    managerNotes: p.managerNotes,
    requestUrl: `${baseUrl()}/admin/overtime/${req.id}`,
  })
  await sendEmail({ to: [req.employeeEmail], subject, html, text })
  await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: { employeeNotifiedAt: new Date() },
  })
  return prisma.overtimeRequest.findUnique({ where: { id: updated.id } })
}

export async function denyOvertimeRequest(p: {
  requestId: string
  reviewerStaffId: string
  reviewerEmail: string
  reviewerName: string
  managerNotes: string | null
}) {
  const req = await prisma.overtimeRequest.findUnique({ where: { id: p.requestId } })
  if (!req) throw new Error('Request not found')
  ensureApprovable(req.status)
  await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: {
      status: 'DENIED',
      reviewedByStaffId: p.reviewerStaffId,
      reviewedByName: p.reviewerName,
      reviewedAt: new Date(),
      managerNotes: p.managerNotes,
    },
  })
  await prisma.overtimeAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: p.reviewerStaffId,
      actorEmail: p.reviewerEmail,
      actorName: p.reviewerName,
      action: 'denied',
      details: { managerNotes: p.managerNotes } as never,
    },
  })
  const { subject, html, text } = generateOvertimeDeniedEmail({
    employeeName: req.employeeName,
    workDate: ymd(req.workDate),
    startTime: req.startTime,
    estimatedHours: Number(req.estimatedHours),
    managerName: p.reviewerName,
    managerNotes: p.managerNotes,
    requestUrl: `${baseUrl()}/admin/overtime/${req.id}`,
  })
  await sendEmail({ to: [req.employeeEmail], subject, html, text })
  await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: { employeeNotifiedAt: new Date() },
  })
  return prisma.overtimeRequest.findUnique({ where: { id: req.id } })
}

export async function cancelOvertimeRequest(p: {
  requestId: string
  actorStaffId: string
  actorEmail: string
  actorName: string
}) {
  const req = await prisma.overtimeRequest.findUnique({ where: { id: p.requestId } })
  if (!req) throw new Error('Request not found')
  if (req.status === 'CANCELLED') return req
  await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: { status: 'CANCELLED' },
  })
  await prisma.overtimeAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: p.actorStaffId,
      actorEmail: p.actorEmail,
      actorName: p.actorName,
      action: 'cancelled',
    },
  })
  return prisma.overtimeRequest.findUnique({ where: { id: req.id } })
}

export async function markOvertimeRecordedInPayroll(p: {
  requestId: string
  actorStaffId: string
  actorEmail: string
  actorName: string
  recorded: boolean
  actualHoursWorked?: number | null
}) {
  const req = await prisma.overtimeRequest.findUnique({ where: { id: p.requestId } })
  if (!req) throw new Error('Request not found')
  if (req.status !== 'APPROVED') throw new Error('Only approved overtime can be marked as recorded')

  await prisma.overtimeRequest.update({
    where: { id: req.id },
    data: p.recorded
      ? {
          payrollRecordedAt: new Date(),
          payrollRecordedByStaffId: p.actorStaffId,
          payrollRecordedByName: p.actorName,
          ...(typeof p.actualHoursWorked === 'number'
            ? { actualHoursWorked: p.actualHoursWorked }
            : {}),
        }
      : {
          payrollRecordedAt: null,
          payrollRecordedByStaffId: null,
          payrollRecordedByName: null,
        },
  })
  await prisma.overtimeAuditLog.create({
    data: {
      requestId: req.id,
      actorStaffId: p.actorStaffId,
      actorEmail: p.actorEmail,
      actorName: p.actorName,
      action: p.recorded ? 'marked_recorded_in_payroll' : 'unmarked_recorded_in_payroll',
      details: { actualHoursWorked: p.actualHoursWorked ?? null } as never,
    },
  })
  return prisma.overtimeRequest.findUnique({ where: { id: req.id } })
}
