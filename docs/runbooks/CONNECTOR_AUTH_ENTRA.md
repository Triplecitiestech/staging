# Runbook — Move the MCP connector's auth from WorkOS to Microsoft Entra

*Owner-run. Switches the connector's OAuth authorization server from WorkOS AuthKit to Microsoft Entra (Azure AD), reusing our own tenant and dropping the WorkOS dependency. Per-user attribution (Autotask impersonation + HR audit actor) is preserved because the connector still reads the signed-in user's email from the token.*

The code supports both providers and picks one via `CONNECTOR_AUTH_PROVIDER` (`workos` default, or `entra`). Switching is env-only — no code change — and is fully reversible. Auth logic: `src/lib/connector/auth.ts`. **Endpoint: `https://www.triplecitiestech.com/api/connector/entra/mcp`.**

> **The endpoint moved from `/api/connector/mcp` to `/api/connector/entra/mcp` on 2026-07-16.** Reason: a Claude client caches the OAuth *authorization server* per connector URL, and that cache survived remove/re-add — so after the WorkOS→Entra cutover the client kept replaying its old **WorkOS** token (`iss` = `…authkit.app`) against the now-Entra server and 401'd forever. A brand-new URL has no cached AS, so Claude discovers Entra from `/.well-known` cleanly. `MCP_RESOURCE_URL` must equal the new endpoint. The Entra **Application ID URI can stay `https://www.triplecitiestech.com/api/connector/mcp`** — it's only an identifier + the scope prefix, and it does NOT need to equal the endpoint because a v2 token's `aud` is the client-id GUID.

## How it works (so the settings make sense)
- Claude gets a 401 from the connector, reads `/.well-known/oauth-protected-resource`, and is sent to the authorization server we advertise (`https://login.microsoftonline.com/<tenant>/v2.0`). Claude discovers Entra via OpenID Connect discovery (the MCP client falls back to it).
- Claude runs the OAuth flow (PKCE S256) against Entra using a **pre-registered** app (Entra has no dynamic client registration). It sends our MCP URL as the RFC 8707 `resource`.
- Entra issues an **access token**. Our server validates the token's signature (Entra JWKS), `iss` (the v2 issuer) and `aud`, then reads the user's email for attribution.
- **The one non-obvious fact:** an Entra v2 access token's `aud` is the app's **client id (a GUID)** — NOT the Application ID URI. So we validate `aud` == client id, and `CONNECTOR_ENTRA_AUDIENCE` must be set to that client id.

## Prerequisites
- A Global Admin / Application Admin in the TCT Entra tenant.
- `triplecitiestech.com` verified on the tenant (needed to use an https Application ID URI).
- Access to the Vercel project env + a redeploy.

## Steps

### 1. Create the Entra app registration
Entra admin center → App registrations → New registration.
- Name: `TCT MCP Connector`
- Supported account types: single tenant.
- Register. Copy the **Application (client) ID** and **Directory (tenant) ID**.

### 2. Set the Application ID URI to the MCP endpoint
App → **Expose an API** → **Application ID URI** → Edit → set it to exactly:
`https://www.triplecitiestech.com/api/connector/mcp`
(Entra allows an https Application ID URI on a verified domain.) Then **Add a scope** — name it e.g. `mcp.access`, admins+users consent, enabled. This is the scope Claude requests so Entra scopes the token to this API.

### 2b. Set the access token to v2 (IMPORTANT — field-verified 2026-07-15)
App → **Manifest** → set **`requestedAccessTokenVersion`** (in the `api` block; `accessTokenAcceptedVersion` in the legacy AAD manifest) to **`2`** → Save. A brand-new app with a custom `https://` Application ID URI defaults this to `null`, which makes Entra mint **v1** access tokens whose `iss` is `https://sts.windows.net/<tid>/` and whose `aud` is the Application ID URI — not the v2 shape (`.../v2.0` + client-id GUID). The server now accepts BOTH shapes (see auth.ts / Gotchas), so this is no longer fatal, but `2` is the intended configuration.

