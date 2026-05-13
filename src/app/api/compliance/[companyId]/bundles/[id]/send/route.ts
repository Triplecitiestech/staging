/**
 * POST /api/compliance/[companyId]/bundles/[id]/send
 *
 * Send the bundle to the customer. Three modes via `sentVia`:
 *
 *   'email'  — renders the HTML report, emails it via Resend to the
 *              primary customer contact (or `recipientEmail` override).
 *              Customer URL goes into reportPdfUrl as the preview link.
 *   'portal' — state transition only; customer will see the bundle in
 *              the (future) customer portal compliance section.
 *   'manual' — state transition only; staff is conveying the bundle
 *              out-of-band (in a meeting, paper printout, etc.).
 *
 * Body:
 *   {
 *     sentVia: 'email' | 'portal' | 'manual',
 *     recipientEmail?: string,     // overrides the company's primary contact
 *     reportPdfUrl?: string         // pre-rendered PDF URL (uncommon)
 *   }
 *
 * State machine (all modes):
 *   bundle: drafted → awaiting_customer
 *   each pending-change item: bundled → awaiting_customer
 */

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { withClient, writeAudit } from '@/lib/compliance/change-management'
import { buildBundleReportData } from '@/lib/compliance/bundle-report/build-data'
import { renderBundleEmail } from '@/lib/compliance/bundle-report/email-template'

const EMAIL_FROM = 'Triple Cities Tech <noreply@triplecitiestech.com>'

export const dynamic = 'force-dynamic'

const VALID_SENT_VIA = new Set(['email', 'portal', 'manual'])

interface Body {
  sentVia?: string
  recipientEmail?: string | null
  reportPdfUrl?: string | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, id } = await params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.sentVia || !VALID_SENT_VIA.has(body.sentVia)) {
    return NextResponse.json({ error: `sentVia must be one of: ${Array.from(VALID_SENT_VIA).join(', ')}` }, { status: 400 })
  }

  await ensureComplianceTables()
  try {
    const result = await withClient(async (client) => {
      const bundle = await client.query<{ status: string }>(
        `SELECT status FROM compliance_change_bundles WHERE id = $1 AND "companyId" = $2`,
        [id, companyId]
      )
      if (bundle.rows.length === 0) return { notFound: true as const }
      if (bundle.rows[0].status !== 'drafted') {
        return { illegalState: true as const, error: `bundle status is ${bundle.rows[0].status}, must be drafted` }
      }

      // Must have at least one item.
      const itemCount = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM compliance_change_bundle_items WHERE "bundleId" = $1`,
        [id]
      )
      if (parseInt(itemCount.rows[0]?.c ?? '0', 10) === 0) {
        return { illegalState: true as const, error: 'bundle has no items to send' }
      }

      // For 'email' mode, render the report and resolve the recipient address
      // BEFORE we commit the state transition — that way a failed render or
      // missing recipient leaves the bundle in 'drafted'.
      let emailDelivery: { recipient: string; messageId: string | null } | null = null
      if (body.sentVia === 'email') {
        const data = await buildBundleReportData(client, companyId, id, session.user!.email!)
        if (!data) return { illegalState: true as const, error: 'bundle data unavailable for render' }
        const recipient = (body.recipientEmail ?? data.customerContact.email ?? '').trim()
        if (!recipient) {
          return {
            illegalState: true as const,
            error: 'no recipient email available: pass recipientEmail in body, or set a primary contact for the company',
          }
        }
        const resendKey = process.env.RESEND_API_KEY
        if (!resendKey) {
          return { illegalState: true as const, error: 'email service not configured (RESEND_API_KEY missing)' }
        }
        const email = renderBundleEmail(data)
        try {
          const resend = new Resend(resendKey)
          const sendResult = await resend.emails.send({
            from: EMAIL_FROM,
            to: recipient,
            replyTo: session.user!.email!,
            subject: email.subject,
            html: email.html,
            text: email.text,
          })
          if (sendResult.error) {
            return { illegalState: true as const, error: `email send failed: ${sendResult.error.message}` }
          }
          emailDelivery = { recipient, messageId: sendResult.data?.id ?? null }
        } catch (err) {
          return {
            illegalState: true as const,
            error: `email send threw: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      }

      await client.query(
        `UPDATE compliance_change_bundles
         SET status = 'awaiting_customer',
             "sentAt" = NOW(),
             "sentBy" = $1,
             "sentVia" = $2,
             "reportPdfUrl" = COALESCE($3, "reportPdfUrl"),
             "updatedAt" = NOW()
         WHERE id = $4`,
        [session.user.email, body.sentVia, body.reportPdfUrl ?? null, id]
      )
      await client.query(
        `UPDATE compliance_pending_changes
         SET status = 'awaiting_customer', "updatedAt" = NOW()
         WHERE "bundleId" = $1 AND status = 'bundled'`,
        [id]
      )
      await writeAudit(client, {
        companyId,
        action: 'bundle.sent',
        actor: session.user.email!,
        details: {
          id,
          sentVia: body.sentVia,
          reportPdfUrl: body.reportPdfUrl ?? null,
          emailDelivery,
        },
      })
      return { ok: true as const, emailDelivery }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ('illegalState' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({
      success: true,
      data: 'emailDelivery' in result ? { emailDelivery: result.emailDelivery } : undefined,
    })
  } catch (err) {
    console.error('[compliance/bundles/send] error:', err)
    return NextResponse.json({ error: 'Failed to send bundle' }, { status: 500 })
  }
}
