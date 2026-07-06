/**
 * Exchange Online automation dispatch — the ONLY module that talks to the
 * Azure Automation runner.
 *
 * Why this exists: Microsoft Graph cannot convert a mailbox to shared, grant
 * Full Access / Send As, or set forwarding — those are Exchange Online
 * management operations (see docs/gotchas.md -> HR Onboarding/Offboarding).
 * They are executed by an Azure Automation runbook (Exchange Online
 * PowerShell v3, app-only certificate auth) that this module dispatches jobs
 * to over an HMAC-signed webhook. The runbook re-reads Exchange state after
 * acting and POSTs the OBSERVED result to /api/hr/exchange-callback; nothing
 * on the platform ever marks the work [DONE] from a dispatch acknowledgment.
 *
 * Job lifecycle (hr_exchange_jobs.status):
 *   pending -> dispatched -> processing -> succeeded | failed
 *                 |                            ^
 *                 +-- timed_out (reconcile cron; no callback arrived)
 *
 * Kill switch: EXO_AUTOMATION_ENABLED must be exactly 'true' AND the webhook
 * URL + both HMAC secrets must be configured, or every availability check
 * returns unavailable and offboardings degrade to today's [MANUAL] outcome.
 *
 * Tables (raw-pg, snake_case like all HR tables — ensured in
 * /api/migrations/run): hr_exchange_jobs, exo_tenant_config.
 */

import crypto from 'crypto'
import { getPool } from '@/lib/db-pool'
import { withRetry, classifyError, structuredLog, generateCorrelationId } from '@/lib/resilience'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExchangeJobType = 'convert_to_shared' | 'set_forwarding' | 'probe'

export type ExchangeJobStatus =
  | 'pending'
  | 'dispatched'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'timed_out'

export interface ExchangeDelegate {
  upn: string
  /** "Read and manage" in the admin center */
  fullAccess: boolean
  sendAs: boolean
}

/** Payload signed and sent to the Azure Automation webhook */
export interface ExchangeJobPayload {
  jobId: string
  action: ExchangeJobType
  /** Entra tenant GUID of the customer tenant */
  tenantId: string
  /** Primary .onmicrosoft.com domain — Connect-ExchangeOnline -Organization */
  organization: string
  targetUpn?: string
  delegates?: ExchangeDelegate[]
  /** Phase 2: forwarding recipient */
  forwardTo?: string
  callbackUrl: string
  issuedAt: string
  hrRequestId?: string
  companySlug: string
}

/** Context the callback needs to finalize the ticket without re-deriving the pipeline */
export interface ExchangeFinalizeContext {
  ticketId: number | null
  ticketNumber?: string | null
  submitterEmail?: string | null
  submitterName?: string | null
  employeeName?: string | null
  targetUserId?: string | null
  targetUpn?: string | null
  companyName?: string | null
  recipients: string[]
  /** Callback removes licenses after a confirmed conversion (keep_accessible) */
  deferLicenseRemoval: boolean
  /** Manual fallback instruction computed at dispatch time (used on failure/timeout) */
  manualInstruction?: string
}

/** Body the runbook POSTs back to /api/hr/exchange-callback */
export interface ExchangeCallbackBody {
  jobId: string
  status: 'succeeded' | 'failed'
  observed?: ExchangeObservedState
  error?: string | null
  azureJobId?: string | null
  startedAt?: string
  finishedAt?: string
}

/** State the runbook OBSERVED by re-reading Exchange after acting */
export interface ExchangeObservedState {
  recipientTypeDetails?: string
  grants?: Array<{ upn: string; fullAccess: boolean; sendAs: boolean }>
  mailboxSizeBytes?: number
  litigationHold?: boolean
  inPlaceHoldCount?: number
  archiveActive?: boolean
  /** Runner's verdict on whether the license can be removed (size/holds/archive) */
  licenseRemovalSafe?: boolean
  licenseRetainReasons?: string[]
  /** probe jobs */
  organizationName?: string
  probeOk?: boolean
}

export interface ExchangeTenantConfig {
  companyId: string
  companySlug: string
  tenantId: string
  organizationDomain: string
  enabled: boolean
  enabledAt: string | null
  enabledBy: string | null
  lastProbeAt: string | null
  lastProbeResult: unknown
  notes: string | null
}

export type ExchangeAvailability =
  | { available: true; config: ExchangeTenantConfig }
  | {
      available: false
      code: 'kill_switch_off' | 'platform_not_configured' | 'tenant_not_configured' | 'tenant_disabled'
      reason: string
    }

