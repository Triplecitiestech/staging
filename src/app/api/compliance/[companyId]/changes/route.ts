/**
 * GET  /api/compliance/[companyId]/changes — list pending changes
 * POST /api/compliance/[companyId]/changes — create a new pending change
 *
 * See docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §6.1.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { getRemediationAction } from '@/lib/compliance/actions/catalog'
import {
  PENDING_CHANGE_STATUSES,
  type PendingChangeStatus,
  withClient,
  writeAudit,
} from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

interface CreateBody {
  actionId?: string
  linkedFindingIds?: string[]
  customerImpactSummary?: string
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
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  const statusFilter = request.nextUrl.searchParams.get('status')
  if (statusFilter && !PENDING_CHANGE_STATUSES.includes(statusFilter as PendingChangeStatus)) {
    return NextResponse.json({ error: `invalid status filter: ${statusFilter}` }, { status: 400 })
  }

  await ensureComplianceTables()
  try {
    const rows = await withClient(async (client) => {
      const args: unknown[] = [companyId]
      let sql = `SELECT * FROM compliance_pending_changes WHERE "companyId" = $1`
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
    console.error('[compliance/changes] GET error:', err)
    return NextResponse.json({ error: 'Failed to list pending changes' }, { status: 500 })
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
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.actionId) {
    return NextResponse.json({ error: 'actionId is required' }, { status: 400 })
  }

  const action = getRemediationAction(body.actionId)
  if (!action) {
    return NextResponse.json({ error: `unknown actionId: ${body.actionId}` }, { status: 400 })
  }

  // Default the customer impact to the catalog's plain-English string but allow
  // the staff member to refine it. Either way it must be non-empty.
  const customerImpactSummary = (body.customerImpactSummary ?? action.impact.userFacing).trim()
  if (!customerImpactSummary) {
    return NextResponse.json(
      { error: 'customerImpactSummary is required (must be a non-empty plain-English description)' },
      { status: 400 }
    )
  }

  await ensureComplianceTables()
  try {
    const newId = await withClient(async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO compliance_pending_changes (
           "companyId", "actionId", "actionVersion", "linkedFindingIds",
           "customerImpactSummary", "internalNotes", status,
           "createdAt", "createdBy", "updatedAt"
         )
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, 'drafted', NOW(), $7, NOW())
         RETURNING id`,
        [
          companyId,
          action.id,
          action.version,
          JSON.stringify(body.linkedFindingIds ?? []),
          customerImpactSummary,
          body.internalNotes ?? null,
          session.user.email,
        ]
      )
      await writeAudit(client, {
        companyId,
        action: 'pending_change.created',
        actor: session.user.email!,
        details: { id: r.rows[0]?.id, actionId: action.id, actionVersion: action.version },
      })
      return r.rows[0]?.id
    })

    return NextResponse.json({ success: true, data: { id: newId } }, { status: 201 })
  } catch (err) {
    console.error('[compliance/changes] POST error:', err)
    return NextResponse.json({ error: 'Failed to create pending change' }, { status: 500 })
  }
}
