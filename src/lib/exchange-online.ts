/**
 * Exchange Online automation bridge.
 *
 * Microsoft Graph cannot convert a mailbox to shared or grant mailbox
 * Full Access / Send As — those are Exchange Online management operations
 * (Set-Mailbox / Add-MailboxPermission / Add-RecipientPermission). The
 * supported unattended path is Exchange Online PowerShell v3 with app-only
 * certificate auth (Office 365 Exchange Online -> Exchange.ManageAsApp,
 * per-tenant admin consent + per-tenant Exchange role for the service
 * principal). Vercel cannot run PowerShell, so this module dispatches jobs
 * to an Azure Automation runbook (scripts/exo/Invoke-TctExoOffboardingJob.ps1)
 * via its webhook and receives results on /api/webhooks/exo-jobs.
 *
 * Setup + per-tenant enablement: docs/reference/EXO_AUTOMATION.md.
 *
 * Safety model:
 * - Kill switch: EXO_AUTOMATION_ENABLED (default off) — plus a per-tenant
 *   allowlist EXO_ENABLED_TENANTS (comma-separated company slugs, or '*').
 * - The runbook verifies OBSERVED state after acting (Get-Mailbox /
 *   Get-MailboxPermission) and reports that, not command exit codes.
 * - Callbacks are authenticated with a per-job secret: the runbook signs the
 *   raw body with HMAC-SHA256 keyed by the job's callback_token. No shared
 *   long-lived callback secret exists.
 * - A job is only marked done by the callback; the offboarding pipeline waits
 *   a bounded time and reports [QUEUED] if confirmation hasn't arrived.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import type { PoolClient } from 'pg'
import { getTenantCredentialsBySlug, getAccessToken, graphRequest } from '@/lib/graph'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExoConvertJobPayload {
  /** Primary *.onmicrosoft.com domain — Connect-ExchangeOnline -Organization */
  organization: string
  /** UPN / primary SMTP of the mailbox to convert */
  mailbox: string
  /** UPNs to grant Read and manage (Full Access) on the shared mailbox */
  delegates: string[]
  /** Also grant Send As to the delegates */
  sendAs: boolean
}

export interface ExoJobRow {
  id: string
  status: 'queued' | 'dispatched' | 'succeeded' | 'failed'
  result: unknown
  error: string | null
}

export interface ExoCallbackBody {
  jobId: string
  ok: boolean
  observed?: {
    recipientType?: string
    permissions?: string[]
    totalItemSizeGb?: number
    litigationHold?: boolean
  }
  warnings?: string[]
  error?: string
}

// ---------------------------------------------------------------------------
// Enablement (kill switch + per-tenant allowlist) — env-driven
// ---------------------------------------------------------------------------

export function isExoAutomationEnabled(
  companySlug: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.EXO_AUTOMATION_ENABLED !== 'true') return false
  if (!env.EXO_AUTOMATION_WEBHOOK_URL) return false
  const allowlist = (env.EXO_ENABLED_TENANTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (allowlist.includes('*')) return true
  return allowlist.includes(companySlug.toLowerCase())
}

// ---------------------------------------------------------------------------
// Callback signing — per-job HMAC (pure, unit-tested)
// ---------------------------------------------------------------------------

/** HMAC-SHA256 hex signature of the raw callback body, keyed by the job's callback token */
export function signExoCallback(rawBody: string, callbackToken: string): string {
  return createHmac('sha256', callbackToken).update(rawBody).digest('hex')
}

