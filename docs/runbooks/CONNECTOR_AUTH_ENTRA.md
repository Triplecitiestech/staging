# Runbook — Move the MCP connector's auth from WorkOS to Microsoft Entra

*Owner-run. Switches the connector's OAuth authorization server from WorkOS AuthKit to Microsoft Entra (Azure AD), reusing our own tenant and dropping the WorkOS dependency. Per-user attribution (Autotask impersonation + HR audit actor) is preserved because the connector still reads the signed-in user's email from the token.*

The code supports both providers and picks one via `CONNECTOR_AUTH_PROVIDER` (`workos` default, or `entra`). Switching is env-only — no code change — and is fully reversible. Auth logic: `src/lib/connector/auth.ts`. Endpoint: `https://www.triplecitiestech.com/api/connector/mcp`.

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

### 3. Add the redirect (reply) URIs
App → **Authentication** → Add platform.
- Add `https://claude.ai/api/mcp/auth_callback` (covers claude.ai web, desktop, mobile, Cowork).
- Add `http://localhost/callback` and `http://127.0.0.1/callback` (Claude Code loopback; Entra matches the base and accepts the ephemeral port).
- Enable **Allow public client flows = Yes** if you want a secret-less PKCE public client (recommended — simpler). Leave off only if you deliberately use a confidential client with a secret.
- If the portal forces platform grouping: put the `https://claude.ai/...` URI under **Web** or **Single-page application**, and the loopback URIs under **Mobile and desktop applications**.

### 4. Put the user's email in the access token
App → **Token configuration** → **Add optional claim** → token type **Access** → add **email** (and **upn** if offered). `preferred_username` is already present on v2 tokens as a fallback, but adding `email` is the reliable one. Save.

### 5. (Only if using a confidential client) create a client secret
App → **Certificates & secrets** → New client secret. Copy the value; you'll paste it into Claude's connector Advanced settings. Skip this if you enabled public-client/PKCE in step 3.

### 6. Set Vercel env vars and redeploy
On the `staging` project (Production environment):
- `CONNECTOR_AUTH_PROVIDER=entra`
- `CONNECTOR_ENTRA_TENANT_ID=<Directory (tenant) ID from step 1>`
- `CONNECTOR_ENTRA_AUDIENCE=<Application (client) ID from step 1>`  ← the client id GUID, not the App ID URI
- `MCP_RESOURCE_URL=https://www.triplecitiestech.com/api/connector/mcp` (must equal the Application ID URI from step 2; it's probably already set)
- (optional) `CONNECTOR_ENTRA_SCOPES=api://<client-id>/mcp.access` — advertise the scope so Claude requests it
- **Redeploy** so the vars take effect.

### 7. Reconnect in Claude
Remove the existing TCT connector, then Add custom connector again with the MCP URL. In **Advanced settings**, enter the Entra **client id** (and the **client secret** only if you made a confidential client in step 5). Complete the sign-in.

### 8. Verify
- The connection finalizes (no hang).
- Run a read tool (e.g. list companies) — should succeed.
- Run a write attributed to you (e.g. an Autotask internal note, or `hr_er_log_append`) and confirm it's recorded under **your** identity, not a service account. If a write says it can't attribute your email, the `email`/`preferred_username` claim isn't reaching the access token — recheck step 4.

## Rollback
Set `CONNECTOR_AUTH_PROVIDER=workos` (leave the WorkOS vars in place) and redeploy. The connector returns to the WorkOS flow immediately.

## Gotchas
- **`aud` = client id, not the resource URL** (step 6). Setting `CONNECTOR_ENTRA_AUDIENCE` to the App ID URI will 401 every request.
- **Email in the ACCESS token** needs the optional claim (step 4); id-token-only email won't help — our server reads the access token.
- **Entra ↔ Anthropic reachability**: Entra's discovery/token endpoints must be reachable from Anthropic's egress. This is a standard public flow, but if discovery fails, that's the first thing to check.
- **Live-validation is required**: the server side is unit/build-verified, but the *interactive* Claude↔Entra flow can only be confirmed by actually connecting (step 7-8). If the desktop app hangs the same way it did on WorkOS, capture the error and we debug the redirect/platform grouping in step 3.

Sources: [MCP Authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) · [Entra access token claims](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference) · [Claude connector authentication](https://claude.com/docs/connectors/building/authentication)
