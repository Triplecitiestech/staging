/**
 * /api/admin/compliance/saas-alerts/test-event
 *
 * Fires SaaS Alerts' `POST /misc/sendTestEvent` — SaaS Alerts will then
 * push a synthetic event to every matching subscription. Use this to smoke-
 * test the full delivery pipeline (subscription → Cloudflare edge → our
 * receiver → DB).
 *
 * Auth: MIGRATION_SECRET / CRON_SECRET (bearer or ?secret=).
 *
 *   POST /api/admin/compliance/saas-alerts/test-event
 *     { "alertStatus": "low", "jointType": "login.success" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkSecretAuth } from '@/lib/api-auth'
import {
  SaasAlertsWebhooksClient,
  SaasAlertsWebhooksApiError,
  type SaasAlertsTestEventParams,
} from '@/lib/saas-alerts-webhooks'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const denied = checkSecretAuth(request)
  if (denied) return denied

  const client = new SaasAlertsWebhooksClient()
  if (!client.isConfigured()) {
    return NextResponse.json(
      { error: 'SAAS_ALERTS_WEBHOOKS_API_KEY not configured' },
      { status: 400 },
    )
  }

  let body: SaasAlertsTestEventParams = {}
  try {
    body = (await request.json()) as SaasAlertsTestEventParams
  } catch {
    // empty body acceptable — SaaS Alerts will use its defaults
  }

  const params: SaasAlertsTestEventParams = {
    alertStatus: body.alertStatus ?? 'low',
    jointType: body.jointType ?? 'login.success',
    partnerId: body.partnerId ?? process.env.SAAS_ALERTS_PARTNER_ID ?? undefined,
  }

  try {
    const result = await client.sendTestEvent(params)
    return NextResponse.json({ success: true, params, result })
  } catch (err) {
    if (err instanceof SaasAlertsWebhooksApiError) {
      return NextResponse.json(
        { error: err.message, status: err.status, responseBody: err.body.slice(0, 2000) },
        { status: err.status || 500 },
      )
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
