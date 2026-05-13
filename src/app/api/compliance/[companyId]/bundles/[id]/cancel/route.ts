/**
 * POST /api/compliance/[companyId]/bundles/[id]/cancel
 *
 * Cancel an in-flight bundle before deployment. Allowed from 'drafted'
 * or 'awaiting_customer'. All bundled pending changes drop back to
 * 'drafted' so staff can reuse them in a different bundle later.
 *
 * Body:
 *   { reason?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { withClient, writeAudit } from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, id } = await params

  let body: { reason?: string } = {}
  try {
    body = (await request.json()) as { reason?: string }
  } catch {
    // optional
  }

  await ensureComplianceTables()
  try {
    const result = await withClient(async (client) => {
      const bundle = await client.query<{ status: string }>(
        `SELECT status FROM compliance_change_bundles WHERE id = $1 AND "companyId" = $2`,
        [id, companyId]
      )
      if (bundle.rows.length === 0) return { notFound: true as const }
      const allowed = ['drafted', 'awaiting_customer', 'partially_approved', 'fully_approved']
      if (!allowed.includes(bundle.rows[0].status)) {
        return { illegalState: true as const, error: `bundle status ${bundle.rows[0].status} cannot be cancelled` }
      }
      await client.query(
        `UPDATE compliance_change_bundles
         SET status = 'cancelled',
             "internalNotes" = COALESCE("internalNotes", '') ||
               CASE WHEN $1::text IS NOT NULL THEN E'\\nCancelled: ' || $1::text ELSE '' END,
             "updatedAt" = NOW()
         WHERE id = $2`,
        [body.reason ?? null, id]
      )
      // Drop bundled / awaiting_customer items back to drafted so they can be
      // re-bundled. Items already approved / declined / deferred keep their state.
      await client.query(
        `UPDATE compliance_pending_changes
         SET status = 'drafted', "bundleId" = NULL, "updatedAt" = NOW()
         WHERE "bundleId" = $1 AND status IN ('bundled', 'awaiting_customer')`,
        [id]
      )
      await writeAudit(client, {
        companyId,
        action: 'bundle.cancelled',
        actor: session.user.email!,
        details: { id, reason: body.reason ?? null, previousStatus: bundle.rows[0].status },
      })
      return { ok: true as const }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ('illegalState' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[compliance/bundles/cancel] error:', err)
    return NextResponse.json({ error: 'Failed to cancel bundle' }, { status: 500 })
  }
}
