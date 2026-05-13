/**
 * POST /api/compliance/[companyId]/dispositions/link-project
 *
 * Hand off a finding to the customer's "Compliance Operations" project as a
 * new PhaseTask. Sets the disposition's lifecycleStatus to 'billable_project'
 * and links projectId/phaseTaskId. See COMPLIANCE_ARCHITECTURE.md §2.9.
 *
 * Body:
 *   {
 *     frameworkId: string
 *     controlId: string
 *     projectId: string         // an existing Project owned by the customer
 *     phaseTaskId?: string      // existing PhaseTask, or null to defer creation
 *     customerImpactSummary?: string
 *     internalNotes?: string
 *     dueDate?: string          // ISO datetime
 *   }
 *
 * Notes:
 *   - This endpoint only links an existing project. PhaseTask creation will be
 *     added once the per-customer "Compliance Operations" Project pattern is
 *     formalized (W7+/C17). For now, callers can pass an existing phaseTaskId
 *     that was created via the standard Project/Phase/Task admin.
 *   - Caller does not need to know whether a disposition already exists —
 *     this performs an upsert.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export const dynamic = 'force-dynamic'

interface LinkBody {
  frameworkId?: string
  controlId?: string
  projectId?: string
  phaseTaskId?: string | null
  customerImpactSummary?: string | null
  internalNotes?: string | null
  dueDate?: string | null
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

  let body: LinkBody
  try {
    body = (await request.json()) as LinkBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.frameworkId || !body.controlId || !body.projectId) {
    return NextResponse.json(
      { error: 'frameworkId, controlId, and projectId are required' },
      { status: 400 }
    )
  }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Verify the project belongs to this customer — otherwise this would be
    // a leakage into someone else's project list.
    const projectRes = await client.query<{ id: string }>(
      `SELECT id FROM projects WHERE id = $1 AND "companyId" = $2`,
      [body.projectId, companyId]
    )
    if (projectRes.rows.length === 0) {
      return NextResponse.json(
        { error: 'projectId not found for this company' },
        { status: 404 }
      )
    }

    // Optional: verify phaseTaskId belongs to the project.
    if (body.phaseTaskId) {
      const taskRes = await client.query<{ id: string }>(
        `SELECT pt.id
         FROM phase_tasks pt
         JOIN phases ph ON ph.id = pt."phaseId"
         WHERE pt.id = $1 AND ph."projectId" = $2`,
        [body.phaseTaskId, body.projectId]
      )
      if (taskRes.rows.length === 0) {
        return NextResponse.json(
          { error: 'phaseTaskId does not belong to projectId' },
          { status: 404 }
        )
      }
    }

    const upsert = await client.query<{ id: string }>(
      `INSERT INTO compliance_finding_dispositions (
         "companyId", "frameworkId", "controlId", "lifecycleStatus",
         "projectId", "phaseTaskId",
         "customerImpactSummary", "internalNotes", "dueDate",
         "decisionBy", "decidedAt", "lastReviewedAt",
         "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, 'billable_project', $4, $5, $6, $7, $8::timestamptz, $9, NOW(), NOW(), NOW(), NOW())
       ON CONFLICT ("companyId", "frameworkId", "controlId")
       DO UPDATE SET
         "lifecycleStatus" = 'billable_project',
         "projectId"       = $4,
         "phaseTaskId"     = COALESCE($5, compliance_finding_dispositions."phaseTaskId"),
         "customerImpactSummary" = COALESCE($6, compliance_finding_dispositions."customerImpactSummary"),
         "internalNotes"   = COALESCE($7, compliance_finding_dispositions."internalNotes"),
         "dueDate"         = $8::timestamptz,
         "decisionBy"      = $9,
         "decidedAt"       = NOW(),
         "lastReviewedAt"  = NOW(),
         "updatedAt"       = NOW()
       RETURNING id`,
      [
        companyId,
        body.frameworkId,
        body.controlId,
        body.projectId,
        body.phaseTaskId ?? null,
        body.customerImpactSummary ?? null,
        body.internalNotes ?? null,
        body.dueDate ?? null,
        session.user.email,
      ]
    )

    try {
      await client.query(
        `INSERT INTO compliance_audit_log ("companyId", action, actor, details)
         VALUES ($1, 'disposition.linked_to_project', $2, $3::jsonb)`,
        [
          companyId,
          session.user.email,
          JSON.stringify({
            frameworkId: body.frameworkId,
            controlId: body.controlId,
            projectId: body.projectId,
            phaseTaskId: body.phaseTaskId ?? null,
          }),
        ]
      )
    } catch (err) {
      console.error('[compliance/dispositions/link-project] audit log failed:', err)
    }

    return NextResponse.json({ success: true, data: { id: upsert.rows[0]?.id } })
  } catch (err) {
    console.error('[compliance/dispositions/link-project] error:', err)
    return NextResponse.json({ error: 'Failed to link disposition to project' }, { status: 500 })
  } finally {
    client.release()
  }
}
