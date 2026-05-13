/**
 * POST /api/compliance/[companyId]/bundles/[id]/send
 *
 * Send the bundle to the customer. Today this is a state transition only:
 *   bundle: drafted → awaiting_customer
 *   each pending-change item: bundled → awaiting_customer
 *
 * The customer-facing PDF + email rendering is deferred to C11. This route
 * accepts a `sentVia` so the audit trail still captures HOW the bundle
 * was conveyed (email / portal / manual).
 *
 * Body:
 *   { sentVia: 'email' | 'portal' | 'manual', reportPdfUrl?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { withClient, writeAudit } from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

const VALID_SENT_VIA = new Set(['email', 'portal', 'manual'])

interface Body {
  sentVia?: string
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
        details: { id, sentVia: body.sentVia, reportPdfUrl: body.reportPdfUrl ?? null },
      })
      return { ok: true as const }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ('illegalState' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[compliance/bundles/send] error:', err)
    return NextResponse.json({ error: 'Failed to send bundle' }, { status: 500 })
  }
}
