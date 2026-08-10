# Runbook — Move the MCP connector onto our OWN authorization server

*Owner-run. Replaces Microsoft Entra as the connector's OAuth **authorization server** with an authorization server built into this app. Entra remains the **identity provider** — you still sign in with Azure AD — so per-technician attribution (Autotask impersonation, HR audit actor) is unchanged.*

**New endpoint: `https://www.triplecitiestech.com/api/connector/tct/mcp`**
Old Entra endpoint (`/api/connector/entra/mcp`) stays live and untouched. Run both, prove the new one, then retire the old one.

---

## Why this exists

The Entra-backed connector dropped every 60-90 minutes and **no change on our side could fix it**:

- claude.ai's custom-connector proxy **never refreshes OAuth tokens** ([anthropics/claude-ai-mcp#228](https://github.com/anthropics/claude-ai-mcp/issues/228)) — it does not check expiry, never calls `/token`, and ignores the 401 our server returns saying the token is dead.
- That issue names a second cause that lands squarely on us: claude.ai **ignores `authorization_endpoint` and `token_endpoint` for external identity providers** — Entra, Okta, Auth0 specifically.
- First-party/directory connectors are unaffected, which is why every other connector in the account stays up and only this one drops.

With refresh effectively unavailable, **the access-token lifetime IS the reconnect interval**. Entra's default is a random 60-90 minutes and its hard ceiling is 24 hours, so the best possible outcome on Entra was one reconnect a day.

Being our own authorization server removes both halves: there is no external IdP for the proxy to mishandle, and the token lifetime is a number we choose (**default 30 days**). It also removes the client secret entirely — we support Dynamic Client Registration, which Entra does not — so the failure that took the connector down on 2026-08-10 (a lapsed secret) cannot recur.

## What was built

| Piece | Path |
|---|---|
| AS metadata (RFC 8414) | `/.well-known/oauth-authorization-server` |
| Protected-resource metadata (RFC 9728) | `/.well-known/oauth-protected-resource/api/connector/tct/mcp` |
| Dynamic client registration (RFC 7591) | `POST /api/connector/oauth/register` |
| Authorization endpoint | `GET /api/connector/oauth/authorize` |
| Token endpoint | `POST /api/connector/oauth/token` |
| MCP mount | `/api/connector/tct/mcp` |
| Logic | `src/lib/connector/oauth/{tokens,store,metadata}.ts` |
| Tool surface (shared with the Entra mount) | `src/lib/connector/build-mcp-handler.ts` |

The tool surface is **the same builder for both mounts** — 30 inline registrations plus 9 register modules. Adding a tool cannot reach one mount and miss the other.

## Prerequisites

- Vercel env access on the `staging` project + a deploy.
- `MIGRATION_SECRET` (for the migration POST).
- `NEXT_PUBLIC_BASE_URL` already set to `https://www.triplecitiestech.com`.

## Steps

### 1. Generate and set the signing key

This key signs every access token. **Fail-closed:** if it is unset or shorter than 32 characters, the authorization server refuses to issue or verify anything.

```powershell
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Vercel → `staging` → Settings → Environment Variables → **Production**:

- `CONNECTOR_OAUTH_SIGNING_KEY` = the value above (required)
- `CONNECTOR_OAUTH_ACCESS_TTL_DAYS` = optional, default `30`
- `CONNECTOR_OAUTH_REFRESH_TTL_DAYS` = optional, default `90`

### 2. Deploy

Merge to `main`. Vercel deploys production automatically.

### 3. Run the migration — REQUIRED, the connector 503s without it

Three new raw-pg tables (`connector_oauth_clients`, `connector_oauth_codes`, `connector_oauth_refresh_tokens`). `prisma migrate deploy` does not run on this database; the API route is the source of truth.

```powershell
Invoke-RestMethod -Method POST -Uri "https://www.triplecitiestech.com/api/migrations/run" `
  -Headers @{ "x-migration-secret" = "<MIGRATION_SECRET>" }
```

Expect `✅ connector_oauth_* tables (clients, codes, refresh tokens)` in the response.

### 4. Verify discovery before touching Claude