export interface ExchangeJobRow {
  id: string
  hr_request_id: string | null
  company_id: string | null
  company_slug: string
  job_type: ExchangeJobType
  step_key: string | null
  status: ExchangeJobStatus
  payload: ExchangeJobPayload | null
  finalize_context: ExchangeFinalizeContext | null
  azure_job_ids: string[] | null
  result: ExchangeCallbackBody | null
  error: string | null
  attempts: number
  dispatched_at: string | null
  completed_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Environment / availability
// ---------------------------------------------------------------------------

const DISPATCH_TIMEOUT_MS = 15_000

function envConfig(): { webhookUrl: string; dispatchSecret: string; callbackSecret: string; baseUrl: string } | null {
  const webhookUrl = process.env.EXO_AUTOMATION_WEBHOOK_URL
  const dispatchSecret = process.env.EXO_DISPATCH_SECRET
  const callbackSecret = process.env.EXO_CALLBACK_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
  if (!webhookUrl || !dispatchSecret || !callbackSecret || !baseUrl) return null
  return { webhookUrl, dispatchSecret, callbackSecret, baseUrl }
}

export function isExchangeAutomationEnabled(): boolean {
  return process.env.EXO_AUTOMATION_ENABLED === 'true'
}

/**
 * Full pre-dispatch availability check: kill switch, platform env, and the
 * per-tenant enablement row. Returns a human-readable reason on unavailability
 * that ends up verbatim in the [MANUAL] instruction — keep it actionable.
 */
export async function checkExchangeAutomationAvailability(companySlug: string): Promise<ExchangeAvailability> {
  if (!isExchangeAutomationEnabled()) {
    return {
      available: false,
      code: 'kill_switch_off',
      reason: 'Exchange automation is disabled platform-wide (EXO_AUTOMATION_ENABLED is not true)',
    }
  }
  if (!envConfig()) {
    return {
      available: false,
      code: 'platform_not_configured',
      reason:
        'Exchange automation env vars are incomplete (EXO_AUTOMATION_WEBHOOK_URL / EXO_DISPATCH_SECRET / EXO_CALLBACK_SECRET / NEXT_PUBLIC_BASE_URL)',
    }
  }
  const config = await getExchangeTenantConfig(companySlug)
  if (!config) {
    return {
      available: false,
      code: 'tenant_not_configured',
      reason: 'tenant not enabled for Exchange automation — see docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md',
    }
  }
  if (!config.enabled) {
    return {
      available: false,
      code: 'tenant_disabled',
      reason: 'tenant is registered but disabled for Exchange automation — see docs/runbooks/EXO_AUTOMATION_ENABLEMENT.md',
    }
  }
  return { available: true, config }
}

// ---------------------------------------------------------------------------
// HMAC signing / verification (pure — unit tested)
// ---------------------------------------------------------------------------

export function signExchangePayload(payloadJson: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadJson, 'utf8').digest('hex')
}

