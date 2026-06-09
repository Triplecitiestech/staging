# Runbook

## Quick Reference

| What | Where |
|------|-------|
| Production URL | Vercel dashboard → Project → Domains |
| Logs | Vercel dashboard → Project → Logs (Runtime) |
| Database | Vercel dashboard → Storage → Postgres |
| Cron status | Vercel dashboard → Project → Cron Jobs |
| AI usage | console.anthropic.com → Usage |
| Email logs | resend.com → Dashboard |
| Autotask sync status | `GET /api/autotask/status` |
| Autotask sync trigger | `GET /api/autotask/trigger?secret=XXX` |
| Autotask sync docs | `/AUTOTASK_SYNC.md` |

## Incident: AI Chat is Slow or Non-Responsive

### Symptoms
- AI project assistant shows typing dots for >25s
- Users report "AI not working" in admin dashboard
- 500 errors in Vercel logs with `[AI Chat]` prefix

### Diagnosis

1. **Check Anthropic status**: https://status.anthropic.com
2. **Check Vercel logs**: Filter by `[AI Chat]` — look for timeout or rate limit errors
3. **Check API key**: Verify `ANTHROPIC_API_KEY` is set in Vercel env vars
4. **Check usage**: console.anthropic.com → Usage → check for rate limit hits

### Resolution

| Cause | Fix |
|-------|-----|
| Anthropic API down | Wait for recovery; AI features degrade gracefully |
| Rate limited (429) | Wait 60s; consider upgrading API tier |
| API key expired/invalid | Rotate key in Anthropic console; update Vercel env var; redeploy |
| Function timeout (30s) | AI call has 25s timeout — if consistently hitting, model may be overloaded |

### Verification
- Send a test message in AI chat
- Check Vercel logs for `[AI Chat] Received response` with timing

## Incident: Create Company / Project Fails

### Symptoms
- Form shows error after submit
- Error banner includes `requestId` for log correlation

### Diagnosis

1. **Get requestId** from the error message shown to user
2. **Search Vercel logs** for that requestId
3. **Common errors**:
   - `duplicate key value violates unique constraint` → slug collision (should be auto-handled)
   - `connect ECONNREFUSED` → database connection pool exhausted
   - `Unauthorized` → session expired

### Resolution

| Cause | Fix |
|-------|-----|
| Slug collision | Bug — the slug uniqueness loop should handle this. Check code. |
| DB connection exhausted | Check Vercel Postgres connection limits; may need to scale |
| Session expired | User re-logs in; no action needed |
| Prisma client error | Run `npx prisma generate` and redeploy |

## Incident: Blog Cron Not Running

### Symptoms
- No new draft blog posts appearing
- Approval emails not being sent

### Diagnosis

1. **Check Vercel Cron Jobs tab**: Is the cron enabled? Last run time?
2. **Check logs** for cron route: Filter by `/api/cron/generate-blog`
3. **Check content sources**: Are RSS feeds returning data?

### Resolution

| Cause | Fix |
|-------|-----|
| Cron disabled | Re-enable in Vercel dashboard |
| RSS feeds down | Check `content_sources` table; update URLs if needed |
| AI generation failing | Check Anthropic API key and rate limits |
| Email not sending | Check Resend API key and domain verification |

## Incident: Deploy Breaks

### Symptoms
- Vercel build fails
- Site shows 500 errors after deploy

### Diagnosis

1. **Check Vercel build logs**: Look for the specific error
2. **Common build errors**:
   - `prisma migrate deploy` fails → migration drift
   - TypeScript errors → code issue
   - Missing env vars → check Vercel settings

### Resolution

| Cause | Fix |
|-------|-----|
| Migration drift | Run `npx prisma migrate dev` locally; commit migration files |
| Missing env var | Add to Vercel project settings; redeploy |
| Type error | Fix in code; push updated commit |
| Dependency issue | Clear Vercel build cache; `npm ci` locally to verify |

### Rollback

Vercel supports instant rollback:
1. Go to Vercel dashboard → Project → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

