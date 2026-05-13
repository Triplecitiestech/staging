/**
 * POST   /api/compliance/[companyId]/bundles/[id]/items — add a pending change to the bundle
 * DELETE /api/compliance/[companyId]/bundles/[id]/items?pendingChangeId=… — remove it
 *
 * Adding flips the pending change from 'drafted' → 'bundled'; removing
 * reverses that to 'drafted'.
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

interface AddBody {
  pendingChangeId?: string
  displayOrder?: number
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

  let body: AddBody
  try {
    body = (await request.json()) as AddBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.pendingChangeId) {
    return NextResponse.json({ error: 'pendingChangeId is required' }, { status: 400 })
  }

  await ensureComplianceTables()
  try {
    const result = await withClient(async (client) => {
      const bundle = await client.query<{ status: string }>(
        `SELECT status FROM compliance_change_bundles WHERE id = $1 AND "companyId" = $2`,
        [id, companyId]
      )
      if (bundle.rows.length === 0) return { notFound: 'bundle' as const }
      if (bundle.rows[0].status !== 'drafted') {
        return { illegalState: true as const, error: `cannot modify items: bundle status is ${bundle.rows[0].status}` }
      }
      const change = await loadPendingChange(client, companyId, body.pendingChangeId!)
      if (!change) return { notFound: 'change' as const }
      try {
        assertStatusTransition(change.status, 'bundled')
      } catch (err) {
        return { illegalState: true as const, error: (err as Error).message }
      }

      // Determine displayOrder if not supplied — append to end.
      let displayOrder = body.displayOrder
      if (displayOrder === undefined) {
        const last = await client.query<{ max: number | null }>(
          `SELECT MAX("displayOrder") AS max FROM compliance_change_bundle_items WHERE "bundleId" = $1`,
          [id]
        )
        displayOrder = (last.rows[0]?.max ?? -1) + 1
      }

      await client.query(
        `INSERT INTO compliance_change_bundle_items ("bundleId", "pendingChangeId", "displayOrder", "createdAt")
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT ("bundleId", "pendingChangeId") DO NOTHING`,
        [id, body.pendingChangeId, displayOrder]
      )
      await client.query(
        `UPDATE compliance_pending_changes
         SET status = 'bundled', "bundleId" = $1, "updatedAt" = NOW()
         WHERE id = $2`,
        [id, body.pendingChangeId]
      )
      await writeAudit(client, {
        companyId,
        action: 'bundle.item_added',
        actor: session.user.email!,
        details: { bundleId: id, pendingChangeId: body.pendingChangeId, displayOrder },
      })
      return { ok: true as const }
    })

    if ('notFound' in result) {
      return NextResponse.json({ error: `${result.notFound} not found` }, { status: 404 })
    }
    if ('illegalState' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[compliance/bundles/items] POST error:', err)
    return NextResponse.json({ error: 'Failed to add bundle item' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, id } = await params
  const pendingChangeId = request.nextUrl.searchParams.get('pendingChangeId')
  if (!pendingChangeId) {
    return NextResponse.json({ error: 'pendingChangeId query param is required' }, { status: 400 })
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
        return { illegalState: true as const, error: `cannot modify items: bundle status is ${bundle.rows[0].status}` }
      }

      await client.query(
        `DELETE FROM compliance_change_bundle_items WHERE "bundleId" = $1 AND "pendingChangeId" = $2`,
        [id, pendingChangeId]
      )
      // Revert the pending change to 'drafted' if it was 'bundled' to this bundle.
      await client.query(
        `UPDATE compliance_pending_changes
         SET status = 'drafted', "bundleId" = NULL, "updatedAt" = NOW()
         WHERE id = $1 AND status = 'bundled' AND "bundleId" = $2`,
        [pendingChangeId, id]
      )
      await writeAudit(client, {
        companyId,
        action: 'bundle.item_removed',
        actor: session.user.email!,
        details: { bundleId: id, pendingChangeId },
      })
      return { ok: true as const }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ('illegalState' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[compliance/bundles/items] DELETE error:', err)
    return NextResponse.json({ error: 'Failed to remove bundle item' }, { status: 500 })
  }
}
