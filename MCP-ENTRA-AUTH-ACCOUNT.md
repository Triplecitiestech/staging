# MCP connector authentication in this repo — a factual account

*Written 2026-08-18 from the code on branch `claude/mcp-connector-auth-docs-h7a8zd`. Every claim cites a file path. Nothing here is a recommendation or a description of what the MCP spec requires — it is what this codebase does.*

**Scope note for the reader:** this repo has been through **two** connector auth designs and currently ships **both, side by side**. If you are building an Entra-authenticated MCP server, the Entra design is the second section; the third section explains why this repo moved off it while leaving it running. The move was not because Entra failed at authentication — it authenticated correctly — but because of how a *client* handles token refresh against an external IdP.

---

## 1. Which connector URL paths exist today

Four route files under `src/app/api/connector/`, plus three metadata routes under `src/app/.well-known/`.

| Path | File | Status |
|---|---|---|
| `/api/connector/entra/[transport]` (i.e. `…/entra/mcp`) | `src/app/api/connector/entra/[transport]/route.ts` | Live. Labelled **"SUPERSEDED, still live"** in the file header (line 16). Kept as the rollback. |
| `/api/connector/tct/[transport]` (i.e. `…/tct/mcp`) | `src/app/api/connector/tct/[transport]/route.ts` | Live. The replacement mount. |
| `POST /api/connector/oauth/register` | `src/app/api/connector/oauth/register/route.ts` | Live, serves the `tct` mount only. |
| `GET /api/connector/oauth/authorize` | `src/app/api/connector/oauth/authorize/route.ts` | Live, serves the `tct` mount only. |
| `POST /api/connector/oauth/token` | `src/app/api/connector/oauth/token/route.ts` | Live, serves the `tct` mount only. |
| `/.well-known/oauth-protected-resource` | `src/app/.well-known/oauth-protected-resource/route.ts` | Live. Describes the **entra** mount. |
| `/.well-known/oauth-protected-resource/api/connector/tct/mcp` | `src/app/.well-known/oauth-protected-resource/api/connector/tct/mcp/route.ts` | Live. Describes the **tct** mount. |
| `/.well-known/oauth-authorization-server` | `src/app/.well-known/oauth-authorization-server/route.ts` | Live. Describes **this app** as an authorization server (tct mount only). |

There is **no callback route** in this repo for the connector's own OAuth server — the client's `redirect_uri` is Claude's own callback, and the repo never hosts one. `src/app/api/auth/[...nextauth]` exists but is the staff-SSO NextAuth handler, a separate concern.

**Dead / legacy paths.** `/api/connector/[transport]` (i.e. `/api/connector/mcp`) no longer exists. It was moved to `/api/connector/entra/[transport]` in commit `1fe2ed7` (2026-07-16) — `git show --stat 1fe2ed7` records the rename `src/app/api/connector/{ => entra}/[transport]/route.ts`. The old URL string survives only as the Entra **Application ID URI**, which is an identifier and not an endpoint (`docs/runbooks/CONNECTOR_AUTH_ENTRA.md` line 7).

The `[transport]` dynamic segment also matches `/sse`. `docs/runbooks/CONNECTOR_AUTH_ENTRA.md` (Ruled out section, last bullet) records that the SSE transport in `mcp-handler` needs Redis for session state and **Redis is not configured here**, so any client pointed at `…/sse` instead of `…/mcp` would drop constantly.

### Is WorkOS AuthKit still referenced?

**Not fully removed from the codebase — the npm dependency is gone, but a complete, selectable WorkOS code path remains and is still the compiled-in default.** Proof:

- `src/lib/connector/auth.ts:29` — `return process.env.CONNECTOR_AUTH_PROVIDER === 'entra' ? 'entra' : 'workos'`. Anything other than the exact string `entra` selects WorkOS.
- `src/lib/connector/auth.ts:54-59` — `getWorkosJwks()`, building a JWKS from `${AUTHKIT_DOMAIN}/oauth2/jwks`.
- `src/lib/connector/auth.ts:183-199` — the live WorkOS verification branch.
- `src/lib/mcp-write-tools.ts:17-33` — `resolveUserEmail()` still calls `https://api.workos.com/user_management/users/${sub}` using `WORKOS_API_KEY`. This is reached **only** from the WorkOS branch (`src/lib/connector/auth.ts:192`).
- `.env.example:144` — `CONNECTOR_AUTH_PROVIDER=workos`.
- `src/lib/connector/capability-registry.ts:709` — the connector's self-report tool defaults its `authProvider` field to `'workos'`.

There is **no WorkOS npm package**: `package.json` contains no `@workos-inc/*` entry, and `grep -n workos package-lock.json` returns nothing. The WorkOS integration is hand-rolled JWKS verification plus one `fetch`, so removing the package did not remove the path.