## Incident: Customer Portal Not Loading

### Symptoms
- Customer sees blank page or error at `/[company-slug]/status`
- 404 for company slug

### Diagnosis

1. Check company exists: query `companies` table for the slug
2. Check password hash is set
3. Check onboarding auth rate limiter hasn't locked out the IP

### Resolution

| Cause | Fix |
|-------|-----|
| Company slug wrong | Verify in admin → Companies list |
| Password not set | Should be auto-generated; check company record |
| Rate limited | Wait 15 minutes for IP lockout to expire |

## Incident: Autotask Sync Not Working

### Symptoms
- Projects showing without phases/tasks (just names)
- Empty phases in the UI
- Duplicate companies appearing
- Contacts step failing

### Diagnosis

1. **Run diagnose step**: `GET /api/autotask/trigger?secret=XXX&step=diagnose`
   - Check if phases/tasks sections show data or errors
   - Check picklist values match expected status mappings
2. **Check sync history**: `GET /api/autotask/status`
3. **Check env vars**: Verify all 4 Autotask env vars are set in Vercel

### Resolution

| Cause | Fix |
|-------|-----|
| Empty phases | Run `?step=resync&page=1` — re-fetches tasks, cleans up empty phases |
| Duplicate companies | Run `?step=merge` — keeps AT-synced company, moves projects from duplicates |
| Task statuses wrong | Run `?step=diagnose` to see actual picklist values; update `src/lib/autotask.ts` constants |
| Contacts table missing | The contacts step auto-creates the table — just run `?step=contacts` |
| API credentials wrong | Check `AUTOTASK_API_USERNAME`, `AUTOTASK_API_SECRET`, `AUTOTASK_API_INTEGRATION_CODE`, `AUTOTASK_API_BASE_URL` in Vercel |
| Phases/tasks API failing | Different Autotask instances use different entity paths; check `?step=diagnose` errors |

### Full Re-sync
```
1. ?step=cleanup
2. ?step=companies
3. ?step=projects&page=1 (follow nextPage links)
4. ?step=contacts
5. ?step=merge
6. ?step=resync&page=1 (follow nextPage links)
```

## Incident: SaaS Alerts REST API Returning 401/403

### Background

The SaaS Alerts compliance integration has two surfaces. Each is documented in the **SaaS Alerts Integration** section of `docs/gotchas.md` ("SaaS Alerts has TWO HTTP surfaces").

- **Webhook receiver** (`/api/compliance/webhooks/saas-alerts`) — primary event source. Push-based, not affected by token state.
- **External Partner API** (`https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1`) — on-demand REST reads via `SaasAlertsClient` in `src/lib/saas-alerts.ts`. Requires `api_key` + `idtoken` headers.

The `idtoken` is a Firebase Auth JWT with a 1-hour TTL. `SaasAlertsClient` exchanges a long-lived **Firebase refresh token** for fresh idtokens on demand, caching them per-isolate with a 5-minute refresh buffer.

### Symptoms

- Compliance UI shows "SaaS Alerts API error" or empty customer list.
- Cron `/api/cron/saas-alerts-poll` reports `polling.success: false` with `auth rejected` in the note.
- Debug-collectors probe (`GET /api/compliance/debug-collectors?collector=saas_alerts`) shows `connectionTest.results[*].status: "failed"` with 401 or 403 in the error.

### Diagnosis

Run the probe (PowerShell):
```powershell
$headers = @{ Authorization = "Bearer $env:MIGRATION_SECRET" }
Invoke-RestMethod -Uri "https://www.triplecitiestech.com/api/compliance/debug-collectors?collector=saas_alerts" -Headers $headers | ConvertTo-Json -Depth 6
```

Read `connectionTest.tokenRefresh` first — it isolates the refresh exchange from the upstream API calls:

