# Live API Verification Report — DNSFilter, Datto EDR, EasyDMARC
*Date: 2026-07-19 · Method: authenticated read-only calls against the live production APIs · Author: integration-verification session*

> **Purpose.** Several integrations were built by guessing endpoints/field names instead of confirming them against the live API. Before repairing them, this report records the **ground truth** of what each API actually returns. Every claim below is backed by a real HTTP response observed in this session, except where explicitly labelled *(from official spec)* or *(could not verify)*.
>
> **Redaction.** All customer/tenant identifiers, org names, domains, IPs, MACs, and user data have been removed. Field **names** and **types** are shown; values are `<redacted>` or a type placeholder. Category names (DNSFilter's fixed taxonomy) and severity labels (vendor taxonomy) are shown because they are not customer data. No secrets appear in this document.

## Verdict summary

| System | Verdict | One-line reason |
|--------|---------|-----------------|
| **DNSFilter** | ✅ **FULLY VERIFIED** | `query_logs` exists and works; real defect is a **9-day-from-now window cap** triggered by the code's full-ISO timestamps, plus single-page sampling. Field names in code are correct. |
| **Datto EDR** | ✅ **FULLY VERIFIED** | `/api/Alerts` list model has a native **`severity`** and **no** `threatName`/`threatScore`/`flagName`; both code paths map fields that only exist on `AlertDetail`. Org scope (`organizationId`) and date (`createdOn`) are correct. |
| **EasyDMARC** | ⚠️ **PARTIALLY VERIFIED** | Base host, full token-exchange auth, endpoint paths, and the client's DNS role all confirmed **live**; response schemas from the official OpenAPI spec. The 200 lookup body could **not** be observed — the calls are rejected with `403 not_authorized` by an **IP allowlist (IP Safelisting)**, not a credential/code problem. Wrong host, paths, HTTP methods, and auth model in code. |

---

## 1. DNSFilter — ✅ FULLY VERIFIED

**Base URL:** `https://api.dnsfilter.com/v1` (code default — correct).

### Auth scheme (working, named)
- `Authorization: Token <JWT>` → **200** ✅ (this is what `src/lib/dnsfilter.ts` uses — correct)
- `Authorization: Bearer <JWT>` → **200** (also accepted)
- No auth → **401** `{"error":"Not Authorized"}`

The token is an Auth0-issued JWT. Both `Token` and `Bearer` prefixes work; keep `Token`.

### Endpoints confirmed to exist (200) vs failed
| Method + path | Result |
|---|---|
| `GET /organizations` | ✅ 200 (23 orgs for this token) |
| `GET /traffic_reports/query_logs` | ✅ 200 (per-row logs) |
| `GET /traffic_reports/top_categories` | ✅ 200 (aggregated) |
| `GET /traffic_reports/top_domains` | ✅ 200 (aggregated) |
| `GET /traffic_reports/{categories,domains,summary,security_report,threats,requests}` | ❌ 404 |
| `GET /nonexistent_xyz_123` | ❌ 404 (HTML) — proves recognized routes return JSON 401/200, unknown routes return 404 |

> **This settles the contradiction.** `src/lib/compliance/collectors/msp.ts:502` states *"traffic_reports endpoints don't exist."* **That is false** — `query_logs`, `top_categories`, and `top_domains` all return 200 with data.

### The real defect: a 9-day-**from-now** window cap (triggered by full-ISO timestamps)
Observed against `query_logs` (org-scoped, `result=blocked`):

| `from` / `to` format | Range | Result |
|---|---|---|
| Full ISO (`2026-07-10T00:00:00Z`) | 9 days | ❌ 400 `{"error":"Time period (from now) is greater than 9 days"}` |
| Full ISO | 10 / 30 days | ❌ 400 (same) |
| **Date-only** (`2026-07-10`) | 9 days | ✅ 200 |
| **Date-only** (`2026-06-19` → `2026-07-19`) | 30 days | ✅ 200 |

The cap is on how far **before *now*** the `from` instant is, and it fires only for **full-ISO timestamps**. `src/lib/dnsfilter.ts` formats dates as full ISO:
```ts
const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');  // -> "2026-06-19T00:00:00Z"
```
`buildSummary()` then queries **month-by-month** (~30-day windows) and an all-period window. Every one of those has `from` far more than 9 days before now → **400 → caught → zeros**. This is why DNSFilter "returns only totals or nothing." **Using date-only `YYYY-MM-DD` lifts the cap** (confirmed: 30-day date-only → 200).

### `query_logs` real response schema (redacted)
```
{ "data": {
    "organization_ids":   [<number>],
    "organization_names": [<string>],          // customer identifiers — redact
    "network_ids": [], "user_ids": [], "collection_ids": [],
    "values": [ {                              // ONE ROW PER DNS REQUEST
        "id": <number>, "time": <string>,
        "fqdn": <string>, "domain": <string>,  // <-- DOMAIN carried here (both)
        "request_address": <string>,           // client IP — PII, redact
        "networkid": <number>, "result": <string>,   // "allowed" | "blocked"
        "threat": <boolean>,
        "categories": [<number>],              // category IDs
        "categories_names": [<string>],        // <-- CATEGORY NAMES carried here
        "policy_id": <number>, "policy_name": <string>,
        "agentid": <string>, "agentname": <string>, "mac_address": <string>,  // PII
        "application_name": <string>, "application_category_name": <string>,
        "response_ips": [...], "server_id": <number>, ...
    } ],
    "page": { "size": <number>, "total": <number>, "first": <number>,
              "last": <number>, "prev": <object>, "next": <number>, "self": <number> },
    "security_report": ...
} }
```
- **Category → `categories_names` (string[])** — code reads this. ✅ correct.
- **Domain → `domain` (and `fqdn`)** — code reads `v.domain || v.fqdn`. ✅ correct.
- **Count → rows are per-request; `data.page.total` = total matches** — code reads `data.page.total`. ✅ correct.
- `result=blocked` **does** filter `query_logs` (confirmed: returned rows all had `result:"blocked"`; `data.page.total` = exact blocked count).

### Aggregation endpoints (no 9-day cap — 30-day date-only → 200)
`top_categories`:
```
{ "meta": { "total_count": <number>, "total_categories_sum": <number> },
  "data": { "organization_ids":[...], "organization_names":[...],
    "values": [ { "category_id": <number>, "category_name": <string>,   // <-- name
                  "total": <number>,                                    // <-- count (ALL traffic)
                  "methods":[...], "methods_names":[...], "policies":[...],
                  "total_networks": <number>, "total_proxies": <number>, "total_agents": <number> } ] } }
```
`top_domains`:
```
{ "meta": { "total_count": <number>, "total_count_networks/proxies/agents": <number> },
  "data": { ...,
    "values": [ { "domain": <string>,                 // <-- domain (redact)
                  "total": <number>,                  // total requests for this domain
                  "allowed": [<number>], "allowed_names": [<string>],   // per-CATEGORY allowed split
                  "blocked": [<number>], "blocked_names": [<string>],   // per-CATEGORY blocked split
                  "policies":[...], "total_networks/proxies/agents": <number> } ] } }
```
⚠️ **`result=blocked` is silently IGNORED by `top_categories`/`top_domains`** (identical output with/without; `type=blocked` returns 0). These report **total** traffic. Their per-row `blocked[]`/`blocked_names[]` arrays do carry a blocked-by-category split, but the list is sorted by `total`, so high-volume (allowed) domains fill the top page and blocked-heavy low-volume domains do not appear (verified: 0 blocked in the top page across 8 orgs).

### Exact recipe — blocked requests by CATEGORY and by DOMAIN for one org over a date range
**Confirmed-reliable method — `query_logs`:**
```
GET /v1/traffic_reports/query_logs
    ?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>     # date-only avoids the 9-day-from-now cap
    &organization_id=<orgId>
    &result=blocked                        # confirmed to filter to blocked only
    &page[size]=<N>&page[number]=<n>       # paginate: data.page.total = match count; iterate to cover it
```
Then aggregate the returned rows client-side:
- **by category:** count occurrences across each row's `categories_names[]`
- **by domain:** count occurrences of each row's `domain` (or `fqdn`)
- **exact blocked total:** `data.page.total`

Notes: if you must use full-ISO timestamps, chunk into ≤9-day windows anchored within the last 9 days; for historical months use **date-only** format (confirmed to work for 30 days). Paginate **all** pages — do not sample a single page.

### Which code assumptions are WRONG
| File | Assumption | Reality |
|---|---|---|
| `src/lib/dnsfilter.ts` (`getTrafficReport`/`buildSummary`) | Any date window is queryable; full-ISO `fmt()`; ~30-day monthly windows | Full-ISO `from` >9 days before now → **400**. Use **date-only** format (or ≤9-day recent windows). |
| `src/lib/dnsfilter.ts` (blocked breakdown) | Sample `page[size]=100` of one page and aggregate | Must **paginate all** rows to `data.page.total`; one page truncates counts |
| `src/lib/dnsfilter.ts` (field names) | `categories_names`, `domain`/`fqdn`, `data.page.total` | ✅ **All correct** — only the window format + pagination are broken |
| `src/lib/compliance/collectors/msp.ts:502` | "traffic_reports endpoints don't exist"; only reads orgs/networks/policies config | Endpoints **exist** and return data; the collector never pulls actual blocked-traffic figures |

---

## 2. Datto EDR (Infocyte "Pulse API") — ✅ FULLY VERIFIED

**Base URL:** `https://triple5695.infocyte.com/api` (code default — correct). LoopBack, `openapi: 3.0.0`, title "Pulse API".

### Auth scheme (working, named)
- `access_token` **query parameter**: `GET /api/Organizations?access_token=<token>` → **200** ✅ (this is what the code uses)
- No token → **401** `{"error":{"statusCode":401,"code":"AUTHORIZATION_REQUIRED"}}`
- Unknown model → **404** `{"error":{"...":"There is no method to handle GET /X"}}`

### Endpoints confirmed to exist (200) vs failed
| Method + path | Result |
|---|---|
| `GET /api/Organizations` | ✅ 200 (38 orgs; per-org fields incl. `alertCount`) |
| `GET /api/Alerts?filter=<LoopBack JSON>` | ✅ 200 (array of Alert) |
| `GET /api/NonexistentModelXyz` | ❌ 404 |

`/api/Alerts` also exposes `/api/Alerts/{id}`, `/findOne`, `/count`, and a separate `/api/AlertsArchive` model.

### Real `/api/Alerts` (list) schema — RUNTIME-confirmed row fields
```
id, name, type, sourceId, sourceVersionId, sourceType, description,
severity,                       <-- NATIVE severity field (values seen: "low","medium")
mitreId, mitreTactic, sourceName, ip, search, hostname, itemId, hostId,
hostScanId, scanId, batchId, fileRepId, signed, managed,
createdOn,                      <-- date field used for filtering
eventTime, data, signal, archived, extensionSuccess, avRatio, agentId, tenant,
createdDate, targetGroupId, targetGroupName, deviceId, vsaId, pulsewayId,
rmmSiteId, rmmAccountId,
organizationId, organizationName,   <-- org-scoping fields
suppressionRuleVersionId, responseData
```
**Absent from the list model (runtime + OpenAPI confirmed):** `threatName`, `threatScore`, `flagName`, `flagColor`, `compromised`, `malicious`, `suspicious`, `synapse`, `avPositives`, `md5`, `sha256`, `severityLevel`.

Those richer fields exist only on the **`AlertDetail`** model (`GET /api/Alerts/{id}`): `flagId, flagColor, flagName, flagWeight, threatName, avPositives, avTotal, avThreatName, synapse, malicious, suspicious, staticAnalysis, whitelist, md5, sha1, sha256, severityLevel, scanName, locationId, locationName, …`.

### Org-scoping filter (confirmed) & threat field names
- **Org scope filter field: `organizationId`** (LoopBack `where`) — ✅ both code paths use this correctly. Also returns `organizationName`.
- **Date filter field: `createdOn`** — ✅ both code paths correct.
- **Threat name / score / status: use the native `severity`** (list) or fetch `AlertDetail` for `threatName`/`threatScore`. The list has **no** `threatName`/`threatScore`.

### Exact recipe — alerts with org scope
```
GET /api/Alerts?access_token=<token>&filter=<url-encoded JSON>
filter = {"where":{"organizationId":"<id>","createdOn":{"gte":"<ISO>","lte":"<ISO>"}},
          "limit":<N>,"skip":<M>,"order":"createdOn DESC"}
```
Map from the **list** row: severity ← `severity`; title/description ← `name` (or `description`); type ← `type`; tactic ← `mitreTactic`; host ← `hostname`/`hostId`/`deviceId`. For threat-intel fields (`threatName`, scores, hashes, AV), fetch `GET /api/Alerts/{id}` per alert (`AlertDetail`).

### Which code assumptions are WRONG (both paths)
| File | Assumption | Reality |
|---|---|---|
| `src/lib/datto-edr.ts` (`getEvents` + `mapThreatNameToSeverity`) | Reads `e.threatName`, `e.threatScore`, `e.flagName`, `e.compromised`, `e.malicious` from the list | All **undefined** on the list model → severity always defaults to `medium`, status always `active`, category falls back to `type`. Use native `severity`. |
| `src/lib/datto-edr.ts` (org/date) | filter on `organizationId`, `createdOn` | ✅ correct |
| `src/lib/compliance/collectors/msp.ts` (~L450) | `eventsBySeverity` keyed on `a.threatName`; `eventsByType` on `a.flagName ?? a.type` | `threatName`/`flagName` **undefined** → severity aggregates entirely to `"unknown"`. Use `severity`; `type` works. |

**Which of the two paths matches reality?** Neither for the threat fields — both read `threatName`/`threatScore`/`flagName`, which the list endpoint does not return. Both are correct on `organizationId` scoping and `createdOn`. `datto-edr.ts` is structurally closer (paginates + maps), but its severity/status/category derivation is dead against the list model.

---

## 3. EasyDMARC — ⚠️ PARTIALLY VERIFIED

**What blocked full verification:** the token-exchange auth is now confirmed **working end-to-end** with the real `client_id`+`client_secret`, but every data call is rejected with **`403 access_denied / not_authorized`** — the token is valid and carries the correct DNS role, so this is an **IP allowlist (IP Safelisting)** rejection on EasyDMARC's side, not a credential or code problem (see *IP Safelisting blocker* below). A live 200 body therefore could not be observed from this environment; endpoint response schemas are taken from the **official OpenAPI spec** (`github.com/easydmarc/public-api-docs → specs/easydmarc-openapi.json`, title "EasyDMARC API", 83 paths), which is authoritative.

### Base URL — WRONG in code
- Code uses `https://api.easydmarc.com/v1` → every path returns **404** (`Cannot GET …`).
- **Real host: `https://api2.easydmarc.com`** (from the docs bundle config; confirmed live: `POST https://api2.easydmarc.com/auth/token` returns 422/401, not 404).

### Auth scheme — WRONG model in code
- Code sends a static `Authorization: Bearer ${EASYDMARC_API_KEY}`. Confirmed live: the single key as a Bearer token → **400 `invalid_grant`**.
- **Real: OAuth2 client-credentials token exchange.**
  ```
  POST https://api2.easydmarc.com/auth/token
  Content-Type: application/x-www-form-urlencoded
  body: client_id=<...>&client_secret=<...>     # both REQUIRED
  ```
  Confirmed live: empty body → **422** listing required `client_id` (string) and `client_secret` (string), each described as *"…obtained in API Client management in Account Console."*
  Response (Keycloak-format):
  ```
  { "access_token": <string>, "token_type": "Bearer", "expires_in": <number ~300s>,
    "refresh_expires_in": <number>, "not-before-policy": <number>, "scope": "public-api" }
  ```
  Then send `Authorization: Bearer <access_token>` (short-lived, ~5 min) on all endpoints. The spec defines **only** `bearer`/`oauth2` security schemes — **there is no static-API-key auth**.
- **Confirmed live end-to-end:** with the real `client_id` + `client_secret`, `POST /auth/token` → **HTTP 201** returning a Bearer `access_token` (`expires_in: 300`, `scope: public-api`). The value first supplied as `EASYDMARC_API_KEY` is the **`client_secret`**; the `client_id` (`api.<…>`) is a separate value the code does not model. (Using the single key as both id and secret → **401 `invalid_client`**, which is how the two-value requirement was first established.)
- **Decoded token claims prove the client is provisioned for DNS lookups:** `resource_access` includes `apisix-api-gateway: ["dns-api-user"]` and `easydmarc-api-gateway: ["deliverability-user"]`, plus an `organization_id`. So the subsequent `403`s are **not** a missing-role/permission problem.

### Real lookup endpoints (from spec; all require the bearer token) — WRONG in code
| Purpose | Code (wrong) | **Real** |
|---|---|---|
| DMARC | `GET /v1/lookup/dmarc?domain=` | **`GET /v1/dns-lookup/dmarc?domain=<d>`** (+ optional `recommendedRua`, `skipOurAddresses`) |
| SPF | `GET /v1/lookup/spf?domain=` | **`POST /v1/dns-lookup/spf`** — body `{ "domain": <d>, "maxAgeMs"?, … }` (note: **POST**, not GET) |
| DKIM | `GET /v1/lookup/dkim?domain=&selector=` | **`GET /v1/dns-lookup/dkim?domain=<d>&selectors=<s>`** (param is **`selectors`**, plural, **required**) |

Response shapes (from spec):
```
DMARC  { "domain": <string>, "raw": <string>,     // raw record string
         "object": <parsed>, "validation": <obj>, "timestamp": <number>, "queryStatus": <string> }
SPF    { "domain": <string>, "raw": <string>, "object": <parsed>, "validation": <obj>,
         "queryStatus": <string>, "timestamp": <number> }
DKIM   { "rootDomain": <string>, "dkimRecords": [<...>], "validation": <obj> }
```
The record string is in **`raw`** (with parsed data in `object` and status in `validation`) — **not** the top-level `record` field the code reads.

### IP Safelisting blocker — why no live 200 (evidence-based)
Every authenticated call — DNS lookups **and** listing the account's own `domains`/`organizations` — returns **`403 {"error":"access_denied","error_description":"not_authorized"}`**, despite a valid token that holds the `dns-api-user` role. Evidence points to an **IP allowlist**, not permissions:
- The token embeds a **`clientAddress`** claim (the caller IP), and EasyDMARC exposes an **IP Safelisting** control under *Organization Settings → Security & Authentication*.
- Calls from this environment egress from IPs that are almost certainly not on the allowlist (observed egress rotated across `152.70.57.80` and `160.79.106.x`).
- The role is present and correct, yet the gateway still denies — the signature of an IP/policy gate rather than a scope gate.

**Implication for production:** if IP Safelisting is enforced, the app calling from **Vercel** will hit the same `403` — serverless egress IPs are dynamic. The integration will need IP Safelisting disabled for the API, or a fixed-egress path (static-IP proxy). This is a deployment decision, independent of the code fixes below.

### Scope answer (account vs per-domain)
**Both.** The API is organization/account-scoped for management (create/get/update/delete domains, organizations, aggregate DMARC reports via `get-report-raw-data`/`get-aggregations`), **and** the `dns-lookup/*` endpoints accept an arbitrary `domain` argument, so ad-hoc per-domain lookups are supported (the code's per-domain assumption is right in spirit; everything else about how it calls them is wrong).

### Which code assumptions are WRONG (`src/lib/easydmarc.ts`)
- Host `api.easydmarc.com` → **`api2.easydmarc.com`**.
- Paths `/lookup/{dmarc,spf,dkim}` → **`/v1/dns-lookup/{dmarc,spf,dkim}`**.
- SPF is **POST** (code GETs it); DMARC/DKIM are GET.
- DKIM param `selector` (singular) → **`selectors`** (plural, required).
- Response `data.record` → **`raw`** (+ `object`/`validation`); DKIM → `dkimRecords[]`.
- Auth: static `Bearer ${EASYDMARC_API_KEY}` → **client-credentials exchange** at `POST /auth/token`, then short-lived bearer. Requires **two** secrets (`client_id` + `client_secret`), not one key.

### To finish EasyDMARC verification
The `client_id`/`client_secret` are in hand and authenticate correctly; the only remaining step is to make a call from an **IP the account authorizes**. Options:
1. Confirm/relax **Organization Settings → Security & Authentication → IP Safelisting** (or add the intended caller IP), then re-run a live `GET /v1/dns-lookup/dmarc` and confirm the 200 `raw`/`object`/`validation` body against the spec.
2. Run the one lookup from an already-authorized IP and compare the redacted shape to the spec.

This environment's egress IP is ephemeral/rotating, so it cannot be safelisted reliably from here.

---

## Appendix — how this was verified
- Real authenticated GET/POST calls to each production API in this session; responses inspected as **structure only** (keys + types), values redacted.
- DNSFilter: one real org (redacted) that has traffic; confirmed auth scheme, the 9-day-from-now cap, `query_logs`/`top_categories`/`top_domains` schemas, and the blocked-by-category/domain recipe against live responses.
- Datto EDR: one real org (redacted, chosen by highest `alertCount`); confirmed list-model fields at runtime and the public `openapi.json`.
- EasyDMARC: host, full token-exchange auth (201 + Bearer token), endpoint paths (routed, not 404), and the client's `dns-api-user` role all confirmed **live**; endpoints/params/response schemas from the vendor's official OpenAPI spec. A live 200 lookup body could not be observed — calls are rejected `403 not_authorized` by an IP allowlist (IP Safelisting) that this ephemeral-egress environment isn't on. No secrets or tenant identifiers (org id, user id, token, client secret) are included; the decoded-token facts cited are role/claim names only.
- No secrets or customer PII are included in this document.
