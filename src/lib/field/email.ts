// src/lib/field/email.ts
//
// Login-code delivery over the repo's existing outbound email path (Resend,
// same client + from-address pattern as src/lib/agent-email.ts). Email is
// best-effort: the code is ALSO recoverable by staff on /field/admin, which is
// the guaranteed delivery path. When RESEND_API_KEY is unset this reports
// 'not_configured' and nothing is sent.

import { Resend } from 'resend'
import { escapeHtml } from '@/lib/security'

const FROM = 'Triple Cities Tech <noreply@triplecitiestech.com>'
const SEND_TIMEOUT_MS = 15_000

export type CodeDeliveryResult = 'sent' | 'not_configured' | 'failed'

export function loginCodeEmailText(code: string, expiresMinutes: number): string {
  return [
    'Triple Cities Tech — Field Playbook',
    '',
    `Your sign-in code is: ${code}`,
    '',
    `It expires in ${expiresMinutes} minutes. Enter it at the page that asked for it.`,
    'If you did not request this code, ignore this message.',
  ].join('\n')
}

export function loginCodeEmailHtml(code: string, expiresMinutes: number): string {
  const safe = escapeHtml(code)
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Your sign-in code</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;background:#ffffff;margin:0;padding:24px;">
  <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">Triple Cities Tech — Field Playbook</p>
  <p style="margin:0 0 8px 0;font-size:16px;">Your sign-in code is</p>
  <p style="margin:0 0 16px 0;font-size:32px;font-weight:700;letter-spacing:6px;">${safe}</p>
  <p style="margin:0 0 8px 0;font-size:14px;color:#475569;">It expires in ${expiresMinutes} minutes. Enter it at the page that asked for it.</p>
  <p style="margin:0;font-size:13px;color:#94a3b8;">If you did not request this code, ignore this message.</p>
</body></html>`
}

export async function sendLoginCodeEmail(
  to: string,
  code: string,
  expiresMinutes: number,
): Promise<CodeDeliveryResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return 'not_configured'
  try {
    const resend = new Resend(key)
    const send = resend.emails.send({
      from: FROM,
      to,
      subject: `Your Triple Cities Tech sign-in code: ${code}`,
      text: loginCodeEmailText(code, expiresMinutes),
      html: loginCodeEmailHtml(code, expiresMinutes),
    })
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Resend send timed out')), SEND_TIMEOUT_MS),
    )
    const result = await Promise.race([send, timeout])
    if (result.error) {
      console.error('[field] login code email rejected by Resend:', result.error.message)
      return 'failed'
    }
    return 'sent'
  } catch (err) {
    console.error('[field] login code email failed:', err instanceof Error ? err.message : String(err))
    return 'failed'
  }
}
