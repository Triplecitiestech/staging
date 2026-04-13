# SaaS Alerts Webhook Integration

Reference doc for how Triple Cities Tech ingests Kaseya SaaS Alerts
"Processed Event" webhooks into the compliance engine.

## TL;DR — how the pieces fit together

1. In the SaaS Alerts UI you **only** (a) approve a partner domain and (b)
   reveal the Webhooks API Key. There is no UI field for the inbound webhook
   URL, filters, or token — the UI alone does not complete the integration.
2. The **Processed Event Webhooks** REST API (a separate host, `outgoingWebhookApi`
   on Google Cloud Functions) is where subscriptions are managed. It accepts
   `api_key: <Webhooks API Key>` and exposes `/subscriptions`, `/misc/sendTestEvent`,
   `/queue`, etc. We call it from `/api/admin/compliance/saas-alerts/subscribe`.
3. Once a subscription exists, SaaS Alerts POSTs events to our receiver at
   `/api/compliance/webhooks/saas-alerts`. The receiver normalizes, dedupes,
   stores, and feeds the compliance engine.
4. Cloudflare blocks `manage.saasalerts.com/api` server-to-server, but does
   **not** block `*.cloudfunctions.net` — so unlike the reporting API, the
   subscription-management API works from Vercel.

## End-to-end setup

### 1. In SaaS Alerts (manage.saasalerts.com)

1. Settings → API → **Webhook API** → **Add new domain** →
   `www.triplecitiestech.com` → wait for "approved".
2. Settings → API → Manage API → **Show Api Key** (this is the value we call
   the "Webhooks API Key"). Copy it. Also optionally **Show Partner ID**.

### 2. In Vercel environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SAAS_ALERTS_WEBHOOKS_API_KEY` | **Yes** | The "Show Api Key" value. Used as the `api_key` header against the Cloud Functions-hosted Webhooks API. |
| `SAAS_ALERTS_WEBHOOK_TOKEN` | Optional, **strongly recommended** | Partner-generated shared secret we register with the subscription. SaaS Alerts echoes it back on every delivery; the receiver rejects mismatches with 401. |
| `SAAS_ALERTS_PARTNER_ID` | Optional | Only used by the test-event endpoint. |
| `SAAS_ALERTS_WEBHOOKS_BASE_URL` | Optional | Override of the Cloud Functions base URL (for QA / dev SaaS Alerts instances). |
| `MIGRATION_SECRET` / `CRON_SECRET` | Required | Gates all admin / stats / debug endpoints on our side. |

### 3. Register the subscription (one-time)

This POST tells SaaS Alerts to start pushing events to our receiver.

```powershell
Invoke-RestMethod `
  -Uri "https://www.triplecitiestech.com/api/admin/compliance/saas-alerts/subscribe" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $env:MIGRATION_SECRET" } `
  -ContentType "application/json" `
  -Body (@{
      url = "https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts"
      token = "<same string you set for SAAS_ALERTS_WEBHOOK_TOKEN>"
      enabled = $true
    } | ConvertTo-Json)
```

The response returns the `channelId` — save it; you'll need it for later
`PATCH`/`DELETE` calls. The admin endpoint fills the URL and token from
env vars automatically if the body is empty, so in practice this works:

```powershell
Invoke-RestMethod `
  -Uri "https://www.triplecitiestech.com/api/admin/compliance/saas-alerts/subscribe" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $env:MIGRATION_SECRET" } `
  -ContentType "application/json" `
  -Body "{}"
```

### 4. Verify the subscription

```powershell
Invoke-RestMethod `
  -Uri "https://www.triplecitiestech.com/api/admin/compliance/saas-alerts/subscribe" `
  -Headers @{ "Authorization" = "Bearer $env:MIGRATION_SECRET" }
```

Look for `receiverMatched: true` and your subscription in `active`.

### 5. Fire a test event

```powershell
Invoke-RestMethod `
  -Uri "https://www.triplecitiestech.com/api/admin/compliance/saas-alerts/test-event" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $env:MIGRATION_SECRET" } `
  -ContentType "application/json" `
  -Body '{ "alertStatus": "low", "jointType": "login.success" }'
```

Then check the receiver stats:

```powershell
Invoke-RestMethod `
  -Uri "https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts?stats=1" `
  -Headers @{ "Authorization" = "Bearer $env:MIGRATION_SECRET" }
```

You should see the event count increment and the most recent delivery in
`recentEvents`.

### Fallback — register directly from your workstation

