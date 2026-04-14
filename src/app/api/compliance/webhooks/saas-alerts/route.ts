/**
 * /api/compliance/webhooks/saas-alerts
 *
 * Inbound webhook receiver for Kaseya SaaS Alerts "Processed Event Webhooks".
 *
 * ============================================================================
 *  SaaS Alerts webhook behavior — what we've verified
 * ============================================================================
 *
 * - Push-based. SaaS Alerts POSTs events to this URL; no polling is needed and
 *   the REST API is not usable server-to-server (Cloudflare bot-blocks us).
 * - Configured at manage.saasalerts.com > Settings > API > Webhooks API.
 *     1. Click "+ Add new domain" and register `www.triplecitiestech.com`.
 *     2. Set the endpoint URL to:
 *          https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts
 *     3. (Optional, strongly recommended) Set a partner-generated security
 *        token — SaaS Alerts echoes it back on every delivery so the receiver
 *        can verify authenticity. Store that same value in the
 *        `SAAS_ALERTS_WEBHOOK_TOKEN` env var.
 * - SaaS Alerts validates the domain with a plain GET — it expects any 2xx
 *   response (body can be blank). This route's GET handler satisfies that.
 * - Payload shape (documented by Kaseya, not in the Swagger):
 *     {
 *       "partner":  { "id": "...", "name": "..." },
 *       "customer": { "id": "...", "name": "..." },
 *       "product":  { "id": "...", "name": "..." },
 *       "token":    "<echoed-back security token, if configured>",
 *       "events": [
 *         {
 *           "eventId": "...",
 *           "time": "2026-04-13T...",
 *           "user": { "id": "...", "name": "...", "email": "..." },
 *           "ip": "...",
 *           "location": { "country": "...", "region": "...", "city": "..." },
 *           "alertStatus": "low|medium|high|critical",
 *           "jointType": "login.failure",
 *           "jointDesc": "IAM Event - Authentication Failure",
 *           "jointDescAdditional": "..."
 *         }
 *       ]
 *     }
 *   Flat arrays and single bare events are also accepted defensively —
 *   Kaseya's external-partner-api has shipped each of those shapes at
 *   different times, and we don't want a Swagger-drift bug to drop alerts.
 * - Retries: Kaseya retries a handful of times on non-2xx, then disables the
 *   subscription. We therefore return 200 as fast as we can and swallow
 *   internal errors (recording them server-side) so a transient DB hiccup
 *   doesn't cause Kaseya to switch our feed off.
 *
 * ============================================================================
 *  What this endpoint does
 * ============================================================================
 *
 *   POST  — Ingest one or more webhook events with full logging, optional
 *           token verification, and per-event idempotency keyed on eventId.
 *   GET   — (public) Domain validation 200 / (authed) stats + recent events.
 *   DELETE — (authed) Purge expired events.
 *
 *   POST ?debug=1       Echoes normalization output alongside the ingest
 *                       result — handy from Postman. Requires the receiver
 *                       secret via header or query param to avoid leaking
 *                       parsed data over the public endpoint.
 *   GET  ?sample=1      Returns the canonical sample payload for smoke tests.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { checkSecretAuth } from '@/lib/api-auth'
import {
  normalizeWebhookBody,
  SAMPLE_SAAS_ALERTS_WEBHOOK,
  type NormalizedSaasAlertsEvent,
} from '@/lib/compliance/saas-alerts-normalizer'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SOURCE = 'saas_alerts'

// Headers whose raw values we never want to persist even into our own audit
// log — they can carry credentials or echo back the receiver token.
const SENSITIVE_HEADER_PREFIXES = ['authorization', 'cookie', 'proxy-authorization']

/**
 * Collect request headers for storage. We preserve the full set for
 * debugging (SaaS Alerts occasionally rotates which header the echo token
 * rides in), but redact anything that looks credential-shaped.
 */
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
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}

/**
 * Verify the optional shared token. Supported carriers:
 *   - `SaasAlerts-Token` / `X-SaasAlerts-Token` / `X-Webhook-Token` headers
 *   - `?token=` query parameter
 *   - `token` / `webhookToken` field on the request body
 *
 * When the env var is unset we skip verification and log a warning so
 * operators know the endpoint is running unauthenticated.
 */
function verifyToken(request: NextRequest, bodyToken: string | null): { ok: boolean; reason: string } {
  const expected = process.env.SAAS_ALERTS_WEBHOOK_TOKEN
  if (!expected) return { ok: true, reason: 'no-token-configured' }

  const headerToken =
    request.headers.get('saasalerts-token') ??
    request.headers.get('x-saasalerts-token') ??
    request.headers.get('x-webhook-token') ??
    request.headers.get('x-webhook-secret')

  const queryToken = request.nextUrl.searchParams.get('token')

  const provided = headerToken ?? queryToken ?? bodyToken ?? null
  if (!provided) return { ok: false, reason: 'missing-token' }
  if (provided !== expected) return { ok: false, reason: 'token-mismatch' }
  return { ok: true, reason: 'token-ok' }
}

