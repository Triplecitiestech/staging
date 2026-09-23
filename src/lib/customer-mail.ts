// src/lib/customer-mail.ts
//
// Emails a ticket's OWN contact from TCT's support mailbox through Microsoft
// Graph. Exists because Autotask cannot be asked to do it: live evidence on
// 2026-09-22 showed that notes and time entries created through the REST API
// never email the customer — the "Quick Notification (Notify via TO)" boxes on
// the note form have no REST field (docs/gotchas.md → Autotask Integration) —
// so a technician updating a customer through Claude was silently updating
// nobody.
//
// A SEPARATE MODULE AND A SEPARATE ENTRA APP, deliberately. Every other Graph
// surface in this repo that acts on TCT's own tenant has its own least-privilege
// app (HR records, scan filer), because each credential is reachable from the
// internet through the connector. This one holds exactly one right: Mail.Send,
// granted by Exchange Application RBAC and scoped to ONE mailbox (the support
// mailbox). It must NEVER be granted Mail.Send by Entra admin consent — Microsoft
// documents the two as a UNION, so a tenant-wide grant would let this app send
// as any person in the company:
//   https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac
//
// Three properties this module holds by construction:
//
//   1. There is no recipient parameter anywhere in the connector. The caller
//      (autotask_add_customer_note) resolves the address from the ticket's
//      contact record, so the connector cannot be used to email an arbitrary
//      address.
//   2. A send is NEVER retried. Graph sendMail is not idempotent; a retry after
//      a timeout that actually delivered would email the customer twice.
//   3. 202 Accepted is reported as ACCEPTED, not delivered. Graph returns no
//      message id and no delivery status for sendMail; a bounce lands in the
//      sender's mailbox, which this app deliberately cannot read.

import { escapeHtml } from '@/lib/security'
import type { FailureInput } from '@/lib/connector/failure-envelope'

/** The mailbox customers already use to reach TCT support. Overridable per environment. */
export const DEFAULT_CUSTOMER_MAIL_SENDER = 'support@triplecitiestech.com'

const TOKEN_TIMEOUT_MS = 15_000
const SEND_TIMEOUT_MS = 30_000

export function customerMailSender(): string {
  return (process.env.CUSTOMER_MAIL_SENDER || DEFAULT_CUSTOMER_MAIL_SENDER).trim()
}

export function customerMailEnabled(): boolean {
  return process.env.CONNECTOR_CUSTOMER_EMAIL_ENABLED === 'true'
}

export function isCustomerMailConfigured(): boolean {
  return Boolean(
    process.env.CUSTOMER_MAIL_TENANT_ID &&
      process.env.CUSTOMER_MAIL_CLIENT_ID &&
      process.env.CUSTOMER_MAIL_CLIENT_SECRET,
  )
}

/**
 * Can a customer email be sent right now?
 *
 * Returned as a value, not thrown, because the caller must check it BEFORE it
 * writes anything to Autotask: a note posted and then an email refused would
 * leave the user believing the customer had been told.
 */
