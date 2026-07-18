# Datto RMM — MCP Connector Reporting Tools (read-only)

*Added 2026-07-18 · branch `claude/datto-rmm-reporting-tools-ngxkzy` · module `src/lib/mcp-datto-rmm-tools.ts`*

Read-only Datto RMM reporting tools on the TCT MCP connector
(`/api/connector/entra/mcp`). Reuses the existing `DattoRmmClient`
(`src/lib/datto-rmm.ts`) — the same OAuth connection the SOC, TBR export,
executive summary, and the every-30-min `datto-device-sync` cron use.
**GET-only by construction**: the only network path the tools have is
`DattoRmmClient.getV2()`, which cannot set an HTTP method or body and rejects
any path outside `/api/v2/`.

## Connection (pre-existing, unchanged)

- **Client**: `src/lib/datto-rmm.ts` → `DattoRmmClient` (single client — do not fork).
- **Auth**: OAuth2 *password* grant at `{DATTO_RMM_API_URL}/auth/oauth/token`, Basic header `public-client:public`, `username` = API key, `password` = API secret. Access tokens live 100 h; the client caches in-instance with a 60 s expiry buffer and auto-refreshes once on 401.
- **Region base URL**: `DATTO_RMM_API_URL` env var (TCT platform host, one of `concord|pinotage|merlot|vidal|zinfandel|syrah`-api.centrastage.net).
- **Secrets**: `DATTO_RMM_API_KEY` / `DATTO_RMM_API_SECRET` (Vercel env only).
- **Rate limits** (Datto docs): 600 read requests/60 s sliding window (writes 100/60 s — unused here); 90% quota adds a 1 s delay, breach = HTTP 429, persistent breach = temporary IP block (wait 5 min). Tools wrap every GET in `withRetry` (resilience.ts — 429/5xx/timeouts retry with backoff, 400/404 surface immediately) and current usage is visible via `datto_rmm_account` → `requestRate`.
- **Pagination**: `page`/`max` params (max 250/page); responses carry `pageDetails { count, totalCount, prevPageUrl, nextPageUrl }`. Tools sweep with page caps and report `pagination.truncated` + `nextPage` — never silent truncation. `activity-logs` alone paginates by cursor (`searchAfter` + `page=next|previous`); tools surface `nextSearchAfter`.

## API v2 read surface (verified against the live OpenAPI spec, 2026-07-18)

Source of truth: `GET {API URL}/api/v3/api-docs/Datto-RMM` (OpenAPI 3.1, "Datto RMM API" v2.0.0)
behind the Swagger UI at `{API URL}/api/swagger-ui/index.html`. 53 paths total: **39 GET**, 18 write (PUT/POST/DELETE).
All 39 GETs, grouped, with the tool that serves them:

| Resource | GET endpoints | Connector tool |
|---|---|---|
| Account | `/v2/account` | `datto_rmm_account` |
| System | `/v2/system/status`, `/v2/system/request_rate`, `/v2/system/pagination` | `datto_rmm_account` |
| Sites | `/v2/account/sites` (filter `siteName`), `/v2/site/{siteUid}`, `/v2/site/{siteUid}/settings`, `/v2/account/dnet-site-mappings` | `datto_rmm_list_sites`, `datto_rmm_get_site` |
| Devices | `/v2/site/{siteUid}/devices` (filter `filterId`), `/v2/account/devices` (LIKE filters `hostname`/`deviceType`/`operatingSystem`/`siteName`, `filterId`), `/v2/device/{deviceUid}`, `/v2/device/id/{deviceId}`, `/v2/device/macAddress/{macAddress}`, `/v2/site/{siteUid}/devices/network-interface` | `datto_rmm_site_devices`, `datto_rmm_search_devices`, `datto_rmm_get_device`, `datto_rmm_site_network_interfaces` |
| Audit | `/v2/audit/device/{deviceUid}` (hardware/system), `/v2/audit/device/macAddress/{macAddress}`, `/v2/audit/esxihost/{deviceUid}` (guests/datastores), `/v2/audit/printer/{deviceUid}` (marker supplies), `/v2/audit/device/{deviceUid}/software` | `datto_rmm_device_audit` (class-aware), `datto_rmm_device_software` |
| Alerts | `/v2/account/alerts/open`, `/v2/account/alerts/resolved`, `/v2/site/{siteUid}/alerts/{open\|resolved}`, `/v2/device/{deviceUid}/alerts/{open\|resolved}` (all take `muted`), `/v2/alert/{alertUid}` | `datto_rmm_alerts` (scope×status matrix), `datto_rmm_get_alert` |
| Activity logs | `/v2/activity-logs` (`from`/`until` UTC, `entities`, `categories`, `actions`, `siteIds` (numeric), `userIds`, `searchQuery`, `size`, `order`, cursor) | `datto_rmm_activity_logs` |
| Jobs | `/v2/job/{jobUid}`, `/v2/job/{jobUid}/components`, `/v2/job/{jobUid}/results/{deviceUid}`, `…/stdout`, `…/stderr` | `datto_rmm_job_status` (note: the API has **no** account-wide job list — find job UIDs via activity logs) |
| Components | `/v2/account/components` | `datto_rmm_list_components` (catalog only) |
| Filters | `/v2/filter/default-filters`, `/v2/filter/custom-filters`, `/v2/site/{siteUid}/filters` | `datto_rmm_list_filters` |
| Users | `/v2/account/users` | `datto_rmm_list_users` |
| Variables | `/v2/account/variables`, `/v2/site/{siteUid}/variables` | `datto_rmm_variables` (masked values forced to `[MASKED]`) |

