/**
 * Finalization of async Exchange Online jobs — shared by the callback route
 * (/api/hr/exchange-callback) and the reconcile cron
 * (/api/cron/exchange-jobs-reconcile), which is why it lives here and not in
 * either route file.
 *
 * Honesty rules (the whole point of this subsystem — see docs/gotchas.md ->
 * HR Onboarding/Offboarding Automation):
 *  - [DONE] is written ONLY after evaluateExchangeJobResult asserted the
 *    runner's OBSERVED Exchange state matches what the job requested.
 *  - License removal for keep_accessible runs HERE, after the confirmed
 *    conversion, and only when the runner judged it safe (size/holds/archive).
 *  - Failures and timeouts post the manual fallback instruction and raise the
 *    ticket priority; nothing anywhere claims the work happened.
 *
 * All text written to Autotask uses ASCII markers only (CP1252 mangling).
 */

import { Resend } from 'resend'
import { getPool } from '@/lib/db-pool'
import { createGraphClient, getTenantCredentialsBySlug } from '@/lib/graph'
import { structuredLog, generateCorrelationId } from '@/lib/resilience'
import {
  completeExchangeJob,
  recordTenantProbeResult,
  type ExchangeCallbackBody,
  type ExchangeJobRow,
} from '@/lib/exchange-online'

const FROM_EMAIL = process.env.EMAIL_FROM || 'Triple Cities Tech <noreply@triplecitiestech.com>'

// ---------------------------------------------------------------------------
// Small local helpers (Autotask + step logging), mirroring the pipeline's shapes
// ---------------------------------------------------------------------------

function autotaskHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    UserName: process.env.AUTOTASK_API_USERNAME ?? '',
    Secret: process.env.AUTOTASK_API_SECRET ?? '',
    ApiIntegrationCode: process.env.AUTOTASK_API_INTEGRATION_CODE ?? '',
  }
}

