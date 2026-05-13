/**
 * POST /api/compliance/[companyId]/changes/[id]/abandon
 *
 * Cancel a pending change before it leaves staff hands. Allowed from
 * 'drafted', 'bundled', and 'scheduled' (in case the customer changed
 * their mind before deployment). See change-management.ts.
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
    // body optional
  }

  await ensureComplianceTables()
  try {
    const result = await withClient(async (client) => {
      const current = await loadPendingChange(client, companyId, id)
      if (!current) return { notFound: true as const }
      try {
        assertStatusTransition(current.status, 'abandoned')
      } catch (err) {
        return { illegalState: true as const, error: (err as Error).message }
      }
      await client.query(
        `UPDATE compliance_pending_changes
         SET status = 'abandoned',
             "internalNotes" = COALESCE("internalNotes", '') ||
               CASE WHEN $1::text IS NOT NULL THEN E'\\nAbandoned: ' || $1::text ELSE '' END,
             "updatedAt" = NOW()
         WHERE id = $2`,
        [body.reason ?? null, id]
      )
      await writeAudit(client, {
        companyId,
        action: 'pending_change.abandoned',
        actor: session.user.email!,
        details: { id, previousStatus: current.status, reason: body.reason ?? null },
      })
      return { ok: true as const }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ('illegalState' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[compliance/changes/abandon] error:', err)
    return NextResponse.json({ error: 'Failed to abandon pending change' }, { status: 500 })
  }
}
