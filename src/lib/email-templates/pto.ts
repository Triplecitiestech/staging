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
// Coverage request email (sent to the teammate the employee picked)
// ---------------------------------------------------------------------------

export interface CoverageRequestEmailContext {
  employeeName: string
  employeeEmail: string
  covererName: string
  kind: string
  startDate: string
  endDate: string
  totalHours: number
  notes: string | null
  respondUrl: string
}

export function generateCoverageRequestEmail(ctx: CoverageRequestEmailContext): {
  subject: string
  html: string
  text: string
} {
  const subject = `Can you cover for ${ctx.employeeName}? ${formatDateRange(ctx.startDate, ctx.endDate)}`
  const body = `
      <tr><td style="padding:32px;">
        <p style="margin:0 0 12px;font-size:16px;color:#0f172a;">Hi ${escapeHtml(ctx.covererName)},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">
          <strong>${escapeHtml(ctx.employeeName)}</strong> has requested time off and listed you as coverage. Please accept or decline below — HR will see your response before deciding on the request.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;font-size:14px;">
          <tr><td style="padding:4px 0;color:#475569;width:40%;">Out</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.employeeName)}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Type</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.kind)}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Dates</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(formatDateRange(ctx.startDate, ctx.endDate))}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Hours</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${ctx.totalHours.toFixed(2)}</td></tr>
        </table>

        ${ctx.notes ? `<div style="background:#f8fafc;border-left:3px solid #94a3b8;padding:12px 16px;margin-bottom:20px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">NOTES FROM ${escapeHtml(ctx.employeeName.toUpperCase())}</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.notes)}</p></div>` : ''}

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">
          <tr>
            <td style="padding-right:10px;">
              <a href="${escapeHtml(ctx.respondUrl)}" style="display:inline-block;background:#10b981;color:#ffffff;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;">Accept or Decline</a>
            </td>
          </tr>
        </table>
        <p style="margin:0;font-size:12px;color:#94a3b8;">If the button doesn&apos;t work, copy this URL into your browser:<br/>${escapeHtml(ctx.respondUrl)}</p>
      </td></tr>`
  const text = `Coverage request for ${ctx.employeeName}

${ctx.employeeName} has asked you to cover their work while they're out.

Type: ${ctx.kind}
Dates: ${formatDateRange(ctx.startDate, ctx.endDate)}
Hours: ${ctx.totalHours.toFixed(2)}
${ctx.notes ? `\nNotes: ${ctx.notes}\n` : ''}
Please accept or decline here: ${ctx.respondUrl}`
  return { subject, html: shell(subject, body), text }
}

// ---------------------------------------------------------------------------
// HR notification when covering employee responds
// ---------------------------------------------------------------------------

export interface CoverageResponseEmailContext {
  employeeName: string
  covererName: string
  response: 'accepted' | 'declined'
  responseNotes: string | null
  kind: string
  startDate: string
  endDate: string
  reviewUrl: string
}

export function generateCoverageResponseEmail(ctx: CoverageResponseEmailContext): {
  subject: string
  html: string
  text: string
} {
  const verb = ctx.response === 'accepted' ? 'accepted' : 'declined'
  const colour = ctx.response === 'accepted' ? '#10b981' : '#ef4444'
  const tintBg = ctx.response === 'accepted' ? '#d1fae5' : '#fee2e2'
  const tintBorder = ctx.response === 'accepted' ? '#065f46' : '#991b1b'
  const subject = `Coverage ${verb}: ${ctx.covererName} for ${ctx.employeeName} — ${formatDateRange(ctx.startDate, ctx.endDate)}`
  const body = `
      <tr><td style="padding:32px;">
        <div style="background:${tintBg};border:1px solid ${colour};padding:14px 16px;border-radius:6px;margin-bottom:20px;text-align:center;">
          <p style="margin:0;color:${tintBorder};font-size:16px;font-weight:700;">Coverage ${verb.charAt(0).toUpperCase() + verb.slice(1)}</p>
        </div>
        <p style="margin:0 0 12px;font-size:14px;color:#0f172a;"><strong>${escapeHtml(ctx.covererName)}</strong> has ${verb} coverage for <strong>${escapeHtml(ctx.employeeName)}</strong>&apos;s ${escapeHtml(ctx.kind.toLowerCase())} request on ${escapeHtml(formatDateRange(ctx.startDate, ctx.endDate))}.</p>
        ${ctx.responseNotes ? `<div style="background:#f8fafc;border-left:3px solid #0891b2;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">COVERER NOTES</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.responseNotes)}</p></div>` : ''}
        <p style="margin:16px 0 0;"><a href="${escapeHtml(ctx.reviewUrl)}" style="color:#0891b2;font-weight:600;text-decoration:none;">Open the request →</a></p>
      </td></tr>`
  const text = `Coverage ${verb}

${ctx.covererName} has ${verb} coverage for ${ctx.employeeName}'s ${ctx.kind.toLowerCase()} request on ${formatDateRange(ctx.startDate, ctx.endDate)}.
${ctx.responseNotes ? `\nCoverer notes: ${ctx.responseNotes}\n` : ''}
Open: ${ctx.reviewUrl}`
  return { subject, html: shell(subject, body), text }
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
  coverageApproval: {
    staffName: string | null
    staffEmail: string | null
    response: string | null  // 'pending' | 'accepted' | 'declined' | null
    responseNotes: string | null
    respondedAt: string | null
  } | null
  intake: {
    byName: string | null
    lastTimeOffNotes: string | null
    balanceNotes: string | null
    coverageConfirmed: boolean | null
    coverageNotes: string | null
    additionalNotes: string | null
    skipped: boolean
  }
  recentRequests: Array<{ kind: string; startDate: string; endDate: string; status: string }>
  reviewUrl: string
}