// ---------------------------------------------------------------------------
// POST — ingest events
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const receivedAt = new Date().toISOString()
  const sourceIp = sourceIpOf(request)
  const headersCaptured = captureHeaders(request)
  const debug = request.nextUrl.searchParams.get('debug') === '1' || request.nextUrl.searchParams.get('debug') === 'true'

  // Always read as text first so we can log exactly what SaaS Alerts sent,
  // even if the body isn't valid JSON.
  let rawBodyText = ''
  try {
    rawBodyText = await request.text()
  } catch (err) {
    console.error('[webhook][saas-alerts] failed to read body', err)
  }

  console.log('[webhook][saas-alerts] inbound', {
    receivedAt,
    sourceIp,
    bodyBytes: rawBodyText.length,
    contentType: headersCaptured['content-type'] ?? null,
    userAgent: headersCaptured['user-agent'] ?? null,
    // Only log the first 500 chars to keep function logs readable
    bodyPreview: rawBodyText.slice(0, 500),
  })

  // Debug mode requires the receiver secret — prevents public leakage of
  // parsed normalization output.
  if (debug) {
    const denied = checkSecretAuth(request)
    if (denied) return denied
  }

  let body: unknown = null
  let parseError: string | null = null
  if (rawBodyText) {
    try {
      body = JSON.parse(rawBodyText)
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err)
    }
  }

  const { events, bodyToken } = normalizeWebhookBody(body)

  // Verify after parsing so we can see a body token regardless of header.
  const tokenCheck = verifyToken(request, bodyToken)
  if (!tokenCheck.ok) {
    // Emit enough detail to diagnose which location SaaS Alerts uses for the
    // echo token. We log HEADER NAMES only (never values) plus the top-level
    // body field names to avoid leaking the echoed secret itself.
    const headerNames = Object.keys(headersCaptured).sort()
    const bodyTopLevelKeys =
      body && typeof body === 'object' && !Array.isArray(body)
        ? Object.keys(body as Record<string, unknown>).sort()
        : Array.isArray(body)
          ? ['<array>']
          : []
    const querySeen = Array.from(request.nextUrl.searchParams.keys()).sort()
    console.warn('[webhook][saas-alerts] token verification failed', {
      reason: tokenCheck.reason,
      sourceIp,
      headerNames,
      bodyTopLevelKeys,
      querySeen,
      bodyTokenSeen: bodyToken ? 'yes' : 'no',
    })
    // Return 401 so bad actors see the rejection, but keep the body generic.
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (parseError) {
    // Log the parse failure but ACK 200 so SaaS Alerts doesn't disable us
    // over a transient payload glitch.
    console.error('[webhook][saas-alerts] body parse error', { parseError, sourceIp })
    return NextResponse.json({ success: false, error: 'Invalid JSON body', parseError }, { status: 200 })
  }

  if (events.length === 0) {
    console.log('[webhook][saas-alerts] zero events in payload — ACKing with noop')
    return NextResponse.json({ success: true, received: 0, message: 'no events in payload' })
  }

  // Persist — best-effort, never 5xx back to SaaS Alerts.
  let inserted = 0
  let duplicates = 0
  let storageErrors = 0

  try {
    await ensureComplianceTables()
    const pool = getPool()
    const client = await pool.connect()
    try {
      for (const evt of events) {
        try {
          const result = await client.query(
            `INSERT INTO compliance_webhook_events
               (source, "eventType", severity, "rawData", "receivedAt", "expiresAt",
                "externalId", "partnerId", "customerId", "sourceIp", headers, normalized, "signalType")
             VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW() + INTERVAL '90 days',
                     $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
             ON CONFLICT (source, "externalId") WHERE "externalId" IS NOT NULL
             DO NOTHING
             RETURNING id`,
            [
              SOURCE,
              evt.eventType,
              evt.severity,
              JSON.stringify(evt.raw),
              evt.externalId,
              evt.partnerId,
              evt.customerId,
              sourceIp,
              JSON.stringify(headersCaptured),
              JSON.stringify({
                externalId: evt.externalId,
                signalType: evt.signalType,
                occurredAt: evt.occurredAt,
                user: evt.user,
                ip: evt.ip,
                location: evt.location,
                description: evt.description,
                productId: evt.productId,
              }),
              evt.signalType,
            ]
          )
          if (result.rowCount && result.rowCount > 0) inserted++
          else duplicates++
        } catch (rowErr) {
          storageErrors++
          console.error('[webhook][saas-alerts] row insert failed', {
            externalId: evt.externalId,
            err: rowErr instanceof Error ? rowErr.message : String(rowErr),
          })
        }
      }
    } finally {
      client.release()
    }
  } catch (err) {
    // Outer DB error — still ACK 200 so the subscription stays active, but
    // record the failure so we can tell from logs that nothing got stored.
    console.error('[webhook][saas-alerts] storage failure', err)
    return NextResponse.json(
      { success: false, received: events.length, stored: 0, error: 'Storage failure (ACKed to prevent retry storm)' },
      { status: 200 }
    )
  }

  console.log('[webhook][saas-alerts] stored', {
    total: events.length,
    inserted,
    duplicates,
    storageErrors,
    tokenCheck: tokenCheck.reason,
  })

  const response: Record<string, unknown> = {
    success: true,
    received: events.length,
    inserted,
    duplicates,
    storageErrors,
  }

  if (debug) {
    response.debug = {
      tokenCheck: tokenCheck.reason,
      sourceIp,
      headers: headersCaptured,
      normalized: events.map((e) => summariseForDebug(e)),
    }
  }

  return NextResponse.json(response)
}

