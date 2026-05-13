/**
 * GET /api/cron/verify-pending-changes
 *
 * C12 — Verification worker. Closes the deploy → verify → complete loop
 * that the pending-change /deploy route opens.
 *
 * For each pending change in status='verifying' whose
 * (deployedAt + action.verification.delaySecondsBeforeVerify) has elapsed:
 *
 *   1. Look up the action in the catalog. Skip if missing or version drift.
 *   2. Determine the frameworks referenced by verification.evaluatorIds.
 *   3. For each (companyId, frameworkId) pair, kick off a fresh assessment
 *      (one per pair per cron tick, cached within this invocation).
 *   4. Read the resulting findings for the targeted control(s).
 *   5. Transition the pending change to:
 *        - 'complete'      — every targeted control now passes
 *        - 'rolled_back'   — any targeted control still fails
 *      The catalog's rollbackActionId is NOT auto-invoked; staff stages
 *      and deploys the rollback action explicitly so it appears in the
 *      audit trail as a separate change. See CHANGE_MANAGEMENT_AND_REMEDIATION.md §4.4.
 *   6. Write `verification` block into verificationResult JSONB and append
 *      a compliance_audit_log row.
 *
 * Resilience:
 *   - One bad change does not abort the whole run; errors are captured
 *     per-change and reported in the response.
 *   - Returns 200 with transient=true on connection/timeout/rate-limit so
 *     Vercel does not flag transient infrastructure issues as cron failures.
 *
 * Auth: Vercel cron sends Authorization: Bearer <CRON_SECRET>.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient } from 'pg'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { getRemediationAction } from '@/lib/compliance/actions/catalog'
import { createAssessment, runAssessment } from '@/lib/compliance/engine'
import { classifyError, structuredLog, generateCorrelationId } from '@/lib/resilience'
import { writeAudit } from '@/lib/compliance/change-management'
import type { FrameworkId } from '@/lib/compliance/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface VerifyingRow {
  id: string
  companyId: string
  actionId: string
  actionVersion: string
  deployedAt: string
  previousResult: unknown | null
}

interface EvaluatorResult {
  evaluatorId: string
  controlId: string
  frameworkId: string
  findingStatus: string | null
}

interface ChangeOutcome {
  changeId: string
  newStatus: 'complete' | 'rolled_back' | 'skipped'
  reason?: string
  evaluatorResults?: EvaluatorResult[]
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // --- Auth (Vercel cron sends Authorization: Bearer <CRON_SECRET>) ---
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const correlationId = generateCorrelationId()
  const ctx = {
    correlationId,
    operation: 'verify-pending-changes',
    route: '/api/cron/verify-pending-changes',
  }
  const startTime = Date.now()

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()

  try {
    const candidates = await client.query<VerifyingRow>(
      `SELECT id, "companyId", "actionId", "actionVersion", "deployedAt",
              "verificationResult" AS "previousResult"
       FROM compliance_pending_changes
       WHERE status = 'verifying' AND "deployedAt" IS NOT NULL
       ORDER BY "deployedAt" ASC
       LIMIT 50`
    )

    const outcomes: ChangeOutcome[] = []
    const assessmentCache = new Map<string, string>() // `${companyId}:${frameworkId}` → assessmentId

    for (const change of candidates.rows) {
      try {
        const outcome = await processChange(client, change, assessmentCache)
        outcomes.push(outcome)
      } catch (err) {
        const classified = classifyError(err)
        structuredLog.error(
          { ...ctx, changeId: change.id, errorCategory: classified.category },
          `Verification failed for change ${change.id}: ${classified.message}`,
          err
        )
        outcomes.push({
          changeId: change.id,
          newStatus: 'skipped',
          reason: `error: ${classified.message}`,
        })
      }
    }

    const completed = outcomes.filter((o) => o.newStatus === 'complete').length
    const rolledBack = outcomes.filter((o) => o.newStatus === 'rolled_back').length
    const skipped = outcomes.filter((o) => o.newStatus === 'skipped').length

    structuredLog.info(
      { ...ctx, durationMs: Date.now() - startTime, scanned: candidates.rows.length, completed, rolledBack, skipped },
      `Verification cycle done: ${completed} complete / ${rolledBack} rolled back / ${skipped} skipped`
    )

    return NextResponse.json({
      success: true,
      correlationId,
      scanned: candidates.rows.length,
      completed,
      rolledBack,
      skipped,
      outcomes,
      durationMs: Date.now() - startTime,
    })
  } catch (err) {
    const classified = classifyError(err)
    structuredLog.error(
      { ...ctx, durationMs: Date.now() - startTime, errorCategory: classified.category },
      `Verification cycle failed: ${classified.message}`,
      err
    )

    // Transient infra issues should not flag the cron run as failed; return
    // 200 so Vercel does not surface its own alert noise.
    if (classified.isTransient) {
      return NextResponse.json({
        success: false,
        transient: true,
        errorCategory: classified.category,
        correlationId,
      })
    }

    return NextResponse.json(
      { success: false, error: classified.message, correlationId },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

async function processChange(
  client: PoolClient,
  change: VerifyingRow,
  assessmentCache: Map<string, string>
): Promise<ChangeOutcome> {
  const action = getRemediationAction(change.actionId)
  if (!action) {
    await rollback(client, change, `action ${change.actionId} no longer exists in catalog`)
    return { changeId: change.id, newStatus: 'rolled_back', reason: 'catalog entry missing' }
  }
  if (action.version !== change.actionVersion) {
    await rollback(
      client,
      change,
      `action version drift: deployed against ${change.actionVersion}, catalog now ${action.version}`
    )
    return { changeId: change.id, newStatus: 'rolled_back', reason: 'catalog version drift' }
  }

  // Skip if the propagation delay has not elapsed yet.
  const deployedAtMs = new Date(change.deployedAt).getTime()
  const requiredDelayMs = (action.verification.delaySecondsBeforeVerify ?? 0) * 1000
  if (Date.now() - deployedAtMs < requiredDelayMs) {
    return {
      changeId: change.id,
      newStatus: 'skipped',
      reason: `propagation delay not yet elapsed (need ${action.verification.delaySecondsBeforeVerify}s)`,
    }
  }

  if (!action.verification.evaluatorIds || action.verification.evaluatorIds.length === 0) {
    // No evaluators to re-run — treat as complete (action is informational only).
    await markComplete(client, change, [])
    return { changeId: change.id, newStatus: 'complete', evaluatorResults: [] }
  }

  // Parse evaluator ids into (frameworkId, controlId). Format: '<framework>.<controlId>'.
  // The first '.' separates the framework from the (possibly-dotted) control id
  // so 'cis-v8.6.3' → framework='cis-v8', control='6.3'.
  const targets: Array<{ frameworkId: FrameworkId; controlId: string; evaluatorId: string }> = []
  for (const evaluatorId of action.verification.evaluatorIds) {
    const dotIdx = evaluatorId.indexOf('.')
    if (dotIdx <= 0 || dotIdx === evaluatorId.length - 1) {
      // Malformed — surface and roll back.
      await rollback(client, change, `malformed evaluatorId in catalog: ${evaluatorId}`)
      return { changeId: change.id, newStatus: 'rolled_back', reason: 'malformed evaluatorId' }
    }
    targets.push({
      frameworkId: evaluatorId.slice(0, dotIdx) as FrameworkId,
      controlId: evaluatorId.slice(dotIdx + 1),
      evaluatorId,
    })
  }

  // For each unique framework, ensure we have an assessment that's fresh
  // enough to verify against. Cache by (companyId, frameworkId) so we run
  // at most one assessment per pair per cron tick.
  const evaluatorResults: EvaluatorResult[] = []
  // es5 target can't iterate a Set directly, so dedupe through Array.from.
  const uniqueFrameworks = Array.from(new Set(targets.map((t) => t.frameworkId)))

  for (const frameworkId of uniqueFrameworks) {
    const cacheKey = `${change.companyId}:${frameworkId}`
    let assessmentId = assessmentCache.get(cacheKey)
    if (!assessmentId) {
      assessmentId = await createAssessment(change.companyId, frameworkId, 'verification-worker')
      await runAssessment(assessmentId, 'verification-worker')
      assessmentCache.set(cacheKey, assessmentId)
    }

    // Read findings for the targeted controls.
    const targetsForFramework = targets.filter((t) => t.frameworkId === frameworkId)
    const controlIds = targetsForFramework.map((t) => t.controlId)
    const findingsRes = await client.query<{ controlId: string; status: string; overrideStatus: string | null }>(
      `SELECT "controlId", status, "overrideStatus"
       FROM compliance_findings
       WHERE "assessmentId" = $1 AND "controlId" = ANY($2::text[])`,
      [assessmentId, controlIds]
    )
    const byControl = new Map(findingsRes.rows.map((r) => [r.controlId, r]))
    for (const t of targetsForFramework) {
      const f = byControl.get(t.controlId)
      // overrideStatus takes priority for human-edited findings.
      const effective = f?.overrideStatus ?? f?.status ?? null
      evaluatorResults.push({
        evaluatorId: t.evaluatorId,
        controlId: t.controlId,
        frameworkId: t.frameworkId,
        findingStatus: effective,
      })
    }
  }

  // Pass criterion: every targeted control is either 'pass' or 'not_applicable'.
  // Anything else (fail, partial, needs_review, not_assessed, missing) is a fail.
  const PASS_STATUSES = new Set(['pass', 'not_applicable'])
  const allPassed = evaluatorResults.every(
    (r) => r.findingStatus !== null && PASS_STATUSES.has(r.findingStatus)
  )

  if (allPassed) {
    await markComplete(client, change, evaluatorResults)
    return { changeId: change.id, newStatus: 'complete', evaluatorResults }
  } else {
    const failing = evaluatorResults
      .filter((r) => r.findingStatus === null || !PASS_STATUSES.has(r.findingStatus))
      .map((r) => `${r.evaluatorId}=${r.findingStatus ?? 'missing'}`)
      .join(', ')
    await rollback(
      client,
      change,
      `verification failed: ${failing}`,
      evaluatorResults
    )
    return { changeId: change.id, newStatus: 'rolled_back', reason: failing, evaluatorResults }
  }
}

async function markComplete(
  client: PoolClient,
  change: VerifyingRow,
  evaluatorResults: EvaluatorResult[]
): Promise<void> {
  await client.query(
    `UPDATE compliance_pending_changes
     SET status = 'complete',
         "verifiedAt" = NOW(),
         "verificationResult" = COALESCE("verificationResult", '{}'::jsonb) ||
           jsonb_build_object('verification', $1::jsonb),
         "updatedAt" = NOW()
     WHERE id = $2`,
    [
      JSON.stringify({ outcome: 'complete', evaluatorResults, verifiedAt: new Date().toISOString() }),
      change.id,
    ]
  )
  await writeAudit(client, {
    companyId: change.companyId,
    action: 'pending_change.verified',
    actor: 'verification-worker',
    details: { id: change.id, outcome: 'complete', evaluatorResults },
  })
}

async function rollback(
  client: PoolClient,
  change: VerifyingRow,
  reason: string,
  evaluatorResults: EvaluatorResult[] = []
): Promise<void> {
  await client.query(
    `UPDATE compliance_pending_changes
     SET status = 'rolled_back',
         "rolledBackAt" = NOW(),
         "rolledBackReason" = $1,
         "verificationResult" = COALESCE("verificationResult", '{}'::jsonb) ||
           jsonb_build_object('verification', $2::jsonb),
         "updatedAt" = NOW()
     WHERE id = $3`,
    [
      reason,
      JSON.stringify({ outcome: 'rolled_back', reason, evaluatorResults, verifiedAt: new Date().toISOString() }),
      change.id,
    ]
  )
  await writeAudit(client, {
    companyId: change.companyId,
    action: 'pending_change.verification_failed',
    actor: 'verification-worker',
    details: { id: change.id, reason, evaluatorResults },
  })
}
