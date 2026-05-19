/**
 * Overtime request email templates. Same shell + style as PTO emails.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function shell(subject: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
      <tr><td style="background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Triple Cities Tech – Overtime</h1>
      </td></tr>
      ${body}
      <tr><td style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#64748b;">Triple Cities Tech · <a href="mailto:HumanResources@triplecitiestech.com" style="color:#0891b2;text-decoration:none;">HumanResources@triplecitiestech.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

// ---------------------------------------------------------------------------
// Submission confirmation
// ---------------------------------------------------------------------------

export interface OvertimeSubmittedContext {
  employeeName: string
  workDate: string
  startTime: string | null
  estimatedHours: number
  reason: string
  requestUrl: string
}

export function generateOvertimeSubmittedEmail(ctx: OvertimeSubmittedContext) {
  const subject = `Overtime request submitted — ${fmtDate(ctx.workDate)}`
  // Note: this email goes to the requester themselves (confirmation). The
  // "Approval needed:" prefix is on the intake-assigned / approval-request
  // emails sent to HR / CEO respectively.
  const body = `
      <tr><td style="padding:32px;">
        <p style="margin:0 0 12px;font-size:16px;color:#0f172a;">Hi ${escapeHtml(ctx.employeeName)},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">Your overtime request for <strong>${escapeHtml(fmtDate(ctx.workDate))}</strong>${ctx.startTime ? ` at <strong>${escapeHtml(ctx.startTime)}</strong>` : ''} (~${ctx.estimatedHours.toFixed(2)} hrs) has been submitted. You&apos;ll receive an email once a decision is made.</p>
        <p style="margin:24px 0 0;"><a href="${escapeHtml(ctx.requestUrl)}" style="color:#7c3aed;font-weight:600;text-decoration:none;">View request →</a></p>
      </td></tr>`
  const text = `Overtime request submitted

Date: ${fmtDate(ctx.workDate)}${ctx.startTime ? `\nTime: ${ctx.startTime}` : ''}
Estimated hours: ${ctx.estimatedHours.toFixed(2)}
Reason: ${ctx.reason}

View: ${ctx.requestUrl}`
  return { subject, html: shell(subject, body), text }
}

// ---------------------------------------------------------------------------
// HR intake assignment
// ---------------------------------------------------------------------------

export interface OvertimeIntakeAssignedContext {
  employeeName: string
  employeeEmail: string
  workDate: string
  startTime: string | null
  estimatedHours: number
  reason: string
  reviewUrl: string
}

export function generateOvertimeIntakeAssignedEmail(ctx: OvertimeIntakeAssignedContext) {
  const subject = `Approval needed: Overtime intake for ${ctx.employeeName} — ${fmtDate(ctx.workDate)}`
  const body = `
      <tr><td style="padding:32px;">
        <div style="background:#ede9fe;border:1px solid #7c3aed;padding:14px 16px;border-radius:6px;margin-bottom:20px;">
          <p style="margin:0;color:#5b21b6;font-size:14px;font-weight:600;">Action required: review and forward to final approver</p>
        </div>
        <p style="margin:0 0 12px;font-size:15px;color:#0f172a;">${escapeHtml(ctx.employeeName)} has requested overtime.</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;font-size:14px;">
          <tr><td style="padding:4px 0;color:#475569;width:40%;">Employee</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.employeeName)} &lt;${escapeHtml(ctx.employeeEmail)}&gt;</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Date</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(fmtDate(ctx.workDate))}</td></tr>
          ${ctx.startTime ? `<tr><td style="padding:4px 0;color:#475569;">Time</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.startTime)}</td></tr>` : ''}
          <tr><td style="padding:4px 0;color:#475569;">Estimated hours</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${ctx.estimatedHours.toFixed(2)}</td></tr>
        </table>

        <div style="background:#f8fafc;border-left:3px solid #7c3aed;padding:12px 16px;margin-bottom:20px;border-radius:4px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#5b21b6;">REASON</p>
          <p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.reason)}</p>
        </div>

        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td>
            <a href="${escapeHtml(ctx.reviewUrl)}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;">Open intake form</a>
          </td></tr>
        </table>
      </td></tr>`
  const text = `Overtime intake needed

Employee: ${ctx.employeeName} <${ctx.employeeEmail}>
Date: ${fmtDate(ctx.workDate)}${ctx.startTime ? `\nTime: ${ctx.startTime}` : ''}
Estimated hours: ${ctx.estimatedHours.toFixed(2)}
Reason: ${ctx.reason}

Open intake: ${ctx.reviewUrl}`
  return { subject, html: shell(subject, body), text }
}

// ---------------------------------------------------------------------------
// Final-approver notification
// ---------------------------------------------------------------------------

export interface OvertimeApprovalRequestContext {
  employeeName: string
  employeeEmail: string
  workDate: string
  startTime: string | null
  estimatedHours: number
  reason: string
  intake: {
    byName: string | null
    notes: string | null
    skipped: boolean
  }
  reviewUrl: string
}

export function generateOvertimeApprovalRequestEmail(ctx: OvertimeApprovalRequestContext) {
  const subject = `Approval needed: Overtime for ${ctx.employeeName} — ${fmtDate(ctx.workDate)}`
  const intakeBlock = ctx.intake.skipped
    ? `<div style="background:#fff7ed;border-left:3px solid #f97316;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0;color:#0f172a;font-size:14px;"><strong>Intake skipped.</strong></p></div>`
    : ctx.intake.notes || ctx.intake.byName
    ? `<div style="background:#f8fafc;padding:16px;border-radius:6px;margin-bottom:16px;">
         <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#475569;">INTAKE NOTES${ctx.intake.byName ? ` — from ${escapeHtml(ctx.intake.byName)}` : ''}</p>
         <p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.intake.notes ?? '(no notes)')}</p>
       </div>`
    : ''

  const body = `
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 16px;font-size:18px;color:#0f172a;">Overtime request for review</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;font-size:14px;">
          <tr><td style="padding:4px 0;color:#475569;width:40%;">Employee</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.employeeName)} &lt;${escapeHtml(ctx.employeeEmail)}&gt;</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Date</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(fmtDate(ctx.workDate))}</td></tr>
          ${ctx.startTime ? `<tr><td style="padding:4px 0;color:#475569;">Time</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.startTime)}</td></tr>` : ''}
          <tr><td style="padding:4px 0;color:#475569;">Estimated hours</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${ctx.estimatedHours.toFixed(2)}</td></tr>
        </table>

        <div style="background:#f8fafc;border-left:3px solid #94a3b8;padding:12px 16px;margin-bottom:16px;border-radius:4px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">REASON</p>
          <p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.reason)}</p>
        </div>

        ${intakeBlock}

        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td>
            <a href="${escapeHtml(ctx.reviewUrl)}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;">Review request</a>
          </td></tr>
        </table>
      </td></tr>`
  const text = `Overtime request for review

Employee: ${ctx.employeeName} <${ctx.employeeEmail}>
Date: ${fmtDate(ctx.workDate)}${ctx.startTime ? `\nTime: ${ctx.startTime}` : ''}
Estimated hours: ${ctx.estimatedHours.toFixed(2)}
Reason: ${ctx.reason}
${ctx.intake.notes ? `\nIntake notes${ctx.intake.byName ? ` (${ctx.intake.byName})` : ''}: ${ctx.intake.notes}` : ''}

Review: ${ctx.reviewUrl}`
  return { subject, html: shell(subject, body), text }
}

// ---------------------------------------------------------------------------
// Decision emails
// ---------------------------------------------------------------------------

export interface OvertimeDecisionContext {
  employeeName: string
  workDate: string
  startTime: string | null
  estimatedHours: number
  managerName: string
  managerNotes: string | null
  requestUrl: string
}

export function generateOvertimeApprovedEmail(ctx: OvertimeDecisionContext) {
  const subject = `Approved: Overtime request — ${fmtDate(ctx.workDate)}`
  const body = `
      <tr><td style="padding:32px;">
        <div style="background:#d1fae5;border:1px solid #10b981;padding:16px;border-radius:6px;margin-bottom:20px;text-align:center;">
          <p style="margin:0;color:#065f46;font-size:18px;font-weight:700;">Approved</p>
        </div>
        <p style="margin:0 0 12px;font-size:16px;color:#0f172a;">Hi ${escapeHtml(ctx.employeeName)},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">Your overtime request for <strong>${escapeHtml(fmtDate(ctx.workDate))}</strong>${ctx.startTime ? ` at <strong>${escapeHtml(ctx.startTime)}</strong>` : ''} (~${ctx.estimatedHours.toFixed(2)} hrs) has been approved by ${escapeHtml(ctx.managerName)}. Please complete the work as planned — HR will record it in payroll.</p>
        ${ctx.managerNotes ? `<div style="background:#f8fafc;border-left:3px solid #7c3aed;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">MANAGER NOTES</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.managerNotes)}</p></div>` : ''}
        <p style="margin:24px 0 0;"><a href="${escapeHtml(ctx.requestUrl)}" style="color:#7c3aed;font-weight:600;text-decoration:none;">View request details →</a></p>
      </td></tr>`
  const text = `Your overtime request is approved.

Date: ${fmtDate(ctx.workDate)}${ctx.startTime ? `\nTime: ${ctx.startTime}` : ''}
Hours: ${ctx.estimatedHours.toFixed(2)}
Approved by: ${ctx.managerName}
${ctx.managerNotes ? `\nManager notes: ${ctx.managerNotes}\n` : ''}
Details: ${ctx.requestUrl}`
  return { subject, html: shell(subject, body), text }
}

export function generateOvertimeDeniedEmail(ctx: OvertimeDecisionContext) {
  const subject = `Denied: Overtime request — ${fmtDate(ctx.workDate)}`
  const body = `
      <tr><td style="padding:32px;">
        <div style="background:#fee2e2;border:1px solid #ef4444;padding:16px;border-radius:6px;margin-bottom:20px;text-align:center;">
          <p style="margin:0;color:#991b1b;font-size:18px;font-weight:700;">Not Approved</p>
        </div>
        <p style="margin:0 0 12px;font-size:16px;color:#0f172a;">Hi ${escapeHtml(ctx.employeeName)},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">Your overtime request for <strong>${escapeHtml(fmtDate(ctx.workDate))}</strong> was not approved by ${escapeHtml(ctx.managerName)}. Please reach out if you&apos;d like to discuss.</p>
        ${ctx.managerNotes ? `<div style="background:#f8fafc;border-left:3px solid #ef4444;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">MANAGER NOTES</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.managerNotes)}</p></div>` : ''}
        <p style="margin:24px 0 0;"><a href="${escapeHtml(ctx.requestUrl)}" style="color:#7c3aed;font-weight:600;text-decoration:none;">View request details →</a></p>
      </td></tr>`
  const text = `Your overtime request was not approved.

Date: ${fmtDate(ctx.workDate)}
Decided by: ${ctx.managerName}
${ctx.managerNotes ? `\nManager notes: ${ctx.managerNotes}\n` : ''}
Details: ${ctx.requestUrl}`
  return { subject, html: shell(subject, body), text }
}

// ---------------------------------------------------------------------------
// REACTIVE / NOTIFICATION FLOW (work already happened)
// ---------------------------------------------------------------------------

export interface ReactiveOvertimeSubmittedContext {
  employeeName: string
  employeeEmail: string
  workDate: string
  startTime: string | null
  endTime: string | null
  actualHours: number
  reactiveReason: string
  incidentContext: string
  lateSubmission: boolean
  lateReason: string | null
  reviewUrl: string
}

/**
 * Sent to HR + CEO when an employee logs reactive overtime. Subject "FYI:".
 * No approval needed — HR records and CEO is informed.
 */