/** Timing-safe verification of a callback signature */
export function verifyExoCallback(rawBody: string, signature: string, callbackToken: string): boolean {
  const expected = signExoCallback(rawBody, callbackToken)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature ?? '', 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Pick the tenant's initial *.onmicrosoft.com domain from Graph verifiedDomains (pure, unit-tested) */
export function resolveOnMicrosoftDomain(
  verifiedDomains: Array<{ name?: string; isInitial?: boolean }> | undefined,
): string | null {
  if (!verifiedDomains || verifiedDomains.length === 0) return null
  const initial = verifiedDomains.find((d) => d.isInitial && d.name)
  if (initial?.name) return initial.name
  const onMicrosoft = verifiedDomains.find(
    (d) => d.name && d.name.toLowerCase().endsWith('.onmicrosoft.com') && !d.name.toLowerCase().endsWith('.mail.onmicrosoft.com'),
  )
  return onMicrosoft?.name ?? null
}

// ---------------------------------------------------------------------------
// Dispatch + wait
// ---------------------------------------------------------------------------

interface DispatchConvertParams {
  pgClient: PoolClient
  requestId: string
  companySlug: string
  ticketId: number | null
  mailbox: string
  delegates: string[]
  sendAs?: boolean
}

/**
 * Create an exo_jobs row and POST it to the Azure Automation webhook.
 * Throws when the tenant's organization domain can't be resolved or the
 * webhook rejects the dispatch — callers treat that as a failed step.
 */
export async function dispatchConvertToShared(params: DispatchConvertParams): Promise<{ jobId: string }> {
  const webhookUrl = process.env.EXO_AUTOMATION_WEBHOOK_URL
  if (!webhookUrl) throw new Error('EXO_AUTOMATION_WEBHOOK_URL is not configured')

  // Resolve the tenant's primary .onmicrosoft.com domain via Graph — the
  // documented value for Connect-ExchangeOnline -Organization.
  const creds = await getTenantCredentialsBySlug(params.companySlug)
  if (!creds) throw new Error(`No M365 credentials for company slug "${params.companySlug}"`)
  const token = await getAccessToken(creds.tenantId, creds.clientId, creds.clientSecret)
  const orgResponse = await graphRequest<{ value: Array<{ verifiedDomains?: Array<{ name?: string; isInitial?: boolean }> }> }>(
    token,
    '/organization?$select=verifiedDomains',
  )
  const organization = resolveOnMicrosoftDomain(orgResponse?.value?.[0]?.verifiedDomains)
  if (!organization) throw new Error('Could not resolve the tenant\'s .onmicrosoft.com domain from Graph')

  const callbackToken = randomBytes(32).toString('hex')
  const payload: ExoConvertJobPayload = {
    organization,
    mailbox: params.mailbox,
    delegates: params.delegates,
    sendAs: params.sendAs ?? true,
  }

  const inserted = await params.pgClient.query<{ id: string }>(
    `INSERT INTO exo_jobs (request_id, company_slug, ticket_id, action, payload, status, callback_token, created_at, updated_at)
     VALUES ($1, $2, $3, 'convert_shared_mailbox', $4::jsonb, 'queued', $5, NOW(), NOW())
     RETURNING id`,
    [params.requestId, params.companySlug, params.ticketId, JSON.stringify(payload), callbackToken],
  )
  const jobId = inserted.rows[0].id

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.triplecitiestech.com'
  const body = JSON.stringify({
    jobId,
    action: 'convert_shared_mailbox',
    ...payload,
    callbackUrl: `${baseUrl}/api/webhooks/exo-jobs`,
    callbackToken,
  })

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    await params.pgClient.query(
      `UPDATE exo_jobs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [jobId, `Webhook dispatch failed (${res.status}): ${text.slice(0, 500)}`],
    )
    throw new Error(`Azure Automation webhook dispatch failed (${res.status})`)
  }

  await params.pgClient.query(
    `UPDATE exo_jobs SET status = 'dispatched', dispatched_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [jobId],
  )
  return { jobId }
}

/**
 * Poll the job row until the callback marks it terminal or the timeout
 * elapses. Returns the final row, or null when still pending at timeout.
 */
export async function waitForExoJobCompletion(
  pgClient: PoolClient,
  jobId: string,
  timeoutMs: number,
  pollIntervalMs = 5_000,
): Promise<ExoJobRow | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    const res = await pgClient.query<ExoJobRow>(
      `SELECT id, status, result, error FROM exo_jobs WHERE id = $1`,
      [jobId],
    )
    const row = res.rows[0]
    if (row && (row.status === 'succeeded' || row.status === 'failed')) return row
  }
  return null
}

/** Flag a still-pending job so the callback route posts the ticket notes itself */
export async function markExoJobNotifyOnCallback(pgClient: PoolClient, jobId: string): Promise<void> {
  await pgClient.query(
    `UPDATE exo_jobs SET notify_on_callback = true, updated_at = NOW() WHERE id = $1`,
    [jobId],
  )
}