If for any reason the admin route fails (e.g. Vercel redeploy in flight), run
the same POST directly against SaaS Alerts' Cloud Functions host from your
workstation — no infrastructure involved:

```powershell
$webhooksKey = "<paste the Webhooks API Key from the UI>"
$token = "<match SAAS_ALERTS_WEBHOOK_TOKEN>"
Invoke-RestMethod `
  -Uri "https://us-central1-the-byway-248217.cloudfunctions.net/outgoingWebhookApi/api/v1/subscriptions" `
  -Method POST `
  -Headers @{ "api_key" = $webhooksKey } `
  -ContentType "application/json" `
  -Body (@{
      url     = "https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts"
      token   = $token
      enabled = $true
    } | ConvertTo-Json)
```

## Endpoint reference

### Our receiver (inbound)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/compliance/webhooks/saas-alerts` | None | Plain 200 for SaaS Alerts domain validation. |
| `GET` | `/api/compliance/webhooks/saas-alerts?sample=1` | None | Returns a canonical sample payload. |
| `GET` | `/api/compliance/webhooks/saas-alerts?stats=1` | `MIGRATION_SECRET` | Stats + recent events. |
| `POST` | `/api/compliance/webhooks/saas-alerts` | Shared-token (optional) | Ingest one or more events. |
| `POST` | `/api/compliance/webhooks/saas-alerts?debug=1` | `MIGRATION_SECRET` | Ingest + echo normalized output. |
| `DELETE` | `/api/compliance/webhooks/saas-alerts` | `MIGRATION_SECRET` | Purge expired events. |

### Our subscription-management (outbound to SaaS Alerts)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/admin/compliance/saas-alerts/subscribe` | `MIGRATION_SECRET` | List active + disabled subscriptions. |
| `POST` | `/api/admin/compliance/saas-alerts/subscribe` | `MIGRATION_SECRET` | Create a subscription (body optional — defaults to our receiver URL + env token). |
| `PATCH` | `/api/admin/compliance/saas-alerts/subscribe?channelId=...` | `MIGRATION_SECRET` | Update a subscription. |
| `DELETE` | `/api/admin/compliance/saas-alerts/subscribe?channelId=...` | `MIGRATION_SECRET` | Delete a subscription. |
| `POST` | `/api/admin/compliance/saas-alerts/test-event` | `MIGRATION_SECRET` | Fire SaaS Alerts' `/misc/sendTestEvent`. |

### Upstream SaaS Alerts API (reference)

Base URL: `https://us-central1-the-byway-248217.cloudfunctions.net/outgoingWebhookApi/api/v1`

Auth header: `api_key: <Webhooks API Key>` (or `x-api-key`).

