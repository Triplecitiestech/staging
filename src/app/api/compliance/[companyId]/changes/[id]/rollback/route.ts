/**
 * POST /api/compliance/[companyId]/changes/[id]/rollback
 *
 * Mark a pending change as rolled-back. Records the reason and writes
 * audit. Does NOT auto-invoke the action's rollbackActionId — that's
 * left to staff so they explicitly stage and deploy the rollback action
 * as a new pending change (visible in the audit trail).
 *
 * Body:
 *   { reason: string }  — required, free text
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  assertStatusTransition,
  loadPendingChange,
  withClient,
  writeAudit,
} from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

interface Body {
  reason?: string
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
  if (!body.reason || !body.reason.trim()) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }
  const reason = body.reason.trim()

  await ensureComplianceTables()
  try {
    const result = await withClient(async (client) => {
      const current = await loadPendingChange(client, companyId, id)
      if (!current) return { notFound: true as const }
      try {
        assertStatusTransition(current.status, 'rolled_back')
      } catch (err) {
        return { illegalState: true as const, error: (err as Error).message }
      }
      await client.query(
        `UPDATE compliance_pending_changes
         SET status = 'rolled_back',
             "rolledBackAt" = NOW(),
             "rolledBackReason" = $1,
             "updatedAt" = NOW()
         WHERE id = $2`,
        [reason, id]
      )
      await writeAudit(client, {
        companyId,
        action: 'pending_change.rolled_back',
        actor: session.user.email!,
        details: { id, previousStatus: current.status, reason },
      })
      return { ok: true as const }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ('illegalState' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[compliance/changes/rollback] error:', err)
    return NextResponse.json({ error: 'Failed to rollback pending change' }, { status: 500 })
  }
}
