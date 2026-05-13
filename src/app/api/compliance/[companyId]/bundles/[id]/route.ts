/**
 * GET   /api/compliance/[companyId]/bundles/[id] — read one bundle + its items
 * PATCH /api/compliance/[companyId]/bundles/[id] — edit title / notes (drafted only)
 *
 * Lifecycle transitions on sub-routes: /send, /cancel, /items, /items/[itemId]/decision.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { withClient, writeAudit } from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ companyId: string; id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, id } = await params

  await ensureComplianceTables()
  try {
    const data = await withClient(async (client) => {
      const bundle = await client.query(
        `SELECT * FROM compliance_change_bundles WHERE id = $1 AND "companyId" = $2`,
        [id, companyId]
      )
      if (bundle.rows.length === 0) return null
      const items = await client.query(
        `SELECT bi.*, pc."actionId", pc."actionVersion", pc."customerImpactSummary",
                pc.status AS "changeStatus", pc."scheduledFor", pc."deployedAt"
         FROM compliance_change_bundle_items bi
         JOIN compliance_pending_changes pc ON pc.id = bi."pendingChangeId"
         WHERE bi."bundleId" = $1
         ORDER BY bi."displayOrder"`,
        [id]
      )
      return { bundle: bundle.rows[0], items: items.rows }
    })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[compliance/bundles/:id] GET error:', err)
    return NextResponse.json({ error: 'Failed to read bundle' }, { status: 500 })
  }
}

interface PatchBody {
  title?: string
  customerFacingNotes?: string | null
  internalNotes?: string | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId, id } = await params

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  await ensureComplianceTables()
  try {
    const result = await withClient(async (client) => {
      const cur = await client.query<{ status: string; title: string }>(
        `SELECT status, title FROM compliance_change_bundles WHERE id = $1 AND "companyId" = $2`,
        [id, companyId]
      )
      if (cur.rows.length === 0) return { notFound: true as const }
      if (cur.rows[0].status !== 'drafted') {
        return { illegalState: true as const, error: `bundle can only be edited while drafted (current: ${cur.rows[0].status})` }
      }
      const title = body.title?.trim() ?? cur.rows[0].title
      if (!title) return { illegalState: true as const, error: 'title must be non-empty' }
      await client.query(
        `UPDATE compliance_change_bundles
         SET title = $1,
             "customerFacingNotes" = COALESCE($2, "customerFacingNotes"),
             "internalNotes" = COALESCE($3, "internalNotes"),
             "updatedAt" = NOW()
         WHERE id = $4`,
        [title, body.customerFacingNotes ?? null, body.internalNotes ?? null, id]
      )
      await writeAudit(client, {
        companyId,
        action: 'bundle.updated',
        actor: session.user.email!,
        details: { id, fieldsChanged: Object.keys(body) },
      })
      return { ok: true as const }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ('illegalState' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[compliance/bundles/:id] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update bundle' }, { status: 500 })
  }
}