export function generateHrApprovalEmail(ctx: ApprovalEmailContext): {
  subject: string
  html: string
  text: string
} {
  const subject = `PTO Request: ${ctx.employeeName} — ${formatDateRange(ctx.startDate, ctx.endDate)}`

  const intakeRow = (label: string, value: string | null) =>
    value && value.trim()
      ? `<tr><td style="padding:6px 12px 6px 0;color:#475569;vertical-align:top;width:40%;">${label}</td><td style="padding:6px 0;color:#0f172a;">${escapeHtml(
          value
        )}</td></tr>`
      : ''

  const intakeBlock = ctx.intake.skipped
    ? `<div style="background:#fff7ed;border-left:3px solid #f97316;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0;color:#0f172a;font-size:14px;"><strong>Intake skipped.</strong> No HR context was gathered before forwarding.</p></div>`
    : `<div style="background:#f8fafc;padding:16px;border-radius:6px;margin-bottom:16px;">
         <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#475569;">INTAKE CONTEXT${
           ctx.intake.byName ? ` — from ${escapeHtml(ctx.intake.byName)}` : ''
         }</p>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
           ${intakeRow('PTO balance', ctx.intake.balanceNotes)}
           ${intakeRow('Last time off', ctx.intake.lastTimeOffNotes)}
           ${intakeRow(
             'Coverage confirmed',
             ctx.intake.coverageConfirmed === true
               ? `Yes${ctx.intake.coverageNotes ? ` — ${ctx.intake.coverageNotes}` : ''}`
               : ctx.intake.coverageConfirmed === false
               ? `No${ctx.intake.coverageNotes ? ` — ${ctx.intake.coverageNotes}` : ''}`
               : ctx.intake.coverageNotes
           )}
           ${intakeRow('Additional notes', ctx.intake.additionalNotes)}
         </table>
       </div>`

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
          ctx.coverageApproval && ctx.coverageApproval.staffName
            ? (() => {
                const ca = ctx.coverageApproval!
                const r = ca.response
                const headerBg =
                  r === 'accepted' ? '#d1fae5' : r === 'declined' ? '#fee2e2' : '#fef3c7'
                const headerBorder =
                  r === 'accepted' ? '#10b981' : r === 'declined' ? '#ef4444' : '#f59e0b'
                const label =
                  r === 'accepted'
                    ? '✓ ACCEPTED'
                    : r === 'declined'
                    ? '✕ DECLINED'
                    : '⏳ PENDING RESPONSE'
                return `<div style="background:${headerBg};border:1px solid ${headerBorder};padding:12px 16px;margin-bottom:16px;border-radius:4px;">
                  <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#0f172a;">COVERAGE: ${label}</p>
                  <p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(
                    ca.staffName ?? ''
                  )}${ca.staffEmail ? ` &lt;${escapeHtml(ca.staffEmail)}&gt;` : ''}</p>
                  ${ca.responseNotes ? `<p style="margin:6px 0 0;color:#334155;font-size:13px;"><em>${escapeHtml(ca.responseNotes)}</em></p>` : ''}
                </div>`
              })()
            : ctx.coverage
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

        ${intakeBlock}

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

Intake context${ctx.intake.byName ? ` (from ${ctx.intake.byName})` : ''}:
${ctx.intake.skipped ? '  (intake was skipped)' : ''}${
    ctx.intake.balanceNotes ? `\n  PTO balance: ${ctx.intake.balanceNotes}` : ''
  }${ctx.intake.lastTimeOffNotes ? `\n  Last time off: ${ctx.intake.lastTimeOffNotes}` : ''}${
    ctx.intake.coverageConfirmed !== null
      ? `\n  Coverage confirmed: ${ctx.intake.coverageConfirmed ? 'Yes' : 'No'}${
          ctx.intake.coverageNotes ? ` — ${ctx.intake.coverageNotes}` : ''
        }`
      : ''
  }${ctx.intake.additionalNotes ? `\n  Additional notes: ${ctx.intake.additionalNotes}` : ''}

Recent requests:
${ctx.recentRequests
  .slice(0, 5)
  .map((r) => `  ${r.kind} · ${formatDateRange(r.startDate, r.endDate)} (${r.status})`)
  .join('\n') || '  (none)'}

Review: ${ctx.reviewUrl}`

  return { subject, html: shell(subject, body), text }
}

// ---------------------------------------------------------------------------
// HR intake assignment email (sent when a new request needs context)
// ---------------------------------------------------------------------------

export interface IntakeAssignedEmailContext {
  employeeName: string
  employeeEmail: string
  kind: string
  startDate: string
  endDate: string
  totalHours: number
  notes: string | null
  coverage: string | null
  reviewUrl: string
}

export function generateIntakeAssignedEmail(ctx: IntakeAssignedEmailContext): {
  subject: string
  html: string
  text: string
} {
  const subject = `PTO intake needed: ${ctx.employeeName} — ${formatDateRange(ctx.startDate, ctx.endDate)}`
  const body = `
      <tr><td style="padding:32px;">
        <div style="background:#eff6ff;border:1px solid #3b82f6;padding:14px 16px;border-radius:6px;margin-bottom:20px;">
          <p style="margin:0;color:#1e3a8a;font-size:14px;font-weight:600;">Action required: gather context before forwarding</p>
        </div>
        <p style="margin:0 0 12px;font-size:15px;color:#0f172a;">${escapeHtml(ctx.employeeName)} has submitted a PTO request.</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;font-size:14px;">
          <tr><td style="padding:4px 0;color:#475569;width:40%;">Employee</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.employeeName)} &lt;${escapeHtml(ctx.employeeEmail)}&gt;</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Type</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ctx.kind)}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Dates</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(formatDateRange(ctx.startDate, ctx.endDate))}</td></tr>
          <tr><td style="padding:4px 0;color:#475569;">Total hours</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${ctx.totalHours.toFixed(2)} hrs</td></tr>
        </table>

        ${ctx.coverage ? `<div style="background:#f0f9ff;border-left:3px solid #0ea5e9;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#0369a1;">COVERAGE (from employee)</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.coverage)}</p></div>` : ''}
        ${ctx.notes ? `<div style="background:#f8fafc;border-left:3px solid #94a3b8;padding:12px 16px;margin-bottom:16px;border-radius:4px;"><p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">EMPLOYEE NOTES</p><p style="margin:0;color:#0f172a;font-size:14px;">${escapeHtml(ctx.notes)}</p></div>` : ''}

        <p style="margin:16px 0 24px;color:#475569;font-size:14px;line-height:1.6;">
          Please open the request and fill in:
          <ul style="margin:8px 0 0;padding-left:20px;color:#334155;font-size:14px;">
            <li>Current PTO balance (look up in Gusto)</li>
            <li>Prior time-off history notes</li>
            <li>Coverage confirmation</li>
            <li>Any other context the final approver should know</li>
          </ul>
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr><td>
            <a href="${escapeHtml(ctx.reviewUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;padding:12px 28px;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;">Open intake form</a>
          </td></tr>
        </table>
      </td></tr>`

  const text = `PTO intake needed

Employee: ${ctx.employeeName} <${ctx.employeeEmail}>
Type: ${ctx.kind}
Dates: ${formatDateRange(ctx.startDate, ctx.endDate)}
Total hours: ${ctx.totalHours.toFixed(2)}
${ctx.coverage ? `\nCoverage (employee): ${ctx.coverage}` : ''}${ctx.notes ? `\nEmployee notes: ${ctx.notes}` : ''}

Please open the request and fill in:
  - Current PTO balance (look up in Gusto)
  - Prior time-off history
  - Coverage confirmation
  - Any other context for the final approver

Open intake form: ${ctx.reviewUrl}`

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
