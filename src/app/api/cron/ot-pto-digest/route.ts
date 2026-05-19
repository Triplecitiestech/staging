/**
 * Friday digest cron — emails the CEO a summary of the week's
 * notification-flow activity. Informational only; no action required.
 *
 * Schedule: Fridays around 4 PM ET (set in vercel.json).
 */

import { cronHandler } from '@/lib/cron-wrapper'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = process.env.PTO_FROM_EMAIL || 'HumanResources@triplecitiestech.com'
const FROM_NAME = process.env.PTO_FROM_NAME || 'Triple Cities Tech HR'
const CEO_EMAIL = process.env.PTO_APPROVER_FALLBACK_EMAIL || 'kurtis@triplecitiestech.com'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const GET = cronHandler(
  { name: 'ot-pto-digest', timeoutMs: 25000 },
  async () => {
    if (!resend) {
      return { success: true, message: 'RESEND_API_KEY not configured — skipping digest' }
    }

    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Notification-flow PTO this week
    const ptoNotifications = await prisma.timeOffRequest.findMany({
      where: {
        flowType: 'NOTIFICATION',
        createdAt: { gte: oneWeekAgo },
        status: { notIn: ['CANCELLED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        employeeName: true,
        kind: true,
        startDate: true,
        endDate: true,
        totalHours: true,
        status: true,
        flagForCeoReview: true,
        flagReason: true,
        paidOrUnpaid: true,
      },
    })

    // Reactive OT this week
    const otReactive = await prisma.overtimeRequest.findMany({
      where: {
        flowType: 'NOTIFICATION',
        createdAt: { gte: oneWeekAgo },
        status: { notIn: ['CANCELLED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        employeeName: true,
        workDate: true,
        actualHoursWorked: true,
        estimatedHours: true,
        reactiveReason: true,
        lateSubmission: true,
        flagForCeoReview: true,
        flagReason: true,
        status: true,
      },
    })

    // Open flags as of right now (across both)
    const openPtoFlags = await prisma.timeOffRequest.count({
      where: { flagForCeoReview: true, ceoAcknowledgedAt: null },
    })
    const openOtFlags = await prisma.overtimeRequest.count({
      where: { flagForCeoReview: true, ceoAcknowledgedAt: null },
    })

    if (ptoNotifications.length === 0 && otReactive.length === 0 && openPtoFlags === 0 && openOtFlags === 0) {
      // Nothing happened — skip the email so the CEO doesn't get noise.
      return {
        success: true,
        message: 'No notification-flow activity this week; digest skipped',
      }
    }

    const subject = `Recorded: Weekly PTO & overtime digest (${ymd(oneWeekAgo)} → ${ymd(now)})`
    const html = renderDigest({
      windowStart: ymd(oneWeekAgo),
      windowEnd: ymd(now),
      ptoNotifications,
      otReactive,
      openPtoFlags,
      openOtFlags,
    })
    const text = renderDigestText({
      windowStart: ymd(oneWeekAgo),
      windowEnd: ymd(now),
      ptoNotifications,
      otReactive,
      openPtoFlags,
      openOtFlags,
    })

    try {
      await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [CEO_EMAIL],
        subject,
        html,
        text,
      })
      return {
        success: true,
        message: 'Friday digest sent',
        data: {
          ptoCount: ptoNotifications.length,
          otCount: otReactive.length,
          openFlags: openPtoFlags + openOtFlags,
        },
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'send failed',
      }
    }
  }
)

interface PtoRow {
  id: string
  employeeName: string
  kind: string
  startDate: Date
  endDate: Date
  totalHours: { toString(): string } | number
  status: string
  flagForCeoReview: boolean
  flagReason: string | null
  paidOrUnpaid: string | null
}

interface OtRow {
  id: string
  employeeName: string
  workDate: Date
  actualHoursWorked: { toString(): string } | number | null
  estimatedHours: { toString(): string } | number
  reactiveReason: string | null
  lateSubmission: boolean
  flagForCeoReview: boolean
  flagReason: string | null
  status: string
}

interface DigestParams {
  windowStart: string
  windowEnd: string
  ptoNotifications: PtoRow[]
  otReactive: OtRow[]
  openPtoFlags: number
  openOtFlags: number
}

function renderDigest(p: DigestParams): string {
  const ptoRows = p.ptoNotifications
    .map(
      (r) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#0f172a;">${escapeHtml(r.employeeName)}</td>
        <td style="padding:6px 12px 6px 0;color:#475569;">${escapeHtml(r.kind.replace(/_/g, ' '))}</td>
        <td style="padding:6px 12px 6px 0;color:#475569;">${ymd(r.startDate)}${
          ymd(r.endDate) !== ymd(r.startDate) ? ' → ' + ymd(r.endDate) : ''
        }</td>
        <td style="padding:6px 12px 6px 0;color:#475569;">${Number(r.totalHours).toFixed(2)} hrs</td>
        <td style="padding:6px 0;color:${r.flagForCeoReview ? '#991b1b' : '#475569'};">${
          r.flagForCeoReview ? '⚑ flagged' : escapeHtml(r.status)
        }</td></tr>`
    )
    .join('')

  const otRows = p.otReactive
    .map(
      (r) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#0f172a;">${escapeHtml(r.employeeName)}</td>
        <td style="padding:6px 12px 6px 0;color:#475569;">${ymd(r.workDate)}</td>
        <td style="padding:6px 12px 6px 0;color:#475569;">${Number(r.actualHoursWorked ?? r.estimatedHours).toFixed(2)} hrs</td>
        <td style="padding:6px 12px 6px 0;color:#475569;">${escapeHtml(r.reactiveReason ?? '—')}</td>
        <td style="padding:6px 0;color:${r.flagForCeoReview ? '#991b1b' : r.lateSubmission ? '#92400e' : '#475569'};">${
          r.flagForCeoReview
            ? '⚑ flagged'
            : r.lateSubmission
              ? '⚠ late'
              : escapeHtml(r.status)
        }</td></tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Weekly digest</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="700" cellpadding="0" cellspacing="0" style="max-width:700px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
      <tr><td style="background:linear-gradient(135deg,#0891b2 0%,#7c3aed 100%);padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Weekly PTO &amp; Overtime Digest</h1>
        <p style="margin:6px 0 0;color:#e0f2fe;font-size:13px;">${escapeHtml(p.windowStart)} → ${escapeHtml(p.windowEnd)} · Informational, no action required</p>
      </td></tr>
      <tr><td style="padding:32px;">
        <div style="background:#eff6ff;border:1px solid #3b82f6;padding:14px 16px;border-radius:6px;margin-bottom:20px;">
          <p style="margin:0;color:#1e3a8a;font-size:14px;">
            <strong>Open flags:</strong> ${p.openPtoFlags + p.openOtFlags} item(s) awaiting your acknowledgement
            ${
              p.openPtoFlags + p.openOtFlags > 0
                ? ` — <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'}/admin/ot-pto-trends" style="color:#0891b2;">open dashboard</a>`
                : ''
            }
          </p>
        </div>

        <h2 style="margin:0 0 8px;font-size:16px;color:#0f172a;">Sick / emergency PTO recorded this week (${p.ptoNotifications.length})</h2>
        ${
          p.ptoNotifications.length === 0
            ? '<p style="margin:0 0 24px;color:#64748b;font-size:14px;">None.</p>'
            : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:24px;border-top:1px solid #e2e8f0;">
                <thead><tr style="background:#f8fafc;">
                  <th style="text-align:left;padding:8px 12px 8px 0;color:#475569;font-weight:600;">Employee</th>
                  <th style="text-align:left;padding:8px 12px 8px 0;color:#475569;font-weight:600;">Type</th>
                  <th style="text-align:left;padding:8px 12px 8px 0;color:#475569;font-weight:600;">Dates</th>
                  <th style="text-align:left;padding:8px 12px 8px 0;color:#475569;font-weight:600;">Hours</th>
                  <th style="text-align:left;padding:8px 0;color:#475569;font-weight:600;">Status</th>
                </tr></thead>
                <tbody>${ptoRows}</tbody>
              </table>`
        }

        <h2 style="margin:0 0 8px;font-size:16px;color:#0f172a;">Reactive overtime this week (${p.otReactive.length})</h2>
        ${
          p.otReactive.length === 0
            ? '<p style="margin:0 0 24px;color:#64748b;font-size:14px;">None.</p>'
            : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:8px;border-top:1px solid #e2e8f0;">
                <thead><tr style="background:#f8fafc;">
                  <th style="text-align:left;padding:8px 12px 8px 0;color:#475569;font-weight:600;">Employee</th>
                  <th style="text-align:left;padding:8px 12px 8px 0;color:#475569;font-weight:600;">Date</th>
                  <th style="text-align:left;padding:8px 12px 8px 0;color:#475569;font-weight:600;">Hours</th>
                  <th style="text-align:left;padding:8px 12px 8px 0;color:#475569;font-weight:600;">Reason</th>
                  <th style="text-align:left;padding:8px 0;color:#475569;font-weight:600;">Status</th>
                </tr></thead>
                <tbody>${otRows}</tbody>
              </table>`
        }

        <p style="margin:24px 0 0;color:#64748b;font-size:12px;">
          This is the Friday digest. No action is required unless something is flagged for review.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

function renderDigestText(p: DigestParams): string {
  const ptoLines = p.ptoNotifications
    .map(
      (r) =>
        `  - ${r.employeeName} · ${r.kind.replace(/_/g, ' ')} · ${ymd(r.startDate)}${
          ymd(r.endDate) !== ymd(r.startDate) ? ' → ' + ymd(r.endDate) : ''
        } · ${Number(r.totalHours).toFixed(2)} hrs · ${r.flagForCeoReview ? 'FLAGGED' : r.status}`
    )
    .join('\n')

  const otLines = p.otReactive
    .map(
      (r) =>
        `  - ${r.employeeName} · ${ymd(r.workDate)} · ${Number(r.actualHoursWorked ?? r.estimatedHours).toFixed(2)} hrs · ${r.reactiveReason ?? '—'} · ${
          r.flagForCeoReview ? 'FLAGGED' : r.lateSubmission ? 'LATE' : r.status
        }`
    )
    .join('\n')

  return `Weekly PTO & Overtime Digest
${p.windowStart} → ${p.windowEnd}

Open flags awaiting acknowledgement: ${p.openPtoFlags + p.openOtFlags}

Sick / emergency PTO this week (${p.ptoNotifications.length}):
${ptoLines || '  (none)'}

Reactive overtime this week (${p.otReactive.length}):
${otLines || '  (none)'}

Open dashboard: ${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'}/admin/ot-pto-trends

Informational — no action required unless something is flagged.`
}