/** Timing-safe hex HMAC comparison; false on any malformed input */
export function verifyExchangeSignature(rawBody: string, signatureHex: string, secret: string): boolean {
  if (!rawBody || !signatureHex || !secret) return false
  const expected = signExchangePayload(rawBody, secret)
  if (signatureHex.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHex, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

/**
 * Assert the runner's OBSERVED state satisfies what the job REQUESTED.
 * Pure so it is unit-testable; the callback route treats any mismatch as a
 * failure even if the runner claimed success — [DONE] means verified, always.
 */
export function evaluateExchangeJobResult(
  payload: ExchangeJobPayload,
  callback: ExchangeCallbackBody,
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = []
  if (callback.status !== 'succeeded') {
    return { ok: false, mismatches: [callback.error || 'runner reported failure'] }
  }
  const observed = callback.observed
  if (!observed) return { ok: false, mismatches: ['runner reported success but returned no observed state'] }

  if (payload.action === 'convert_to_shared') {
    if (observed.recipientTypeDetails !== 'SharedMailbox') {
      mismatches.push(
        `mailbox type observed as "${observed.recipientTypeDetails ?? 'unknown'}" — expected SharedMailbox`,
      )
    }
    for (const delegate of payload.delegates ?? []) {
      const grant = (observed.grants ?? []).find((g) => g.upn.toLowerCase() === delegate.upn.toLowerCase())
      if (!grant) {
        mismatches.push(`no access grant observed for ${delegate.upn}`)
        continue
      }
      if (delegate.fullAccess && !grant.fullAccess) mismatches.push(`Full Access not observed for ${delegate.upn}`)
      if (delegate.sendAs && !grant.sendAs) mismatches.push(`Send As not observed for ${delegate.upn}`)
    }
  }
  if (payload.action === 'probe' && observed.probeOk !== true) {
    mismatches.push('probe did not confirm tenant connectivity')
  }
  return { ok: mismatches.length === 0, mismatches }
}

// ---------------------------------------------------------------------------
// Tenant config (exo_tenant_config)
// ---------------------------------------------------------------------------

function rowToTenantConfig(row: Record<string, unknown>): ExchangeTenantConfig {
  return {
    companyId: String(row.company_id),
    companySlug: String(row.company_slug),
    tenantId: String(row.tenant_id),
    organizationDomain: String(row.organization_domain),
    enabled: row.enabled === true,
    enabledAt: (row.enabled_at as string | null) ?? null,
    enabledBy: (row.enabled_by as string | null) ?? null,
    lastProbeAt: (row.last_probe_at as string | null) ?? null,
    lastProbeResult: row.last_probe_result ?? null,
    notes: (row.notes as string | null) ?? null,
  }
}

export async function getExchangeTenantConfig(companySlug: string): Promise<ExchangeTenantConfig | null> {
  const pool = getPool()
  const res = await pool.query(`SELECT * FROM exo_tenant_config WHERE company_slug = $1`, [companySlug])
  if (res.rows.length === 0) return null
  return rowToTenantConfig(res.rows[0])
}

export async function listExchangeTenantConfigs(): Promise<ExchangeTenantConfig[]> {
  const pool = getPool()
  const res = await pool.query(`SELECT * FROM exo_tenant_config ORDER BY company_slug`)
  return res.rows.map(rowToTenantConfig)
}

export async function upsertExchangeTenantConfig(input: {
  companyId: string
  companySlug: string
  tenantId: string
  organizationDomain: string
  enabled: boolean
  enabledBy?: string
  notes?: string
}): Promise<ExchangeTenantConfig> {
  const pool = getPool()
  const res = await pool.query(
    `INSERT INTO exo_tenant_config
       (company_id, company_slug, tenant_id, organization_domain, enabled, enabled_at, enabled_by, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NOW() ELSE NULL END, $6, $7, NOW())
     ON CONFLICT (company_id) DO UPDATE SET
       company_slug = EXCLUDED.company_slug,
       tenant_id = EXCLUDED.tenant_id,
       organization_domain = EXCLUDED.organization_domain,
       enabled = EXCLUDED.enabled,
       enabled_at = CASE WHEN EXCLUDED.enabled AND NOT exo_tenant_config.enabled THEN NOW() ELSE exo_tenant_config.enabled_at END,
       enabled_by = COALESCE(EXCLUDED.enabled_by, exo_tenant_config.enabled_by),
       notes = COALESCE(EXCLUDED.notes, exo_tenant_config.notes),
       updated_at = NOW()
     RETURNING *`,
    [input.companyId, input.companySlug, input.tenantId, input.organizationDomain, input.enabled, input.enabledBy ?? null, input.notes ?? null],
  )
  return rowToTenantConfig(res.rows[0])
}

export async function recordTenantProbeResult(companySlug: string, result: unknown): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE exo_tenant_config SET last_probe_at = NOW(), last_probe_result = $2::jsonb, updated_at = NOW()
     WHERE company_slug = $1`,
    [companySlug, JSON.stringify(result ?? null)],
  )
}

// ---------------------------------------------------------------------------
// Job state (hr_exchange_jobs)
// ---------------------------------------------------------------------------

export async function getExchangeJob(jobId: string): Promise<ExchangeJobRow | null> {
  const pool = getPool()
  const res = await pool.query(`SELECT * FROM hr_exchange_jobs WHERE id = $1`, [jobId])
  return (res.rows[0] as ExchangeJobRow | undefined) ?? null
}

/**
 * Single-use claim for callback processing: only one caller can move a job
 * out of pending/dispatched. Replayed callbacks find a terminal status and
 * are answered as duplicates.
 */
export async function claimExchangeJob(jobId: string): Promise<ExchangeJobRow | null> {
  const pool = getPool()
  const res = await pool.query(
    `UPDATE hr_exchange_jobs SET status = 'processing', updated_at = NOW()
     WHERE id = $1 AND status IN ('pending', 'dispatched')
     RETURNING *`,
    [jobId],
  )
  return (res.rows[0] as ExchangeJobRow | undefined) ?? null
}

/**
 * Revert a claim after a processing crash so the runner's callback retry (or
 * the reconcile cron) can pick the job up again instead of seeing a phantom
 * in-flight state.
 */
export async function releaseExchangeJobClaim(jobId: string): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE hr_exchange_jobs SET status = 'dispatched', updated_at = NOW() WHERE id = $1 AND status = 'processing'`,
    [jobId],
  )
}

export async function completeExchangeJob(
  jobId: string,
  status: 'succeeded' | 'failed' | 'timed_out',
  result: ExchangeCallbackBody | null,
  error?: string,
): Promise<void> {
  const pool = getPool()
  // First terminal state wins — a racing cron timeout can never overwrite a
  // completed result (or vice versa).
  await pool.query(
    `UPDATE hr_exchange_jobs
     SET status = $2, result = $3::jsonb, error = $4, completed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status NOT IN ('succeeded', 'failed', 'timed_out')`,
    [jobId, status, result ? JSON.stringify(result) : null, error ?? null],
  )
}

