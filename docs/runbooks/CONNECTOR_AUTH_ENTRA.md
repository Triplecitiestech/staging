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

Given a 60-90 minute access token, **once-or-twice-daily is far too infrequent to be plain access-token expiry.** Something is refreshing successfully for hours and then hitting a hard wall. That points at a ~24-hour boundary.

### Candidate causes, ranked

**1. ~~Redirect URI registered under the SPA platform instead of Web → hard 24-hour cap.~~ RULED OUT 2026-07-28.** Verified in the portal: on app **TCT MCP Connector**, `https://claude.ai/api/mcp/auth_callback` is registered under the **Web** platform. (`http://localhost/callback` and `http://127.0.0.1/callback` are also present under *Mobile and desktop applications*; those are unrelated to the claude.ai flow.) No SPA redirect URI exists, so the 24-hour refresh-token cap does not apply and refresh tokens get the normal 90-day lifetime.

This was the best-fitting hypothesis on frequency alone and it was wrong. Recorded here so nobody re-runs the same check.

**2. A Conditional Access sign-in frequency policy forcing daily reauth. ← now the leading candidate.** Common in a security-conscious tenant, and a 1-day sign-in frequency produces exactly this symptom. With SPA eliminated, this is the only remaining explanation for a ~24-hour boundary that isn't the offline_access gap.

> **Check:** Entra → **Protection → Conditional Access → Policies**. Look for any policy with **Session → Sign-in frequency** set. Also check **Sign-in logs** → pick a connector sign-in → **Conditional Access** tab, which shows which policies applied. Fix: exclude the connector app from the sign-in-frequency policy, or accept the reauth as a deliberate security decision.

**3. `offline_access` never advertised, so no refresh token was issued at all.** Fixed in code on 2026-07-28 — `getProtectedResourceMetadata()` now appends `offline_access` to `scopes_supported`. Previously the metadata advertised only `mcp.access`, so whether a refresh token existed depended entirely on the Claude client adding the scope itself.

> This was a real gap and worth closing, but on its own it predicts **hourly** disconnects, not daily. If disconnects continue after this deploys, cause 1 or 2 is the actual driver. Do not treat this fix as the answer until a day has passed without a reconnect.

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

### Ruled out

- **Concurrent refresh across surfaces** — Microsoft does not revoke the prior refresh token on use.
- **Client secret expiry** — would break permanently, not daily. Still worth confirming the expiry date, since a silent expiry *will* eventually cause a hard outage: Entra → the app → **Certificates & secrets**.
- **Serverless session loss** — the connector is stateless Streamable HTTP. Worth noting the `[transport]` route segment also matches `/sse`, and the SSE transport in `mcp-handler` needs Redis for session state, which is **not** configured. If any client is ever pointed at `.../entra/sse` instead of `.../entra/mcp`, expect constant drops. Confirm the configured URL ends in `/mcp`.

Sources: [Refresh tokens in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens) · [Configurable token lifetimes](https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes) · [Conditional Access session lifetime](https://learn.microsoft.com/en-us/entra/identity/conditional-access/howto-conditional-access-session-lifetime) — all retrieved 2026-07-28.

---

Sources: [MCP Authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) · [Entra access token claims](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference) · [Claude connector authentication](https://claude.com/docs/connectors/building/authentication)