export function generateReactiveOvertimeSubmittedEmail(ctx: ReactiveOvertimeSubmittedContext) {
  const subject = `FYI: Reactive overtime — ${ctx.employeeName} (${fmtDate(ctx.workDate)})`
  const body = `
      <tr><td style="padding:32px;">
        <div style="background:#ede9fe;border:1px solid #7c3aed;padding:14px 16px;border-radius:6px;margin-bottom:20px;">
          <p style="margin:0;color:#5b21b6;font-size:14px;font-weight:600;">Informational — work has already been performed. HR will record to payroll.</p>
        </div>
        <p style="margin:0 0 12px;font-size:15px;color:#0f172a;"><strong>${escapeHtml(ctx.employeeName)}</strong> has logged reactive overtime.</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;font-size:14px;">
          <tr><td style="padding:4px 0;color:#475569;width:40%;">Employee</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.employeeName)} &lt;${escapeHtml(ctx.employeeEmail)}&gt;</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Date</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(fmtDate(ctx.workDate))}</td></tr>
          ${ctx.startTime ? `<tr><td style="padding:4px 0;color:#475569;">Start</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.startTime)}</td></tr>` : ''}
          ${ctx.endTime ? `<tr><td style="padding:4px 0;color:#475569;">End</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.endTime)}</td></tr>` : ''}
          <tr><td style="padding:4px 0;color:#475569;">Actual hours</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${ctx.actualHours.toFixed(2)}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Reason</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.reactiveReason)}</td></tr>
        </table>

        <div style="background:#f8fafc;border-left:3px solid #7c3aed;padding:12px 16px;margin-bottom:16px;border-radius:4px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#5b21b6;">INCIDENT CONTEXT</p>
          <p style="margin:0;color:#0f172a;font-size:14px;white-space:pre-wrap;">${escapeHtml(ctx.incidentContext)}</p>
        </div>

        ${ctx.lateSubmission ? `<div style="background:#fef3c7;border:1px solid #d97706;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#92400e;">⚠ LATE SUBMISSION (over 24 hours)</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.lateReason ?? '')}</p></div>` : ''}

        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>
          <a href="${escapeHtml(ctx.reviewUrl)}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;">View details</a>
        </td></tr></table>
      </td></tr>`
  const text = `FYI: Reactive overtime logged by ${ctx.employeeName}

Date: ${fmtDate(ctx.workDate)}${ctx.startTime ? `\nStart: ${ctx.startTime}` : ''}${ctx.endTime ? `\nEnd: ${ctx.endTime}` : ''}
Actual hours: ${ctx.actualHours.toFixed(2)}
Reason: ${ctx.reactiveReason}

Incident context:
${ctx.incidentContext}
${ctx.lateSubmission ? `\n⚠ LATE SUBMISSION (over 24 hours): ${ctx.lateReason ?? ''}\n` : ''}
Details: ${ctx.reviewUrl}`
  return { subject, html: shell(subject, body), text }
}

