/**
 * POST /api/compliance/[companyId]/bundles/[id]/items/[itemId]/decision
 *
 * Record the customer's decision for ONE pending change inside a bundle.
 * Staff captures the customer's reply (per the staff-attestation model);
 * the platform does not require the customer to log in.
 *
 * Body:
 *   {
 *     customerDecision: 'approved' | 'declined' | 'deferred'
 *     customerNote?: string
 *     agreedDeploymentDate?: string    // ISO datetime; required if approved
 *     deferredUntil?: string           // ISO datetime; required if deferred
 *   }
 *
 * Side effects on the underlying pending change:
 *   approved → status stays 'awaiting_customer' until /communicate is called.
 *              agreedDeploymentDate is stored on the item.
 *   declined → status = 'customer_declined' (terminal).
 *   deferred → status = 'deferred', deferredUntil stored on both item + change.
 *
 * Bundle status auto-progresses to 'partially_approved' or 'fully_approved'
 * once every item has a decision.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  CUSTOMER_DECISIONS,
  type CustomerDecision,
  withClient,
  writeAudit,
} from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

interface Body {
  customerDecision?: string
  customerNote?: string | null
  agreedDeploymentDate?: string | null
  deferredUntil?: string | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; id: string; itemId: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, id, itemId } = await params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.customerDecision || !CUSTOMER_DECISIONS.includes(body.customerDecision as CustomerDecision)) {
    return NextResponse.json(
      { error: `customerDecision must be one of: ${CUSTOMER_DECISIONS.join(', ')}` },
      { status: 400 }
    )
  }
  if (body.customerDecision === 'approved' && !body.agreedDeploymentDate) {
    return NextResponse.json({ error: 'agreedDeploymentDate is required when approved' }, { status: 400 })
  }
  if (body.customerDecision === 'deferred' && !body.deferredUntil) {
    return NextResponse.json({ error: 'deferredUntil is required when deferred' }, { status: 400 })
  }

  await ensureComplianceTables()
  try {
    const result = await withClient(async (client) => {
      const item = await client.query<{
        id: string
        bundleId: string
        pendingChangeId: string
      }>(
        `SELECT bi.id, bi."bundleId", bi."pendingChangeId"
         FROM compliance_change_bundle_items bi
         JOIN compliance_change_bundles b ON b.id = bi."bundleId"
         WHERE bi.id = $1 AND bi."bundleId" = $2 AND b."companyId" = $3`,
        [itemId, id, companyId]
      )
      if (item.rows.length === 0) return { notFound: true as const }
      const { pendingChangeId } = item.rows[0]

      await client.query(
        `UPDATE compliance_change_bundle_items
         SET "customerDecision" = $1,
             "customerNote" = $2,
             "decisionRecordedAt" = NOW(),
             "decisionRecordedBy" = $3,
             "agreedDeploymentDate" = $4::timestamptz,
             "deferredUntil" = $5::timestamptz
         WHERE id = $6`,
        [
          body.customerDecision,
          body.customerNote ?? null,
          session.user.email,
          body.agreedDeploymentDate ?? null,
          body.deferredUntil ?? null,
          itemId,
        ]
      )

      // Cascade to the pending change row.
      if (body.customerDecision === 'declined') {
        await client.query(
          `UPDATE compliance_pending_changes
           SET status = 'customer_declined', "updatedAt" = NOW()
           WHERE id = $1`,
          [pendingChangeId]
        )
      } else if (body.customerDecision === 'deferred') {
        await client.query(
          `UPDATE compliance_pending_changes
           SET status = 'deferred', "deferredUntil" = $1::timestamptz, "updatedAt" = NOW()
           WHERE id = $2`,
          [body.deferredUntil ?? null, pendingChangeId]
        )
      }
      // 'approved' leaves the change in awaiting_customer until /communicate.

      // Recompute bundle aggregate status.
      const counts = await client.query<{ total: string; decided: string; approved: string; declined: string; deferred: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE "customerDecision" IS NOT NULL)::text AS decided,
           COUNT(*) FILTER (WHERE "customerDecision" = 'approved')::text AS approved,
           COUNT(*) FILTER (WHERE "customerDecision" = 'declined')::text AS declined,
           COUNT(*) FILTER (WHERE "customerDecision" = 'deferred')::text AS deferred
         FROM compliance_change_bundle_items
         WHERE "bundleId" = $1`,
        [id]
      )
      const c = counts.rows[0]
      const total = parseInt(c?.total ?? '0', 10)
      const decided = parseInt(c?.decided ?? '0', 10)
      const approved = parseInt(c?.approved ?? '0', 10)
      let nextBundleStatus: string | null = null
      if (decided === total && total > 0) {
        nextBundleStatus = approved > 0 && approved < total ? 'partially_approved' : 'fully_approved'
      } else if (decided > 0 && decided < total) {
        nextBundleStatus = 'partially_approved'
      }
      if (nextBundleStatus) {
        await client.query(
          `UPDATE compliance_change_bundles
           SET status = $1, "customerRespondedAt" = NOW(), "updatedAt" = NOW()
           WHERE id = $2`,
          [nextBundleStatus, id]
        )
      }

      await writeAudit(client, {
        companyId,
        action: 'bundle.customer_response_recorded',
        actor: session.user.email!,
        details: {
          bundleId: id,
          itemId,
          pendingChangeId,
          customerDecision: body.customerDecision,
          newBundleStatus: nextBundleStatus,
        },
      })
      return { ok: true as const, newBundleStatus: nextBundleStatus }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: { newBundleStatus: 'newBundleStatus' in result ? result.newBundleStatus : null } })
  } catch (err) {
    console.error('[compliance/bundles/items/decision] error:', err)
    return NextResponse.json({ error: 'Failed to record customer decision' }, { status: 500 })
  }
}
