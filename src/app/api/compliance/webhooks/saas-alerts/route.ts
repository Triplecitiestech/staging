/**
 * POST /api/compliance/webhooks/saas-alerts
 *
 * Webhook receiver for SaaS Alerts processed event notifications.
 * SaaS Alerts pushes events here instead of us polling their API
 * (their API is behind Cloudflare bot protection, blocking server-to-server calls).
 *
 * Setup in SaaS Alerts:
 *   1. Go to manage.saasalerts.com > Settings > API
 *   2. Under "Webhook API", click "+ Add new domain"
 *   3. Add: www.triplecitiestech.com
 *   4. Set webhook URL: https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts
 *
 * Also provides:
 *   GET /api/compliance/webhooks/saas-alerts?secret=...  — view stored event stats
 *   DELETE /api/compliance/webhooks/saas-alerts?secret=...  — purge expired events
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    await ensureComplianceTables()
    const pool = getPool()
    const client = await pool.connect()

    try {
      // SaaS Alerts webhook payloads can be single events or arrays
      const events = Array.isArray(body) ? body : [body]
      let inserted = 0

      for (const event of events) {
        // Extract key fields from the SaaS Alerts event
        const eventType = event.jointType ?? event.eventType ?? event.type ?? ''
        const severity = event.alertStatus ?? event.severity ?? 'low'

        await client.query(
          `INSERT INTO compliance_webhook_events (source, "eventType", severity, "rawData", "receivedAt", "expiresAt")
           VALUES ('saas_alerts', $1, $2, $3::jsonb, NOW(), NOW() + INTERVAL '90 days')`,
          [eventType, severity, JSON.stringify(event)]
        )
        inserted++
      }

      console.log(`[webhook][saas-alerts] Received ${inserted} event(s)`)
      return NextResponse.json({ success: true, received: inserted })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[webhook][saas-alerts] Error:', err)
    // Always return 200 to prevent SaaS Alerts from retrying
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 200 })
  }
}

export async function GET(request: NextRequest) {
  // Stats endpoint — requires auth
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Count events by severity and type
    const stats = await client.query<{ severity: string; count: string }>(
      `SELECT severity, COUNT(*) as count
       FROM compliance_webhook_events
       WHERE source = 'saas_alerts' AND "expiresAt" > NOW()
       GROUP BY severity ORDER BY count DESC`
    )

    const typeStats = await client.query<{ eventType: string; count: string }>(
      `SELECT "eventType", COUNT(*) as count
       FROM compliance_webhook_events
       WHERE source = 'saas_alerts' AND "expiresAt" > NOW()
       GROUP BY "eventType" ORDER BY count DESC LIMIT 20`
    )

    const totalRes = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM compliance_webhook_events
       WHERE source = 'saas_alerts' AND "expiresAt" > NOW()`
    )

    const recentRes = await client.query<{ eventType: string; severity: string; receivedAt: string; rawData: Record<string, unknown> }>(
      `SELECT "eventType", severity, "receivedAt", "rawData"
       FROM compliance_webhook_events
       WHERE source = 'saas_alerts' AND "expiresAt" > NOW()
       ORDER BY "receivedAt" DESC LIMIT 5`
    )

    return NextResponse.json({
      success: true,
      source: 'saas_alerts',
      totalEvents: parseInt(totalRes.rows[0]?.count ?? '0'),
      bySeverity: Object.fromEntries(stats.rows.map((r) => [r.severity, parseInt(r.count)])),
      byType: Object.fromEntries(typeStats.rows.map((r) => [r.eventType, parseInt(r.count)])),
      recentEvents: recentRes.rows.map((r) => ({
        type: r.eventType,
        severity: r.severity,
        receivedAt: r.receivedAt,
        user: (r.rawData as Record<string, unknown>)?.user,
        description: (r.rawData as Record<string, unknown>)?.jointDesc,
      })),
    })
  } finally {
    client.release()
  }
}

export async function DELETE(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