Which provider is actually active in production is an environment-variable value in Vercel and is **not determinable from the code**. The runbook `docs/runbooks/CONNECTOR_AUTH_ENTRA.md` step 6 instructs setting `CONNECTOR_AUTH_PROVIDER=entra`, and `CLAUDE.md`'s 2026-07-16 decision entry states the cutover went live, but the repo cannot prove the current value.

---

## 2. The exact auth flow, end to end

Two flows, because two mounts. Both use `withMcpAuth` from `mcp-handler` (`^1.0.0`, `package.json`).

### 2a. The `tct` mount — this app is the authorization server

**Step 1 — Claude POSTs to the MCP endpoint with no token.**
`src/app/api/connector/tct/[transport]/route.ts:53-56` wraps the tool handler in `withMcpAuth(handler, verify, { required: true, resourceMetadataPath: '/.well-known/oauth-protected-resource/api/connector/tct/mcp' })`.

**Step 2 — the server returns 401 with a `WWW-Authenticate` challenge.** The base challenge is constructed inside `mcp-handler`, which is not vendored in this repo, so its exact byte content is **not determinable from the code here**. What this repo adds is explicit and readable: `src/app/api/connector/tct/[transport]/route.ts:72-80` intercepts any 401 and appends `, scope="<CHALLENGE_SCOPE>"` unless a `scope=` is already present. `CHALLENGE_SCOPE` is `"mcp.access offline_access"` (`src/lib/connector/oauth/metadata.ts:22,69`). The comment at lines 60-70 states the reason: Anthropic's connector docs make the `scope` parameter on the 401 the first-choice way to control what Claude requests, so refresh-token issuance is not left to the client's metadata-reading fallback.

For the Entra mount, `docs/runbooks/CONNECTOR_AUTH_ENTRA.md` ("Hard outage" table) records an observed production result: *"401 with a correct RFC 9728 `WWW-Authenticate` + `resource_metadata`"*. That is a recorded observation, not a code citation.

**Step 3 — Claude reads the protected-resource document** at the path named in the challenge. `src/app/.well-known/oauth-protected-resource/api/connector/tct/mcp/route.ts` serves `protectedResourceMetadata()` (`src/lib/connector/oauth/metadata.ts:51-60`):

```
resource:                 <NEXT_PUBLIC_BASE_URL>/api/connector/tct/mcp
authorization_servers:    [ <NEXT_PUBLIC_BASE_URL> ]
bearer_methods_supported: ["header"]
scopes_supported:         ["mcp.access", "offline_access"]
```

`resource` and `authorization_servers` are derived from `NEXT_PUBLIC_BASE_URL` at `src/lib/connector/oauth/tokens.ts:45-52`. The path suffix on this well-known route is deliberate: the file header (lines 5-11) explains that the *bare* `/.well-known/oauth-protected-resource` still describes the older Entra mount, so two documents are needed.

**Step 4 — Claude reads the authorization-server document** at `/.well-known/oauth-authorization-server`. Served by `src/app/.well-known/oauth-authorization-server/route.ts` from `authorizationServerMetadata()` (`src/lib/connector/oauth/metadata.ts:25-48`):

```
issuer:                             <NEXT_PUBLIC_BASE_URL>
authorization_endpoint:             <base>/api/connector/oauth/authorize
token_endpoint:                     <base>/api/connector/oauth/token
registration_endpoint:              <base>/api/connector/oauth/register
response_types_supported:           ["code"]
grant_types_supported:              ["authorization_code", "refresh_token"]
code_challenge_methods_supported:   ["S256"]
token_endpoint_auth_methods_supported: ["none"]
scopes_supported:                   ["mcp.access", "offline_access"]
resource_indicators_supported:      true
service_documentation:              <base>/admin/connector/usage
```

The comment at `src/lib/connector/oauth/metadata.ts:11-15` records the distinction that mattered: `offline_access` belongs on **this** document, not the protected-resource one, and putting it only on the latter (what was done against Entra) does nothing for refresh.

**Step 5 — Claude registers itself (RFC 7591).** `POST /api/connector/oauth/register`, JSON body (`src/app/api/connector/oauth/register/route.ts:36-41` — deliberately JSON, not form-encoded like `/token`, per the comment at lines 14-16). The server:
- requires a non-empty `redirect_uris` array (lines 43-51);
- filters every URI through `isRegisterableRedirectUri()` (`src/lib/connector/oauth/tokens.ts:170-175`), which accepts **only** `https://claude.ai` origins and RFC 8252 loopback (`http://localhost`, `http://127.0.0.1`, `http://[::1]`), and rejects the whole request if any entry fails (lines 57-64);
- mints a `randomUUID()` client id, persists it (`registerClient()` → `connector_oauth_clients`), and returns `token_endpoint_auth_method: "none"` — a **public client, no secret issued** (lines 66-91).