### 3. Add the redirect (reply) URIs
App → **Authentication** → Add platform.
- Add `https://claude.ai/api/mcp/auth_callback` under the **Web** platform (covers claude.ai web, desktop, mobile, Cowork). **Use Web, not SPA** — Claude exchanges the auth code from its own servers, which is a confidential (Web) client flow that needs a client secret; the secret-less SPA/PKCE path expects a browser origin Claude's backend won't send.
- Add `http://localhost/callback` and `http://127.0.0.1/callback` under **Mobile and desktop applications** (Claude Code loopback; Entra matches the base and accepts the ephemeral port).

### 4. Put the user's email in the access token
App → **Token configuration** → **Add optional claim** → token type **Access** → add **email** (and **upn** if offered). `preferred_username` is already present on v2 tokens as a fallback, but adding `email` is the reliable one. Save.

### 5. Create a client secret
App → **Certificates & secrets** → New client secret. Copy the **value** (not the secret ID). You'll paste it into Claude's connector **Advanced settings** alongside the client id. Required because the claude.ai callback is a Web (confidential) client.

### 6. Set Vercel env vars and redeploy
On the `staging` project (Production environment):
- `CONNECTOR_AUTH_PROVIDER=entra`
- `CONNECTOR_ENTRA_TENANT_ID=<Directory (tenant) ID from step 1>`
- `CONNECTOR_ENTRA_AUDIENCE=<Application (client) ID from step 1>`  ← the client id GUID, not the App ID URI
- `MCP_RESOURCE_URL=https://www.triplecitiestech.com/api/connector/entra/mcp` — MUST equal the new endpoint URL (this is what `/.well-known` advertises). It does NOT need to equal the Entra Application ID URI; those legitimately differ now.
- (optional) `CONNECTOR_ENTRA_SCOPES=https://www.triplecitiestech.com/api/connector/mcp/mcp.access` — the Entra scope Claude requests (Application ID URI + `/mcp.access`). Note this keeps the **old** App ID URI path; it's the Entra scope identifier, not the endpoint.
- **Redeploy** so the vars take effect.

### 7. Reconnect in Claude (on the NEW URL)
1. **Remove every existing TCT connector on every surface** (desktop app, web, mobile) — the old one holds a cached WorkOS authorization that will otherwise keep being replayed. **Quit the desktop app** after removing, so it stops refreshing the old token in the background.
2. You **cannot edit** a connector, so **Add custom connector** fresh with the NEW URL: `https://www.triplecitiestech.com/api/connector/entra/mcp`.
3. Click **Advanced settings** (only shown in the Add dialog) and enter the Entra **client id** AND the **client secret** from step 5. (Entra has no dynamic client registration — "Automatic client registration isn't supported" means the client id field was empty.)
4. Connect → Microsoft sign-in → consent. Because the URL is new, Claude has no cached WorkOS AS and discovers Entra fresh.

### 8. Verify
- The connection finalizes (no hang).
- Run a read tool (e.g. list companies) — should succeed.
- Run a write attributed to you (e.g. an Autotask internal note, or `hr_er_log_append`) and confirm it's recorded under **your** identity, not a service account. If a write says it can't attribute your email, the `email`/`preferred_username` claim isn't reaching the access token — recheck step 4.

## Rollback
Set `CONNECTOR_AUTH_PROVIDER=workos` (leave the WorkOS vars in place) and redeploy. The connector returns to the WorkOS flow immediately.

## Gotchas
- **v1 vs v2 token shape was the big one (2026-07-15).** A new app defaults to v1 access tokens (`iss=https://sts.windows.net/<tid>/`, `aud`=App ID URI); our server originally hard-required v2 (`.../v2.0` + client-id GUID), so Entra authenticated the user fine (sign-in log = Success) but our endpoint 401'd the token. Fixes: set `requestedAccessTokenVersion=2` (step 2b), and the server now **accepts both** issuers (`.../v2.0` and `sts.windows.net`) and both audiences (`CONNECTOR_ENTRA_AUDIENCE` client-id GUID **or** `MCP_RESOURCE_URL` App ID URI). See `verifyConnectorToken` in `src/lib/connector/auth.ts`.
- **Diagnose a connector 401 fast:** the error's "Entra Trace ID" is ambiguous (it can appear whether Entra or our server failed). Check the Entra **Sign-in logs** — if the app shows **Success**, Entra issued the token and OUR server rejected it. `verifyConnectorToken` now logs `connector.entra.verify_failed` with the token's actual `aud`/`iss`/`ver` vs expected (Vercel runtime logs) — no token/PII logged. Also check Vercel logs for `POST /api/connector/mcp 401` to confirm the request even reached us.
- **`CONNECTOR_ENTRA_AUDIENCE` = client-id GUID** (step 6) is the intended value; the server also tolerates the App ID URI now, but set the GUID.
- **Email in the ACCESS token** needs the optional claim (step 4); id-token-only email won't help — our server reads the access token.
- **Entra ↔ Anthropic reachability**: Entra's discovery/token endpoints must be reachable from Anthropic's egress. This is a standard public flow, but if discovery fails, that's the first thing to check.
- **Live-validation is required**: the server side is unit/build-verified, but the *interactive* Claude↔Entra flow can only be confirmed by actually connecting (step 7-8). If the desktop app hangs the same way it did on WorkOS, capture the error and we debug the redirect/platform grouping in step 3.