export interface ReactiveOvertimeRecordedContext {
  employeeName: string
  workDate: string
  actualHours: number
  hrName: string
  hrNotes: string | null
  requestUrl: string
}

/**
 * Sent to the requester when HR records the reactive OT. Subject "Recorded:".
 */
export function generateReactiveOvertimeRecordedEmail(ctx: ReactiveOvertimeRecordedContext) {
  const subject = `Recorded: Reactive overtime — ${fmtDate(ctx.workDate)}`
  const body = `
      <tr><td style="padding:32px;">
        <div style="background:#d1fae5;border:1px solid #10b981;padding:16px;border-radius:6px;margin-bottom:20px;text-align:center;">
          <p style="margin:0;color:#065f46;font-size:18px;font-weight:700;">Recorded for payroll</p>
        </div>
        <p style="margin:0 0 12px;font-size:16px;color:#0f172a;">Hi ${escapeHtml(ctx.employeeName)},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">
          ${escapeHtml(ctx.hrName)} has recorded your reactive overtime on <strong>${escapeHtml(fmtDate(ctx.workDate))}</strong> (${ctx.actualHours.toFixed(2)} hrs) for payroll.
        </p>
        ${ctx.hrNotes ? `<div style="background:#f8fafc;border-left:3px solid #94a3b8;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">HR NOTES</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.hrNotes)}</p></div>` : ''}
        <p style="margin:24px 0 0;"><a href="${escapeHtml(ctx.requestUrl)}" style="color:#7c3aed;font-weight:600;text-decoration:none;">View details →</a></p>
      </td></tr>`
  const text = `Recorded: Reactive overtime

Hi ${ctx.employeeName},

${ctx.hrName} has recorded your reactive overtime on ${fmtDate(ctx.workDate)} (${ctx.actualHours.toFixed(2)} hrs) for payroll.
${ctx.hrNotes ? `\nHR notes: ${ctx.hrNotes}\n` : ''}
Details: ${ctx.requestUrl}`
  return { subject, html: shell(subject, body), text }
}