Relevant endpoints:

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/subscriptions` | List active subscriptions. |
| `GET` | `/subscriptions/disabled` | List disabled subscriptions (SaaS Alerts disables them after repeated delivery failures). |
| `POST` | `/subscriptions` | Create. Body `{ url, token?, enabled?, alertStatuses?, eventTypes?, customerIds?, expiration?, channelId?, alertSettings?, skipSuppressed? }`. `alertStatuses` and `eventTypes` are mutually exclusive. Omit both for "all events". |
| `PATCH` | `/subscriptions/{channelId}` | Update. |
| `DELETE` | `/subscriptions/{channelId}` | Delete. |
| `POST` | `/misc/sendTestEvent` | Synthetic event. Body `{ alertStatus?, jointType?, partnerId? }`. |
| `GET` | `/misc/customers` | List customer/organization IDs. |
| `GET` | `/misc/alertTypes` | List valid `jointType` values. |
| `GET` | `/queue` | Events queued for redelivery. |
| `GET` | `/domains` | Approved webhook domains. |

## Subscription body constraints (client-validated before dispatch)

- `url` HTTPS only; no IP literal, no userinfo, no fragment; ≤ 256 chars.
- `token` ≤ 128 chars.
- **At least one of `alertStatuses` or `eventTypes` must be set.** The API
  returns 500 "At least one of the following fields must be present" if both
  are omitted, despite the Swagger marking each optional. The admin route
  defaults to `alertStatuses: ['critical','medium','low']` when neither is
  supplied, which is effectively "all events" for this tenant.
- `alertStatuses` ∈ `{ critical, medium, low }` — mutually exclusive with
  `eventTypes`.
- `customerIds` ≤ 50 entries.
- `alertSettings.recipients` ≤ 20 entries.

## Payload received (from SaaS Alerts, documented in their Swagger)

```json
{
  "partner":  { "id": "0FQzuh6qqNr9F8kpi3gN", "name": "Acme Corp" },
  "customer": { "id": "Abc123def456ghi789jk", "name": "Customer Org" },
  "product":  { "id": "MS", "name": "Microsoft 365" },
  "events": [
    {
      "eventId": "abc123def456",
      "time": "2021-05-16 21:00:00.000",
      "user": { "id": "user123", "name": "user@example.com", "fullName": "…", "isLicensed": true, "accountEnabled": true },
      "ip": "192.168.1.1",
      "location": {
        "country": "US",
        "region": "NY",
        "city": "Binghamton",
        "ll": [42.1, -75.9],
        "ipInfo": { "asn": { "name": "…", "asn": "AS…", "route": "…", "type": "…", "domain": "…" }, "threat": { "is_tor": false, "is_proxy": false, "scores": { "threat_score": 0, "trust_score": 100, "proxy_score": 0, "vpn_score": 0 } } }
      },
      "alertStatus": "low",
      "jointType": "login.failure",
      "jointDesc": "IAM Event - Authentication Failure",
      "jointDescAdditional": "Agent - Chrome / Method - Unknown / Activity - OAuth2:Authorize"
    }
  ]
}
```

Our receiver defensively accepts bare arrays and single-event objects too —
the external-partner-api has shipped each shape in the past.

## Signal classification (what the receiver derives)

The normalizer at `src/lib/compliance/saas-alerts-normalizer.ts` maps each
event's `jointType` + description into one of:

| Signal | Weight | Notes |
|--------|--------|-------|
| `impossible_travel` | 10 | `alert.impossibletravel` |
| `account_compromise` | 10 | Compromise / takeover / hijack |
| `privilege_escalation` | 8 | Role grant, admin assign |
| `mfa_disabled` | 8 | MFA turned off / bypassed |
| `suspicious_login` | 6 | Foreign login, Tor, anonymous IP |
| `risky_ip` | 5 | Malicious IP |
| `new_device` | 4 | Unrecognized device |
| `sharing_exposure` | 4 | External / anonymous sharing |
| `policy_violation` | 4 | Policy violation |
| `failed_login` | 2 | `login.failure` |
| `unusual_activity` | 2 | Generic `alert.*` |
| `password_change` | 1 | Password change / reset |
| `configuration_change` | 1 | `config.change` |
| `informational` | 0 | `login.success`, `audit.*` |
| `unknown` | 1 | Anything unclassified |

Weights are aggregated into the compliance evidence record as
`signalWeightSum`.

## Idempotency, storage, and retention

- Inserts use `ON CONFLICT (source, externalId) DO NOTHING`. External IDs
  prefer `eventId` → `id` → a deterministic sha256 of (type, time, user, ip,
  description) so events that arrive without an ID still dedupe.
- Retention: 90 days (`compliance_webhook_events.expiresAt`).
- Purge expired rows with `DELETE /api/compliance/webhooks/saas-alerts`.

## Known limitations / notes

- **No payload signing.** SaaS Alerts does not HMAC-sign requests. The only
  authenticity mechanism is the optional shared token that's echoed back.
- **Soft retries.** SaaS Alerts retries a few times before disabling the
  subscription. The receiver returns 200 aggressively to avoid tripping the
  auto-disable. If a subscription ever goes to `/subscriptions/disabled`,
  re-enable it by PATCH-ing `enabled: true`.
- **AlertStatus enum is three values (`critical | medium | low`).** Our
  internal severity taxonomy also includes `high`; the normalizer maps
  incoming values through but outgoing subscription filters must stick to
  the three API values.
- **URL regex is strict.** No IP literals, no userinfo, no fragment. Preview
  deployments with random subdomains still satisfy it, but `localhost`
  doesn't.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `POST /subscriptions` returns 403 | API key invalid / wrong key | Re-copy "Show Api Key" from the Webhook API UI into `SAAS_ALERTS_WEBHOOKS_API_KEY`. |
| `POST /subscriptions` returns 400 with "domain" in body | Domain not approved | Add `www.triplecitiestech.com` under Webhook API → Add new domain and retry. |
| Subscription created but no events arrive | No events match filters yet, or subscription disabled | `GET /api/admin/compliance/saas-alerts/subscribe` and inspect `disabled[]`. Fire a `sendTestEvent` to smoke-test. |
| Receiver `?stats=1` never increments | Subscription URL wrong, or token mismatch rejecting | Compare `active[0].url` to the exact receiver URL; check function logs for "token verification failed". |
| Vercel function logs show a signed-out `[redacted]` header | Normal — auth-shaped headers are redacted before logging. |
