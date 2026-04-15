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
  const subject = `Overtime intake needed: ${ctx.employeeName} — ${fmtDate(ctx.workDate)}`
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
  const subject = `Overtime request: ${ctx.employeeName} — ${fmtDate(ctx.workDate)}`
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
  const subject = `Your overtime request is approved — ${fmtDate(ctx.workDate)}`
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
  const subject = `Your overtime request was not approved — ${fmtDate(ctx.workDate)}`
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