**Step 6 — authorization.** `GET /api/connector/oauth/authorize`. In order (`src/app/api/connector/oauth/authorize/route.ts`):
- 503 if `isConfigured()` is false (missing signing key or base URL) — line 49;
- missing `client_id` or `redirect_uri` → rendered HTML error, **never redirected** (lines 59-60, comment at 12-15 cites RFC 6749 §4.1.2.1);
- unknown `client_id` → HTML error (line 69);
- `redirect_uri` checked against **that client's** registered list via `redirectUriAllowed()` (line 73);
- from here errors redirect to the now-verified callback: `response_type` must be `code` (line 79); `code_challenge` required (line 85); `code_challenge_method` must be `S256` (line 88);
- **user authentication is the existing staff NextAuth session**: `const session = await auth()` (line 95). No session → redirect to `${issuerUrl()}/auth/signin?callbackUrl=<this authorize URL, parameters intact>` (lines 97-100), so the OAuth dance resumes rather than restarts. That NextAuth instance is Azure AD (`src/auth.ts:31-35`), which is how **Entra remains the identity provider under this mount**;
- **no separate consent screen** (comment lines 102-105), justified by the narrowed callback allowlist plus the interactive tenant sign-in that just happened;
- a 32-byte CSPRNG code (`newSecret()`, `src/lib/connector/oauth/store.ts:19-21`) is stored **SHA-256 only** with a 300-second TTL (`AUTH_CODE_TTL_SECONDS`, `src/lib/connector/oauth/tokens.ts:27`) bound to `{clientId, redirectUri, codeChallenge, method, resource, userEmail, scope}`, then redirected back with `state`.

**Step 7 — token exchange.** `POST /api/connector/oauth/token` accepts `application/x-www-form-urlencoded` **and** JSON (`src/app/api/connector/oauth/token/route.ts:52-66`; the comment at lines 9-13 notes form-encoded is what Claude sends and a JSON-only parser causes 415s). For `grant_type=authorization_code`:
- `consumeAuthCode()` is an atomic `UPDATE … WHERE consumed_at IS NULL … RETURNING` (`src/lib/connector/oauth/store.ts:122-147`) — single-use by construction, a replay loses the race;
- the code's stored `clientId` must equal the presented one (line 113);
- `redirect_uri` must equal the one in the authorization request **and** still be registered (lines 116-121);
- PKCE S256 verified in constant time (`verifyPkce`, `src/lib/connector/oauth/tokens.ts:122-130`; `plain` is refused outright).

For `grant_type=refresh_token`: `rotateRefreshToken()` revokes the presented token and records `rotated_to` in the same statement (`src/lib/connector/oauth/store.ts:168-181`). Failure returns `invalid_grant` specifically — the comment at `token/route.ts:15-17` states Anthropic's docs require that exact spelling or Claude will not fall back to re-authorizing.

**Step 8 — the access token.** `signAccessToken()` (`src/lib/connector/oauth/tokens.ts:74-86`): HS256, `typ: at+jwt`, `iss` = `NEXT_PUBLIC_BASE_URL`, `aud` = `<base>/api/connector/tct/mcp`, `sub` = the email, custom claims `scp`, `azp`, `email`. Default lifetime **30 days** (`DEFAULT_ACCESS_TTL_DAYS`, line 23), refresh **90 days** (line 25), both env-overridable.

**Step 9 — per-request verification.** `verifyAccessToken()` (`src/lib/connector/oauth/tokens.ts:95-115`) checks signature, `iss` and `aud`, and requires an `email` claim; returns `null` on anything else, never throws. The route wraps it into an `AuthInfo` with `extra: { sub: v.email, email: v.email }` (`src/app/api/connector/tct/[transport]/route.ts:45-50`).

### 2b. The `entra` mount — Microsoft Entra is the authorization server

**Step 1-2** as above, except `resourceMetadataPath` is the bare `/.well-known/oauth-protected-resource` (`src/app/api/connector/entra/[transport]/route.ts:45`) and **no `scope` is appended to the 401** — that interception exists only on the tct mount.

**Step 3 — protected-resource document.** `src/app/.well-known/oauth-protected-resource/route.ts` serves `getProtectedResourceMetadata()` (`src/lib/connector/auth.ts:74-114`). On the entra branch:

```
resource:                 <MCP_RESOURCE_URL>
authorization_servers:    [ https://login.microsoftonline.com/<CONNECTOR_ENTRA_TENANT_ID>/v2.0 ]   (or CONNECTOR_ENTRA_ISSUER)
bearer_methods_supported: ["header"]
scopes_supported:         <CONNECTOR_ENTRA_SCOPES split on whitespace> + "offline_access"   — only if CONNECTOR_ENTRA_SCOPES is set
```

`offline_access` is appended at line 103 if absent. If `CONNECTOR_ENTRA_SCOPES` is unset, `scopes_supported` is **omitted entirely** (line 82) — including the `offline_access` that was added to fix the refresh problem.

