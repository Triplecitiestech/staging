// Sales agent transactional emails (welcome / password reset / referral notification).
// Uses the same Resend client + from-address pattern as src/app/api/contacts/invite.

import { Resend } from 'resend'

const FROM = 'Triple Cities Tech <noreply@triplecitiestech.com>'

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

interface WelcomeEmailParams {
  agentName: string
  setPasswordUrl: string
  expiresInHours: number
}

export function welcomeEmailHtml({ agentName, setPasswordUrl, expiresInHours }: WelcomeEmailParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to the Triple Cities Tech Referral Program</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1e293b; background:#f1f5f9; margin:0; padding:20px; }
  .container { max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%); color:#fff; padding:32px; text-align:center; }
  .header h1 { margin:0 0 8px 0; font-size:22px; font-weight:700; }
  .header p { margin:0; font-size:14px; color:#94a3b8; }
  .content { padding:32px; font-size:15px; color:#475569; }
  .cta { text-align:center; margin:32px 0; }
  .btn { display:inline-block; background: linear-gradient(135deg,#06b6d4 0%,#0891b2 100%); color:#fff !important; padding:14px 40px; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px; }
  .panel { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px 20px; margin:16px 0; font-size:14px; }
  .footer { padding:24px 32px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center; font-size:13px; color:#94a3b8; }
  a { color:#0891b2; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to the Referral Program</h1>
      <p>Triple Cities Tech</p>
    </div>
    <div class="content">
      <p>Hi <strong>${escapeHtml(agentName)}</strong>,</p>
      <p>You've been added as a referral partner for Triple Cities Tech. We're excited to have you on board.</p>
      <p>To get started, set your password and log in to your agent portal. From there you can submit new referrals, track the status of every introduction you've made, view your signed referral agreement, and access training material.</p>
      <div class="cta">
        <a href="${setPasswordUrl}" class="btn" target="_blank" rel="noopener noreferrer">Set Your Password</a>
      </div>
      <div class="panel">
        <strong>Reminder:</strong> This link is single-use and expires in ${expiresInHours} hours. If it expires before you use it, just reply to this email and we'll send you a new one.
      </div>
      <p style="margin-top:24px;">As a quick reminder of how the program works: when a business you refer signs an MSP agreement with us and pays their third monthly invoice, you receive a one-time commission equal to the full amount of that third invoice.</p>
      <p>Questions? Reply to this email or write to <a href="mailto:sales@triplecitiestech.com">sales@triplecitiestech.com</a>.</p>
      <p>Welcome aboard,<br/>The Triple Cities Tech Team</p>
    </div>
    <div class="footer">
      <p>Triple Cities Tech</p>
      <p><a href="https://www.triplecitiestech.com">www.triplecitiestech.com</a> &bull; <a href="mailto:sales@triplecitiestech.com">sales@triplecitiestech.com</a> &bull; 607-341-7500</p>
    </div>
  </div>
</body>
</html>`
}

export function welcomeEmailText({ agentName, setPasswordUrl, expiresInHours }: WelcomeEmailParams): string {
  return [
    `Hi ${agentName},`,
    '',
    `You've been added as a referral partner for Triple Cities Tech.`,
    '',
    `Set your password and log in to your agent portal here:`,
    setPasswordUrl,
    '',
    `This link is single-use and expires in ${expiresInHours} hours. If it expires, reply to this email and we'll send a new one.`,
    '',
    `Reminder: When a business you refer signs an MSP agreement with us and pays their third monthly invoice, you receive a one-time commission equal to the full amount of that third invoice.`,
    '',
    `Questions? sales@triplecitiestech.com`,
    '',
    `— Triple Cities Tech`,
  ].join('\n')
}

interface ResetEmailParams {
  agentName: string
  resetUrl: string
  expiresInHours: number
}

export function resetEmailHtml({ agentName, resetUrl, expiresInHours }: ResetEmailParams): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Reset your TCT agent password</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height:1.6; color:#1e293b; background:#f1f5f9; margin:0; padding:20px; }
  .container { max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%); color:#fff; padding:24px; text-align:center; }
  .content { padding:32px; color:#475569; font-size:15px; }
  .btn { display:inline-block; background: linear-gradient(135deg,#06b6d4 0%,#0891b2 100%); color:#fff !important; padding:12px 32px; border-radius:8px; text-decoration:none; font-weight:600; }
  .footer { padding:16px 32px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center; font-size:12px; color:#94a3b8; }
</style></head><body>
<div class="container">
  <div class="header"><h1 style="margin:0;font-size:18px;">Reset Your Password</h1></div>
  <div class="content">
    <p>Hi ${escapeHtml(agentName)},</p>
    <p>We received a request to reset the password for your Triple Cities Tech agent portal account. If you didn't make this request, you can safely ignore this email.</p>
    <p style="text-align:center;margin:28px 0;"><a href="${resetUrl}" class="btn">Reset Password</a></p>
    <p style="font-size:13px;color:#64748b;">This link expires in ${expiresInHours} hours and can only be used once.</p>
  </div>
  <div class="footer">Triple Cities Tech &bull; sales@triplecitiestech.com</div>
</div>
</body></html>`
}

export function resetEmailText({ agentName, resetUrl, expiresInHours }: ResetEmailParams): string {
  return [
    `Hi ${agentName},`,
    '',
    `We received a request to reset your Triple Cities Tech agent portal password.`,
    `If you didn't make this request, you can safely ignore this email.`,
    '',
    `Reset link (expires in ${expiresInHours} hours, single-use):`,
    resetUrl,
    '',
    `— Triple Cities Tech`,
  ].join('\n')
}

interface ReferralNotificationParams {
  agentName: string
  agentEmail: string
  businessName: string
  contactName: string
  contactEmail: string
  contactPhone?: string | null
  notes?: string | null
  adminUrl: string
}

export function referralNotificationHtml(p: ReferralNotificationParams): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>New Referral Submitted</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#1e293b; background:#f1f5f9; margin:0; padding:20px; }
  .container { max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%); color:#fff; padding:24px; text-align:center; }
  .row { padding:8px 0; border-bottom:1px solid #e2e8f0; font-size:14px; }
  .label { color:#64748b; font-size:12px; text-transform:uppercase; letter-spacing:0.05em; }
  .value { color:#0f172a; font-weight:500; }
  .content { padding:24px 32px; }
  .btn { display:inline-block; background:#06b6d4; color:#fff !important; padding:10px 24px; border-radius:6px; text-decoration:none; font-weight:600; }
  .notes { background:#f8fafc; border:1px solid #e2e8f0; padding:12px 16px; border-radius:6px; white-space:pre-wrap; font-size:13px; color:#334155; }
</style></head><body>
<div class="container">
  <div class="header"><h1 style="margin:0;font-size:18px;">New Referral Submitted</h1></div>
  <div class="content">
    <p style="margin-top:0;color:#475569;">A referral partner just submitted a new lead through the agent portal.</p>
    <div class="row"><div class="label">Business</div><div class="value">${escapeHtml(p.businessName)}</div></div>
    <div class="row"><div class="label">Contact</div><div class="value">${escapeHtml(p.contactName)}</div></div>
    <div class="row"><div class="label">Email</div><div class="value">${escapeHtml(p.contactEmail)}</div></div>
    ${p.contactPhone ? `<div class="row"><div class="label">Phone</div><div class="value">${escapeHtml(p.contactPhone)}</div></div>` : ''}
    <div class="row"><div class="label">Submitted by</div><div class="value">${escapeHtml(p.agentName)} (${escapeHtml(p.agentEmail)})</div></div>
    ${p.notes ? `<div style="margin:16px 0;"><div class="label" style="margin-bottom:6px;">Notes from agent</div><div class="notes">${escapeHtml(p.notes)}</div></div>` : ''}
    <p style="text-align:center;margin:28px 0 0 0;"><a href="${p.adminUrl}" class="btn">View in Admin</a></p>
  </div>
</div>
</body></html>`
}

export function referralNotificationText(p: ReferralNotificationParams): string {
  return [
    `New referral submitted to the Triple Cities Tech referral program.`,
    '',
    `Business:    ${p.businessName}`,
    `Contact:     ${p.contactName}`,
    `Email:       ${p.contactEmail}`,
    p.contactPhone ? `Phone:       ${p.contactPhone}` : null,
    `Submitted by: ${p.agentName} <${p.agentEmail}>`,
    '',
    p.notes ? `Notes:\n${p.notes}` : null,
    '',
    `View in admin: ${p.adminUrl}`,
  ].filter(Boolean).join('\n')
}

// ============================================================
// Sender helpers
// ============================================================

type SendResult = { ok: true; id: string | null } | { ok: false; error: string }

export async function sendWelcomeEmail(to: string, params: WelcomeEmailParams): Promise<SendResult> {
  const resend = getResend()
  if (!resend) return { ok: false, error: 'Email service not configured (RESEND_API_KEY missing).' }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: 'Welcome to the Triple Cities Tech Referral Program',
      html: welcomeEmailHtml(params),
      text: welcomeEmailText(params),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data?.id ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown email error' }
  }
}

export async function sendResetEmail(to: string, params: ResetEmailParams): Promise<SendResult> {
  const resend = getResend()
  if (!resend) return { ok: false, error: 'Email service not configured (RESEND_API_KEY missing).' }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: 'Reset your Triple Cities Tech agent portal password',
      html: resetEmailHtml(params),
      text: resetEmailText(params),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data?.id ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown email error' }
  }
}

export async function sendReferralNotification(to: string, params: ReferralNotificationParams): Promise<SendResult> {
  const resend = getResend()
  if (!resend) return { ok: false, error: 'Email service not configured (RESEND_API_KEY missing).' }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `New referral: ${params.businessName} (from ${params.agentName})`,
      html: referralNotificationHtml(params),
      text: referralNotificationText(params),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data?.id ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown email error' }
  }
}

function escapeHtml(s: string): string {
  if (typeof s !== 'string') return ''
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
