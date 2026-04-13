/**
 * PTO email templates.
 *
 * All templates use light backgrounds with inline styles for email-client
 * compatibility (Outlook / Gmail / Apple Mail).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDateRange(startYmd: string, endYmd: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }
  return startYmd === endYmd ? fmt(startYmd) : `${fmt(startYmd)} – ${fmt(endYmd)}`
}

function shell(subject: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(
    subject
  )}</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
      <tr><td style="background:linear-gradient(135deg,#0891b2 0%,#0e7490 100%);padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Triple Cities Tech – Time Off</h1>
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
// HR approval email
// ---------------------------------------------------------------------------

export interface ApprovalEmailContext {
  employeeName: string
  employeeEmail: string
  kind: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
  totalHours: number
  notes: string | null
  coverage: string | null
  balances: Array<{ policyName: string; balanceHours: number }>
  recentRequests: Array<{ kind: string; startDate: string; endDate: string; status: string }>
  reviewUrl: string
}

export function generateHrApprovalEmail(ctx: ApprovalEmailContext): {
  subject: string
  html: string
  text: string
} {
  const subject = `PTO Request: ${ctx.employeeName} — ${formatDateRange(ctx.startDate, ctx.endDate)}`

  const balancesHtml = ctx.balances.length
    ? ctx.balances
        .map(
          (b) =>
            `<tr><td style="padding:6px 12px 6px 0;color:#475569;">${escapeHtml(
              b.policyName
            )}</td><td style="padding:6px 0;color:#0f172a;font-weight:600;text-align:right;">${b.balanceHours.toFixed(
              2
            )} hrs</td></tr>`
        )
        .join('')
    : '<tr><td colspan="2" style="padding:6px 0;color:#94a3b8;">No balance data</td></tr>'

  const recentHtml = ctx.recentRequests.length
    ? ctx.recentRequests
        .slice(0, 5)
        .map(
          (r) =>
            `<li style="margin-bottom:4px;color:#475569;">${escapeHtml(r.kind)} · ${escapeHtml(
              formatDateRange(r.startDate, r.endDate)
            )} <span style="color:#64748b;">(${escapeHtml(r.status)})</span></li>`
        )
        .join('')
    : '<li style="color:#94a3b8;">No recent requests</li>'

  const body = `
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 16px;font-size:18px;color:#0f172a;">New PTO request for review</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;font-size:14px;">
          <tr><td style="padding:4px 0;color:#475569;width:40%;">Employee</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(
            ctx.employeeName
          )} &lt;${escapeHtml(ctx.employeeEmail)}&gt;</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Type</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(
            ctx.kind
          )}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Dates</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(
            formatDateRange(ctx.startDate, ctx.endDate)
          )}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Total hours</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${ctx.totalHours.toFixed(
            2
          )} hrs</td></tr>
        </table>

        ${
          ctx.coverage
            ? `<div style="background:#f0f9ff;border-left:3px solid #0ea5e9;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#0369a1;">SHIFT COVERAGE</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(
                ctx.coverage
              )}</p></div>`
            : ''
        }

        ${
          ctx.notes
            ? `<div style="background:#f8fafc;border-left:3px solid #94a3b8;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">EMPLOYEE NOTES</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(
                ctx.notes
              )}</p></div>`
            : ''
        }

        <div style="background:#f8fafc;padding:16px;border-radius:6px;margin-bottom:16px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#475569;">CURRENT BALANCES (from Gusto)</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${balancesHtml}</table>
        </div>

        <div style="background:#f8fafc;padding:16px;border-radius:6px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#475569;">RECENT REQUESTS</p>
          <ul style="margin:0;padding-left:18px;font-size:14px;">${recentHtml}</ul>
        </div>

        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td>
            <a href="${escapeHtml(
              ctx.reviewUrl
            )}" style="display:inline-block;background:#0891b2;color:#ffffff;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;">Review request</a>
          </td></tr>
        </table>
      </td></tr>`

  const text = `New PTO request for review

Employee: ${ctx.employeeName} <${ctx.employeeEmail}>
Type: ${ctx.kind}
Dates: ${formatDateRange(ctx.startDate, ctx.endDate)}
Total hours: ${ctx.totalHours.toFixed(2)}
${ctx.coverage ? `\nShift coverage: ${ctx.coverage}` : ''}${ctx.notes ? `\nNotes: ${ctx.notes}` : ''}

Current balances:
${ctx.balances.map((b) => `  ${b.policyName}: ${b.balanceHours.toFixed(2)} hrs`).join('\n') || '  (no data)'}

Recent requests:
${ctx.recentRequests
  .slice(0, 5)
  .map((r) => `  ${r.kind} · ${formatDateRange(r.startDate, r.endDate)} (${r.status})`)
  .join('\n') || '  (none)'}

Review: ${ctx.reviewUrl}`

  return { subject, html: shell(subject, body), text }
}

// ---------------------------------------------------------------------------
// Employee decision emails
// ---------------------------------------------------------------------------

export interface DecisionEmailContext {
  employeeName: string
  kind: string
  startDate: string
  endDate: string
  totalHours: number
  managerNotes: string | null
  managerName: string
  requestUrl: string
}

export function generateApprovalNotificationEmail(ctx: DecisionEmailContext): {
  subject: string
  html: string
  text: string
} {
  const subject = `Your PTO request is approved — ${formatDateRange(ctx.startDate, ctx.endDate)}`
  const body = `
      <tr><td style="padding:32px;">
        <div style="background:#d1fae5;border:1px solid #10b981;padding:16px;border-radius:6px;margin-bottom:20px;text-align:center;">
          <p style="margin:0;color:#065f46;font-size:18px;font-weight:700;">Approved</p>
        </div>
        <p style="margin:0 0 12px;font-size:16px;color:#0f172a;">Hi ${escapeHtml(ctx.employeeName)},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">Your ${escapeHtml(
          ctx.kind.toLowerCase()
        )} request for <strong>${escapeHtml(
          formatDateRange(ctx.startDate, ctx.endDate)
        )}</strong> (${ctx.totalHours.toFixed(2)} hrs) has been approved by ${escapeHtml(
          ctx.managerName
        )}. A calendar invite has been sent separately, and the shared time-off calendar has been updated.</p>
        ${
          ctx.managerNotes
            ? `<div style="background:#f8fafc;border-left:3px solid #0891b2;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">MANAGER NOTES</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(
                ctx.managerNotes
              )}</p></div>`
            : ''
        }
        <p style="margin:24px 0 0;"><a href="${escapeHtml(
          ctx.requestUrl
        )}" style="color:#0891b2;font-weight:600;text-decoration:none;">View request details →</a></p>
      </td></tr>`
  const text = `Your PTO request is approved.

Dates: ${formatDateRange(ctx.startDate, ctx.endDate)}
Hours: ${ctx.totalHours.toFixed(2)}
Approved by: ${ctx.managerName}
${ctx.managerNotes ? `\nManager notes: ${ctx.managerNotes}\n` : ''}
Details: ${ctx.requestUrl}`
  return { subject, html: shell(subject, body), text }
}

export function generateDenialNotificationEmail(ctx: DecisionEmailContext): {
  subject: string
  html: string
  text: string
} {
  const subject = `Your PTO request was not approved — ${formatDateRange(ctx.startDate, ctx.endDate)}`
  const body = `
      <tr><td style="padding:32px;">
        <div style="background:#fee2e2;border:1px solid #ef4444;padding:16px;border-radius:6px;margin-bottom:20px;text-align:center;">
          <p style="margin:0;color:#991b1b;font-size:18px;font-weight:700;">Not Approved</p>
        </div>
        <p style="margin:0 0 12px;font-size:16px;color:#0f172a;">Hi ${escapeHtml(ctx.employeeName)},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">Your ${escapeHtml(
          ctx.kind.toLowerCase()
        )} request for <strong>${escapeHtml(
          formatDateRange(ctx.startDate, ctx.endDate)
        )}</strong> was not approved by ${escapeHtml(
          ctx.managerName
        )}. Please reach out if you'd like to discuss or submit an alternate request.</p>
        ${
          ctx.managerNotes
            ? `<div style="background:#f8fafc;border-left:3px solid #ef4444;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">MANAGER NOTES</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(
                ctx.managerNotes
              )}</p></div>`
            : ''
        }
        <p style="margin:24px 0 0;"><a href="${escapeHtml(
          ctx.requestUrl
        )}" style="color:#0891b2;font-weight:600;text-decoration:none;">View request details →</a></p>
      </td></tr>`
  const text = `Your PTO request was not approved.

Dates: ${formatDateRange(ctx.startDate, ctx.endDate)}
Decided by: ${ctx.managerName}
${ctx.managerNotes ? `\nManager notes: ${ctx.managerNotes}\n` : ''}
Details: ${ctx.requestUrl}`
  return { subject, html: shell(subject, body), text }
}

// ---------------------------------------------------------------------------
// Submitter confirmation email (to the employee who submitted)
// ---------------------------------------------------------------------------

export interface SubmittedEmailContext {
  employeeName: string
  kind: string
  startDate: string
  endDate: string
  totalHours: number
  requestUrl: string
}

export function generateSubmittedConfirmationEmail(
  ctx: SubmittedEmailContext
): { subject: string; html: string; text: string } {
  const subject = `PTO request submitted — ${formatDateRange(ctx.startDate, ctx.endDate)}`
  const body = `
      <tr><td style="padding:32px;">
        <p style="margin:0 0 12px;font-size:16px;color:#0f172a;">Hi ${escapeHtml(ctx.employeeName)},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">Your ${escapeHtml(
          ctx.kind.toLowerCase()
        )} request for <strong>${escapeHtml(
          formatDateRange(ctx.startDate, ctx.endDate)
        )}</strong> (${ctx.totalHours.toFixed(
          2
        )} hrs) has been submitted for review. You'll receive an email once a decision is made.</p>
        <p style="margin:24px 0 0;"><a href="${escapeHtml(
          ctx.requestUrl
        )}" style="color:#0891b2;font-weight:600;text-decoration:none;">View request →</a></p>
      </td></tr>`
  const text = `Your PTO request has been submitted.\n\nDates: ${formatDateRange(
    ctx.startDate,
    ctx.endDate
  )}\nHours: ${ctx.totalHours.toFixed(2)}\n\nView: ${ctx.requestUrl}`
  return { subject, html: shell(subject, body), text }
}
