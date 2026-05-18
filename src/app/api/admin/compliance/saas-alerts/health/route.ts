/**
 * GET /api/admin/compliance/saas-alerts/health
 *
 * Runs the SaaS Alerts External Partner API connectivity probe and returns
 * the full result for the admin compliance dashboard health card.
 *
 * Authentication: signed-in staff session (NextAuth).
 *
 * What it returns:
 *   - configured / hasApiKey / hasRefreshToken / hasStaticIdToken / authMode
 *   - tokenRefresh: { attempted, success, expiresInSec, error? }
 *   - results[] per probe endpoint with success/failed/error/dataPreview
 *   - webhookHealth: total events, last received timestamp, freshness category
 *
 * This is intentionally a read-only diagnostic surface. It does not mutate
 * any token cache (testConnection() handles cache reset internally on
 * forced refresh).
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { SaasAlertsClient } from '@/lib/saas-alerts'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SOURCE = 'saas_alerts'

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = new SaasAlertsClient()

  const connectionTestPromise = client.testConnection().catch((err) => ({
    configured: client.isConfigured(),
    hasApiKey: client.hasApiKey(),
    hasRefreshToken: client.hasRefreshToken(),
    hasStaticIdToken: client.hasStaticIdToken(),
    hasPartnerId: client.hasPartnerId(),
    authMode: client.authMode(),
    baseUrl: client.getBaseUrl(),
    missingCredentials: client.missingCredentials(),
    results: [
      {
        endpoint: 'all',
        status: 'failed' as const,
        error: err instanceof Error ? err.message : String(err),
      },
    ],
  }))

  const webhookHealthPromise = (async () => {
    try {
      await ensureComplianceTables()
      const pool = getPool()
      const dbClient = await pool.connect()
      try {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const res = await dbClient.query<{ total: string; last24h: string; lastAt: string | null }>(
          `SELECT
             COUNT(*) FILTER (WHERE source = $1) AS total,
             COUNT(*) FILTER (WHERE source = $1 AND "receivedAt" > $2) AS last24h,
             MAX("receivedAt") FILTER (WHERE source = $1) AS "lastAt"
           FROM compliance_webhook_events`,
          [SOURCE, dayAgo]
        )
        const row = res.rows[0]
        const totalAll = parseInt(row?.total ?? '0')
        const last24h = parseInt(row?.last24h ?? '0')
        const lastAt = row?.lastAt ?? null
        const minutesSinceLast = lastAt ? Math.round((Date.now() - new Date(lastAt).getTime()) / 60000) : null

        return {
          totalEventsAllTime: totalAll,
          eventsLast24h: last24h,
          lastEventAt: lastAt,
          minutesSinceLastEvent: minutesSinceLast,
          status:
            totalAll === 0
              ? ('never_received' as const)
              : minutesSinceLast !== null && minutesSinceLast > 24 * 60
                ? ('stale' as const)
                : ('healthy' as const),
          tokenConfigured: !!process.env.SAAS_ALERTS_WEBHOOK_TOKEN,
        }
      } finally {
        dbClient.release()
      }
    } catch (err) {
      return {
        totalEventsAllTime: 0,
        eventsLast24h: 0,
        lastEventAt: null,
        minutesSinceLastEvent: null,
        status: 'unknown' as const,
        tokenConfigured: !!process.env.SAAS_ALERTS_WEBHOOK_TOKEN,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })()

  const [connectionTest, webhookHealth] = await Promise.all([connectionTestPromise, webhookHealthPromise])

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    connectionTest,
    webhookHealth,
  })
}