**Step 4 — there is no authorization-server document served by us on this path.** The runbook states Claude discovers Entra via OpenID Connect discovery against the advertised issuer (`docs/runbooks/CONNECTOR_AUTH_ENTRA.md`, "How it works", bullet 1).

**Step 5 — token verification.** `verifyConnectorToken()` entra branch (`src/lib/connector/auth.ts:130-180`), detailed in §5 below.

---

## 3. How Entra's lack of Dynamic Client Registration was handled

Entra has no DCR. This repo handled that **two different ways at two different times**, and both are still in the tree.

**On the `entra` mount: a pre-registered app registration, with its client ID *and client secret* typed into Claude's connector Advanced settings.** There is no proxy and no shim — the client talks to Entra directly. `docs/runbooks/CONNECTOR_AUTH_ENTRA.md` step 7.3: *"Click **Advanced settings** (only shown in the Add dialog) and enter the Entra **client id** AND the **client secret** from step 5. (Entra has no dynamic client registration — 'Automatic client registration isn't supported' means the client id field was empty.)"* Step 5 of the same runbook creates the secret and states it is required *"because the claude.ai callback is a Web (confidential) client."*

**On the `tct` mount: this app implements DCR itself, so Entra's lack of it stops mattering.** `POST /api/connector/oauth/register` (`src/app/api/connector/oauth/register/route.ts`) is the mechanism. Its file header (lines 5-9) states the motive explicitly: *"This endpoint is the reason the new connector needs no client secret pasted into Claude's Advanced settings — which is the thing that failed on 2026-08-10 when the Entra app's secret lapsed… Entra has no DCR at all; ours does, so there is no secret to expire."* `docs/runbooks/CONNECTOR_AUTH_TCT.md` step 5.3: *"Leave Advanced settings empty. No client ID, no client secret."*

The tct mount is **not** a proxy or shim in front of Entra in the OAuth sense: it does not forward the authorization request to Entra or exchange Entra tokens. It is a full authorization server that happens to authenticate its users by requiring an existing Azure AD staff session (`src/app/api/connector/oauth/authorize/route.ts:95`).

---

## 4. The Entra app registration shape required

All of this is from `docs/runbooks/CONNECTOR_AUTH_ENTRA.md` and `docs/runbooks/CONNECTOR_TEAM_ACCESS.md` — it is tenant configuration, so no code proves it.

**App registration count: one, for the connector.** Named `TCT MCP Connector`, single tenant (Entra runbook step 1). The repo has other, unrelated Entra apps — staff SSO (`AZURE_AD_CLIENT_ID/SECRET/TENANT_ID`, `src/auth.ts:32-34`) and a deliberately separate least-privilege HR app (`HR_RECORDS_CLIENT_ID` etc., `.env.example` line 193-196, which says explicitly *"Do NOT reuse the AZURE_AD staff-SSO app for this"*). The connector app is its own registration.

**Exposed API / scope.** Expose an API → Application ID URI set to `https://www.triplecitiestech.com/api/connector/mcp`, then Add a scope named `mcp.access`, admins+users consent, enabled (step 2). Note the Application ID URI keeps the **old** endpoint path; the runbook (line 7) explains this is fine because it is only an identifier and a scope prefix. The full scope string Claude requests is `https://www.triplecitiestech.com/api/connector/mcp/mcp.access` (step 6, optional `CONNECTOR_ENTRA_SCOPES`).

**Manifest.** `requestedAccessTokenVersion` must be set to `2` (step 2b). A new app with a custom `https://` Application ID URI defaults it to `null`, which mints v1 tokens.

**Redirect URIs** (step 3):
- `https://claude.ai/api/mcp/auth_callback` under the **Web** platform — yes, present. The runbook is emphatic: *"Use Web, not SPA — Claude exchanges the auth code from its own servers, which is a confidential (Web) client flow that needs a client secret."*
- `http://localhost/callback` and `http://127.0.0.1/callback` under **Mobile and desktop applications**, for Claude Code's loopback.

**Optional claims.** Token configuration → add `email` (and `upn` if offered) to the **Access** token (step 4). The runbook notes an id-token-only email does not help because the server reads the access token.

**Client secret.** Required for the Entra mount (step 5), because of the Web-platform callback. This is what lapsed on 2026-08-10.

**Admin consent.** Not required as a separate step in the runbook — the scope is configured as admins-and-users consent (step 2), and step 7.4 has the user consent interactively at sign-in. The runbook adds a specific warning at the end of cause 4: *"Do NOT add `offline_access` as an API permission / delegated permission on the app registration"* — it is implicitly granted whenever any delegated permission is, and consent was never the blocker.

**"Assignment required" is used.** `docs/runbooks/CONNECTOR_TEAM_ACCESS.md`, one-time setup step 3: Enterprise applications → the connector app → Properties → **Assignment required? = Yes**, described as *"the switch that makes the connector opt-in. With it set to No, anyone in your tenant who finds the URL can connect."* Per-technician access is then a Users-and-groups assignment, with the runbook recommending a `TCT-Connector-Users` security group. Removal is a de-assignment plus, for immediate effect, Revoke sessions — because the already-issued access token stays valid until it expires.

