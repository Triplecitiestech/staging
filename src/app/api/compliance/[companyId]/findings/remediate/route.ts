/**
 * POST /api/compliance/[companyId]/findings/remediate
 *
 * Fast-path "Remediate this finding now" endpoint used by the Remediate
 * button on the Findings page. Two modes — operator clicks Remediate
 * once for a preview, then Confirm to apply. Bypasses the bundle /
 * customer-approval flow, which is only needed when the customer must
 * sign off; routine MSP-applied config changes go straight to deploy.
 *
 * Body:
 *   {
 *     actionId: string,              // remediation catalog id
 *     frameworkId?: string,          // for the linked-finding back-pointer
 *     controlId?: string,            // ditto (not used yet but audited)
 *     findingId?: string,            // ditto (audited so we know which finding triggered it)
 *     confirm: boolean,              // false = preview only (no DB writes); true = create + deploy
 *   }
 *
 * Preview response (confirm=false):
 *   { success: true, mode: 'preview', data: { action, preview, hasRealPreviewer } }
 *
 * Apply response (confirm=true):
 *   { success: true, mode: 'apply', data: { pendingChangeId, preview, executor } }
 *
 * Apply refuses (409) if any hard precondition fails (license missing,
 * tool not deployed, etc.) — exactly the same gate the
 * /changes/[id]/deploy route enforces, so this route can't slip a
 * dangerous change through.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { getRemediationAction } from '@/lib/compliance/actions/catalog'
import { previewImpact, hasRealPreviewer } from '@/lib/compliance/actions/previewers'
import { executeAction } from '@/lib/compliance/actions/executors'
import { withClient, writeAudit } from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Body {
  actionId?: string
  frameworkId?: string
  controlId?: string
  findingId?: string
  confirm?: boolean
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

  let body: Body
  try {
    body = (await request.json()) as Body
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

  await ensureComplianceTables()

  // ----- PREVIEW MODE -----
  // No DB writes. Pure read: previewer + precondition check. Lets the
  // operator see what's about to happen before committing.
  if (!body.confirm) {
    try {
      const preview = await previewImpact({ companyId, action })
      return NextResponse.json({
        success: true,
        mode: 'preview',
        data: {
          action: {
            id: action.id,
            name: action.name,
            version: action.version,
            impact: action.impact,
            executorKind: action.executor.kind,
            executorHandler: action.executor.kind === 'automated' ? action.executor.handler : null,
          },
          preview,
          hasRealPreviewer:
            action.executor.kind === 'automated'
              ? hasRealPreviewer(action.executor.handler)
              : false,
        },
      })
    } catch (err) {
      console.error('[compliance/remediate] preview error:', err)
      return NextResponse.json({ error: 'Failed to run impact preview' }, { status: 500 })
    }
  }

  // ----- APPLY MODE -----
  // 1. Create the pending change (status='drafted').
  // 2. Run preview again as the authoritative pre-flight (audit-logged).
  // 3. Refuse if any hard precondition fails — same gate as /deploy.
  // 4. Transition drafted → deploying, run executor, transition → verifying.
  // All under one withClient transaction so partial state can't leak.
  try {
    const result = await withClient(async (client) => {
      const created = await client.query<{ id: string }>(
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
          JSON.stringify(body.findingId ? [body.findingId] : []),
          action.impact.userFacing,
          body.frameworkId || body.controlId
            ? `Remediate-button fast-path — ${body.frameworkId ?? '?'} / ${body.controlId ?? '?'}`
            : null,
          session.user!.email,
        ]
      )
      const pendingChangeId = created.rows[0].id
      await writeAudit(client, {
        companyId,
        action: 'pending_change.created',
        actor: session.user!.email!,
        details: {
          id: pendingChangeId,
          actionId: action.id,
          actionVersion: action.version,
          via: 'findings_remediate_button',
          findingId: body.findingId ?? null,
          frameworkId: body.frameworkId ?? null,
          controlId: body.controlId ?? null,
        },
      })

      // Authoritative preview — captures preconditions for audit before
      // we touch the customer's tenant.
      const preview = await previewImpact({ companyId, action })
      await writeAudit(client, {
        companyId,
        action: 'pending_change.impact_previewed',
        actor: session.user!.email!,
        details: {
          id: pendingChangeId,
          actionId: action.id,
          totalAffected: preview.totalAffected,
          isLiveQuery: preview.isLiveQuery,
          warnings: preview.warnings ?? [],
          preconditionResults: preview.preconditions?.results ?? [],
          preconditionAllPass: preview.preconditions?.allPass ?? null,
        },
      })

      if (preview.preconditions?.anyHardFail) {
        const failures = preview.preconditions.results
          .filter((r) => r.status === 'fail')
          .map((r) => r.message)
        return {
          refused: true as const,
          pendingChangeId,
          error:
            'Precondition check failed; remediate refused. Fix each item and try again: ' +
            failures.map((f, i) => `(${i + 1}) ${f}`).join(' '),
          preview,
        }
      }

      // Drafted → deploying (allowed by the new fast-path transition).
      await client.query(
        `UPDATE compliance_pending_changes
         SET status = 'deploying', "deployedAt" = NOW(), "deployedBy" = $1, "updatedAt" = NOW()
         WHERE id = $2`,
        [session.user!.email, pendingChangeId]
      )
      await writeAudit(client, {
        companyId,
        action: 'pending_change.deploying',
        actor: session.user!.email!,
        details: {
          id: pendingChangeId,
          actionId: action.id,
          actionVersion: action.version,
          executorKind: action.executor.kind,
          via: 'findings_remediate_button',
        },
      })

      const exec = await executeAction({
        companyId,
        staffEmail: session.user!.email!,
        action,
      })

      // Drafted → deploying → verifying. The verification worker
      // re-runs the relevant evaluator on its own cadence and advances
      // to complete or rolled_back.
      await client.query(
        `UPDATE compliance_pending_changes
         SET status = 'verifying',
             "verificationResult" = $1::jsonb,
             "updatedAt" = NOW()
         WHERE id = $2`,
        [
          JSON.stringify({
            executorSummary: exec.summary,
            executorDetails: exec.details ?? null,
            executorSuccess: exec.success,
            preview,
          }),
          pendingChangeId,
        ]
      )
      await writeAudit(client, {
        companyId,
        action: exec.success ? 'pending_change.deployed' : 'pending_change.deploy_failed',
        actor: session.user!.email!,
        details: { id: pendingChangeId, summary: exec.summary, success: exec.success, via: 'findings_remediate_button' },
      })

      return {
        ok: true as const,
        pendingChangeId,
        preview,
        executor: exec,
      }
    })

    if ('refused' in result) {
      return NextResponse.json(
        { error: result.error, data: { pendingChangeId: result.pendingChangeId, preview: result.preview } },
        { status: 409 }
      )
    }
    return NextResponse.json({
      success: true,
      mode: 'apply',
      data: {
        pendingChangeId: result.pendingChangeId,
        preview: result.preview,
        executor: result.executor,
      },
    })
  } catch (err) {
    console.error('[compliance/remediate] apply error:', err)
    return NextResponse.json({ error: 'Failed to apply remediation' }, { status: 500 })
  }
}