export interface OvertimeFlagContext {
  employeeName: string
  workDate: string
  actualHours: number
  flagReason: string
  hrName: string
  requestUrl: string
}

/**
 * Sent to CEO when HR flags a reactive OT for review. Subject "Review requested:".
 * OT is still recorded and paid — this is just for visibility.
 */
export function generateOvertimeFlagEmail(ctx: OvertimeFlagContext) {
  const subject = `Review requested: Reactive overtime flagged — ${ctx.employeeName} (${fmtDate(ctx.workDate)})`
  const body = `
      <tr><td style="padding:32px;">
        <div style="background:#fee2e2;border:1px solid #ef4444;padding:14px 16px;border-radius:6px;margin-bottom:20px;">
          <p style="margin:0;color:#991b1b;font-size:14px;font-weight:600;">HR has flagged this for your visibility. The OT has been recorded and will be paid — this does not block anything.</p>
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;font-size:14px;">
          <tr><td style="padding:4px 0;color:#475569;width:40%;">Employee</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.employeeName)}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Date</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(fmtDate(ctx.workDate))}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Hours</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${ctx.actualHours.toFixed(2)}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Flagged by</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.hrName)}</td></tr>
        </table>
        <div style="background:#f8fafc;border-left:3px solid #ef4444;padding:12px 16px;margin-bottom:20px;border-radius:4px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">FLAG REASON</p>
          <p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.flagReason)}</p>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>
          <a href="${escapeHtml(ctx.requestUrl)}" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;">Review and acknowledge</a>
        </td></tr></table>
      </td></tr>`
  const text = `Review requested: Reactive overtime flagged

Employee: ${ctx.employeeName}
Date: ${fmtDate(ctx.workDate)}
Hours: ${ctx.actualHours.toFixed(2)}
Flagged by: ${ctx.hrName}

Flag reason: ${ctx.flagReason}

For your visibility — the OT has been recorded and will be paid. Acknowledge: ${ctx.requestUrl}`
  return { subject, html: shell(subject, body), text }
}
