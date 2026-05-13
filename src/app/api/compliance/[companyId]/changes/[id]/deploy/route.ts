/**
 * POST /api/compliance/[companyId]/changes/[id]/deploy
 *
 * Run the action's executor (automated handler or manual confirmation),
 * record the result, and move the pending change toward verification.
 *
 * Status flow:
 *   scheduled → deploying → verifying → complete | rolled_back
 *
 * Verification (re-running the relevant evaluator after delaySecondsBeforeVerify)
 * is intentionally deferred to a follow-up: this route stops at 'verifying'
 * with the executor result captured, and a separate verification worker
 * advances it to 'complete' or 'rolled_back'. For automated actions with
 * stub handlers (today, all of them), the result indicates a stub run and
 * staff should treat the verification step as advisory until real handlers
 * land in C12/C13 follow-up work.
 *
 * Body (optional):
 *   { confirmManual?: boolean }  — required for manual executors
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { getRemediationAction } from '@/lib/compliance/actions/catalog'
import { executeAction } from '@/lib/compliance/actions/executors'
import { previewImpact } from '@/lib/compliance/actions/previewers'
import {
  assertStatusTransition,
  loadPendingChange,
  withClient,
  writeAudit,
} from '@/lib/compliance/change-management'

export const dynamic = 'force-dynamic'

interface Body {
  confirmManual?: boolean
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

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    // optional body
  }

  await ensureComplianceTables()
  try {
    const result = await withClient(async (client) => {
      const current = await loadPendingChange(client, companyId, id)
      if (!current) return { notFound: true as const }

      try {
        assertStatusTransition(current.status, 'deploying')
      } catch (err) {
        return { illegalState: true as const, error: (err as Error).message }
      }

      const action = getRemediationAction(current.actionId)
      if (!action) {
        return { illegalState: true as const, error: `action ${current.actionId} no longer exists in the catalog` }
      }
      if (action.version !== current.actionVersion) {
        // Version drift — surface and refuse rather than silently running a different action.
        return {
          illegalState: true as const,
          error: `action ${current.actionId} version drift: pending change staged against ${current.actionVersion}, catalog now ${action.version}`,
        }
      }
      if (action.executor.kind === 'manual' && !body.confirmManual) {
        return {
          illegalState: true as const,
          error: 'manual executor requires { "confirmManual": true } to acknowledge the change was performed in the vendor console',
        }
      }

      // Run the impact previewer FIRST (read-only) so the affected-entity
      // list is captured in audit before any mutation happens. If the
      // previewer is a stub (no live query), the result still records that
      // fact so the audit trail is honest. We intentionally don't *gate*
      // deploy on a successful live preview — that would block manual
      // executors and actions whose previewers aren't wired yet. The
      // cockpit UI is the right place to enforce "tech must view this
      // list before deploying".
      const preview = await previewImpact({ companyId, action })
      await writeAudit(client, {
        companyId,
        action: 'pending_change.impact_previewed',
        actor: session.user.email!,
        details: {
          id,
          actionId: action.id,
          totalAffected: preview.totalAffected,
          isLiveQuery: preview.isLiveQuery,
          warnings: preview.warnings ?? [],
        },
      })

      // Move to 'deploying' so the row reflects in-flight state.
      await client.query(
        `UPDATE compliance_pending_changes
         SET status = 'deploying', "deployedAt" = NOW(), "deployedBy" = $1, "updatedAt" = NOW()
         WHERE id = $2`,
        [session.user.email, id]
      )
      await writeAudit(client, {
        companyId,
        action: 'pending_change.deploying',
        actor: session.user.email!,
        details: { id, actionId: action.id, actionVersion: action.version, executorKind: action.executor.kind },
      })

      const exec = await executeAction({
        companyId,
        staffEmail: session.user.email!,
        action,
      })

      // Move to 'verifying'. The actual evaluator re-run is performed by
      // the verification worker; this route captures the executor's
      // structured result + the impact preview snapshot for later
      // inspection (the preview shows what we expected to change; the
      // verification shows what actually changed).
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
          id,
        ]
      )
      await writeAudit(client, {
        companyId,
        action: exec.success ? 'pending_change.deployed' : 'pending_change.deploy_failed',
        actor: session.user.email!,
        details: { id, summary: exec.summary, success: exec.success },
      })

      return { ok: true as const, executor: exec }
    })

    if ('notFound' in result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ('illegalState' in result) return NextResponse.json({ error: result.error }, { status: 409 })
    return NextResponse.json({ success: true, data: { executor: result.executor } })
  } catch (err) {
    console.error('[compliance/changes/deploy] error:', err)
    return NextResponse.json({ error: 'Failed to deploy pending change' }, { status: 500 })
  }
}