export function customerMailReadiness():
  | { ready: true; sender: string }
  | { ready: false; failure: FailureInput } {
  if (!customerMailEnabled()) {
    return {
      ready: false,
      failure: {
        reasonCode: 'POLICY_BLOCKED',
        message: 'Emailing the ticket contact is turned off by its kill switch, so nothing was written and nothing was sent.',
        remediation:
          'Set CONNECTOR_CUSTOMER_EMAIL_ENABLED=true in the Vercel project once the TCT Customer Mail app is set up (docs/runbooks/CUSTOMER_MAIL_SETUP.md). ' +
          'To post the note without emailing, call again with notifyContact omitted and tick Ticket Contact in the note\'s Notification panel in Autotask.',
        surface: 'customer_mail',
      },
    }
  }
  if (!isCustomerMailConfigured()) {
    return {
      ready: false,
      failure: {
        reasonCode: 'POLICY_BLOCKED',
        message: 'The TCT Customer Mail Entra app is not configured, so the connector holds no credential to send email. Nothing was written and nothing was sent.',
        remediation:
          'Set CUSTOMER_MAIL_TENANT_ID, CUSTOMER_MAIL_CLIENT_ID and CUSTOMER_MAIL_CLIENT_SECRET in the Vercel project (docs/runbooks/CUSTOMER_MAIL_SETUP.md). The secret is created in Entra by an admin and never passes through a conversation.',
        surface: 'customer_mail',
      },
    }
  }
  return { ready: true, sender: customerMailSender() }
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export interface CustomerUpdateInput {
  ticketNumber: string
  ticketTitle: string | null
  contactFirstName: string | null
  message: string
}

export interface CustomerUpdateEmail {
  subject: string
  html: string
  text: string
}

/**
 * Deliberately plain: the technician approved the message text, so the email
 * carries that text and a ticket reference, and adds no claims of its own.
 *
 * The ticket number leads the subject so the customer and any reply can be
 * matched to the ticket. Whether a REPLY is appended to the ticket automatically
 * depends on Autotask incoming-email processing for the support mailbox, which
 * is UI-only configuration this code cannot read — so the email makes no promise
 * about it.
 *
 * Pure, and exported for the tests.
 */
export function buildCustomerUpdateEmail(input: CustomerUpdateInput): CustomerUpdateEmail {
  const title = (input.ticketTitle ?? '').replace(/[\r\n]+/g, ' ').trim()
  const subject = title ? `Ticket ${input.ticketNumber}: ${title}` : `Ticket ${input.ticketNumber}: update`
  const greeting = input.contactFirstName?.trim() ? `Hi ${input.contactFirstName.trim()},` : 'Hello,'
  const body = input.message.replace(/\r\n?/g, '\n').trim()

  const text = [greeting, '', body, '', `Ticket: ${input.ticketNumber}`, 'Triple Cities Tech Support'].join('\n')

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;background:#ffffff;margin:0;padding:24px;font-size:15px;line-height:1.5;">
<p style="margin:0 0 14px 0;">${escapeHtml(greeting)}</p>
${paragraphs}
<p style="margin:18px 0 0 0;font-size:13px;color:#475569;">Ticket: ${escapeHtml(input.ticketNumber)}<br>Triple Cities Tech Support</p>
</body></html>`

  return { subject, html, text }
}

/** A deliberately narrow check: one address, no display-name syntax, no list. */
export function isSendableEmailAddress(address: string | null | undefined): address is string {
  if (!address) return false
  const a = address.trim()
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(a)
}

// ---------------------------------------------------------------------------
// Token (app-only client credentials, cached on globalThis across cold starts)
// ---------------------------------------------------------------------------

interface TokenEntry {
  accessToken: string
  expiresAt: number
}
declare global {
  // eslint-disable-next-line no-var
  var __customerMailGraphToken: TokenEntry | undefined
}

async function getAccessToken(): Promise<string> {
  const cached = globalThis.__customerMailGraphToken
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken

  const url = `https://login.microsoftonline.com/${process.env.CUSTOMER_MAIL_TENANT_ID}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.CUSTOMER_MAIL_CLIENT_ID!,
    client_secret: process.env.CUSTOMER_MAIL_CLIENT_SECRET!,
    scope: 'https://graph.microsoft.com/.default',
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Customer mail Graph token fetch failed (${res.status}): ${text.slice(0, 500)}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  globalThis.__customerMailGraphToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  }
  return data.access_token
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export interface CustomerMailSendResult {
  status: 'accepted'
  httpStatus: number
  sender: string
  to: string
  acceptedAt: string
  subject: string
}

/**
 * POST /users/{sender}/sendMail, saved to the sender's Sent Items so the support
 * mailbox holds the record. Graph documents 202 Accepted as the success status:
 *   https://learn.microsoft.com/en-us/graph/api/user-sendmail
 *
 * Throws on anything else, with a permission hint on 401/403. Never retries —
 * see the header.
 */
export async function sendCustomerUpdateEmail(input: {
  to: string
  toName?: string | null
  email: CustomerUpdateEmail
}): Promise<CustomerMailSendResult> {
  const sender = customerMailSender()
  const token = await getAccessToken()
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: input.email.subject,
        body: { contentType: 'HTML', content: input.email.html },
        toRecipients: [{ emailAddress: { address: input.to, ...(input.toName ? { name: input.toName } : {}) } }],
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  })
  if (res.status !== 202) {
    const text = await res.text().catch(() => '')
    const hint =
      res.status === 401 || res.status === 403
        ? ` Hint: the TCT Customer Mail app has no Mail.Send right over ${sender}. Check the Exchange Application RBAC assignment with Test-ServicePrincipalAuthorization (docs/runbooks/CUSTOMER_MAIL_SETUP.md) — do NOT fix it with a tenant-wide Entra consent.`
        : ''
    throw new Error(`Graph sendMail from ${sender} failed (${res.status}): ${text.slice(0, 500)}${hint}`)
  }
  return {
    status: 'accepted',
    httpStatus: res.status,
    sender,
    to: input.to,
    acceptedAt: new Date().toISOString(),
    subject: input.email.subject,
  }
}
