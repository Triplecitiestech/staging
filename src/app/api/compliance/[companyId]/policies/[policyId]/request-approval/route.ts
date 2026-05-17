/**
 * POST /api/compliance/[companyId]/policies/[policyId]/request-approval
 *
 * Staff action: request the customer to review + approve a policy
 * before TCT publishes it back to their SharePoint / IT Glue.
 *
 * What happens:
 *   1. Creates a compliance_policy_approvals row (decision='pending')
 *      with a content-hash of the policy at request time. The
 *      approval is THIS-version-specific — revising the policy
 *      invalidates it implicitly via the hash mismatch.
 *   2. Generates a 30-day HMAC-signed magic-link token.
 *   3. Emails the recipient with a "review and approve" CTA pointing
 *      at /portal/policy-approval/<token>.
 *
 * Body:
 *   {
 *     recipientEmail: string,    // customer HR / PoC email
 *     requesterNote?: string     // optional internal note from staff
 *   }
 *
 * Returns the approval id + magic link (so staff can copy/paste it
 * if the email bounces or needs to be resent manually).
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { Resend } from 'resend'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { signApprovalToken, APPROVAL_TOKEN_LIFETIME_DAYS } from '@/lib/compliance/policy-approval-token'

export const dynamic = 'force-dynamic'

const EMAIL_FROM = 'Triple Cities Tech <noreply@triplecitiestech.com>'

interface Body {
  recipientEmail?: string
  requesterNote?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; policyId: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, policyId } = await params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const recipient = (body.recipientEmail ?? '').trim()
  if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    return NextResponse.json({ error: 'Valid recipientEmail is required' }, { status: 400 })
  }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const policyRes = await client.query<{ id: string; title: string; content: string }>(
      `SELECT id, title, content FROM compliance_policies
        WHERE id = $1 AND "companyId" = $2`,
      [policyId, companyId]
    )
    const policy = policyRes.rows[0]
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 })

    const companyRes = await client.query<{ displayName: string }>(
      `SELECT "displayName" FROM companies WHERE id = $1`, [companyId]
    )
    const companyName = companyRes.rows[0]?.displayName ?? 'Customer'

    const contentHash = crypto.createHash('sha256').update(policy.content).digest('hex')
    const expiresAt = new Date(Date.now() + APPROVAL_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000)

    const ins = await client.query<{ id: string }>(
      `INSERT INTO compliance_policy_approvals (
         "companyId", "policyId", "policyContentHash",
         "recipientEmail", "requesterEmail", "requesterNote",
         decision, "expiresAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING id`,
      [
        companyId,
        policyId,
        contentHash,
        recipient,
        session.user.email,
        body.requesterNote?.trim() || null,
        expiresAt.toISOString(),
      ]
    )
    const approvalId = ins.rows[0].id

    const token = signApprovalToken({
      approvalId,
      companyId,
      policyId,
      expires: expiresAt.getTime(),
    })
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'
    const reviewUrl = `${baseUrl}/portal/policy-approval/${token}`

    // Email send — best-effort. If Resend isn't configured (e.g. local
    // dev), the row + magic link are still returned so the operator
    // can ship the link manually.
    let emailMessageId: string | null = null
    let emailWarning: string | null = null
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      try {
        const subject = `Please review and approve: ${policy.title}`
        const html = renderApprovalRequestEmail({
          policyTitle: policy.title,
          companyName,
          requesterEmail: session.user.email,
          requesterNote: body.requesterNote?.trim() || null,
          reviewUrl,
          expiresAt,
        })
        const text =
          `Triple Cities Tech has prepared an updated "${policy.title}" for ${companyName}.\n\n` +
          `Please review and approve it here:\n${reviewUrl}\n\n` +
          (body.requesterNote ? `Note from ${session.user.email}: ${body.requesterNote}\n\n` : '') +
          `This link expires ${expiresAt.toLocaleDateString()}.`
        const resend = new Resend(resendKey)
        const send = await resend.emails.send({
          from: EMAIL_FROM,
          to: recipient,
          replyTo: session.user.email,
          subject,
          html,
          text,
        })
        if (send.error) {
          emailWarning = `Email send failed: ${send.error.message}`
        } else {
          emailMessageId = send.data?.id ?? null
        }
      } catch (err) {
        emailWarning = `Email send threw: ${err instanceof Error ? err.message : String(err)}`
      }
    } else {
      emailWarning = 'RESEND_API_KEY not configured — email was NOT sent. Copy the review link manually.'
    }

    return NextResponse.json({
      success: true,
      data: {
        approvalId,
        reviewUrl,
        recipientEmail: recipient,
        expiresAt: expiresAt.toISOString(),
        emailMessageId,
        emailWarning,
      },
    })
  } catch (err) {
    console.error('[compliance/policies/request-approval] error:', err)
    return NextResponse.json({ error: 'Failed to request approval' }, { status: 500 })
  } finally {
    client.release()
  }
}

function renderApprovalRequestEmail(args: {
  policyTitle: string
  companyName: string
  requesterEmail: string
  requesterNote: string | null
  reviewUrl: string
  expiresAt: Date
}): string {
  return `<!DOCTYPE html>
<html><body style="font-family: 'Segoe UI', Calibri, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.5;">
  <h2 style="color: #1e3a5f; margin-bottom: 8px;">Policy ready for your review</h2>
  <p style="color: #555; margin-top: 0;">${escapeHtml(args.companyName)}</p>
  <p>Triple Cities Tech has prepared an updated <strong>${escapeHtml(args.policyTitle)}</strong> for ${escapeHtml(args.companyName)} and would like your sign-off before publishing it to your SharePoint or other storage.</p>
  ${args.requesterNote ? `<div style="background: #f4f6f8; border-left: 3px solid #1e3a5f; padding: 12px 16px; margin: 16px 0; font-size: 14px;"><strong>Note from ${escapeHtml(args.requesterEmail)}:</strong><br>${escapeHtml(args.requesterNote)}</div>` : ''}
  <p style="margin: 24px 0;"><a href="${args.reviewUrl}" style="display: inline-block; background: #1e3a5f; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Review and approve →</a></p>
  <p style="font-size: 12px; color: #888;">Link expires ${args.expiresAt.toLocaleDateString()}. If you didn't expect this, reply to ${escapeHtml(args.requesterEmail)} or contact <a href="mailto:support@triplecitiestech.com">support@triplecitiestech.com</a>.</p>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