---

## Disconnects — why the connector drops roughly once or twice a day

*Reported 2026-07-28: the connector needs manual reconnection 1-2× daily. Below is what the token lifetimes actually are, the three candidate causes ranked, and how to tell which one it is. Diagnosis is NOT yet confirmed — the deciding evidence is in the Entra sign-in logs.*

### The relevant token facts (Microsoft-documented, not inferred)

| Token | Lifetime |
|---|---|
| Access token | **60-90 minutes**, randomized per issue (~75 min average) |
| Refresh token — redirect URI registered as `spa` | **24 hours**, hard cap, not extendable |
| Refresh token — all other cases (incl. **Web**) | **90 days** (sliding, 90-day max inactive) |
| Refresh/session lifetimes via token-lifetime policy | **Not configurable** since 2021-01-30 — use Conditional Access sign-in frequency instead |

Refresh tokens replace themselves on each use, and Microsoft does **not** revoke the old one when a new one is issued — so two Claude surfaces refreshing concurrently is *not* a cause. That rules out a theory worth ruling out.

~~Given a 60-90 minute access token, once-or-twice-daily is far too infrequent to be plain access-token expiry. Something is refreshing successfully for hours and then hitting a hard wall. That points at a ~24-hour boundary.~~ **This reasoning was wrong and cost two dead-end investigations.** It treated the owner's reported cadence as the true event frequency. The sign-in logs show reconnects actually occur at 68-135 minute intervals and track USAGE, not the clock — so it WAS plain access-token expiry all along. See cause 4.

### Candidate causes, ranked

**1. ~~Redirect URI registered under the SPA platform instead of Web → hard 24-hour cap.~~ RULED OUT 2026-07-28.** Verified in the portal: on app **TCT MCP Connector**, `https://claude.ai/api/mcp/auth_callback` is registered under the **Web** platform. (`http://localhost/callback` and `http://127.0.0.1/callback` are also present under *Mobile and desktop applications*; those are unrelated to the claude.ai flow.) No SPA redirect URI exists, so the 24-hour refresh-token cap does not apply and refresh tokens get the normal 90-day lifetime.

This was the best-fitting hypothesis on frequency alone and it was wrong. Recorded here so nobody re-runs the same check.

**2. ~~A Conditional Access sign-in frequency policy forcing daily reauth.~~ RULED OUT 2026-07-28.** Enumerated the tenant's 12 CA policies (2 Microsoft-managed, 10 user-created) via `Get-MgIdentityConditionalAccessPolicy`. Exactly two carry session controls and **both are `disabled`**:

| Policy | State | Sign-in frequency | Apps |
|---|---|---|---|
| Require multifactor authentication for Intune device enrollments | `disabled` | enabled, no value | one app |
| Require MFA for All Apps | `disabled` | **1 day** | **All** |

The second would produce the symptom exactly if enabled — worth knowing before anyone switches it on, because doing so will reintroduce daily connector reauth tenant-wide. (`disabled` = Off; report-only would read `enabledForReportingButNotEnforced`.)

Also cleared: **"Ensure Office 365 Idle session timeout for unmanaged devices"** (State: On) looked like the obvious culprit by name, and was the leading hypothesis. Its Session control is **"Use app enforced restrictions"**, which delegates to SharePoint/Exchange idle timeout and sets no Entra token lifetime, and it targets only 1 resource (Office 365). Not in the connector's path.

**Conclusion: Conditional Access is not the cause.** Two ranked hypotheses (SPA redirect URI, CA sign-in frequency) both eliminated by evidence.

