/**
 * POST /api/portal/policy-approval/[token]/decide
 *
 * Customer-side decision endpoint. Magic-link token gates access —
 * no auth session needed. The customer's email/name aren't checked
 * directly; the assumption is that whoever holds the link IS the
 * intended approver (same trust model as a password-reset link).
 *
 * Body:
 *   {
 *     decision: 'approved' | 'rejected',
 *     decisionNotes?: string
 *   }
 *
 * Updates the compliance_policy_approvals row. Idempotent in the
 * sense that re-submitting the same decision is a no-op; changing
 * the decision after the fact is refused (the operator would have
 * to send a new approval request).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { verifyApprovalToken } from '@/lib/compliance/policy-approval-token'

export const dynamic = 'force-dynamic'

interface Body {
  decision?: string
  decisionNotes?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const { token } = await params
  const payload = verifyApprovalToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Link is invalid or has expired' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const decision = body.decision === 'approved' ? 'approved'
                 : body.decision === 'rejected' ? 'rejected'
                 : null
  if (!decision) {
    return NextResponse.json({ error: 'decision must be "approved" or "rejected"' }, { status: 400 })
  }
  const notes = (body.decisionNotes ?? '').trim().slice(0, 4000) || null

  const pool = getPool()
  const client = await pool.connect()
  try {
    // Verify the row + that the policy content hasn't changed since
    // the approval was requested (otherwise the customer would be
    // approving stale content).
    const row = await client.query<{
      id: string
      decision: string
      policyContentHash: string
      expiresAt: string
      policyTitle: string
      currentContentHash: string
    }>(
      `SELECT
         a.id,
         a.decision,
         a."policyContentHash",
         a."expiresAt"::text AS "expiresAt",
         p.title AS "policyTitle",
         encode(sha256(convert_to(p.content, 'UTF8')), 'hex') AS "currentContentHash"
       FROM compliance_policy_approvals a
       JOIN compliance_policies p ON p.id = a."policyId"
       WHERE a.id = $1 AND a."companyId" = $2 AND a."policyId" = $3`,
      [payload.approvalId, payload.companyId, payload.policyId]
    )
    const approval = row.rows[0]
    if (!approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }
    if (new Date(approval.expiresAt).getTime() < Date.now()) {
      // Stamp it expired so the operator UI shows the right state.
      await client.query(
        `UPDATE compliance_policy_approvals SET decision = 'expired' WHERE id = $1 AND decision = 'pending'`,
        [approval.id]
      )
      return NextResponse.json({ error: 'This approval link has expired' }, { status: 410 })
    }
    if (approval.decision !== 'pending') {
      return NextResponse.json({
        error: `This approval was already ${approval.decision}. Ask TCT to send a new approval request if you need to change your decision.`,
      }, { status: 409 })
    }
    if (approval.policyContentHash !== approval.currentContentHash) {
      return NextResponse.json({
        error: 'The policy has been edited since this approval link was sent. Ask TCT to send a new approval request for the updated version.',
      }, { status: 409 })
    }

    await client.query(
      `UPDATE compliance_policy_approvals
         SET decision = $1, "decisionNotes" = $2, "decidedAt" = NOW()
       WHERE id = $3`,
      [decision, notes, approval.id]
    )

    return NextResponse.json({
      success: true,
      data: {
        decision,
        policyTitle: approval.policyTitle,
        decidedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('[portal/policy-approval/decide] error:', err)
    return NextResponse.json({ error: 'Failed to record decision' }, { status: 500 })
  } finally {
    client.release()
  }
}

