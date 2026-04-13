/**
 * /api/admin/compliance/saas-alerts/subscribe
 *
 * Manages the SaaS Alerts Processed Event Webhooks *subscription* — the
 * record that tells SaaS Alerts where to POST events. The subscription
 * cannot be created in the UI (the Webhook API page only handles the API
 * key and the approved-domains list); it must be created via the
 * `POST /subscriptions` endpoint on the Cloud Functions-hosted partner API.
 *
 * Auth: MIGRATION_SECRET or CRON_SECRET via `Authorization: Bearer ...`
 *       or `?secret=...`.
 *
 *   GET    — list current subscriptions (and disabled ones) for this partner
 *   POST   — create a subscription pointing at our webhook receiver
 *   PATCH  — update an existing subscription by channelId
 *   DELETE — remove a subscription by channelId
 *
 * Example (PowerShell) — create the subscription for our compliance receiver:
 *   Invoke-RestMethod `
 *     -Uri "https://www.triplecitiestech.com/api/admin/compliance/saas-alerts/subscribe" `
 *     -Method POST `
 *     -Headers @{ "Authorization" = "Bearer $env:MIGRATION_SECRET" } `
 *     -ContentType "application/json" `
 *     -Body (@{
 *         url = "https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts"
 *         token = "<same value as SAAS_ALERTS_WEBHOOK_TOKEN>"
 *         enabled = $true
 *       } | ConvertTo-Json)
 *
 * Fallback: if for any reason this request fails from our Vercel deployment,
 * the same body can be sent directly from a workstation:
 *   Invoke-RestMethod `
 *     -Uri "https://us-central1-the-byway-248217.cloudfunctions.net/outgoingWebhookApi/api/v1/subscriptions" `
 *     -Method POST `
 *     -Headers @{ "api_key" = "<Webhooks API Key from manage.saasalerts.com>" } `
 *     -ContentType "application/json" `
 *     -Body ('{"url":"https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts","token":"<token>","enabled":true}')
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkSecretAuth } from '@/lib/api-auth'
import {
  SaasAlertsWebhooksClient,
  SaasAlertsWebhooksApiError,
  type SaasAlertsSubscriptionCreateParams,
  type SaasAlertsSubscriptionUpdateParams,
} from '@/lib/saas-alerts-webhooks'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const DEFAULT_RECEIVER_URL = 'https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts'

function receiverUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL
  if (!base) return DEFAULT_RECEIVER_URL
  return `${base.replace(/\/$/, '')}/api/compliance/webhooks/saas-alerts`
}

export async function GET(request: NextRequest) {
  const denied = checkSecretAuth(request)
  if (denied) return denied

  const client = new SaasAlertsWebhooksClient()
  if (!client.isConfigured()) {
    return NextResponse.json(
      { error: 'SAAS_ALERTS_WEBHOOKS_API_KEY not configured' },
      { status: 400 },
    )
  }

  try {
    const [active, disabled] = await Promise.all([
      client.listSubscriptions(),
      client.listDisabledSubscriptions().catch(() => [] as unknown[]),
    ])
    const receiver = receiverUrl()
    return NextResponse.json({
      baseUrl: client.getBaseUrl(),
      receiverUrl: receiver,
      receiverMatched: active.some((s) => s.url === receiver) || (disabled as Array<{ url?: string }>).some((s) => s.url === receiver),
      active,
      disabled,
    })
  } catch (err) {
    return handleError(err)
  }
}

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

  let body: Partial<SaasAlertsSubscriptionCreateParams> = {}
  try {
    body = (await request.json()) as Partial<SaasAlertsSubscriptionCreateParams>
  } catch {
    // empty body is fine — we'll fill defaults below
  }

  const envToken = process.env.SAAS_ALERTS_WEBHOOK_TOKEN
  const params: SaasAlertsSubscriptionCreateParams = {
    url: body.url ?? receiverUrl(),
    token: body.token ?? envToken ?? undefined,
    enabled: body.enabled ?? true,
    alertStatuses: body.alertStatuses,
    eventTypes: body.eventTypes,
    customerIds: body.customerIds,
    expiration: body.expiration,
    channelId: body.channelId,
    alertSettings: body.alertSettings,
    skipSuppressed: body.skipSuppressed,
  }

  if (!params.token) {
    console.warn('[saas-alerts-subscribe] creating subscription WITHOUT a shared token — receiver will accept any delivery.')
  }

  try {
    const subscription = await client.createSubscription(params)
    return NextResponse.json({
      success: true,
      subscription,
      note: params.token
        ? 'Receiver will enforce the token on every delivery.'
        : 'SAAS_ALERTS_WEBHOOK_TOKEN is not set — receiver accepts all deliveries. Set the env var and PATCH the subscription to harden.',
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(request: NextRequest) {
  const denied = checkSecretAuth(request)
  if (denied) return denied

  const client = new SaasAlertsWebhooksClient()
  if (!client.isConfigured()) {
    return NextResponse.json(
      { error: 'SAAS_ALERTS_WEBHOOKS_API_KEY not configured' },
      { status: 400 },
    )
  }

  const channelId = request.nextUrl.searchParams.get('channelId')
  if (!channelId) {
    return NextResponse.json({ error: '?channelId=... is required' }, { status: 400 })
  }

  let body: SaasAlertsSubscriptionUpdateParams = {}
  try {
    body = (await request.json()) as SaasAlertsSubscriptionUpdateParams
  } catch {
    return NextResponse.json({ error: 'JSON body required' }, { status: 400 })
  }

  try {
    const subscription = await client.updateSubscription(channelId, body)
    return NextResponse.json({ success: true, subscription })
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(request: NextRequest) {
  const denied = checkSecretAuth(request)
  if (denied) return denied

  const client = new SaasAlertsWebhooksClient()
  if (!client.isConfigured()) {
    return NextResponse.json(
      { error: 'SAAS_ALERTS_WEBHOOKS_API_KEY not configured' },
      { status: 400 },
    )
  }

  const channelId = request.nextUrl.searchParams.get('channelId')
  if (!channelId) {
    return NextResponse.json({ error: '?channelId=... is required' }, { status: 400 })
  }

  try {
    const subscription = await client.deleteSubscription(channelId)
    return NextResponse.json({ success: true, subscription })
  } catch (err) {
    return handleError(err)
  }
}

function handleError(err: unknown): NextResponse {
  if (err instanceof SaasAlertsWebhooksApiError) {
    console.error('[saas-alerts-subscribe] API error', { status: err.status, url: err.url, body: err.body.slice(0, 300) })
    return NextResponse.json(
      {
        error: err.message,
        status: err.status,
        responseBody: err.body.slice(0, 2000),
        note:
          err.status === 403
            ? 'The Webhooks API Key appears invalid or missing. Verify SAAS_ALERTS_WEBHOOKS_API_KEY against manage.saasalerts.com > Settings > API > Webhook API > Show Api Key.'
            : err.status === 400
              ? 'Validation error — often the receiver URL. It must be HTTPS, no IP, no fragment, and the domain must already be approved in the SaaS Alerts UI.'
              : undefined,
      },
      { status: err.status || 500 },
    )
  }
  console.error('[saas-alerts-subscribe] unexpected error', err)
  return NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status: 500 },
  )
}