**3. Risk-based reauth from Anthropic's datacenter IPs. ← current leading candidate, UNCONFIRMED.** Three enabled policies are risk/IP-driven: *Require multifactor authentication for risky sign-ins*, *Fortify block known compromised IP addresses*, *Require password change for high-risk users*. The connector authenticates from Anthropic's cloud egress, not the technician's device; datacenter and anonymizing ranges are routinely risk-flagged and the addresses rotate. This fits the *irregular* "once or twice a day" cadence better than any hard lifetime cap, which would be metronomic.

> **Check:** Entra → **Sign-in logs** → filter to the connector app → open an entry → **Risk state** and the **Conditional Access** tab. A risk state of "At risk", or one of those three policies listed as applied, confirms it. Fix would be a named-location exclusion or excluding the connector app from the risk policy — a deliberate security tradeoff, since it means accepting sign-ins from an IP the risk engine dislikes. Bounded blast radius: the connector cannot reach IT Glue passwords at all, and config/firewall writes still require an approval its own token cannot grant.

**4. `offline_access` never requested, so NO REFRESH TOKEN WAS EVER ISSUED. ← CONFIRMED 2026-07-28. This is the cause.**

Evidence, from `Get-MgAuditLogSignIn` filtered to the connector app over 12 days:

- **30 of 30 sign-ins are `IsInteractive: True`.** Zero silent renewals. A working refresh token produces `IsInteractive: False` rows interleaved; there are none, ever.
- **Shortest interval between sign-ins is 68 minutes**, and no interval is ever shorter. That is the access-token floor (60-90 min randomized). Longer gaps are simply periods of no use.
- `RiskState: none` on every row, `ErrorCode: 0` (success). Not risk, not failure — just expiry with nothing to renew from.
- Sign-in IPs are the **technician's own residential address**, not Anthropic's egress. These are interactive browser authorizations, i.e. one row = one manual reconnect.

Microsoft: *"On the Microsoft identity platform (requests made to the v2.0 endpoint), your app must explicitly request the `offline_access` scope, to receive refresh tokens."*

**The symptom was never daily.** Reconnect frequency tracks USAGE, not the clock: 5 reconnects on a heavy day (2026-07-20), 1 on a quiet one. The owner reported "once or twice a day" because that is how often he noticed. Two hypotheses (SPA redirect URI, CA sign-in frequency) were investigated and eliminated because the reported cadence was taken as a ~24h boundary to explain. **Lesson: for an intermittent auth symptom, measure the interval distribution from the sign-in logs BEFORE theorising about lifetime caps.** The floor of the distribution names the mechanism.

**Fix applied:** `getProtectedResourceMetadata()` appends `offline_access` to `scopes_supported`.

**Do NOT add `offline_access` as an API permission / delegated permission on the app registration.** It is implicitly granted whenever any delegated permission is granted (Microsoft: *"If any delegated permission is granted, offline_access is implicitly granted"*). Consent was never the blocker — the authorization REQUEST was, and that request is built by the Claude client, not by our tenant.

**Residual uncertainty:** our metadata change is the only server-side lever, and it only helps if the client derives its requested scopes from the discovery document. If interactive sign-ins continue at ~75-minute intervals after a fresh reconnect, the client is not reading `scopes_supported` and the remedy is client-side, not ours. Verify behaviourally with the query below — look for `IsInteractive: False` rows appearing for the first time.

**THAT FIX DID NOT WORK — measured 2026-08-10. The residual-uncertainty branch is the real one.** A live 401 on the production deployment, from a real Claude client:

```
12:11:30 POST /api/connector/entra/mcp 401
{"operation":"connector.entra.verify_failed",
 "reason":"\"exp\" claim timestamp check failed",
 "token_aud":"<client-id GUID>","token_iss":"https://login.microsoftonline.com/<tid>/v2.0",
 "token_ver":"2.0","token_scp":"mcp.access"}
```

Read it claim by claim: `aud`, `iss` and `ver` are exactly what we expect, so the token *shape* is correct and every earlier v1/v2 fix is holding. The sole failure is `exp` — the token is simply expired. And **`scp` is `mcp.access` alone**: `offline_access` was never granted, so Entra issued no refresh token, so there is nothing to renew from.

