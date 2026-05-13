/**
 * GET  /api/compliance/[companyId]/bundles — list bundles
 * POST /api/compliance/[companyId]/bundles — create a new (empty) bundle
 *
 * See docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §6.2.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import {
  BUNDLE_STATUSES,
  type BundleStatus,
  withClient,
  writeAudit,
} from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

interface CreateBody {
  title?: string
  customerFacingNotes?: string | null
  internalNotes?: string | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId } = await params
  const statusFilter = request.nextUrl.searchParams.get('status')
  if (statusFilter && !BUNDLE_STATUSES.includes(statusFilter as BundleStatus)) {
    return NextResponse.json({ error: `invalid status: ${statusFilter}` }, { status: 400 })
  }

  await ensureComplianceTables()
  try {
    const rows = await withClient(async (client) => {
      const args: unknown[] = [companyId]
      let sql = `SELECT * FROM compliance_change_bundles WHERE "companyId" = $1`
      if (statusFilter) {
        sql += ` AND status = $2`
        args.push(statusFilter)
      }
      sql += ` ORDER BY "createdAt" DESC`
      const r = await client.query(sql, args)
      return r.rows
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    console.error('[compliance/bundles] GET error:', err)
    return NextResponse.json({ error: 'Failed to list bundles' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { companyId } = await params

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const title = (body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  await ensureComplianceTables()
  try {
    const id = await withClient(async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO compliance_change_bundles (
           "companyId", title, status, "customerFacingNotes", "internalNotes",
           "createdAt", "createdBy", "updatedAt"
         )
         VALUES ($1, $2, 'drafted', $3, $4, NOW(), $5, NOW())
         RETURNING id`,
        [companyId, title, body.customerFacingNotes ?? null, body.internalNotes ?? null, session.user.email]
      )
      await writeAudit(client, {
        companyId,
        action: 'bundle.created',
        actor: session.user.email!,
        details: { id: r.rows[0]?.id, title },
      })
      return r.rows[0]?.id
    })
    return NextResponse.json({ success: true, data: { id } }, { status: 201 })
  } catch (err) {
    console.error('[compliance/bundles] POST error:', err)
    return NextResponse.json({ error: 'Failed to create bundle' }, { status: 500 })
  }
}
