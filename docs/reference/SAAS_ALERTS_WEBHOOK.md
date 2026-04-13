# SaaS Alerts Webhook Integration

Reference doc for how Triple Cities Tech ingests Kaseya SaaS Alerts
"Processed Event" webhooks into the compliance engine.

## TL;DR

- **Push-based, not polling.** SaaS Alerts POSTs events to our endpoint.
- **REST API is Cloudflare-blocked** from server-to-server calls (403 for every
  auth pattern we've tried). Polling exists only as a fallback heartbeat; it
  logs the 403 and moves on.
- **Endpoint:**
  `https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts`
- **Status check (domain validation):** plain `GET` returns 200.
- **Events land in** the `compliance_webhook_events` table and are read by the
  compliance collector (`collectSaasAlertsEvidence` in
  `src/lib/compliance/collectors/msp.ts`).

## Configuration in SaaS Alerts

1. Sign in to <https://manage.saasalerts.com>.
2. Settings → API → Webhooks API.
3. Click **+ Add new domain** and register `www.triplecitiestech.com`.
4. Confirm the domain passes validation (SaaS Alerts performs a GET against the
   root; our endpoint already returns a 2xx on GET).
5. Set the webhook URL to:
   `https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts`
6. (Strongly recommended) Generate a security token in the SaaS Alerts UI and
   copy it. Set the same value as the `SAAS_ALERTS_WEBHOOK_TOKEN` environment
   variable in Vercel. SaaS Alerts echoes the token back on every delivery.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SAAS_ALERTS_WEBHOOK_TOKEN` | Optional (recommended) | Shared secret echoed back by SaaS Alerts on every webhook delivery. When set, deliveries missing / mismatching the token are rejected with 401. |
| `SAAS_ALERTS_API_KEY` | Optional | Only used by the fallback polling cron. Most deployments leave this unset because the REST API is Cloudflare-blocked. |
| `SAAS_ALERTS_PARTNER_ID` | Optional | Same — only used by the polling cron. |
| `MIGRATION_SECRET` / `CRON_SECRET` | Required | Used by the stats/debug endpoints and the polling cron. |

## Endpoint behavior

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/compliance/webhooks/saas-alerts` | None | Plain 200 for SaaS Alerts domain validation. |
| `GET` | `/api/compliance/webhooks/saas-alerts?sample=1` | None | Returns a canonical sample payload for smoke tests. |
| `GET` | `/api/compliance/webhooks/saas-alerts?stats=1` | `MIGRATION_SECRET` / `CRON_SECRET` | Ingest stats + 10 most recent events. |
| `POST` | `/api/compliance/webhooks/saas-alerts` | Shared-token (optional) | Ingests one or more events. |
| `POST` | `/api/compliance/webhooks/saas-alerts?debug=1` | `MIGRATION_SECRET` / `CRON_SECRET` | Ingests events **and** echoes normalized output. |
| `DELETE` | `/api/compliance/webhooks/saas-alerts` | `MIGRATION_SECRET` / `CRON_SECRET` | Purges expired events (rows past `expiresAt`). |

## How the receiver handles each request

1. Reads the raw body first and logs length, source IP, content-type,
   user-agent, and a 500-char preview.
2. Captures all request headers. Authorization-like headers are redacted to
   `[redacted]`; anything containing `token`, `secret`, `apikey`, or `api-key`
   is stored as `first4…last2`.
3. Optional token verification against `SAAS_ALERTS_WEBHOOK_TOKEN`. Token can
   arrive via:
   - `SaasAlerts-Token`, `X-SaasAlerts-Token`, `X-Webhook-Token`, or
     `X-Webhook-Secret` headers.
   - `?token=` query string.
   - `token` / `webhookToken` field in the JSON body.
4. Parses the payload. Three shapes are accepted:
   - `{ partner, customer, product, events: [...] }` — the documented wrapper.
   - `[ event, event, ... ]` — a bare array.
   - `event` — a single bare event object.
5. Normalizes each event via `src/lib/compliance/saas-alerts-normalizer.ts`:
   - Stable external ID (`eventId` → `id` → sha256 hash).
   - `severity` → `low | medium | high | critical`.
   - `signalType` classification (see table below).
6. Inserts into `compliance_webhook_events` with
   `ON CONFLICT (source, externalId) DO NOTHING` for idempotency.
7. Always returns `200` unless the token check explicitly rejects the request.
   Storage errors are logged and ACKed so SaaS Alerts does not disable the
   subscription over transient DB issues.

## Signal classification

The normalizer maps each event's `jointType` + description into one of the
following compliance signals:

| Signal | Weight | Example `jointType` values |
|--------|--------|----------------------------|
| `impossible_travel` | 10 | `alert.impossibletravel` |
| `account_compromise` | 10 | `alert.compromise` |
| `privilege_escalation` | 8 | `user.roleassign`, `admin.granted` |
| `mfa_disabled` | 8 | `mfa.disabled`, `mfa.bypass` |
| `suspicious_login` | 6 | `alert.foreignlogin`, `alert.risky*` |
| `risky_ip` | 5 | `alert.maliciousip` |
| `new_device` | 4 | `device.newdevice` |
| `sharing_exposure` | 4 | `sharing.external` |
| `policy_violation` | 4 | `policy.violation` |
| `failed_login` | 2 | `login.failure` |
| `unusual_activity` | 2 | generic `alert.*` |
| `password_change` | 1 | `user.passwordchange` |
| `configuration_change` | 1 | `config.change` |
| `informational` | 0 | `login.success`, `audit.*` |
| `unknown` | 1 | anything unclassified |

Weights feed the compliance scoring engine — the collector exposes
`signalWeightSum` in the evidence record.

## Payload format (documented by Kaseya, not in Swagger)

```json
{
  "partner":  { "id": "5000", "name": "Triple Cities Tech" },
  "customer": { "id": "9001", "name": "Acme Industries" },
  "product":  { "id": "m365", "name": "Microsoft 365" },
  "token":    "optional-shared-token",
  "events": [
    {
      "eventId": "evt_abc123",
      "time": "2026-04-13T12:34:56Z",
      "user": { "id": "u123", "name": "Jane User", "email": "jane@acme.com" },
      "ip": "203.0.113.42",
      "location": { "country": "US", "region": "NY", "city": "Binghamton" },
      "alertStatus": "high",
      "jointType": "login.failure",
      "jointDesc": "IAM Event - Authentication Failure",
      "jointDescAdditional": "Agent - Edge / Method - Unknown / Activity - OAuth2:Authorize"
    }
  ]
}
```

## Testing from Postman / PowerShell

### Fetch the sample payload

```powershell
Invoke-RestMethod -Uri "https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts?sample=1"
```

### POST a sample event (debug mode echoes normalization output)

```powershell
$sample = (Invoke-RestMethod -Uri "https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts?sample=1").sample
Invoke-RestMethod `
  -Uri "https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts?debug=1" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer $env:MIGRATION_SECRET" } `
  -ContentType "application/json" `
  -Body ($sample | ConvertTo-Json -Depth 10)
```

### Inspect stats / recent events

```powershell
Invoke-RestMethod `
  -Uri "https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts?stats=1" `
  -Headers @{ "Authorization" = "Bearer $env:MIGRATION_SECRET" }
```

## Fallback polling

`GET /api/cron/saas-alerts-poll` runs every 30 minutes via Vercel cron.

- Reports webhook health: total events ever, events in the last 24h, minutes
  since last event, `healthy | stale | never_received` status.
- Attempts a direct API call to SaaS Alerts with `SAAS_ALERTS_API_KEY` if set.
  When Cloudflare blocks the call (the normal case), it records
  `polling.success = false` with a Cloudflare note and keeps the 200.
- Never returns 500 for transient errors; classification comes from
  `src/lib/resilience.ts`.

## Known limitations

- **No signing**. SaaS Alerts does not sign payloads (no HMAC). The only
  authenticity mechanism is the optional shared token, which we enforce when
  configured. Treat the endpoint as public-but-authenticated.
- **Retries are soft**. SaaS Alerts retries "a few times" before switching the
  subscription off. Our receiver aggressively returns 200 to avoid tripping
  the shut-off.
- **Idempotency relies on `eventId`.** Events that arrive without an ID are
  deduped via a deterministic hash of (type, time, user, ip, description).
  Two identical events that truly happened (same user, same second, same IP)
  would be collapsed — acceptable for compliance rollups.
- **Data retention is 90 days** (see `compliance_webhook_events.expiresAt`).
  Purge via `DELETE /api/compliance/webhooks/saas-alerts`.

## Troubleshooting

- *Deliveries stop suddenly.* Check the Vercel function logs for 5xx and
  confirm `SAAS_ALERTS_WEBHOOK_TOKEN` still matches the value in
  `manage.saasalerts.com`. Then re-enable the subscription from the SaaS
  Alerts UI (Kaseya disables auto after repeated failures).
- *Domain validation fails.* Hit the root GET: it must return 2xx on
  `https://www.triplecitiestech.com/api/compliance/webhooks/saas-alerts`.
- *"No events in the last 30 days" in the compliance dashboard.* Run the
  polling cron manually (`/api/cron/saas-alerts-poll?secret=...`) and
  inspect `webhookHealth` — it tells you whether the webhook ever fired.