function summariseForDebug(e: NormalizedSaasAlertsEvent) {
  return {
    externalId: e.externalId,
    eventType: e.eventType,
    signalType: e.signalType,
    severity: e.severity,
    occurredAt: e.occurredAt,
    user: e.user,
    ip: e.ip,
    location: e.location,
    description: e.description,
    customerId: e.customerId,
    partnerId: e.partnerId,
  }
}

// ---------------------------------------------------------------------------
// GET — public domain validation / authed stats / sample payload
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Public plain-2xx for SaaS Alerts domain validation. We only return the
  // validation response when the request is obviously from their prober
  // (no auth, no explicit `stats=1`).
  const statsRequested = request.nextUrl.searchParams.get('stats') === '1'
  const sampleRequested = request.nextUrl.searchParams.get('sample') === '1'

  if (sampleRequested) {
    return NextResponse.json({
      description:
        'Canonical sample SaaS Alerts webhook payload — safe to POST back to this endpoint for smoke tests.',
      endpoint: 'https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts',
      sample: SAMPLE_SAAS_ALERTS_WEBHOOK,
    })
  }

  if (!statsRequested) {
    // Domain validation 200. Body is small but valid JSON for humans.
    return NextResponse.json(
      {
        service: 'Triple Cities Tech — SaaS Alerts Webhook Receiver',
        status: 'ok',
        docs: 'POST SaaS Alerts webhook events to this URL. Append ?stats=1 (authed) for ingest stats or ?sample=1 for a sample payload.',
      },
      { status: 200 }
    )
  }

  // Stats endpoint — requires auth via header (preferred) or query param
  const denied = checkSecretAuth(request)
  if (denied) return denied

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const stats = await client.query<{ severity: string; count: string }>(
      `SELECT severity, COUNT(*) as count
       FROM compliance_webhook_events
       WHERE source = $1 AND "expiresAt" > NOW()
       GROUP BY severity ORDER BY count DESC`,
      [SOURCE]
    )

    const typeStats = await client.query<{ eventType: string; count: string }>(
      `SELECT "eventType", COUNT(*) as count
       FROM compliance_webhook_events
       WHERE source = $1 AND "expiresAt" > NOW()
       GROUP BY "eventType" ORDER BY count DESC LIMIT 20`,
      [SOURCE]
    )

    const signalStats = await client.query<{ signalType: string | null; count: string }>(
      `SELECT "signalType", COUNT(*) as count
       FROM compliance_webhook_events
       WHERE source = $1 AND "expiresAt" > NOW()
       GROUP BY "signalType" ORDER BY count DESC`,
      [SOURCE]
    )

    const totalRes = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM compliance_webhook_events
       WHERE source = $1 AND "expiresAt" > NOW()`,
      [SOURCE]
    )

    const recentRes = await client.query<{
      eventType: string
      severity: string
      receivedAt: string
      sourceIp: string | null
      signalType: string | null
      normalized: Record<string, unknown>
      rawData: Record<string, unknown>
    }>(
      `SELECT "eventType", severity, "receivedAt", "sourceIp", "signalType", normalized, "rawData"
       FROM compliance_webhook_events
       WHERE source = $1 AND "expiresAt" > NOW()
       ORDER BY "receivedAt" DESC LIMIT 10`,
      [SOURCE]
    )

    return NextResponse.json({
      success: true,
      source: SOURCE,
      tokenConfigured: !!process.env.SAAS_ALERTS_WEBHOOK_TOKEN,
      totalEvents: parseInt(totalRes.rows[0]?.count ?? '0'),
      bySeverity: Object.fromEntries(stats.rows.map((r) => [r.severity, parseInt(r.count)])),
      byType: Object.fromEntries(typeStats.rows.map((r) => [r.eventType, parseInt(r.count)])),
      bySignal: Object.fromEntries(signalStats.rows.map((r) => [r.signalType ?? 'unknown', parseInt(r.count)])),
      recentEvents: recentRes.rows.map((r) => ({
        type: r.eventType,
        severity: r.severity,
        signalType: r.signalType,
        receivedAt: r.receivedAt,
        sourceIp: r.sourceIp,
        user: r.normalized?.user ?? (r.rawData as Record<string, unknown>)?.user,
        description: r.normalized?.description ?? (r.rawData as Record<string, unknown>)?.jointDesc,
      })),
    })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// DELETE — purge expired events (authed)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const denied = checkSecretAuth(request)
  if (denied) return denied

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query(
      `DELETE FROM compliance_webhook_events WHERE "expiresAt" < NOW() RETURNING id`
    )
    return NextResponse.json({ success: true, purged: res.rowCount })
  } finally {
    client.release()
  }
}