| `tokenRefresh` state | Meaning |
|---|---|
| `attempted: false` | No refresh token set. Client is falling back to static `SAAS_ALERTS_ID_TOKEN`, which will go stale every hour. Configure `SAAS_ALERTS_REFRESH_TOKEN` to fix permanently. |
| `attempted: true, success: false` | Refresh exchange failed. The refresh token is invalid, expired, or revoked. See **Resolution** below. |
| `attempted: true, success: true, expiresInSec: ~3595` | Refresh worked. Any subsequent 401/403 in `results[*]` is an upstream permissions issue (msp_admin role / SA license scope), not a token issue. |

### Resolution

| Cause | Fix |
|-------|-----|
| `SAAS_ALERTS_REFRESH_TOKEN` rejected with `Requests from referer <empty> are blocked` | Google API key referrer restriction. Set `SAAS_ALERTS_REFRESH_REFERER` in Vercel to an allowed origin (default `https://manage.saasalerts.com/`). The client also sends a matching `Origin` header automatically. |
| `SAAS_ALERTS_REFRESH_TOKEN` rejected (other 4xx) | The partner-user account was logged out, password-changed, or admin-disabled. Get a fresh refresh token (see **Refreshing the refresh token** below). |
| `computedBaseUrl` shows `manage.saasalerts.com` | Stale `SAAS_ALERTS_API_URL` env var. The client now auto-overrides this to the cloudfunctions URL, but you should still clear or correct the env var so the diagnostic output is honest. |
| Refresh succeeds, upstream still 403s | Check JWT claims of the returned idtoken — `role` should be `msp_admin`, `license_scopes` should include `"SA"`. If not, contact Kaseya support to verify the partner user's permissions. |
| Refresh works but `/reports/customers` returns empty | `msp_id` claim is correct but no customers are assigned to this MSP. Verify in manage.saasalerts.com → Organizations. |
| `host_not_allowed` 403 (note: no `x-deny-reason` header from our app) | This is an upstream block from a managed MCP runner, not from our middleware. Run the probe from a different machine (your own PowerShell, or `vercel env pull` then a local script). |

### Refreshing the refresh token (when SAAS_ALERTS_REFRESH_TOKEN is rejected)

The refresh token is bound to the partner-user Firebase account (currently `kurtis@triplecitiestech.com`). It survives idtoken rotation but **dies on logout / password change / account disablement**. Treat it as **not fully production-stable** until Kaseya provides a proper M2M / OAuth client-credentials flow.

To rotate:

1. In a browser, log in to https://manage.saasalerts.com as the partner user.
2. F12 → **Application** → **IndexedDB** → `firebaseLocalStorageDb` → store `firebaseLocalStorage`.
3. Find the row whose `fbase_key` starts with `firebase:authUser:`.
4. In the right-hand panel, navigate the JSON: `value.stsTokenManager.refreshToken`. Copy the value (~204 chars, typically starts with `AMf-`).
5. **NOT in localStorage** — the Firebase v9 SDK uses IndexedDB. Any tool that scrapes localStorage for this will come up empty.
6. Paste into Vercel as `SAAS_ALERTS_REFRESH_TOKEN`. Production scope. The redeploy will pick it up automatically.
7. Re-run the probe to confirm `tokenRefresh.success: true`.

### Long-term action

The refresh-token approach is a working bridge but is bound to a single human's Firebase account. **Open a Kaseya support ticket** asking whether the SaaS Alerts External Partner API supports any of:
- A long-lived service-account token (preferred)
- OAuth 2.0 client-credentials flow
- A documented partner refresh-token endpoint that does not require a portal login

Once they confirm a supported M2M path, swap `SaasAlertsClient.refreshIdToken()` to use it and remove `SAAS_ALERTS_REFRESH_TOKEN` from the env.

## Where to Find Logs

### Structured Logs (Server)
- All API routes log via `server-logger.ts`
- Format: JSON with `{ timestamp, level, requestId, message, context }`
- Search by `requestId` to trace a full request lifecycle

### Security Logs
- Prefixed with `[SECURITY-*]`
- Include IP, user agent, event type, severity
- Critical events also logged to `console.error`

### Client Errors
- Caught by `AdminErrorBoundary` on admin pages
- Logged to browser console (consider adding external error reporting in future)