On the same day `curl https://www.triplecitiestech.com/.well-known/oauth-protected-resource` returns `"scopes_supported":["…/mcp.access","offline_access"]`. We advertise it; the client does not ask for it. **`scopes_supported` in RFC 9728 protected-resource metadata is not a lever on this client** — do not spend another session tuning it. The one remaining server-side option, untried and unverified, is the RFC 6750 `scope` parameter on the `WWW-Authenticate` challenge; treat that as a hypothesis, not a fix, until a token comes back carrying `offline_access` in `scp`.

**Diagnostic shortcut:** `token_scp` in the `verify_failed` log answers "does a refresh token exist at all" in one line, with no tenant access required. An `exp`-only failure plus an `scp` without `offline_access` is this cause, confirmed — no sign-in-log query needed.

```powershell
Connect-MgGraph -Scopes 'AuditLog.Read.All' -NoWelcome
Get-MgAuditLogSignIn -Filter "appDisplayName eq 'TCT MCP Connector'" -Top 30 |
  Select-Object @{n='Utc';e={$_.CreatedDateTime.ToUniversalTime().ToString('yyyy-MM-dd HH:mm')}},
                IsInteractive, @{n='Err';e={$_.Status.ErrorCode}} |
  Format-Table -AutoSize
```

Historical note: an `ErrorCode 9010010` ("resource parameter provided in the request doesn't match") on 2026-07-16 corresponds to the WorkOS→Entra cutover debugging recorded above, not to this issue.

### Adding a tool? Clients must reconnect to see it

Not a disconnect cause, but the same family of problem, confirmed 2026-07-28 when `tct_connector_capabilities` deployed:

**A Claude client fetches the tool list once, when the connector session is established, and does not re-fetch it after a deploy.** Two separate sessions that connected before the deploy both reported **125** tools — exactly the pre-deploy count — and both concluded the new tool did not exist. One of them went on to propose *building* the tool that was already live.

So after any deploy that adds or renames a tool: **disconnect and reconnect the connector** (Customize → Connectors) in each surface, or start a fresh conversation. Counting the tools a client can see is a measure of that client's cache, not of the server.

Reconciled counts for reference: **125** tools before `tct_connector_capabilities`, **126** after (97 from the seven importable register modules + 29 registered inline in the route file).

### The deciding evidence

Entra → **Sign-in logs**, filter to the connector application, over the last 7 days. Then:

- **Interactive sign-ins roughly every 24 hours** → cause 1 or 2. Open one and read the **Conditional Access** tab: policies listed as applied ⇒ cause 2; nothing applied ⇒ cause 1.
- **Interactive sign-ins roughly hourly** → cause 3 (should now be fixed).
- **Failures rather than fresh sign-ins** → not a lifetime problem. Read the failure code and treat it as a 401 (see the troubleshooting note above about Success-in-Entra-but-401-from-us).

### Landmine: policies that would break the connector if enabled

Currently harmless, but they will take the connector down for everyone the moment someone flips them on. The connector signs in from Anthropic's cloud, so it presents as an unknown platform on an unmanaged device — permanently, by design.

- **"Block access for unknown or unsupported device platform"** — currently *Report-only*. Enabling this blocks the connector outright. Exclude the connector app first. Being report-only, it may already be logging the connector as a would-be block.
- **"Require MFA for All Apps"** — currently *Off*, and carries sign-in frequency = 1 day across All apps. Enabling it reintroduces daily reauth.
- Any future policy requiring a **compliant or hybrid-joined device** — same reasoning, same outcome.

### Enumerating CA policies (read-only)

```powershell
Connect-MgGraph -Scopes 'Policy.Read.All' -NoWelcome

Get-MgIdentityConditionalAccessPolicy -All |
  Where-Object { $_.SessionControls.SignInFrequency.IsEnabled -or $_.SessionControls.PersistentBrowser.IsEnabled } |
  ForEach-Object {
    [pscustomobject]@{
      Name              = $_.DisplayName
      State             = $_.State
      IncludeApps       = ($_.Conditions.Applications.IncludeApplications -join ', ')
      ExcludeApps       = ($_.Conditions.Applications.ExcludeApplications -join ', ')
      SignInFreqEnabled = $_.SessionControls.SignInFrequency.IsEnabled
      SignInFreqValue   = $_.SessionControls.SignInFrequency.Value
      SignInFreqType    = $_.SessionControls.SignInFrequency.Type
      PersistentBrowser = $_.SessionControls.PersistentBrowser.Mode
      DeviceFilter      = $_.Conditions.Devices.DeviceFilter.Rule
    }
  } | Format-List
```