```powershell
Invoke-RestMethod "https://www.triplecitiestech.com/.well-known/oauth-authorization-server"
Invoke-RestMethod "https://www.triplecitiestech.com/.well-known/oauth-protected-resource/api/connector/tct/mcp"
```

Check, specifically:
- AS `scopes_supported` **contains `offline_access`** — this is the document Claude reads when deciding whether to request a refresh token. Putting it only on the protected-resource document is what silently did nothing against Entra.
- AS has `registration_endpoint` (this is why no client secret is needed).
- PRM `resource` is **exactly** `https://www.triplecitiestech.com/api/connector/tct/mcp` — it must equal the URL you type into Claude, path included.

### 5. Add the connector in Claude

1. claude.ai → Settings → **Connectors** → **Add custom connector**.
2. URL: `https://www.triplecitiestech.com/api/connector/tct/mcp`
3. **Leave Advanced settings empty.** No client ID, no client secret — Claude registers itself via DCR. Pasting the old Entra credentials here will break it.
4. **Connect** → you are sent to the normal TCT staff sign-in (Azure AD) → you land back connected.

Leave the old **TCT MCP** connector in place for now. Two connectors will show the same tools; that is expected during migration.

### 6. Verify

- A read tool works (e.g. list Autotask companies).
- A write is attributed to **you**, not a service account — post an internal note or use `hr_er_log_append` and confirm the actor.
- **Come back the next day and confirm it is still connected.** That is the whole point of the change, and it is the only test that actually proves it.

### 7. Retire the Entra connector

Once the new one has survived several days: remove the old **TCT MCP** connector in Claude. The `/api/connector/entra/mcp` route can stay deployed — it costs nothing and is the rollback.

## Rollback

Nothing to undo. The Entra mount is untouched and still live — reconnect the old connector and carry on. The new routes are additive; the tables are additive.

## Security model

- **Public client + PKCE.** No client secret exists, so none can leak or expire. S256 only — `plain` is refused even if the value matches.
- **Registration is NOT open.** RFC 7591 registration is open by design; ours accepts only `https://claude.ai` callbacks and RFC 8252 loopback addresses. An arbitrary registered callback plus one phished staff sign-in is a stolen token, and this server fronts write access to Autotask, IT Glue and UniFi. Widen it only for a callback Anthropic documents.
- **Loopback ports are ignored, nothing else is.** Claude Code binds an ephemeral port and declares only the port-less form, so scheme/host/path must match exactly but the port is ignored — for loopback hosts only.
- **Codes and refresh tokens are stored only as SHA-256.** There is deliberately no column that could hold the plaintext; a database dump cannot be replayed against the token endpoint. Codes are single-use, enforced atomically by the UPDATE that consumes them. Refresh tokens rotate on every use.
- **Access tokens are 30 days by default.** That is a real trade: a disabled account keeps working against the connector until its token expires. Bounded by what the connector can reach — no IT Glue passwords, and config/firewall writes still require an approval its own token cannot grant.

### Revoking access

Two levers, both immediate:

- **One person** — revoke their refresh tokens (`revokeUserRefreshTokens` in `src/lib/connector/oauth/store.ts`). Stops renewal; their current access token still works until it expires.
- **Everyone, right now** — rotate `CONNECTOR_OAUTH_SIGNING_KEY` in Vercel and redeploy. Every outstanding access token becomes unverifiable instantly. This is the break-glass; everyone reconnects afterwards.

There is deliberately no per-request denylist lookup — it would add a blocking database round-trip to every MCP call.

## Notes

- **A new URL was mandatory.** A Claude client caches the authorization server per connector URL and that cache survives remove/re-add (learned the hard way on 2026-07-16, and again on 2026-08-10). Reusing `/api/connector/entra/mcp` would have kept replaying the Entra authorization server.
- **The 401 challenge carries an explicit `scope`.** Anthropic's connector docs make `scope` on `WWW-Authenticate` the first-choice way to control what Claude requests, so refresh-token issuance does not depend on Claude's fallback reading of any metadata document. Both levers are used; neither is trusted alone.
- **`/api/connector/oauth/*` is under `/api`**, so `middleware.ts` does not run on it (its matcher excludes `api`). The two `.well-known` documents DO pass through middleware, which only sets security headers.