/** Jobs the reconcile cron should time out: dispatched (or stuck pending/processing) with no callback */
export async function findStaleExchangeJobs(olderThanMinutes: number): Promise<ExchangeJobRow[]> {
  const pool = getPool()
  const res = await pool.query(
    `SELECT * FROM hr_exchange_jobs
     WHERE status IN ('pending', 'dispatched', 'processing')
       AND COALESCE(dispatched_at, created_at) < NOW() - ($1 || ' minutes')::interval
     ORDER BY created_at ASC
     LIMIT 25`,
    [String(olderThanMinutes)],
  )
  return res.rows as ExchangeJobRow[]
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export type DispatchResult =
  | { ok: true; jobId: string; azureJobIds: string[] }
  | { ok: false; jobId: string | null; error: string }

/**
 * Create the job row and POST the signed envelope to the Azure Automation
 * webhook. A 202 from Azure means QUEUED — never done. Any failure marks the
 * job row failed and returns ok:false so the pipeline records [FAILED] and
 * falls back to the manual checklist.
 */
export async function dispatchExchangeJob(input: {
  jobType: ExchangeJobType
  companySlug: string
  tenantConfig: ExchangeTenantConfig
  hrRequestId?: string
  stepKey?: string
  targetUpn?: string
  delegates?: ExchangeDelegate[]
  forwardTo?: string
  finalizeContext?: ExchangeFinalizeContext
}): Promise<DispatchResult> {
  const env = envConfig()
  if (!env) return { ok: false, jobId: null, error: 'Exchange automation platform env vars are not configured' }

  const pool = getPool()
  const log = { correlationId: generateCorrelationId(), operation: 'exchange_dispatch', companySlug: input.companySlug }

  // 1. Create the job row first so a crash mid-dispatch is still visible to the reconcile cron
  const insert = await pool.query(
    `INSERT INTO hr_exchange_jobs
       (hr_request_id, company_id, company_slug, job_type, step_key, status, finalize_context, attempts)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb, 1)
     RETURNING id`,
    [
      input.hrRequestId ?? null,
      input.tenantConfig.companyId,
      input.companySlug,
      input.jobType,
      input.stepKey ?? null,
      input.finalizeContext ? JSON.stringify(input.finalizeContext) : null,
    ],
  )
  const jobId = String(insert.rows[0].id)

  const payload: ExchangeJobPayload = {
    jobId,
    action: input.jobType,
    tenantId: input.tenantConfig.tenantId,
    organization: input.tenantConfig.organizationDomain,
    targetUpn: input.targetUpn,
    delegates: input.delegates,
    forwardTo: input.forwardTo,
    callbackUrl: `${env.baseUrl.replace(/\/$/, '')}/api/hr/exchange-callback`,
    issuedAt: new Date().toISOString(),
    hrRequestId: input.hrRequestId,
    companySlug: input.companySlug,
  }
  const payloadJson = JSON.stringify(payload)
  const envelope = JSON.stringify({ payload: payloadJson, signature: signExchangePayload(payloadJson, env.dispatchSecret) })

  await pool.query(`UPDATE hr_exchange_jobs SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1`, [jobId, payloadJson])

  try {
    const response = await withRetry(
      async () => {
        const res = await fetch(env.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: envelope,
          signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          const err = new Error(`Azure Automation webhook returned ${res.status}: ${text.slice(0, 300)}`)
          // 4xx = permanent (expired/disabled webhook, bad token); 5xx = transient
          if (res.status >= 500) throw err
          throw Object.assign(err, { permanent: true })
        }
        return res.json().catch(() => ({})) as Promise<{ JobIds?: string[] }>
      },
      {
        maxRetries: 2,
        baseDelayMs: 2000,
        shouldRetry: (err) => !(err.original as { permanent?: boolean } | undefined)?.permanent && err.isTransient,
      },
    )

    const azureJobIds = Array.isArray(response.JobIds) ? response.JobIds.map(String) : []
    await pool.query(
      `UPDATE hr_exchange_jobs
       SET status = 'dispatched', azure_job_ids = $2::jsonb, dispatched_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [jobId, JSON.stringify(azureJobIds)],
    )
    structuredLog.info({ ...log, jobId, azureJobIds }, 'Exchange job dispatched')
    return { ok: true, jobId, azureJobIds }
  } catch (err) {
    const classified = classifyError(err)
    await pool.query(
      `UPDATE hr_exchange_jobs SET status = 'failed', error = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [jobId, classified.message],
    )
    structuredLog.error({ ...log, jobId }, 'Exchange job dispatch failed', err)
    return { ok: false, jobId, error: classified.message }
  }
}