---

## 5. Token validation on the server

### Entra mount — `verifyConnectorToken()`, `src/lib/connector/auth.ts:126-203`

**Signing keys** come from a lazily-created `createRemoteJWKSet` over `https://login.microsoftonline.com/${CONNECTOR_ENTRA_TENANT_ID}/discovery/v2.0/keys` (lines 61-71), cached in a module-level singleton.

**Claims checked** — via `jwtVerify(bearerToken, jwks, { issuer: issuers, audience: audiences })` at line 149. That call verifies signature, `iss`, `aud`, and `exp`/`nbf` (jose's defaults). Specifically:

- **`aud`** — accepts *either* `CONNECTOR_ENTRA_AUDIENCE` (the app's **client ID GUID**) *or* `MCP_RESOURCE_URL` (line 139). The comment at lines 45-49 and 134-138 explains: an Entra **v2** access token's `aud` is the client-id GUID, never the Application ID URI; a **v1** token's `aud` is the Application ID URI. Both are accepted so a tenant that never flipped the manifest still works.
- **`iss`** — if `CONNECTOR_ENTRA_ISSUER` is set it is pinned; otherwise **both** `https://login.microsoftonline.com/<tid>/v2.0` and `https://sts.windows.net/<tid>/` are accepted (lines 142-147), for the same v1/v2 reason.
- **`exp`** — enforced by jose. The 2026-08-10 production log line in the runbook shows exactly this failing: `"reason":"\"exp\" claim timestamp check failed"`.
- **`tid`** — **not checked directly.** Tenant isolation comes from the issuer check and from the tenant-scoped JWKS URL, not from reading `tid`.
- **`scp`** — read but **not enforced**. Line 157 splits it into `scopes` on the returned `AuthInfo`; nothing rejects a token for lacking `mcp.access`. There is no scope gate anywhere in the request path.

**Identity** is `preferred_username` → `email` → `upn` → `unique_name`, first non-empty, lowercased (line 154). `clientId` is `azp` → `appid` → `sub` (line 158).

**Failure is closed and diagnosable**: any failure returns `undefined` → 401, and line 164-178 decodes (does not verify) the token to log `connector.entra.verify_failed` with `aud`/`iss`/`ver`/`appid`/`scp` versus expected — deliberately no token and no PII.

### tct mount — `verifyAccessToken()`, `src/lib/connector/oauth/tokens.ts:95-115`

HS256 with a symmetric key from `CONNECTOR_OAUTH_SIGNING_KEY`, which must be ≥32 characters or the whole server is inert (`signingKey()`, lines 58-62 — no hardcoded fallback, per `CLAUDE.md` rule 7). Checks `iss` (this site's origin), `aud` (`<base>/api/connector/tct/mcp`), `exp` (jose default), and requires an `email` claim. `scp` is split into scopes and, again, not enforced.

### Where signed-in identity is read in tool handlers

Uniformly at `authInfo.extra.email`, reached from the per-call `extra` argument:

- `src/lib/mcp-write-tools.ts:366` — `const emailOf = (extra: any) => extra?.authInfo?.extra?.email`, then `resolveResourceId()` (lines 37-50) maps it to an Autotask resource id for the `ImpersonationResourceId` header. A missing email is a hard error: *"Cannot attribute this action…"* (line 39).
- `src/lib/mcp-hr-tools.ts:42`, `src/lib/mcp-config-write-tools.ts:44`, `src/lib/mcp-unifi-site-tools.ts:143` — same one-liner.
- `src/lib/connector/telemetry.ts:413-420` — reads only that path for per-call attribution.

This is why `src/app/api/connector/tct/[transport]/route.ts:49` puts the email at `extra.email` and the comment says it *"must stay on this exact path"* — the two mounts return the same `AuthInfo` shape so the tool layer is auth-agnostic.

---

## 6. npm packages doing the work

From `package.json`:

| Package | Version | Role |
|---|---|---|
| `mcp-handler` | `^1.0.0` | `createMcpHandler` (tool surface) and `withMcpAuth` (401 + bearer extraction). |
| `@modelcontextprotocol/sdk` | `^1.27.1` | `AuthInfo` type from `…/server/auth/types.js`. |
| `jose` | `^5.0.0` | `createRemoteJWKSet`, `jwtVerify`, `decodeJwt`, `SignJWT`. All JWT work, both mounts. |
| `next-auth` | `^5.0.0-beta.30` | Staff Azure AD session; `auth()` is what `/authorize` requires. |
| `@auth/prisma-adapter` | `^2.11.1` | NextAuth session persistence. |
| `next` | `15.5.9` | App Router, route handlers. |
| `pg` | `^8.13.1` | Raw-pg OAuth store (`connector_oauth_*` tables). |
| `zod` | `^3.23.8` | Tool input schemas (not auth). |

Node crypto (`createHash`, `randomBytes`, `timingSafeEqual`, `randomUUID`) does PKCE, secret generation and hashing — no library.

---

## 7. What broke during the build, and how each was fixed

This is the part with the most reusable content. Every item is recorded in the code comments or `docs/runbooks/CONNECTOR_AUTH_ENTRA.md`, and in commit messages `8987ba1`, `f398a5d`, `1fe2ed7`, `7f6c962`.

**1. WorkOS desktop sign-in never finalized — the reason Entra was adopted at all.** Commit `8987ba1` (2026-07-15): *"the WorkOS AuthKit sign-in completes on claude.ai web but the desktop app never finalizes the connection (matches a known Claude↔WorkOS connector bug)."* The fix was the provider-swappable `src/lib/connector/auth.ts`, not a WorkOS change.

**2. Entra authenticated the user, and our server rejected the token — v1 vs v2 token shape.** Commit `f398a5d` (2026-07-15). A new app registration with a custom `https://` Application ID URI defaults `requestedAccessTokenVersion` to `null`, so Entra mints **v1** tokens: `iss` = `https://sts.windows.net/<tid>/`, `aud` = the Application ID URI. The verifier hard-required **v2**: `iss` = `…/v2.0`, `aud` = the client-id GUID. Symptom: Entra sign-in logs showed **Success** while our endpoint returned `POST /api/connector/mcp 401`. Two fixes, both kept: set `requestedAccessTokenVersion: 2` in the manifest (runbook step 2b), and accept **both** issuers and **both** audiences (`src/lib/connector/auth.ts:134-147`). The commit also added the `connector.entra.verify_failed` diagnostic log because *"a 401 is diagnosable instead of opaque."* The generalizable fact: **an Entra v2 access token's `aud` is the client-ID GUID, not the Application ID URI** — set your audience env var to the GUID.

**3. The client cached the old authorization server, so the cutover could not take — fixed by moving the URL.** Commit `1fe2ed7` (2026-07-16). Server side was fully correct and the connector still 401'd: the Claude client caches the OAuth **authorization server per connector URL**, and that cache **survived remove/re-add across devices**. It kept replaying its old WorkOS token — proven by the new diagnostic showing `token_iss` = the WorkOS AuthKit domain — against the now-Entra server. Fix: move the route to a brand-new URL (`/api/connector/mcp` → `/api/connector/entra/mcp`) so the client has no cached AS for it. The same behaviour is cited again in `docs/runbooks/CONNECTOR_AUTH_TCT.md` ("A new URL was mandatory… learned the hard way on 2026-07-16, and again on 2026-08-10") and is why the third design also got a fresh path.

**4. `AADSTS` / error code seen during that cutover: `9010010`** — *"resource parameter provided in the request doesn't match"*. `docs/runbooks/CONNECTOR_AUTH_ENTRA.md` labels this a historical artifact of the 2026-07-16 cutover debugging, not of the later disconnect problem.

**5. Redirect URI platform: Web, not SPA.** Runbook step 3 and the troubleshooting table (*"Sign-in window never finishes → Redirect URI registered under the wrong platform"*). Claude exchanges the code from its own servers — a confidential-client flow — so `https://claude.ai/api/mcp/auth_callback` must sit under the **Web** platform. A `spa` registration also hard-caps refresh tokens at 24 hours.

**6. The ~75-minute disconnects, and three wrong diagnoses before the right one.** This is the most instructive sequence in the repo.
   - *Hypothesis 1, SPA redirect URI → 24h cap.* **Ruled out** 2026-07-28 by portal inspection: the callback is registered under Web. The runbook records it *"was the best-fitting hypothesis on frequency alone and it was wrong. Recorded here so nobody re-runs the same check."*
   - *Hypothesis 2, a Conditional Access sign-in-frequency policy.* **Ruled out** by enumerating all 12 CA policies with `Get-MgIdentityConditionalAccessPolicy`; the only two with session controls are both `disabled`. (One of them, "Require MFA for All Apps", carries sign-in frequency = 1 day across All apps — a live landmine if anyone enables it.)
   - *Hypothesis 3, risk-based reauth from Anthropic's egress IPs.* Superseded by evidence: sign-in IPs were the technician's residential address, `RiskState: none` on every row.
   - *Actual cause, confirmed:* **no refresh token was ever issued**, because `offline_access` was never requested. Evidence from `Get-MgAuditLogSignIn` over 12 days: **30 of 30 sign-ins `IsInteractive: True`** (a working refresh token produces `IsInteractive: False` rows), and the **shortest interval between sign-ins was 68 minutes** — the floor of Entra's randomized 60-90 minute access-token lifetime. The reported "once or twice a day" cadence tracked *usage*, not the clock. The runbook's stated lesson: *"for an intermittent auth symptom, measure the interval distribution from the sign-in logs BEFORE theorising about lifetime caps. The floor of the distribution names the mechanism."*
   - *First fix attempt:* append `offline_access` to `scopes_supported` in `getProtectedResourceMetadata()` (`src/lib/connector/auth.ts:103`). Later found to be on the **wrong document** — see item 8.

**7. A retracted diagnosis worth copying, because the retraction is the lesson.** On 2026-08-10 a note claimed that a live token's `scp: "mcp.access"` proved `offline_access` had never been granted, and declared the July fix disproven. Retracted the same day (`docs/runbooks/CONNECTOR_AUTH_ENTRA.md`, first paragraph after the log block): Microsoft defines `scp` as the scopes **exposed by the application** for which consent was received. `offline_access` is a *reserved* scope, not one the API exposes, so it is **absent from `scp` whether or not it was requested** — exactly like `openid`, `profile`, `email`. *"An absence guaranteed by the format carries no information."* The status reverted to UNKNOWN, settleable only by `IsInteractive: False` rows in the sign-in logs. Two usable facts did survive: `scp` carries the **short** scope name (`mcp.access`), Entra having stripped the Application-ID-URI prefix; and the custom scope arriving at all is weak evidence the client *does* read `scopes_supported`.

**8. `offline_access` was on the wrong metadata document.** Commit `7f6c962` (2026-08-10) states it plainly: *"`offline_access` belongs on the AUTHORIZATION SERVER document. Putting it on the protected-resource document, which is what we did against Entra, does not influence what Claude requests."* The comment at `src/lib/connector/oauth/metadata.ts:11-15` quotes the Anthropic doc sentence behind that. The new design therefore does both: `offline_access` in the AS document's `scopes_supported`, **and** an explicit `scope` parameter on the `WWW-Authenticate` 401 (`src/app/api/connector/tct/[transport]/route.ts:72-80`), the docs' first-choice lever — *"Both levers are used; neither is trusted alone"* (`docs/runbooks/CONNECTOR_AUTH_TCT.md`, Notes).

**9. A hard outage: OAuth completes, Claude shows "Connected", zero tools.** 2026-08-10, recorded as OPEN in `docs/runbooks/CONNECTOR_AUTH_ENTRA.md` § "Hard outage". Server health was verified first (metadata 200, correct 401 challenge, no 5xx, last connector deploy 2026-07-31; the only intervening deploy added a `/rtp` redirect to `middleware.ts` whose matcher excludes `api`). Leading candidate: **the app's client secret expired** — the authorize leg still succeeds, so the user sees a Microsoft sign-in and a "Connected" page, while the code→token exchange fails and Claude replays its stale token. The named diagnostic is **`AADSTS7000222`** in the Entra sign-in logs. Recovery is not just a new secret: a connector cannot be edited in place, so it must be removed and re-added with the new secret in Advanced settings. The runbook's advice — 24-month expiry and a calendar entry, because there is no warning before it lapses.

**10. Access-token lifetime IS configurable on Entra, and three sessions missed it.** Recorded in `docs/runbooks/CONNECTOR_AUTH_ENTRA.md` § "The fix that does not depend on Claude". The January 2021 retirement of *refresh and session* lifetime configuration was misread as "token lifetimes aren't configurable"; **access-token** lifetime never was retired. `AccessTokenLifetime` on a `tokenLifetimePolicy`, minimum `00:10:00`, **maximum `23:59:59`**, assignable to one app via Graph/Graph PowerShell — **there is no portal UI**. Four caveats the runbook records: an **org-level policy silently overrides an app-level one** (check first, and it is the usual reason "it didn't take"); CAE's 24-28h extension can never apply because it needs both client and resource support and this is a plain custom API; the policy only affects tokens minted after it is applied; and the real trade is a longer window after revocation.

**11. The reason this repo left Entra as the authorization server.** Not an Entra defect. `docs/runbooks/CONNECTOR_AUTH_TCT.md` § "Why this exists" and commit `7f6c962`: claude.ai's custom-connector proxy **never refreshes OAuth tokens** ([anthropics/claude-ai-mcp#228](https://github.com/anthropics/claude-ai-mcp/issues/228)) and **specifically ignores the token endpoint of external identity providers — Entra, Okta, Auth0** — while first-party connectors are unaffected, *"which is why every other connector in the account stays up and only this one drops."* With refresh unavailable, the access-token lifetime is the reconnect interval, and Entra's ceiling is 24 hours. Owning the authorization server sets that number to 30 days by default and removes the client secret. **If you are building an Entra-authenticated MCP server for claude.ai today, this is the constraint to verify first, because it bounds the best achievable outcome at one reconnect per day.**

**12. Two smaller traps recorded alongside.** Sharing one body parser between `/register` (JSON, RFC 7591 §3.1) and `/token` (form-urlencoded, RFC 6749 §4.1.3) causes 415s — the two routes parse differently on purpose (`register/route.ts:14-16`, `token/route.ts:9-13`). And: **a Claude client fetches the tool list once per session and does not re-fetch after a deploy** — two sessions both reported the pre-deploy tool count of 125 and concluded a newly shipped tool did not exist, one proposing to build what was already live (`docs/runbooks/CONNECTOR_AUTH_ENTRA.md` § "Adding a tool?").

---

## 8. Configuration surface (names only, no values)

**Entra mount:** `CONNECTOR_AUTH_PROVIDER`, `MCP_RESOURCE_URL`, `CONNECTOR_ENTRA_TENANT_ID`, `CONNECTOR_ENTRA_AUDIENCE`, `CONNECTOR_ENTRA_ISSUER` (optional), `CONNECTOR_ENTRA_SCOPES` (optional). WorkOS branch: `AUTHKIT_DOMAIN`, `WORKOS_API_KEY`. All at `.env.example:140-167` and `src/lib/connector/auth.ts`.

**tct mount:** `CONNECTOR_OAUTH_SIGNING_KEY` (required, ≥32 chars, fail-closed; rotating it is the break-glass revocation of every outstanding token), `CONNECTOR_OAUTH_ACCESS_TTL_DAYS` (optional, default 30), `CONNECTOR_OAUTH_REFRESH_TTL_DAYS` (optional, default 90), `NEXT_PUBLIC_BASE_URL` (the issuer). `.env.example:169-188`, `src/lib/connector/oauth/tokens.ts`.

**Staff SSO used by `/authorize`:** `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (`.env.example:25-36`, `src/auth.ts`).

**Storage.** Three raw-pg tables created by `src/app/api/migrations/run/route.ts:736-779`: `connector_oauth_clients`, `connector_oauth_codes`, `connector_oauth_refresh_tokens`, plus three indexes. Codes and refresh tokens are stored **SHA-256 only** — `src/lib/connector/oauth/store.ts:10-13` states there is deliberately no column that could hold plaintext. This migration is a manual POST after deploy; without it every OAuth call returns 503 via `OAuthStoreUnavailable` (`store.ts:50-65`).

**Routing config.** `src/middleware.ts:94` matches `/((?!api|_next/static|_next/image|favicon.ico).*)` — so middleware **does not run** on any `/api/connector/**` path, and **does** run on the two `.well-known` documents, where it only sets security headers and passes through. `next.config.js` has no rewrite, redirect or header rule specific to connector or `.well-known` paths; its `async headers()` block applies the same global security headers and CSP to `/(.*)`. `vercel.json` sets `maxDuration: 60` for `src/app/api/connector/**/*.ts`; both route files also declare `runtime = 'nodejs'` and `maxDuration = 60` inline.

---

## Open questions

1. **Which provider is live in production right now.** `CONNECTOR_AUTH_PROVIDER` is a Vercel environment value. The code default is `workos` (`src/lib/connector/auth.ts:29`); the runbooks and `CLAUDE.md` decision log say the cutover to `entra` went live 2026-07-16. Not determinable from the code.

2. **Whether the `tct` mount is actually in service.** The code, migration DDL and runbook all exist (commit `7f6c962`, 2026-08-10), but nothing in the repo records that `CONNECTOR_OAUTH_SIGNING_KEY` was set, that `/api/migrations/run` was POSTed, or that the connector was re-added in Claude on the new URL. `docs/session-summary.md` and `docs/current-tasks.md` contain no mention of `connector/tct`.

3. **The exact `WWW-Authenticate` bytes on a 401.** Produced inside `mcp-handler` ^1.0.0, which is not vendored here (`node_modules` is absent in this checkout). Only the appended `scope="mcp.access offline_access"` is attributable to this repo's code.

4. **Whether the 2026-08-10 hard outage was the expired client secret.** The runbook lists it as the leading candidate with `AADSTS7000222` as the deciding evidence, and marks the section **OPEN**. No later commit or doc records the answer.

5. **Whether the July `offline_access` fix ever produced a refresh token on Entra.** Explicitly recorded as UNKNOWN after the retraction; the deciding evidence (`IsInteractive: False` rows) is not recorded anywhere in the repo.

6. **`/auth/signin` has no page in this repo.** `src/app/api/connector/oauth/authorize/route.ts:99` redirects unauthenticated users to `${issuerUrl()}/auth/signin?callbackUrl=…`, and `src/auth.ts:130` configures NextAuth `pages.signIn: '/auth/signin'`. `src/app/auth/` contains only `error/page.tsx`, and there is no rewrite in `next.config.js`. Many admin pages redirect there too, so this is not connector-specific — but what production actually serves at that path is not determinable from the code.

7. **No scope enforcement anywhere.** Both verifiers parse `scp` into a `scopes` array (`auth.ts:157`, `tokens.ts:110`) and no code path checks it before running a tool. Whether that is deliberate is not stated in any comment.
