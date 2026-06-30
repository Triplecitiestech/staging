/**
 * /api/webhooks/domotz
 *
 * Inbound webhook receiver for Domotz collector events — primarily
 * `agent_wan_change` (ISP / public-IP change = the failover fingerprint) and
 * `agent_status` (collector up/down). These events are push-only: they are NOT
 * retrievable from any Domotz REST history endpoint, so ingesting them here is
 * the only way the Site Connectivity report can detect primary-circuit failovers
 * at a dual-WAN site.
 *
 * ============================================================================
 *  Operator setup (one-time, per Domotz account)
 * ============================================================================
 *  1. In Domotz Portal → Account → Webhooks (Contact Channel of type Webhook),
 *     add a channel pointing at:
 *        https://www.triplecitiestech.com/api/webhooks/domotz?token=<DOMOTZ_WEBHOOK_TOKEN>
 *  2. Bind an Alert Profile to your collectors that includes the
 *     "WAN/Public IP changed" and "Collector up/down" events.
 *  3. Set the same token value in the DOMOTZ_WEBHOOK_TOKEN env var. If unset,
 *     the endpoint runs UNAUTHENTICATED (a startup warning is logged).
 *
 * Behavior mirrors the SaaS Alerts receiver: events are stored idempotently in
 * the shared `compliance_webhook_events` sink (source='domotz'); we ACK 200 even
 * on parse/storage hiccups so Domotz doesn't disable the channel; only a token
 * mismatch returns 401.
 *
 *   POST            Ingest one or more events.
 *   GET             (public) validation 200 / (authed ?stats=1) stats / ?sample=1 sample payload.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { checkSecretAuth } from '@/lib/api-auth'
import { normalizeDomotzWebhook, storeDomotzEvents, SAMPLE_DOMOTZ_WEBHOOK } from '@/lib/domotz-events'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SOURCE = 'domotz'
const SENSITIVE_HEADER_PREFIXES = ['authorization', 'cookie', 'proxy-authorization']

function captureHeaders(request: NextRequest): Record<string, string> {
  const out: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (SENSITIVE_HEADER_PREFIXES.some((p) => lower === p || lower.startsWith(`${p}-`))) {
      out[lower] = '[redacted]'
      return
    }
    if (/token|secret|apikey|api-key/.test(lower)) {
      out[lower] = value ? `${value.slice(0, 4)}…${value.slice(-2)}` : ''
      return
    }
    out[lower] = value
  })
  return out
}

function sourceIpOf(request: NextRequest): string | null {
  const xf = request.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip')?.trim() || null
}

/** Optional shared-token check via header / query / body. Skipped when env unset. */
function verifyToken(request: NextRequest, bodyToken: string | null): { ok: boolean; reason: string } {
  const expected = process.env.DOMOTZ_WEBHOOK_TOKEN
  if (!expected) return { ok: true, reason: 'no-token-configured' }
  const headerToken =
    request.headers.get('x-domotz-token') ??
    request.headers.get('x-webhook-token') ??
    request.headers.get('x-webhook-secret')
  const queryToken = request.nextUrl.searchParams.get('token')
  const provided = headerToken ?? queryToken ?? bodyToken ?? null
  if (!provided) return { ok: false, reason: 'missing-token' }
  if (provided !== expected) return { ok: false, reason: 'token-mismatch' }
  return { ok: true, reason: 'token-ok' }
}

export async function POST(request: NextRequest) {
  const sourceIp = sourceIpOf(request)
  const headers = captureHeaders(request)

  let rawBodyText = ''
  try {
    rawBodyText = await request.text()
  } catch (err) {
    console.error('[webhook][domotz] failed to read body', err)
  }

  console.log('[webhook][domotz] inbound', {
    sourceIp,
    bodyBytes: rawBodyText.length,
    contentType: headers['content-type'] ?? null,
    bodyPreview: rawBodyText.slice(0, 500),
  })

  let body: unknown = null
  let parseError: string | null = null
  if (rawBodyText) {
    try {
      body = JSON.parse(rawBodyText)
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err)
    }
  }

  const bodyToken =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (((body as Record<string, unknown>).token as string) ?? null)
      : null
  const tokenCheck = verifyToken(request, bodyToken)
  if (!tokenCheck.ok) {
    console.warn('[webhook][domotz] token verification failed', { reason: tokenCheck.reason, sourceIp })
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (parseError) {
    console.error('[webhook][domotz] body parse error', { parseError, sourceIp })
    return NextResponse.json({ success: false, error: 'Invalid JSON body', parseError }, { status: 200 })
  }

  const events = normalizeDomotzWebhook(body)
  if (events.length === 0) {
    return NextResponse.json({ success: true, received: 0, message: 'no recognizable events in payload' })
  }

  try {
    const { inserted, duplicates, storageErrors } = await storeDomotzEvents(events, { sourceIp, headers })
    console.log('[webhook][domotz] stored', { total: events.length, inserted, duplicates, storageErrors, tokenCheck: tokenCheck.reason })
    return NextResponse.json({ success: true, received: events.length, inserted, duplicates, storageErrors })
  } catch (err) {
    // ACK 200 so Domotz doesn't disable the channel over a transient DB hiccup.
    console.error('[webhook][domotz] storage failure', err)
    return NextResponse.json({ success: false, received: events.length, stored: 0, error: 'Storage failure (ACKed)' }, { status: 200 })
  }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  if (sp.get('sample') === '1') {
    return NextResponse.json({
      description: 'Canonical sample Domotz agent_wan_change webhook — safe to POST back here for smoke tests.',
      endpoint: 'https://www.triplecitiestech.com/api/webhooks/domotz',
      sample: SAMPLE_DOMOTZ_WEBHOOK,
    })
  }

  if (sp.get('stats') !== '1') {
    return NextResponse.json({
      service: 'Triple Cities Tech — Domotz Webhook Receiver',
      status: 'ok',
      tokenConfigured: !!process.env.DOMOTZ_WEBHOOK_TOKEN,
      docs: 'POST Domotz webhook events here. ?stats=1 (authed) for ingest stats, ?sample=1 for a sample payload.',
    })
  }

  const denied = checkSecretAuth(request)
  if (denied) return denied

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const byType = await client.query<{ eventType: string; count: string }>(
      `SELECT "eventType", COUNT(*) AS count FROM compliance_webhook_events
       WHERE source = $1 AND "expiresAt" > NOW() GROUP BY "eventType" ORDER BY count DESC`,
      [SOURCE],
    )
    const byAgent = await client.query<{ customerId: string | null; count: string }>(
      `SELECT "customerId", COUNT(*) AS count FROM compliance_webhook_events
       WHERE source = $1 AND "expiresAt" > NOW() GROUP BY "customerId" ORDER BY count DESC LIMIT 25`,
      [SOURCE],
    )
    const total = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM compliance_webhook_events WHERE source = $1 AND "expiresAt" > NOW()`,
      [SOURCE],
    )
    return NextResponse.json({
      success: true,
      source: SOURCE,
      tokenConfigured: !!process.env.DOMOTZ_WEBHOOK_TOKEN,
      totalEvents: parseInt(total.rows[0]?.count ?? '0', 10),
      byType: Object.fromEntries(byType.rows.map((r) => [r.eventType, parseInt(r.count, 10)])),
      byAgent: Object.fromEntries(byAgent.rows.map((r) => [r.customerId ?? 'unknown', parseInt(r.count, 10)])),
    })
  } finally {
    client.release()
  }
}
