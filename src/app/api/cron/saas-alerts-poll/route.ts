/**
 * GET /api/cron/saas-alerts-poll
 *
 * Fallback event ingest for SaaS Alerts. The webhook at
 *   /api/compliance/webhooks/saas-alerts
 * is the primary path — this cron exists for two cases:
 *
 *   1. The webhook subscription is down or delayed, and we still want to
 *      attempt to pull events through the REST API.
 *   2. Observability: we want a scheduled heartbeat that asserts the
 *      webhook feed is live (and loudly surfaces gaps when it isn't).
 *
 * IMPORTANT: The SaaS Alerts REST API (manage.saasalerts.com/api) is behind
 * Cloudflare bot protection and has returned 403 for every server-to-server
 * auth pattern we've tried. We therefore:
 *   - Still attempt the API call, but mark it as "degraded" when it fails.
 *   - Report webhook freshness (last event received, events in last 24h).
 *   - Never 500. Transient failures return 200 so Vercel's cron monitor
 *     doesn't flag false alerts.
 *
 * Authentication: standard Vercel cron `Authorization: Bearer <CRON_SECRET>`.
 * Also callable with `?secret=...` for manual runs.
 *
 * Schedule: every 30 minutes (see vercel.json).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { SaasAlertsClient } from '@/lib/saas-alerts'
import { normalizeEvent } from '@/lib/compliance/saas-alerts-normalizer'
import { classifyError, structuredLog, generateCorrelationId } from '@/lib/resilience'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SOURCE = 'saas_alerts'

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const migrationSecret = process.env.MIGRATION_SECRET
  const header = request.headers.get('authorization')
  const query = request.nextUrl.searchParams.get('secret')
  if (header && cronSecret && header === `Bearer ${cronSecret}`) return true
  if (header && migrationSecret && header === `Bearer ${migrationSecret}`) return true
  if (query && (query === cronSecret || query === migrationSecret)) return true
  // Vercel cron always sets the CRON_SECRET header. If neither secret is set we
  // behave as if disabled.
  if (!cronSecret && !migrationSecret) return false
  return false
}

export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId()
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized', correlationId }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const outcome: {
    correlationId: string
    startedAt: string
    finishedAt?: string
    webhookHealth: {
      totalEventsAllTime: number
      eventsLast24h: number
      lastEventAt: string | null
      minutesSinceLastEvent: number | null
      status: 'healthy' | 'stale' | 'never_received'
    }
    polling: {
      attempted: boolean
      success: boolean
      inserted: number
      duplicates: number
      note: string
      error?: string
    }
    transient?: boolean
  } = {
    correlationId,
    startedAt,
    webhookHealth: {
      totalEventsAllTime: 0,
      eventsLast24h: 0,
      lastEventAt: null,
      minutesSinceLastEvent: null,
      status: 'never_received',
    },
    polling: {
      attempted: false,
      success: false,
      inserted: 0,
      duplicates: 0,
      note: '',
    },
  }

  try {
    await ensureComplianceTables()
    const pool = getPool()
    const client = await pool.connect()

    try {
      // --- Webhook health check ---
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const health = await client.query<{
        total: string
        last24h: string
        lastAt: string | null
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE source = $1) AS total,
           COUNT(*) FILTER (WHERE source = $1 AND "receivedAt" > $2) AS last24h,
           MAX("receivedAt") FILTER (WHERE source = $1) AS "lastAt"
         FROM compliance_webhook_events`,
        [SOURCE, dayAgo]
      )
      const row = health.rows[0]
      const totalAll = parseInt(row?.total ?? '0')
      const last24h = parseInt(row?.last24h ?? '0')
      const lastAt = row?.lastAt ?? null
      const minutesSinceLast = lastAt
        ? Math.round((Date.now() - new Date(lastAt).getTime()) / 60000)
        : null

      outcome.webhookHealth = {
        totalEventsAllTime: totalAll,
        eventsLast24h: last24h,
        lastEventAt: lastAt,
        minutesSinceLastEvent: minutesSinceLast,
        status:
          totalAll === 0
            ? 'never_received'
            : minutesSinceLast != null && minutesSinceLast > 24 * 60
              ? 'stale'
              : 'healthy',
      }

      // --- Best-effort polling fallback ---
      const clientApi = new SaasAlertsClient()
      if (!clientApi.isConfigured()) {
        outcome.polling.note = 'SAAS_ALERTS_API_KEY not set — polling skipped (webhook is primary path).'
      } else {
        outcome.polling.attempted = true
        try {
          const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // last 2h
          const { events } = await clientApi.getEvents({ since, limit: 200 })
          if (events.length === 0) {
            outcome.polling.success = true
            outcome.polling.note = 'Polling reached the API but returned no events (common — API usually 403s behind Cloudflare).'
          } else {
            for (const raw of events) {
              const normalized = normalizeEvent(raw as Parameters<typeof normalizeEvent>[0], {
                partnerId: null,
                customerId: typeof raw.customerId === 'string' ? raw.customerId : null,
                productId: null,
              })
              try {
                const insertRes = await client.query(
                  `INSERT INTO compliance_webhook_events
                     (source, "eventType", severity, "rawData", "externalId", "signalType", normalized)
                   VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb)
                   ON CONFLICT (source, "externalId") WHERE "externalId" IS NOT NULL
                   DO NOTHING
                   RETURNING id`,
                  [
                    SOURCE,
                    normalized.eventType,
                    normalized.severity,
                    JSON.stringify(normalized.raw),
                    normalized.externalId,
                    normalized.signalType,
                    JSON.stringify({
                      externalId: normalized.externalId,
                      signalType: normalized.signalType,
                      occurredAt: normalized.occurredAt,
                      user: normalized.user,
                      ip: normalized.ip,
                      location: normalized.location,
                      description: normalized.description,
                      pollingSource: true,
                    }),
                  ]
                )
                if (insertRes.rowCount && insertRes.rowCount > 0) outcome.polling.inserted++
                else outcome.polling.duplicates++
              } catch (rowErr) {
                structuredLog.warn(
                  { correlationId, operation: 'saas-alerts-poll' },
                  `row insert failed: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`
                )
              }
            }
            outcome.polling.success = true
            outcome.polling.note = `Polled ${events.length} event(s): ${outcome.polling.inserted} new, ${outcome.polling.duplicates} duplicates.`
          }
        } catch (apiErr) {
          outcome.polling.success = false
          outcome.polling.error = apiErr instanceof Error ? apiErr.message : String(apiErr)
          outcome.polling.note = outcome.polling.error.includes('Cloudflare')
            ? 'SaaS Alerts API is Cloudflare-blocked (expected). Webhook remains primary.'
            : 'SaaS Alerts API call failed. Webhook remains primary.'
          const classification = classifyError(apiErr)
          if (classification.isTransient) outcome.transient = true
        }
      }
    } finally {
      client.release()
    }
  } catch (err) {
    const classification = classifyError(err)
    structuredLog.error(
      { correlationId, operation: 'saas-alerts-poll' },
      `saas-alerts-poll failed (transient=${classification.isTransient})`,
      err
    )
    // Return 200 for transient errors so Vercel doesn't flag repeated "failures".
    return NextResponse.json(
      {
        ...outcome,
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        transient: classification.isTransient,
      },
      { status: classification.isTransient ? 200 : 500 }
    )
  }

  outcome.finishedAt = new Date().toISOString()
  return NextResponse.json(outcome)
}
