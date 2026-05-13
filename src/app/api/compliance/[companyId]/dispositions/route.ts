/**
 * GET  /api/compliance/[companyId]/dispositions — list lifecycle dispositions for a company
 * POST /api/compliance/[companyId]/dispositions — upsert a disposition for one (framework, control)
 *
 * Dispositions are the durable human decision about what to do with a failed
 * control — accept the risk, schedule a fix, hand it to a billable project,
 * customer declined, etc. They survive reassessment runs (which only update
 * the underlying compliance_findings row). See COMPLIANCE_ARCHITECTURE.md §2.7
 * and CHANGE_MANAGEMENT_AND_REMEDIATION.md §5.4.
 *
 * Query params (GET):
 *   frameworkId? — filter to one framework (e.g. 'cis-v8')
 *   status?      — filter to one lifecycleStatus
 *
 * POST body:
 *   {
 *     frameworkId: string
 *     controlId: string
 *     lifecycleStatus?: 'open' | 'accepted_risk' | 'scheduled' | 'in_progress'
 *                     | 'completed' | 'customer_declined' | 'billable_project' | 'superseded'
 *     assignedTo?: string                  // staff user id
 *     dueDate?: string | null              // ISO datetime
 *     projectId?: string | null
 *     phaseTaskId?: string | null
 *     customerImpactSummary?: string | null
 *     internalNotes?: string | null
 *     acceptedRiskRationale?: string | null
 *     supersededByPendingChangeId?: string | null
 *   }
 *
 *   On upsert, lastReviewedAt is set to NOW(). decisionBy/decidedAt are set
 *   from the session if lifecycleStatus is being changed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set([
  'open',
  'accepted_risk',
  'scheduled',
  'in_progress',
  'completed',
  'customer_declined',
  'billable_project',
  'superseded',
])

export interface DispositionRow {
  id: string
  companyId: string
  frameworkId: string
  controlId: string
  lifecycleStatus: string
  assignedTo: string | null
  dueDate: string | null
  projectId: string | null
  phaseTaskId: string | null
  customerImpactSummary: string | null
  internalNotes: string | null
  acceptedRiskRationale: string | null
  decisionBy: string | null
  decidedAt: string | null
  lastReviewedAt: string | null
  supersededByPendingChangeId: string | null
  createdAt: string
  updatedAt: string
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
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  const frameworkId = request.nextUrl.searchParams.get('frameworkId')
  const status = request.nextUrl.searchParams.get('status')

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const filters = ['"companyId" = $1']
    const args: unknown[] = [companyId]
    if (frameworkId) {
      filters.push(`"frameworkId" = $${args.length + 1}`)
      args.push(frameworkId)
    }
    if (status) {
      if (!VALID_STATUSES.has(status)) {
        return NextResponse.json({ error: 'invalid status filter' }, { status: 400 })
      }
      filters.push(`"lifecycleStatus" = $${args.length + 1}`)
      args.push(status)
    }

    const res = await client.query<DispositionRow>(
      `SELECT
         id, "companyId", "frameworkId", "controlId", "lifecycleStatus",
         "assignedTo", "dueDate", "projectId", "phaseTaskId",
         "customerImpactSummary", "internalNotes", "acceptedRiskRationale",
         "decisionBy", "decidedAt", "lastReviewedAt", "supersededByPendingChangeId",
         "createdAt", "updatedAt"
       FROM compliance_finding_dispositions
       WHERE ${filters.join(' AND ')}
       ORDER BY "frameworkId", "controlId"`,
      args
    )

    return NextResponse.json({ success: true, data: res.rows })
  } catch (err) {
    console.error('[compliance/dispositions] GET error:', err)
    return NextResponse.json({ error: 'Failed to load dispositions' }, { status: 500 })
  } finally {
    client.release()
  }
}

interface UpsertBody {
  frameworkId?: string
  controlId?: string
  lifecycleStatus?: string
  assignedTo?: string | null
  dueDate?: string | null
  projectId?: string | null
  phaseTaskId?: string | null
  customerImpactSummary?: string | null
  internalNotes?: string | null
  acceptedRiskRationale?: string | null
  supersededByPendingChangeId?: string | null
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
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  let body: UpsertBody
  try {
    body = (await request.json()) as UpsertBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.frameworkId || !body.controlId) {
    return NextResponse.json({ error: 'frameworkId and controlId are required' }, { status: 400 })
  }
  if (body.lifecycleStatus && !VALID_STATUSES.has(body.lifecycleStatus)) {
    return NextResponse.json({ error: `invalid lifecycleStatus: ${body.lifecycleStatus}` }, { status: 400 })
  }
  if (body.lifecycleStatus === 'accepted_risk' && !body.acceptedRiskRationale) {
    return NextResponse.json(
      { error: 'acceptedRiskRationale is required when lifecycleStatus is accepted_risk' },
      { status: 400 }
    )
  }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Read existing row to determine which fields are actually changing.
    // decisionBy/decidedAt are stamped only when lifecycleStatus changes.
    const existingRes = await client.query<{ lifecycleStatus: string }>(
      `SELECT "lifecycleStatus" FROM compliance_finding_dispositions
       WHERE "companyId" = $1 AND "frameworkId" = $2 AND "controlId" = $3`,
      [companyId, body.frameworkId, body.controlId]
    )
    const previousStatus = existingRes.rows[0]?.lifecycleStatus ?? null
    const newStatus = body.lifecycleStatus ?? previousStatus ?? 'open'
    const statusChanged = previousStatus !== newStatus
    const stampDecision = statusChanged

    // Sparse merge — only fields the caller sent are updated. Use COALESCE
    // to preserve existing values when the caller omits a field, but allow
    // explicit null to clear it.
    const result = await client.query<{ id: string }>(
      `INSERT INTO compliance_finding_dispositions (
         "companyId", "frameworkId", "controlId", "lifecycleStatus",
         "assignedTo", "dueDate", "projectId", "phaseTaskId",
         "customerImpactSummary", "internalNotes", "acceptedRiskRationale",
         "decisionBy", "decidedAt", "lastReviewedAt",
         "supersededByPendingChangeId", "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10, $11,
               $12, $13::timestamptz, NOW(), $14, NOW(), NOW())
       ON CONFLICT ("companyId", "frameworkId", "controlId")
       DO UPDATE SET
         "lifecycleStatus"             = $4,
         "assignedTo"                  = COALESCE($5, compliance_finding_dispositions."assignedTo"),
         "dueDate"                     = $6::timestamptz,
         "projectId"                   = COALESCE($7, compliance_finding_dispositions."projectId"),
         "phaseTaskId"                 = COALESCE($8, compliance_finding_dispositions."phaseTaskId"),
         "customerImpactSummary"       = COALESCE($9, compliance_finding_dispositions."customerImpactSummary"),
         "internalNotes"               = COALESCE($10, compliance_finding_dispositions."internalNotes"),
         "acceptedRiskRationale"       = COALESCE($11, compliance_finding_dispositions."acceptedRiskRationale"),
         "decisionBy"                  = CASE WHEN $15::boolean THEN $12 ELSE compliance_finding_dispositions."decisionBy" END,
         "decidedAt"                   = CASE WHEN $15::boolean THEN $13::timestamptz ELSE compliance_finding_dispositions."decidedAt" END,
         "lastReviewedAt"              = NOW(),
         "supersededByPendingChangeId" = COALESCE($14, compliance_finding_dispositions."supersededByPendingChangeId"),
         "updatedAt"                   = NOW()
       RETURNING id`,
      [
        companyId,
        body.frameworkId,
        body.controlId,
        newStatus,
        body.assignedTo ?? null,
        body.dueDate ?? null,
        body.projectId ?? null,
        body.phaseTaskId ?? null,
        body.customerImpactSummary ?? null,
        body.internalNotes ?? null,
        body.acceptedRiskRationale ?? null,
        stampDecision ? session.user.email : null,
        stampDecision ? new Date().toISOString() : null,
        body.supersededByPendingChangeId ?? null,
        stampDecision,
      ]
    )

    // Audit log
    try {
      await client.query(
        `INSERT INTO compliance_audit_log ("companyId", action, actor, details)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          companyId,
          statusChanged
            ? (previousStatus ? 'disposition.status_changed' : 'disposition.created')
            : 'disposition.updated',
          session.user.email,
          JSON.stringify({
            frameworkId: body.frameworkId,
            controlId: body.controlId,
            previousStatus,
            newStatus,
          }),
        ]
      )
    } catch (err) {
      console.error('[compliance/dispositions] audit log write failed:', err)
    }

    return NextResponse.json({
      success: true,
      data: { id: result.rows[0]?.id, statusChanged, previousStatus, newStatus },
    })
  } catch (err) {
    console.error('[compliance/dispositions] POST error:', err)
    return NextResponse.json({ error: 'Failed to upsert disposition' }, { status: 500 })
  } finally {
    client.release()
  }
}