Drop the `Where-Object` line to list every policy. Note this filter shows only sign-in-frequency / persistent-browser controls — a policy using **"Use app enforced restrictions"** has neither and will not appear, which is why the Office 365 idle-timeout policy was absent from the output despite being On.

To exclude an app from a policy in the portal: **Assignments → Target resources → Resources (formerly cloud apps) → Exclude tab → Select excluded cloud apps**. App exclusions are NOT under *Users or agents* — that tab excludes people, and is a common wrong turn.

### Ruled out

- **Concurrent refresh across surfaces** — Microsoft does not revoke the prior refresh token on use.
- **Client secret expiry** — would break permanently, not daily. Still worth confirming the expiry date, since a silent expiry *will* eventually cause a hard outage: Entra → the app → **Certificates & secrets**. **Ruled out as a cause of the DAILY drops only — see "Hard outage" below, where it is the leading candidate for a permanent one.**

---

## Hard outage — reconnecting no longer fixes it (2026-08-10, OPEN)

*Distinguish this from the daily drops above. Daily drop = works again after reconnecting. Hard outage = the OAuth flow completes, Claude shows "Connected", and the connector still sits on a **Connect** button with zero tools.*

**Server side was verified healthy first, so this is not ours to fix by deploying:**

| Check | Result |
|---|---|
| `/.well-known/oauth-protected-resource` | 200, correct `resource` + `authorization_servers` + `offline_access` |
| `POST /api/connector/entra/mcp` unauthenticated | 401 with a correct RFC 9728 `WWW-Authenticate` + `resource_metadata` |
| Connector route 5xx / timeouts | none today; 2 timeouts in 7 days, last 2026-08-03 on the *previous* deployment |
| Last deploy touching the connector | 2026-07-31. The only production deploy since (2026-08-06, `63607a0`) adds a `/rtp` casing redirect to `middleware.ts`, whose matcher excludes `api` — it cannot reach this route |

**What the token says:** structurally perfect, expired, `scp: mcp.access` — i.e. the no-refresh-token cause above. That explains the connector *dying*. It does not explain a fresh interactive reconnect failing to revive it, because a successful reconnect mints a token good for 60-90 minutes.

**Two candidates for why the reconnect does not take, and the check that settles each:**

1. **The app's client secret has expired.** Best fit. The authorize leg would still succeed — the user sees the Microsoft sign-in and Claude's "Connected" page — while the code→token exchange fails, leaving Claude with no new token and replaying the stale one, which is exactly the 401 observed. Check: Entra → App registrations → **TCT MCP Connector** → **Certificates & secrets** → the secret's **Expires** date. Confirm in Entra → **Sign-in logs** filtered to the app: `AADSTS7000222` is an expired client secret.
2. **A cached authorization surviving remove/re-add** — the documented 2026-07-16 behaviour, which is why the endpoint moved to `/entra/mcp` in the first place. Check: does a reconnect ever produce a `verify_failed` line whose token is *not* expired? If every failure is `exp`, the client is replaying, not re-acquiring.

**If it is the secret:** create a new one, then **remove and re-add the connector** in Claude and paste the new secret under *Advanced settings* — a connector cannot be edited in place, so updating the secret means re-adding. Set the new expiry to 24 months and put the date in the calendar; there is no warning before it lapses and the failure mode is this outage.
- **Serverless session loss** — the connector is stateless Streamable HTTP. Worth noting the `[transport]` route segment also matches `/sse`, and the SSE transport in `mcp-handler` needs Redis for session state, which is **not** configured. If any client is ever pointed at `.../entra/sse` instead of `.../entra/mcp`, expect constant drops. Confirm the configured URL ends in `/mcp`.

Sources: [Refresh tokens in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens) · [Configurable token lifetimes](https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes) · [Conditional Access session lifetime](https://learn.microsoft.com/en-us/entra/identity/conditional-access/howto-conditional-access-session-lifetime) — all retrieved 2026-07-28.

---

Sources: [MCP Authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) · [Entra access token claims](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference) · [Claude connector authentication](https://claude.com/docs/connectors/building/authentication)