Key response facts (from the spec, not guessed):

- **`portalUrl` is returned by the API** on Site, Device, DeviceAudit, ESXiHostAudit, PrinterAudit, and DnetSiteMappings; Device/DeviceAudit also carry `webRemoteUrl`. The tools pass these through as `consoleUrl`/`webRemoteUrl` — console links are never constructed from a guessed URL pattern (none is documented; verified against the API help page, the Single Alert View help page, and the Integrations Whitepaper).
- **Alerts do NOT carry a URL**; they reference site/device via `alertSourceInfo { deviceUid, deviceName, siteUid, siteName }`. Tools resolve `site.consoleUrl` from a 5-min-cached account-sites sweep and `device.consoleUrl` from per-site device sweeps (account-wide sweeps cap link resolution at 8 sites per call and say so in `linkNotes`).
- **Alert typing**: there is no `alertType` field; the monitor type is `alertContext['@class']` (e.g. `perf_disk_usage_ctx`). The Alert schema fields are `alertUid, priority, diagnostics, resolved, resolvedBy, resolvedOn, muted, ticketNumber, timestamp, alertMonitorInfo{sendsEmails,createsTicket}, alertContext, alertSourceInfo, responseActions[], autoresolveMins`.
- **Site schema** includes `autotaskCompanyId`/`autotaskCompanyName` (the RMM↔PSA mapping) and `proxySettings` **including a `password` field — tools redact it** (`[REDACTED]`); site variables can be `masked` — tools force `[MASKED]`.
- **Activity log** rows reference sites by **numeric id** (`site.id`) and devices by **numeric `deviceId`** — not UIDs. `datto_rmm_get_device` accepts `deviceId` for exactly this.
- `/v2/device/{uid}/patch` (used by the old `getDevicePatch()` diagnostic) is **not in the current spec** — patch data lives on the Device object under `patchManagement`.

## Tool catalog (17 tools, all read-only)

`datto_rmm_account` · `datto_rmm_list_sites` · `datto_rmm_get_site` · `datto_rmm_site_devices` · `datto_rmm_search_devices` · `datto_rmm_get_device` · `datto_rmm_device_audit` · `datto_rmm_device_software` · `datto_rmm_site_network_interfaces` · `datto_rmm_alerts` · `datto_rmm_get_alert` · `datto_rmm_activity_logs` · `datto_rmm_job_status` · `datto_rmm_list_components` · `datto_rmm_list_filters` · `datto_rmm_list_users` · `datto_rmm_variables`

Conventions: site-scoped tools take the site **UID** (UUID), never the numeric id (`docs/gotchas.md` → Datto RMM); exhaustive per-customer inventory goes through `datto_rmm_site_devices` (the account-wide list has returned a subset before — use it for filtered search); every site/device-referencing response carries the console deep link.

## Write/action surface — deliberately NOT implemented (deferred)

The API exposes these; none are built, none are scaffolded. If ever wanted, they must go
through the same human-approval staged-write gate as Autotask/UniFi config writes:

- `PUT /v2/device/{uid}/quickjob` — run a component on a device (remote execution)
- `PUT /v2/device/{uid}/site/{siteUid}` — move device between sites
- `POST /v2/device/{uid}/udf` — write user-defined fields
- `POST /v2/device/{uid}/warranty` — set warranty
- `POST /v2/alert/{uid}/resolve` — resolve an alert (mute/unmute are dead as of RMM 8.9.0)
- `PUT /v2/site` / `POST /v2/site/{uid}` — create/update site
- `POST/DELETE /v2/site/{uid}/settings/proxy` — site proxy settings
- `PUT/POST/DELETE` account + site **variables**
- `POST /v2/user/resetApiKeys` — rotate the API keys of the calling user

## Verification & operating notes

- Unit tests: `src/lib/mcp-datto-rmm-tools.test.ts` — mechanically asserts the whole tool
  surface touches only `getV2` (a proxy-mocked client turns any other method into a failure),
  that every requested path is `/api/v2/…`, that site/device/alert/activity responses carry
  console links, and that proxy passwords + masked variables are redacted.
- The OAuth path is exercised in production every 30 min by `/api/cron/datto-device-sync`
  (same client, same token code). Live one-call check of the connection:
  `GET https://www.triplecitiestech.com/api/reports/rmm-test` with `Authorization: Bearer <MIGRATION_SECRET>`.
- **Connector tool lists cache at connect time** — after deploy, disconnect/reconnect the
  TCT connector in Claude for the `datto_rmm_*` tools to appear (same lesson as the HR tools).