async function addTicketNote(ticketId: number, title: string, description: string, publish: 1 | 2): Promise<void> {
  try {
    const { AutotaskClient } = await import('@/lib/autotask')
    const autotask = new AutotaskClient()
    await autotask.createTicketNote(ticketId, { title, description, noteType: 1, publish })
  } catch (err) {
    console.warn('[exchange-finalize] Ticket note failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}

async function patchTicket(ticketId: number, fields: Record<string, unknown>): Promise<void> {
  try {
    const baseUrl = (process.env.AUTOTASK_API_BASE_URL ?? '').replace(/\/$/, '')
    await fetch(`${baseUrl}/V1.0/Tickets`, {
      method: 'PATCH',
      headers: autotaskHeaders(),
      body: JSON.stringify({ id: ticketId, ...fields }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    console.warn('[exchange-finalize] Ticket PATCH failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}

/** Same row shape the pipeline's logStep writes to hr_request_steps */
async function insertStepRow(
  requestId: string,
  stepKey: string,
  stepName: string,
  status: 'completed' | 'failed',
  input: Record<string, unknown> | undefined,
  output: Record<string, unknown> | undefined,
  error?: string,
): Promise<void> {
  try {
    const pool = getPool()
    await pool.query(
      `INSERT INTO hr_request_steps
         (request_id, step_key, step_name, status, attempt, input, output, error, started_at, completed_at, created_at)
       VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6::jsonb, $7::jsonb, NOW(), NOW(), NOW())`,
      [
        requestId,
        stepKey,
        stepName,
        status,
        input ? JSON.stringify(input) : null,
        output ? JSON.stringify(output) : null,
        error ? JSON.stringify({ message: error }) : null,
      ],
    )
  } catch (err) {
    console.warn('[exchange-finalize] Step log failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}

/** Move step keys between the arrays in hr_requests.resolved_action_plan */
async function updateActionPlan(
  requestId: string,
  changes: { completed?: string[]; failed?: string[] },
): Promise<void> {
  try {
    const pool = getPool()
    const res = await pool.query<{ resolved_action_plan: Record<string, unknown> | string | null }>(
      `SELECT resolved_action_plan FROM hr_requests WHERE id = $1`,
      [requestId],
    )
    if (res.rows.length === 0) return
    const raw = res.rows[0].resolved_action_plan
    const plan = (typeof raw === 'string' ? JSON.parse(raw) : raw) ?? {}
    const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])
    const completedActions = asArray(plan.completedActions)
    const failedActions = asArray(plan.failedActions)
    const queuedActions = asArray(plan.queuedActions)
    const moved = [...(changes.completed ?? []), ...(changes.failed ?? [])]
    const next = {
      ...plan,
      completedActions: Array.from(new Set(completedActions.concat(changes.completed ?? []))),
      failedActions: Array.from(new Set(failedActions.concat(changes.failed ?? []))),
      queuedActions: queuedActions.filter((k) => !moved.includes(k)),
    }
    await pool.query(
      `UPDATE hr_requests SET resolved_action_plan = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [requestId, JSON.stringify(next)],
    )
  } catch (err) {
    console.warn('[exchange-finalize] Action-plan update failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}

/** Manual work left on the request beyond what this callback resolves */
async function remainingManualWork(requestId: string): Promise<{ manualCount: number; failedCount: number } | null> {
  try {
    const pool = getPool()
    const res = await pool.query<{ resolved_action_plan: Record<string, unknown> | string | null; status: string }>(
      `SELECT resolved_action_plan, status FROM hr_requests WHERE id = $1`,
      [requestId],
    )
    if (res.rows.length === 0) return null
    if (res.rows[0].status !== 'completed') return null // pipeline still running or failed — never auto-close
    const raw = res.rows[0].resolved_action_plan
    const plan = (typeof raw === 'string' ? JSON.parse(raw) : raw) ?? {}
    const manual = Array.isArray(plan.manualActions) ? plan.manualActions.length : 0
    const failed = Array.isArray(plan.failedActions) ? plan.failedActions.length : 0
    const queued = Array.isArray(plan.queuedActions) ? plan.queuedActions.length : 0
    return { manualCount: manual + queued, failedCount: failed }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Success continuation
// ---------------------------------------------------------------------------

export async function finalizeExchangeJobSuccess(job: ExchangeJobRow, callback: ExchangeCallbackBody): Promise<void> {
  const log = { correlationId: generateCorrelationId(), operation: 'exchange_finalize_success', jobId: job.id }
  const ctx = job.finalize_context
  const observed = callback.observed ?? {}

  if (job.job_type === 'probe') {
    await recordTenantProbeResult(job.company_slug, observed)
    await completeExchangeJob(job.id, 'succeeded', callback)
    return
  }

  const targetUpn = ctx?.targetUpn ?? job.payload?.targetUpn ?? 'unknown user'
  const recipients = ctx?.recipients ?? []

  if (job.hr_request_id) {
    await insertStepRow(
      job.hr_request_id,
      job.step_key ?? 'convert_shared_mailbox',
      'Convert Mailbox to Shared + Delegate Access',
      'completed',
      { jobId: job.id, targetUpn, recipients },
      { observed, azureJobIds: job.azure_job_ids ?? [] },
    )
  }

  // --- Deferred license removal (keep_accessible) --------------------------
  let licenseOutcome: 'removed' | 'retained' | 'failed' | 'not_deferred' = 'not_deferred'
  let licenseDetail = ''
  const removedLicenseNames: string[] = []
  if (ctx?.deferLicenseRemoval) {
    if (observed.licenseRemovalSafe === false) {
      licenseOutcome = 'retained'
      licenseDetail =
        (observed.licenseRetainReasons?.length
          ? observed.licenseRetainReasons.join('; ')
          : 'the runner flagged the mailbox as unsafe for license removal') +
        ' — an unlicensed shared mailbox is limited to 50 GB and holds/archives require a license.'
      if (job.hr_request_id) {
        await insertStepRow(job.hr_request_id, 'remove_licenses', 'Remove Licenses', 'failed',
          { userId: ctx?.targetUserId ?? undefined }, { retained: true, reasons: observed.licenseRetainReasons }, licenseDetail)
      }
    } else if (!ctx.targetUserId) {
      licenseOutcome = 'failed'
      licenseDetail = 'no target user id recorded on the job — remove the licenses manually'
    } else {
      try {
        const creds = await getTenantCredentialsBySlug(job.company_slug)
        if (!creds) throw new Error('M365 credentials unavailable for this company')
        const graph = createGraphClient(creds)
        const skus = await graph.getLicenseSkus()
        for (const sku of skus) {
          try {
            await graph.removeLicense(ctx.targetUserId, sku.skuId)
            removedLicenseNames.push(sku.displayName ?? sku.skuPartNumber)
          } catch {
            // License wasn't assigned to this user — ignore (same as the pipeline)
          }
        }
        licenseOutcome = 'removed'
        licenseDetail = removedLicenseNames.length > 0
          ? `removed ${removedLicenseNames.length} license(s): ${removedLicenseNames.join(', ')}`
          : 'no licenses were assigned'
        if (job.hr_request_id) {
          await insertStepRow(job.hr_request_id, 'remove_licenses', 'Remove Licenses', 'completed',
            { userId: ctx.targetUserId }, { removed: removedLicenseNames.length, names: removedLicenseNames })
        }
      } catch (err) {
        licenseOutcome = 'failed'
        licenseDetail = err instanceof Error ? err.message : String(err)
        if (job.hr_request_id) {
          await insertStepRow(job.hr_request_id, 'remove_licenses', 'Remove Licenses', 'failed',
            { userId: ctx.targetUserId }, undefined, licenseDetail)
        }
      }
    }
  }

  // --- Ticket record -------------------------------------------------------
  const grantLines = (observed.grants ?? []).map(
    (g) => `  [OK] ${g.upn} — Read and manage${g.sendAs ? ' + Send as' : ''}`,
  )
  if (ctx?.ticketId) {
    const internalLines = [
      'Exchange Online automation completed and VERIFIED (observed state, not assumed):',
      '',
      `[DONE] Mailbox converted to shared: ${targetUpn} (RecipientTypeDetails = ${observed.recipientTypeDetails})`,
      ...(grantLines.length > 0 ? ['Access granted:', ...grantLines] : ['No access recipients were requested on the form.']),
      '',
      licenseOutcome === 'removed'
        ? `[DONE] Microsoft 365 licenses removed — ${licenseDetail}`
        : licenseOutcome === 'retained'
          ? `[MANUAL] Licenses NOT removed: ${licenseDetail} Review with the customer before removing.`
          : licenseOutcome === 'failed'
            ? `[FAILED] License removal failed: ${licenseDetail} Remove the licenses manually (Microsoft 365 admin center -> Active users -> ${targetUpn} -> Licenses and apps).`
            : null,
      '',
      `Runner job: ${job.id}${callback.azureJobId ? ` / Azure job ${callback.azureJobId}` : ''}`,
      typeof observed.mailboxSizeBytes === 'number'
        ? `Mailbox size: ${(observed.mailboxSizeBytes / 1024 ** 3).toFixed(2)} GB; litigation hold: ${observed.litigationHold ? 'YES' : 'no'}; in-place holds: ${observed.inPlaceHoldCount ?? 0}; archive: ${observed.archiveActive ? 'active' : 'none'}`
        : null,
    ].filter((l): l is string => l !== null)
    await addTicketNote(ctx.ticketId, 'Mailbox Conversion Completed (automated)', internalLines.join('\n'), 2)

    const customerLines = [
      `The mailbox for ${ctx.employeeName ?? targetUpn} has been converted to a shared mailbox.`,
      ...(recipients.length > 0 ? ['', `Access has been granted to: ${recipients.join(', ')}.`] : []),
      licenseOutcome === 'removed' ? '' : null,
      licenseOutcome === 'removed' ? 'The Microsoft 365 license has been removed.' : null,
      licenseOutcome === 'retained'
        ? 'The Microsoft 365 license is being kept for now (mailbox size or a legal hold requires it) — our team will follow up.'
        : null,
    ].filter((l): l is string => l !== null)
    await addTicketNote(ctx.ticketId, 'Shared Mailbox Ready', customerLines.join('\n'), 1)

    // Close only when this was the last open item and nothing failed/manual remains
    const remaining = job.hr_request_id ? await remainingManualWork(job.hr_request_id) : null
    const licenseClean = licenseOutcome === 'removed' || licenseOutcome === 'not_deferred'
    if (remaining && remaining.manualCount === 0 && remaining.failedCount === 0 && licenseClean) {
      await patchTicket(ctx.ticketId, { status: 5 })
    } else if (licenseOutcome === 'retained' || licenseOutcome === 'failed') {
      await patchTicket(ctx.ticketId, { priority: 3 })
    }
  }

  // --- Customer email ------------------------------------------------------
  if (process.env.RESEND_API_KEY && ctx?.submitterEmail) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: FROM_EMAIL,
        to: ctx.submitterEmail,
        subject: `Shared Mailbox Ready — ${ctx.employeeName ?? targetUpn}`,
        text: [
          `Hi${ctx.submitterName ? ` ${ctx.submitterName}` : ''},`,
          '',
          `The mailbox for ${ctx.employeeName ?? targetUpn} has been converted to a shared mailbox.`,
          ...(recipients.length > 0 ? [`Access has been granted to: ${recipients.join(', ')}.`] : []),
          licenseOutcome === 'removed' ? 'The Microsoft 365 license has been removed.' : '',
          licenseOutcome === 'retained'
            ? 'The Microsoft 365 license is being kept for now (mailbox size or a legal hold requires it) — our team will follow up with you.'
            : '',
          '',
          'Triple Cities Tech',
        ].filter((l) => l !== '').join('\n'),
      })
    } catch (err) {
      console.warn('[exchange-finalize] Email failed (non-fatal):', err instanceof Error ? err.message : err)
    }
  }

  // --- Bookkeeping ----------------------------------------------------------
  await completeExchangeJob(job.id, 'succeeded', callback)
  if (job.hr_request_id) {
    const completed = [job.step_key ?? 'convert_shared_mailbox']
    const failed: string[] = []
    if (licenseOutcome === 'removed') completed.push('remove_licenses')
    if (licenseOutcome === 'retained' || licenseOutcome === 'failed') failed.push('remove_licenses')
    await updateActionPlan(job.hr_request_id, { completed, failed })
  }
  structuredLog.info({ ...log, licenseOutcome }, 'Exchange job finalized as succeeded')
}

// ---------------------------------------------------------------------------
// Failure / timeout continuation (also used by the reconcile cron)
// ---------------------------------------------------------------------------

export async function finalizeExchangeJobFailure(
  job: ExchangeJobRow,
  errorSummary: string,
  options: { timedOut?: boolean; callback?: ExchangeCallbackBody } = {},
): Promise<void> {
  const log = { correlationId: generateCorrelationId(), operation: 'exchange_finalize_failure', jobId: job.id }
  const ctx = job.finalize_context
  const targetUpn = ctx?.targetUpn ?? job.payload?.targetUpn ?? 'unknown user'
  const marker = options.timedOut ? 'TIMED OUT' : 'FAILED'

  if (job.job_type === 'probe') {
    await recordTenantProbeResult(job.company_slug, { probeOk: false, error: errorSummary })
    await completeExchangeJob(job.id, options.timedOut ? 'timed_out' : 'failed', options.callback ?? null, errorSummary)
    return
  }

  if (job.hr_request_id) {
    await insertStepRow(
      job.hr_request_id,
      job.step_key ?? 'convert_shared_mailbox',
      'Convert Mailbox to Shared + Delegate Access',
      'failed',
      { jobId: job.id, targetUpn },
      options.callback?.observed ? { observed: options.callback.observed } : undefined,
      errorSummary,
    )
  }

  if (ctx?.ticketId) {
    const lines = [
      `[${marker}] Exchange Online automation did NOT complete the mailbox conversion for ${targetUpn}.`,
      '',
      `Error: ${errorSummary}`,
      '',
      'Complete it manually:',
      `  ${ctx.manualInstruction ?? `Convert the mailbox for ${targetUpn} to a SHARED mailbox (Microsoft 365 admin center -> Active users -> ${targetUpn} -> Mail -> Convert to shared mailbox)${ctx.recipients.length > 0 ? `, then grant Read and manage + Send as access to: ${ctx.recipients.join(', ')}` : ''}. The license is still assigned — remove it after converting.`}`,
      '',
      `Runner job: ${job.id}${options.callback?.azureJobId ? ` / Azure job ${options.callback.azureJobId}` : ''}`,
    ]
    await addTicketNote(ctx.ticketId, `Mailbox Conversion ${marker} — Manual Completion Required`, lines.join('\n'), 2)
    await patchTicket(ctx.ticketId, { priority: 3 })
  }

  await completeExchangeJob(job.id, options.timedOut ? 'timed_out' : 'failed', options.callback ?? null, errorSummary)
  if (job.hr_request_id) {
    await updateActionPlan(job.hr_request_id, { failed: [job.step_key ?? 'convert_shared_mailbox'] })
  }
  structuredLog.warn({ ...log, timedOut: options.timedOut === true }, `Exchange job finalized as ${marker.toLowerCase()}: ${errorSummary}`)
}
