// src/lib/mcp-datto-rmm-tools.ts
//
// Read-only Datto RMM reporting tools for the MCP connector. Reuses the
// single DattoRmmClient (src/lib/datto-rmm.ts — same OAuth password-grant
// token cache, 401 refresh, and timeouts the SOC/reporting/cron paths use
// daily); no parallel client.
//
// READ-ONLY BY CONSTRUCTION: every network call in this module goes through
// DattoRmmClient.getV2(), which issues GETs only and rejects any path
// outside /api/v2/. No tool here can create, modify, delete, move, or
// trigger anything — no quick jobs, no agent commands, no UDF/site/variable
// writes, no alert resolve/mute. The API's write surface (PUT/POST/DELETE:
// quickjob, device move, UDF set, warranty set, site create/update, proxy
// settings, variables CRUD, alert resolve) is deliberately not implemented
// or scaffolded.
//
// Console deep links: the Datto RMM API itself returns the web-console URL
// for sites, devices, and audits (portalUrl / webRemoteUrl fields — verified
// against the live OpenAPI spec /api/v3/api-docs/Datto-RMM). Tools pass
// those through as consoleUrl/webRemoteUrl. Alert and activity-log rows do
// NOT carry a URL in the API, so tools resolve the referenced site/device
// links from the API's own sites/devices responses (short-lived caches
// below) rather than constructing URLs from a guessed pattern.
//
// Rate limits (per Datto docs): 600 read requests / 60s sliding window,
// HTTP 429 on breach. Every GET is wrapped in withRetry (resilience.ts),
// which classifies 429/5xx/timeouts as transient and backs off; 400/404
// surface immediately. Paged sweeps are page-capped with an explicit
// `truncated` flag — no silent truncation.
//
// Field notes (docs/gotchas.md → Datto RMM): site-scoped endpoints need the
// site UID (UUID), never the numeric id; the account-wide devices endpoint
// has returned a subset of the fleet before, so exhaustive inventory goes
// per-site.

import { z } from 'zod'
import { DattoRmmClient } from '@/lib/datto-rmm'
import { withRetry } from '@/lib/resilience'

function ok(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data ?? null, null, 2) }] } }
function fail(err: unknown) { const m = err instanceof Error ? err.message : String(err); return { content: [{ type: 'text' as const, text: `Error: ${m}` }], isError: true } }

// Module-level singleton so the OAuth token cache survives across tool calls
// in a warm lambda (same pattern as the Autotask client in the route).
let _client: DattoRmmClient | null = null
function datto(): DattoRmmClient {
  if (!_client) _client = new DattoRmmClient()
  return _client
}

function ensureConfigured(c: DattoRmmClient) {
  if (!c.isConfigured()) {
    throw new Error('Datto RMM is not configured: set DATTO_RMM_API_URL, DATTO_RMM_API_KEY and DATTO_RMM_API_SECRET in the environment.')
  }
}

/** All reads go through here: GET-only client passthrough + transient retry. */
function get(path: string): Promise<unknown> {
  const c = datto()
  ensureConfigured(c)
  return withRetry(() => c.getV2(path), { maxRetries: 2, baseDelayMs: 1500 })
}

// ---------------------------------------------------------------------------
// Raw API shapes (subset we consume — Datto RMM API v2 OpenAPI spec)
// ---------------------------------------------------------------------------

interface DrmPageDetails { count?: number; totalCount?: number; prevPageUrl?: string | null; nextPageUrl?: string | null }

interface DrmProxySettings { host?: string; port?: number; type?: string; username?: string; password?: string }

interface DrmSite {
  id?: number
  uid?: string
  name?: string
  description?: string
  notes?: string
  onDemand?: boolean
  proxySettings?: DrmProxySettings | null
  devicesStatus?: { numberOfDevices?: number; numberOfOnlineDevices?: number; numberOfOfflineDevices?: number }
  autotaskCompanyName?: string | null
  autotaskCompanyId?: string | null
  portalUrl?: string | null
}

interface DrmDevice {
  id?: number
  uid?: string
  siteId?: number
  siteUid?: string
  siteName?: string
  deviceType?: { category?: string; type?: string } | null
  hostname?: string
  intIpAddress?: string
  extIpAddress?: string
  operatingSystem?: string
  lastLoggedInUser?: string
  domain?: string
  description?: string
  cagVersion?: string
  displayVersion?: string
  a64Bit?: boolean
  rebootRequired?: boolean
  online?: boolean
  suspended?: boolean
  deleted?: boolean
  lastSeen?: string | number
  lastReboot?: string | number
  lastAuditDate?: string | number
  creationDate?: string | number
  udf?: Record<string, string | null> | null
  snmpEnabled?: boolean
  deviceClass?: string
  portalUrl?: string | null
  warrantyDate?: string
  antivirus?: { antivirusProduct?: string; antivirusStatus?: string } | null
  patchManagement?: { patchStatus?: string; patchesApprovedPending?: number; patchesNotApproved?: number; patchesInstalled?: number } | null
  softwareStatus?: string
  webRemoteUrl?: string | null
}

interface DrmAlert {
  alertUid?: string
  priority?: string
  diagnostics?: unknown
  resolved?: boolean
  resolvedBy?: string
  resolvedOn?: string
  muted?: boolean
  ticketNumber?: string
  timestamp?: string
  alertMonitorInfo?: { sendsEmails?: boolean; createsTicket?: boolean } | null
  alertContext?: (Record<string, unknown> & { '@class'?: string }) | null
  alertSourceInfo?: { deviceUid?: string; deviceName?: string; siteUid?: string; siteName?: string } | null
  responseActions?: Array<{ actionTime?: string; actionType?: string; description?: string }> | null
  autoresolveMins?: number
}

interface DrmActivityLog {
  id?: string
  entity?: string
  category?: string
  action?: string
  date?: number
  site?: { id?: number; name?: string } | null
  deviceId?: number
  hostname?: string
  user?: { id?: number; userName?: string; firstName?: string; lastName?: string } | null
  details?: string
  hasStdOut?: boolean
  hasStdErr?: boolean
}

interface DrmVariable { id?: number; name?: string; value?: string; masked?: boolean }

// ---------------------------------------------------------------------------
// Small pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** Build a query string, skipping undefined/null; arrays join as CSV (per API docs). */
export function drmQuery(params: Record<string, string | number | boolean | Array<string | number> | undefined | null>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue
    const val = Array.isArray(v) ? v.join(',') : String(v)
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(val)}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

/** Accept 'YYYY-MM-DD' or ISO datetime; emit the API's yyyy-MM-ddTHH:mm:ssZ format. */
export function toDrmUtc(input: string, endOfDay = false): string {
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(input)
  const iso = bare ? `${input}T${endOfDay ? '23:59:59' : '00:00:00'}Z` : input
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${input} (use YYYY-MM-DD or an ISO-8601 UTC datetime)`)
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Normalize a MAC to the API's XXXXXXXXXXXX format (strip separators, uppercase). */
export function normalizeMac(mac: string): string {
  const hex = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (hex.length !== 12) throw new Error(`Invalid MAC address: ${mac} (expected 12 hex digits, e.g. 001A2B3C4D5E)`)
  return hex
}

/** Redact the proxy password on a site/settings object (never expose credentials). */
export function redactProxy<T extends { proxySettings?: DrmProxySettings | null }>(obj: T): T {
  if (obj && obj.proxySettings && typeof obj.proxySettings === 'object' && 'password' in obj.proxySettings && obj.proxySettings.password) {
    return { ...obj, proxySettings: { ...obj.proxySettings, password: '[REDACTED]' } }
  }
  return obj
}

/** Enforce masking on variables regardless of what the API returned. */
export function redactVariables(vars: DrmVariable[]): DrmVariable[] {
  return vars.map(v => (v?.masked ? { ...v, value: '[MASKED]' } : v))
}

/** Strip empty/null UDF slots so 300-field UDF objects stay readable. */
export function compactUdf(udf: Record<string, string | null> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!udf) return out
  for (const [k, v] of Object.entries(udf)) {
    if (typeof v === 'string' && v.trim() !== '') out[k] = v
  }
  return out
}

function tsOf(value: string | number | undefined): string | null {
  if (value === undefined || value === null || value === '') return null
  const d = typeof value === 'number' ? new Date(value) : new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString()
}

function slimSite(s: DrmSite) {
  return {
    id: s.id ?? null,
    uid: s.uid ?? null,
    name: s.name ?? '',
    description: s.description ?? '',
    onDemand: s.onDemand ?? false,
    devices: s.devicesStatus?.numberOfDevices ?? null,
    devicesOnline: s.devicesStatus?.numberOfOnlineDevices ?? null,
    devicesOffline: s.devicesStatus?.numberOfOfflineDevices ?? null,
    autotaskCompanyId: s.autotaskCompanyId ?? null,
    autotaskCompanyName: s.autotaskCompanyName ?? null,
    consoleUrl: s.portalUrl ?? null,
  }
}

function slimDevice(d: DrmDevice, opts?: { includeUdf?: boolean }) {
  return {
    id: d.id ?? null,
    uid: d.uid ?? null,
    hostname: d.hostname ?? '',
    description: d.description ?? '',
    siteUid: d.siteUid ?? null,
    siteName: d.siteName ?? null,
    deviceType: d.deviceType?.category ?? null,
    deviceClass: d.deviceClass ?? null,
    operatingSystem: d.operatingSystem ?? null,
    intIpAddress: d.intIpAddress ?? null,
    extIpAddress: d.extIpAddress ?? null,
    domain: d.domain ?? null,
    lastLoggedInUser: d.lastLoggedInUser ?? null,
    online: d.online ?? false,
    suspended: d.suspended ?? false,
    rebootRequired: d.rebootRequired ?? false,
    lastSeen: tsOf(d.lastSeen),
    lastReboot: tsOf(d.lastReboot),
    lastAuditDate: tsOf(d.lastAuditDate),
    agentVersion: d.cagVersion ?? null,
    patchStatus: d.patchManagement?.patchStatus ?? null,
    patchesInstalled: d.patchManagement?.patchesInstalled ?? null,
    patchesApprovedPending: d.patchManagement?.patchesApprovedPending ?? null,
    patchesNotApproved: d.patchManagement?.patchesNotApproved ?? null,
    antivirusProduct: d.antivirus?.antivirusProduct ?? null,
    antivirusStatus: d.antivirus?.antivirusStatus ?? null,
    softwareStatus: d.softwareStatus ?? null,
    warrantyDate: d.warrantyDate ?? null,
    ...(opts?.includeUdf ? { udf: compactUdf(d.udf) } : {}),
    consoleUrl: d.portalUrl ?? null,
    webRemoteUrl: d.webRemoteUrl ?? null,
  }
}

/**
 * Compact alert row with console links resolved from the API's own data.
 * Exported for unit tests.
 */
export function buildAlertRow(
  a: DrmAlert,
  links: { siteUrlByUid: Map<string, string>; deviceUrlByUid: Map<string, string> },
  opts?: { includeDiagnostics?: boolean },
) {
  const src = a.alertSourceInfo ?? {}
  const siteUid = src.siteUid ?? null
  const deviceUid = src.deviceUid ?? null
  return {
    alertUid: a.alertUid ?? null,
    priority: a.priority ?? null,
    type: a.alertContext?.['@class'] ?? 'unknown',
    timestamp: a.timestamp ?? null,
    resolved: a.resolved ?? false,
    ...(a.resolved ? { resolvedOn: a.resolvedOn ?? null, resolvedBy: a.resolvedBy ?? null } : {}),
    muted: a.muted ?? false,
    ticketNumber: a.ticketNumber ?? null,
    monitor: { createsTicket: a.alertMonitorInfo?.createsTicket ?? null, sendsEmails: a.alertMonitorInfo?.sendsEmails ?? null },
    alertContext: a.alertContext ?? null,
    responseActions: a.responseActions ?? [],
    ...(opts?.includeDiagnostics ? { diagnostics: a.diagnostics ?? null } : {}),
    device: {
      uid: deviceUid,
      name: src.deviceName ?? null,
      consoleUrl: (deviceUid && links.deviceUrlByUid.get(deviceUid)) || null,
    },
    site: {
      uid: siteUid,
      name: src.siteName ?? null,
      consoleUrl: (siteUid && links.siteUrlByUid.get(siteUid)) || null,
    },
  }
}

// ---------------------------------------------------------------------------
// Paged GET sweep (page/max + pageDetails.nextPageUrl presence, like the
// existing client methods) with an explicit truncation flag.
// The Datto RMM `page` parameter is 0-INDEXED — confirmed live 2026-07-18:
// page=1 came back empty while pageDetails.totalCount reported 213 sites.
// Sweeps MUST start at page 0 or they silently skip the first 250 rows.
// ---------------------------------------------------------------------------

interface PagedResult<T> { items: T[]; pagesFetched: number; totalCount: number | null; truncated: boolean; nextPage: number | null }

async function pagedGet<T>(
  basePath: string,
  itemsKey: string,
  params: Record<string, string | number | boolean | undefined>,
  { startPage = 0, max = 250, maxPages = 4 }: { startPage?: number; max?: number; maxPages?: number } = {},
): Promise<PagedResult<T>> {
  const items: T[] = []
  let page = startPage
  let pagesFetched = 0
  let totalCount: number | null = null
  let truncated = false
  let nextPage: number | null = null

  while (pagesFetched < maxPages) {
    const qs = drmQuery({ ...params, page, max })
    const data = (await get(`${basePath}${qs}`)) as Record<string, unknown> & { pageDetails?: DrmPageDetails }
    pagesFetched++
    const rows = (data?.[itemsKey] as T[] | undefined) ?? []
    items.push(...rows)
    if (typeof data?.pageDetails?.totalCount === 'number') totalCount = data.pageDetails.totalCount
    if (!data?.pageDetails?.nextPageUrl) { nextPage = null; break }
    page++
    if (pagesFetched >= maxPages) { truncated = true; nextPage = page }
  }
  return { items, pagesFetched, totalCount, truncated, nextPage }
}

function pageMeta<T>(r: PagedResult<T>) {
  return { pagesFetched: r.pagesFetched, returned: r.items.length, totalCount: r.totalCount, truncated: r.truncated, ...(r.truncated && r.nextPage ? { nextPage: r.nextPage, note: `More pages exist — call again with page=${r.nextPage} to continue.` } : {}) }
}

// ---------------------------------------------------------------------------
// Console-link caches (warm-lambda only; resolved from the API's own
// portalUrl fields, never constructed from a guessed URL pattern)
// ---------------------------------------------------------------------------

const LINK_CACHE_TTL_MS = 5 * 60_000

let siteLinkCache: { at: number; byUid: Map<string, string>; byNumericId: Map<number, string>; nameByUid: Map<string, string> } | null = null
const deviceLinkCacheBySite = new Map<string, { at: number; byUid: Map<string, string> }>()

async function siteLinks(): Promise<NonNullable<typeof siteLinkCache>> {
  if (siteLinkCache && Date.now() - siteLinkCache.at < LINK_CACHE_TTL_MS) return siteLinkCache
  const swept = await pagedGet<DrmSite>('/api/v2/account/sites', 'sites', {}, { maxPages: 4 })
  const byUid = new Map<string, string>()
  const byNumericId = new Map<number, string>()
  const nameByUid = new Map<string, string>()
  for (const s of swept.items) {
    if (s.uid && s.portalUrl) byUid.set(s.uid, s.portalUrl)
    if (typeof s.id === 'number' && s.portalUrl) byNumericId.set(s.id, s.portalUrl)
    if (s.uid && s.name) nameByUid.set(s.uid, s.name)
  }
  siteLinkCache = { at: Date.now(), byUid, byNumericId, nameByUid }
  return siteLinkCache
}

async function siteDeviceLinks(siteUid: string): Promise<Map<string, string>> {
  const cached = deviceLinkCacheBySite.get(siteUid)
  if (cached && Date.now() - cached.at < LINK_CACHE_TTL_MS) return cached.byUid
  const swept = await pagedGet<DrmDevice>(`/api/v2/site/${encodeURIComponent(siteUid)}/devices`, 'devices', {}, { maxPages: 2 })
  const byUid = new Map<string, string>()
  for (const d of swept.items) { if (d.uid && d.portalUrl) byUid.set(d.uid, d.portalUrl) }
  deviceLinkCacheBySite.set(siteUid, { at: Date.now(), byUid })
  return byUid
}

/** Max distinct sites whose device maps we resolve per alerts call (rate-limit courtesy). */
const MAX_LINK_SITES_PER_CALL = 8

async function alertLinkMaps(alerts: DrmAlert[]): Promise<{ siteUrlByUid: Map<string, string>; deviceUrlByUid: Map<string, string>; linkNotes: string[] }> {
  const linkNotes: string[] = []
  const sites = await siteLinks()
  const distinctSiteUids = Array.from(new Set(alerts.map(a => a.alertSourceInfo?.siteUid).filter((v): v is string => !!v)))
  const toResolve = distinctSiteUids.slice(0, MAX_LINK_SITES_PER_CALL)
  const deviceUrlByUid = new Map<string, string>()
  const resolved = await Promise.all(toResolve.map(async uid => {
    try { return await siteDeviceLinks(uid) } catch { linkNotes.push(`Could not resolve device console links for site ${uid}.`); return new Map<string, string>() }
  }))
  for (const m of resolved) for (const [k, v] of m) deviceUrlByUid.set(k, v)
  if (distinctSiteUids.length > toResolve.length) {
    linkNotes.push(`Device console links resolved for ${toResolve.length} of ${distinctSiteUids.length} sites in this page (per-call cap). Rows still carry site console links; use datto_rmm_get_device for a specific device's link.`)
  }
  return { siteUrlByUid: sites.byUid, deviceUrlByUid, linkNotes }
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerDattoRmmTools(server: any) {
  // ── Account / platform health ────────────────────────────────────────────
  server.registerTool('datto_rmm_account', { title: 'Datto RMM: account overview', description: 'Read-only. The authenticated Datto RMM account: name/uid, device-count rollup (total/online/offline/on-demand/managed), platform system status + version, current API rate-limit usage (600 reads/60s sliding window), and the API pagination config. Use as the entry point / connectivity check for all Datto RMM reporting.', inputSchema: {} },
    async () => { try {
      const [account, status, rate, pagination] = await Promise.allSettled([
        get('/api/v2/account'), get('/api/v2/system/status'), get('/api/v2/system/request_rate'), get('/api/v2/system/pagination'),
      ])
      const val = (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled' ? r.value : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
      return ok({ account: val(account), systemStatus: val(status), requestRate: val(rate), paginationConfig: val(pagination) })
    } catch (e) { return fail(e) } })

  // ── Sites ────────────────────────────────────────────────────────────────
  server.registerTool('datto_rmm_list_sites', { title: 'Datto RMM: list sites', description: 'Read-only. List Datto RMM sites (customers/locations) with device counts (total/online/offline), the mapped Autotask company id/name when set, and each site\'s web-console deep link (consoleUrl). IMPORTANT: sites have BOTH a numeric id and a UUID uid — every site-scoped tool takes the UID. Optional siteName filters server-side (partial match). Set includeDnetMappings=true to also return Datto Networking network ids per site. Results are paginated; response reports truncation.', inputSchema: { siteName: z.string().optional().describe('Partial site name filter (server-side LIKE match)'), includeDnetMappings: z.boolean().optional().describe('Also fetch Datto Networking network-id mappings per site (default false)'), page: z.number().int().min(0).optional().describe('Start page, 0-BASED — the API\'s page index (default 0, the first page)'), maxPages: z.number().int().min(1).max(8).optional().describe('Pages to sweep, 250 rows/page (default 4)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ siteName, includeDnetMappings, page, maxPages }: any) => { try {
      const swept = await pagedGet<DrmSite>('/api/v2/account/sites', 'sites', { siteName }, { startPage: page ?? 0, maxPages: maxPages ?? 4 })
      const sites = swept.items.map(slimSite)
      let dnet: unknown
      if (includeDnetMappings) {
        const mappings = await pagedGet<{ uid?: string; dattoNetworkingNetworkIds?: number[] }>('/api/v2/account/dnet-site-mappings', 'dnetSiteMappings', {}, { maxPages: 4 })
        const byUid = new Map(mappings.items.map(m => [m.uid, m.dattoNetworkingNetworkIds] as const))
        dnet = { note: 'dattoNetworkingNetworkIds merged per site where present.' }
        for (const s of sites as Array<Record<string, unknown>>) {
          const ids = s.uid ? byUid.get(s.uid as string) : undefined
          if (ids && ids.length) s.dattoNetworkingNetworkIds = ids
        }
      }
      return ok({ sites, pagination: pageMeta(swept), ...(dnet ? { dnetMappings: dnet } : {}), note: 'Use the uid (UUID) — not the numeric id — for all site-scoped tools.' })
    } catch (e) { return fail(e) } })

  server.registerTool('datto_rmm_get_site', { title: 'Datto RMM: get site', description: 'Read-only. One Datto RMM site by UID (the UUID from datto_rmm_list_sites, NOT the numeric id): full site record incl. device-status rollup, Autotask mapping, notes, and the site\'s web-console deep link (consoleUrl). includeSettings=true (default) also returns the site\'s settings (general settings + alert email recipients; any proxy password is redacted).', inputSchema: { siteUid: z.string().describe('Site UID (UUID from datto_rmm_list_sites)'), includeSettings: z.boolean().optional().describe('Include site settings + mail recipients (default true)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ siteUid, includeSettings }: any) => { try {
      const raw = redactProxy((await get(`/api/v2/site/${encodeURIComponent(siteUid)}`)) as DrmSite)
      const out: Record<string, unknown> = { site: { ...raw, consoleUrl: raw.portalUrl ?? null } }
      if (includeSettings !== false) {
        try { out.settings = redactProxy((await get(`/api/v2/site/${encodeURIComponent(siteUid)}/settings`)) as { proxySettings?: DrmProxySettings | null }) }
        catch (e) { out.settings = { error: e instanceof Error ? e.message : String(e) } }
      }
      return ok(out)
    } catch (e) { return fail(e) } })

  // ── Devices ──────────────────────────────────────────────────────────────
  server.registerTool('datto_rmm_site_devices', { title: 'Datto RMM: site devices', description: 'Read-only. Devices of ONE site by site UID — the reliable way to enumerate a customer\'s fleet (the account-wide device list has returned a subset of the fleet before; per-site is authoritative). Each row: hostname, type/class, OS, int/ext IP, domain, last user, online/suspended, last seen/reboot/audit, agent version, patch summary (status + installed/pending/not-approved), antivirus product+status, warranty, plus web-console deep link (consoleUrl) and Web Remote link (webRemoteUrl). Optional filterId applies a device filter from datto_rmm_list_filters. includeUdf=true adds each device\'s non-empty user-defined fields.', inputSchema: { siteUid: z.string().describe('Site UID (UUID from datto_rmm_list_sites)'), filterId: z.number().int().optional().describe('Device filter id from datto_rmm_list_filters (exclusively determines results)'), includeUdf: z.boolean().optional().describe('Include non-empty user-defined fields per device (default false)'), page: z.number().int().min(0).optional().describe('Start page, 0-BASED — the API\'s page index (default 0, the first page)'), maxPages: z.number().int().min(1).max(8).optional().describe('Pages to sweep, 250 rows/page (default 2)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ siteUid, filterId, includeUdf, page, maxPages }: any) => { try {
      const [site, swept] = await Promise.all([
        get(`/api/v2/site/${encodeURIComponent(siteUid)}`).catch(() => null),
        pagedGet<DrmDevice>(`/api/v2/site/${encodeURIComponent(siteUid)}/devices`, 'devices', { filterId }, { startPage: page ?? 0, maxPages: maxPages ?? 2 }),
      ])
      const s = site as DrmSite | null
      return ok({ site: s ? { uid: s.uid, name: s.name, consoleUrl: s.portalUrl ?? null } : { uid: siteUid }, devices: swept.items.map(d => slimDevice(d, { includeUdf })), pagination: pageMeta(swept) })
    } catch (e) { return fail(e) } })

  server.registerTool('datto_rmm_search_devices', { title: 'Datto RMM: search devices (account-wide)', description: 'Read-only. Search devices ACROSS ALL sites with server-side partial (LIKE) filters: hostname, deviceType (e.g. Server, Laptop, Desktop, Printer, Esxihost), operatingSystem, siteName — or a saved device filter via filterId (from datto_rmm_list_filters; overrides the other filters). Rows include site name/uid, patch + AV summary, and web-console deep links (consoleUrl, webRemoteUrl) per device. CAUTION: unfiltered account-wide listing has returned a subset of the fleet before — for an exhaustive inventory of one customer use datto_rmm_site_devices; use this for targeted lookups ("find host X", "all Hyper-V servers", "every Windows 11 device").', inputSchema: { hostname: z.string().optional().describe('Partial hostname'), deviceType: z.string().optional().describe('Partial device type (Server/Laptop/Desktop/…)'), operatingSystem: z.string().optional().describe('Partial OS name (e.g. "Windows 11")'), siteName: z.string().optional().describe('Partial site name'), filterId: z.number().int().optional().describe('Saved device filter id (exclusively determines results)'), includeUdf: z.boolean().optional().describe('Include non-empty UDFs per device (default false)'), page: z.number().int().min(0).optional().describe('Start page, 0-BASED — the API\'s page index (default 0, the first page)'), maxPages: z.number().int().min(1).max(8).optional().describe('Pages to sweep, 250 rows/page (default 2)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ hostname, deviceType, operatingSystem, siteName, filterId, includeUdf, page, maxPages }: any) => { try {
      const swept = await pagedGet<DrmDevice>('/api/v2/account/devices', 'devices', { hostname, deviceType, operatingSystem, siteName, filterId }, { startPage: page ?? 0, maxPages: maxPages ?? 2 })
      return ok({ devices: swept.items.map(d => slimDevice(d, { includeUdf })), pagination: pageMeta(swept), ...(hostname || deviceType || operatingSystem || siteName || filterId ? {} : { caution: 'Unfiltered account-wide listing has returned a subset of the fleet before — enumerate per site with datto_rmm_site_devices for authoritative inventory.' }) })
    } catch (e) { return fail(e) } })

  server.registerTool('datto_rmm_get_device', { title: 'Datto RMM: get device', description: 'Read-only. One device by EXACTLY ONE of: deviceUid (UUID), deviceId (numeric), or macAddress (returns every device with that MAC; any separator format accepted). Full record: identity, site, type/class, OS, IPs, domain, last user, online/suspended/deleted, timestamps, agent version, patch management detail, antivirus, warranty, non-empty UDFs (includeUdf=true), plus the web-console deep link (consoleUrl) and Web Remote link (webRemoteUrl).', inputSchema: { deviceUid: z.string().optional().describe('Device UID (UUID)'), deviceId: z.number().int().optional().describe('Numeric device id (e.g. from activity logs)'), macAddress: z.string().optional().describe('MAC address, any format'), includeUdf: z.boolean().optional().describe('Include non-empty user-defined fields (default true here)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ deviceUid, deviceId, macAddress, includeUdf }: any) => { try {
      const given = [deviceUid, deviceId, macAddress].filter(v => v !== undefined && v !== null)
      if (given.length !== 1) throw new Error('Provide exactly one of deviceUid, deviceId, macAddress.')
      const withUdf = includeUdf !== false
      const decorate = async (d: DrmDevice) => {
        let siteConsoleUrl: string | null = null
        try { siteConsoleUrl = d.siteUid ? (await siteLinks()).byUid.get(d.siteUid) ?? null : null } catch { /* site link is best-effort */ }
        return { ...slimDevice(d, { includeUdf: withUdf }), creationDate: tsOf(d.creationDate), snmpEnabled: d.snmpEnabled ?? null, deleted: d.deleted ?? false, siteConsoleUrl }
      }
      if (macAddress) {
        const mac = normalizeMac(macAddress)
        const data = (await get(`/api/v2/device/macAddress/${mac}`)) as { devices?: DrmDevice[] } | DrmDevice[]
        const list = Array.isArray(data) ? data : data?.devices ?? []
        return ok({ macAddress: mac, matches: await Promise.all(list.map(decorate)) })
      }
      const path = deviceUid ? `/api/v2/device/${encodeURIComponent(deviceUid)}` : `/api/v2/device/id/${deviceId}`
      return ok({ device: await decorate((await get(path)) as DrmDevice) })
    } catch (e) { return fail(e) } })

  server.registerTool('datto_rmm_device_audit', { title: 'Datto RMM: device hardware/system audit', description: 'Read-only. Audited hardware + system detail for one device by UID: system info (manufacturer/model/RAM/CPU cores/.NET), BIOS, baseboard, processors, physical memory modules, logical disks (size/free), NICs (IPv4/IPv6/MAC), displays, video boards, attached devices, SNMP info — plus the device\'s web-console deep link. Detects the device class automatically and reads the matching audit (generic / ESXi host incl. guests+datastores / printer incl. marker supplies). Alternatively pass macAddress to audit by MAC. Software inventory is the separate datto_rmm_device_software tool.', inputSchema: { deviceUid: z.string().optional().describe('Device UID (UUID)'), macAddress: z.string().optional().describe('MAC address, any format (generic-device audit only)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ deviceUid, macAddress }: any) => { try {
      if (!deviceUid && !macAddress) throw new Error('Provide deviceUid or macAddress.')
      if (deviceUid && macAddress) throw new Error('Provide only one of deviceUid, macAddress.')
      if (macAddress) {
        const mac = normalizeMac(macAddress)
        return ok({ macAddress: mac, audit: await get(`/api/v2/audit/device/macAddress/${mac}`) })
      }
      const device = (await get(`/api/v2/device/${encodeURIComponent(deviceUid)}`)) as DrmDevice
      const cls = (device.deviceClass ?? 'device').toLowerCase()
      const auditPath = cls === 'esxihost' ? `/api/v2/audit/esxihost/${encodeURIComponent(deviceUid)}`
        : cls === 'printer' ? `/api/v2/audit/printer/${encodeURIComponent(deviceUid)}`
        : `/api/v2/audit/device/${encodeURIComponent(deviceUid)}`
      const audit = (await get(auditPath)) as { portalUrl?: string | null; webRemoteUrl?: string | null }
      return ok({ device: { uid: device.uid, hostname: device.hostname, siteUid: device.siteUid, siteName: device.siteName, deviceClass: cls, consoleUrl: device.portalUrl ?? audit?.portalUrl ?? null, webRemoteUrl: device.webRemoteUrl ?? audit?.webRemoteUrl ?? null }, audit })
    } catch (e) { return fail(e) } })

  server.registerTool('datto_rmm_device_software', { title: 'Datto RMM: device software inventory', description: 'Read-only. Audited installed-software list (name + version) for one device by UID, paginated. Optional nameContains filters client-side (case-insensitive substring) — useful for "which devices have <app>" checks one device at a time. Response includes the device\'s hostname and web-console deep link.', inputSchema: { deviceUid: z.string().describe('Device UID (UUID)'), nameContains: z.string().optional().describe('Case-insensitive substring filter on software name'), page: z.number().int().min(0).optional().describe('Start page, 0-BASED — the API\'s page index (default 0, the first page)'), maxPages: z.number().int().min(1).max(8).optional().describe('Pages to sweep, 250 rows/page (default 4)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ deviceUid, nameContains, page, maxPages }: any) => { try {
      const [deviceRaw, swept] = await Promise.all([
        get(`/api/v2/device/${encodeURIComponent(deviceUid)}`).catch(() => null),
        pagedGet<{ name?: string; version?: string }>(`/api/v2/audit/device/${encodeURIComponent(deviceUid)}/software`, 'software', {}, { startPage: page ?? 0, maxPages: maxPages ?? 4 }),
      ])
      const device = deviceRaw as DrmDevice | null
      const needle = nameContains?.toLowerCase()
      const software = needle ? swept.items.filter(s => (s.name ?? '').toLowerCase().includes(needle)) : swept.items
      return ok({ device: device ? { uid: device.uid, hostname: device.hostname, siteName: device.siteName, consoleUrl: device.portalUrl ?? null } : { uid: deviceUid }, softwareCount: software.length, software, pagination: pageMeta(swept), ...(needle ? { filter: { nameContains } } : {}) })
    } catch (e) { return fail(e) } })

  server.registerTool('datto_rmm_site_network_interfaces', { title: 'Datto RMM: site device network interfaces', description: 'Read-only. Bulk NIC report for ONE site by UID: each device\'s network interfaces (instance, IPv4, IPv6, MAC, type) with hostname and int/ext IP — the fast way to build an IP/MAC inventory for a customer network. Each row carries the device\'s web-console deep link resolved from the site\'s device list.', inputSchema: { siteUid: z.string().describe('Site UID (UUID from datto_rmm_list_sites)'), page: z.number().int().min(0).optional().describe('Start page, 0-BASED — the API\'s page index (default 0, the first page)'), maxPages: z.number().int().min(1).max(8).optional().describe('Pages to sweep, 250 rows/page (default 2)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ siteUid, page, maxPages }: any) => { try {
      const [links, swept] = await Promise.all([
        siteDeviceLinks(siteUid).catch(() => new Map<string, string>()),
        pagedGet<DrmDevice & { nics?: unknown[] }>(`/api/v2/site/${encodeURIComponent(siteUid)}/devices/network-interface`, 'devices', {}, { startPage: page ?? 0, maxPages: maxPages ?? 2 }),
      ])
      const rows = swept.items.map(d => ({ uid: d.uid ?? null, hostname: d.hostname ?? '', deviceType: d.deviceType?.category ?? null, intIpAddress: d.intIpAddress ?? null, extIpAddress: d.extIpAddress ?? null, nics: d.nics ?? [], consoleUrl: (d.uid && links.get(d.uid)) || null }))
      return ok({ siteUid, devices: rows, pagination: pageMeta(swept) })
    } catch (e) { return fail(e) } })

  // ── Alerts ───────────────────────────────────────────────────────────────
  server.registerTool('datto_rmm_alerts', { title: 'Datto RMM: alerts (open/resolved; account, site, or device)', description: 'Read-only alert reporting. scope=account (default; all customers), or pass siteUid / deviceUid to scope down. status=open (default) or resolved. Each row: priority, monitor type (from the alert context class), timestamp, ticket number, resolution info (resolved scope), response actions, the raw alertContext, and the referenced device + site each WITH their web-console deep link (resolved from the API\'s own data; account-wide sweeps resolve device links for up to 8 sites per call and say so when capped). sinceDays filters client-side by alert timestamp — the API has no date filter, so old resolved alerts may need more pages (response reports truncation). includeDiagnostics=true adds the (large) diagnostics payload. Alert volume can be high — resolved sweeps default to 2 pages of 100.', inputSchema: { scope: z.enum(['account', 'site', 'device']).optional().describe('Default account; site/device require siteUid/deviceUid'), siteUid: z.string().optional().describe('Site UID (UUID) — required when scope=site'), deviceUid: z.string().optional().describe('Device UID (UUID) — required when scope=device'), status: z.enum(['open', 'resolved']).optional().describe('Default open'), muted: z.boolean().optional().describe('Filter by muted state (omit for all)'), sinceDays: z.number().int().min(1).max(365).optional().describe('Keep only alerts newer than N days (client-side filter)'), includeDiagnostics: z.boolean().optional().describe('Include raw diagnostics payload per alert (default false; large)'), page: z.number().int().min(0).optional().describe('Start page, 0-BASED — the API\'s page index (default 0, the first page)'), max: z.number().int().min(1).max(250).optional().describe('Rows per page (default 100)'), maxPages: z.number().int().min(1).max(8).optional().describe('Pages to sweep (default 2)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ scope, siteUid, deviceUid, status, muted, sinceDays, includeDiagnostics, page, max, maxPages }: any) => { try {
      const effScope = scope ?? (deviceUid ? 'device' : siteUid ? 'site' : 'account')
      if (effScope === 'site' && !siteUid) throw new Error('scope=site requires siteUid.')
      if (effScope === 'device' && !deviceUid) throw new Error('scope=device requires deviceUid.')
      const st = status ?? 'open'
      const base = effScope === 'device' ? `/api/v2/device/${encodeURIComponent(deviceUid)}/alerts/${st}`
        : effScope === 'site' ? `/api/v2/site/${encodeURIComponent(siteUid)}/alerts/${st}`
        : `/api/v2/account/alerts/${st}`
      const swept = await pagedGet<DrmAlert>(base, 'alerts', { muted }, { startPage: page ?? 0, max: max ?? 100, maxPages: maxPages ?? 2 })
      let alerts = swept.items
      let dateFiltered = 0
      if (sinceDays) {
        const cutoff = Date.now() - sinceDays * 86_400_000
        const before = alerts.length
        alerts = alerts.filter(a => { const t = a.timestamp ? Date.parse(a.timestamp) : NaN; return Number.isNaN(t) ? true : t >= cutoff })
        dateFiltered = before - alerts.length
      }
      const links = await alertLinkMaps(alerts)
      const rows = alerts.map(a => buildAlertRow(a, links, { includeDiagnostics }))
      return ok({ scope: effScope, status: st, alerts: rows, alertCount: rows.length, pagination: pageMeta(swept), ...(sinceDays ? { sinceDays, olderRowsDropped: dateFiltered } : {}), ...(links.linkNotes.length ? { linkNotes: links.linkNotes } : {}) })
    } catch (e) { return fail(e) } })

  server.registerTool('datto_rmm_get_alert', { title: 'Datto RMM: get alert', description: 'Read-only. One alert by alert UID: full detail including diagnostics, monitor info, response actions, resolution state, and the referenced device + site with their web-console deep links.', inputSchema: { alertUid: z.string().describe('Alert UID') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ alertUid }: any) => { try {
      const alert = (await get(`/api/v2/alert/${encodeURIComponent(alertUid)}`)) as DrmAlert
      const links = await alertLinkMaps([alert])
      return ok({ alert: buildAlertRow(alert, links, { includeDiagnostics: true }), ...(links.linkNotes.length ? { linkNotes: links.linkNotes } : {}) })
    } catch (e) { return fail(e) } })

  // ── Activity / audit logs ────────────────────────────────────────────────
  server.registerTool('datto_rmm_activity_logs', { title: 'Datto RMM: activity/audit logs', description: 'Read-only. The platform activity log (who did what, when): filter by UTC window (from/until — accepts YYYY-MM-DD or ISO datetime; DEFAULT IS ONLY THE LAST 15 MINUTES, so pass a window for reports), entity type (device/user), categories, actions, numeric siteIds (the numeric id from datto_rmm_list_sites, not the UID), numeric userIds (from datto_rmm_list_users), and a searchQuery. Rows include the acting user, category/action, details, and the referenced site with its console link (device rows carry hostname + numeric deviceId — resolve a device\'s link with datto_rmm_get_device). Pagination is cursor-based: pass back nextSearchAfter from the previous response together with page="next".', inputSchema: { from: z.string().optional().describe('UTC window start (YYYY-MM-DD or ISO datetime)'), until: z.string().optional().describe('UTC window end (YYYY-MM-DD or ISO datetime)'), entities: z.array(z.enum(['device', 'user'])).optional().describe('Entity types to include'), categories: z.array(z.string()).optional().describe('Category filters (e.g. audit, monitor, job)'), actions: z.array(z.string()).optional().describe('Action filters'), siteIds: z.array(z.number().int()).optional().describe('Numeric site ids (NOT UIDs)'), userIds: z.array(z.number().int()).optional().describe('Numeric user ids'), searchQuery: z.string().optional().describe('Free-text query (supports wildcards/boolean per Datto docs)'), size: z.number().int().min(1).max(250).optional().describe('Rows to return (default 50)'), order: z.enum(['asc', 'desc']).optional().describe('By creation date (default desc)'), searchAfter: z.array(z.string()).optional().describe('Cursor from the previous response\'s nextSearchAfter'), page: z.enum(['next', 'previous']).optional().describe('Cursor direction, used with searchAfter') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ from, until, entities, categories, actions, siteIds, userIds, searchQuery, size, order, searchAfter, page }: any) => { try {
      const qs = drmQuery({ from: from ? toDrmUtc(from) : undefined, until: until ? toDrmUtc(until, true) : undefined, entities, categories, actions, siteIds, userIds, searchQuery, size: size ?? 50, order: order ?? 'desc', searchAfter, page })
      const data = (await get(`/api/v2/activity-logs${qs}`)) as { pageDetails?: DrmPageDetails; activities?: DrmActivityLog[]; error?: string }
      let siteUrlById = new Map<number, string>()
      try { siteUrlById = (await siteLinks()).byNumericId } catch { /* links best-effort */ }
      const rows = (data.activities ?? []).map(a => ({
        id: a.id ?? null,
        date: typeof a.date === 'number' ? new Date(a.date).toISOString() : a.date ?? null,
        entity: a.entity ?? null,
        category: a.category ?? null,
        action: a.action ?? null,
        details: a.details ?? null,
        user: a.user ? { id: a.user.id ?? null, userName: a.user.userName ?? null, name: [a.user.firstName, a.user.lastName].filter(Boolean).join(' ') || null } : null,
        site: a.site ? { id: a.site.id ?? null, name: a.site.name ?? null, consoleUrl: (typeof a.site.id === 'number' && siteUrlById.get(a.site.id)) || null } : null,
        device: a.deviceId || a.hostname ? { deviceId: a.deviceId ?? null, hostname: a.hostname ?? null, note: 'Resolve this device\'s console link with datto_rmm_get_device (deviceId).' } : null,
        hasStdOut: a.hasStdOut ?? false,
        hasStdErr: a.hasStdErr ?? false,
      }))
      // Surface the cursor for the next page (the API encodes it in nextPageUrl).
      let nextSearchAfter: string[] | null = null
      try { if (data.pageDetails?.nextPageUrl) nextSearchAfter = new URL(data.pageDetails.nextPageUrl).searchParams.getAll('searchAfter') } catch { /* no cursor */ }
      return ok({ activities: rows, returned: rows.length, ...(nextSearchAfter && nextSearchAfter.length ? { nextSearchAfter, note: 'Pass nextSearchAfter as searchAfter with page="next" for the next page.' } : {}), ...(data.error ? { apiError: data.error } : {}) })
    } catch (e) { return fail(e) } })

  // ── Jobs (results of already-run jobs; nothing here can run one) ─────────
  server.registerTool('datto_rmm_job_status', { title: 'Datto RMM: job status/results', description: 'Read-only. Status and results of an ALREADY-RUN job by job UID (this tool cannot create or run jobs). Returns the job record (name, status, created) and its components. Pass deviceUid to add that device\'s per-component results, and includeOutput=true to also fetch captured StdOut/StdErr for that device. Find job UIDs in datto_rmm_activity_logs (category "job") or from the Datto RMM console.', inputSchema: { jobUid: z.string().describe('Job UID'), deviceUid: z.string().optional().describe('Device UID to fetch per-device results for'), includeOutput: z.boolean().optional().describe('Also fetch StdOut/StdErr for that device (default false)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ jobUid, deviceUid, includeOutput }: any) => { try {
      const j = encodeURIComponent(jobUid)
      const [job, components] = await Promise.all([
        get(`/api/v2/job/${j}`),
        get(`/api/v2/job/${j}/components`).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
      ])
      const out: Record<string, unknown> = { job, components }
      if (deviceUid) {
        const d = encodeURIComponent(deviceUid)
        out.deviceResults = await get(`/api/v2/job/${j}/results/${d}`).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))
        try { const dev = (await get(`/api/v2/device/${d}`)) as DrmDevice; out.device = { uid: dev.uid, hostname: dev.hostname, siteName: dev.siteName, consoleUrl: dev.portalUrl ?? null } } catch { out.device = { uid: deviceUid } }
        if (includeOutput) {
          out.stdOut = await get(`/api/v2/job/${j}/results/${d}/stdout`).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))
          out.stdErr = await get(`/api/v2/job/${j}/results/${d}/stderr`).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))
        }
      }
      return ok(out)
    } catch (e) { return fail(e) } })

  // ── Catalogs: components, filters, users, variables ──────────────────────
  server.registerTool('datto_rmm_list_components', { title: 'Datto RMM: list components', description: 'Read-only. The account\'s component catalog (scripts/monitors/applications available in Datto RMM): name, description, category, and declared variables. LISTING ONLY — this connector has no tool that runs components or quick jobs.', inputSchema: { page: z.number().int().min(0).optional().describe('Start page, 0-BASED — the API\'s page index (default 0, the first page)'), maxPages: z.number().int().min(1).max(8).optional().describe('Pages to sweep, 250 rows/page (default 4)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ page, maxPages }: any) => { try {
      const swept = await pagedGet<Record<string, unknown>>('/api/v2/account/components', 'components', {}, { startPage: page ?? 0, maxPages: maxPages ?? 4 })
      return ok({ components: swept.items, pagination: pageMeta(swept) })
    } catch (e) { return fail(e) } })

  server.registerTool('datto_rmm_list_filters', { title: 'Datto RMM: list device filters', description: 'Read-only. Device filters usable as filterId in datto_rmm_site_devices / datto_rmm_search_devices: type=default (built-in), custom (account-defined), or site (one site\'s filters; requires siteUid).', inputSchema: { type: z.enum(['default', 'custom', 'site']).optional().describe('Default "default"'), siteUid: z.string().optional().describe('Site UID — required when type=site'), page: z.number().int().min(0).optional().describe('Start page, 0-BASED — the API\'s page index (default 0, the first page)'), maxPages: z.number().int().min(1).max(8).optional().describe('Pages to sweep (default 2)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ type, siteUid, page, maxPages }: any) => { try {
      const t = type ?? 'default'
      if (t === 'site' && !siteUid) throw new Error('type=site requires siteUid.')
      const base = t === 'site' ? `/api/v2/site/${encodeURIComponent(siteUid)}/filters` : t === 'custom' ? '/api/v2/filter/custom-filters' : '/api/v2/filter/default-filters'
      const swept = await pagedGet<Record<string, unknown>>(base, 'filters', {}, { startPage: page ?? 0, maxPages: maxPages ?? 2 })
      return ok({ type: t, filters: swept.items, pagination: pageMeta(swept) })
    } catch (e) { return fail(e) } })

  server.registerTool('datto_rmm_list_users', { title: 'Datto RMM: list console users', description: 'Read-only. Datto RMM console (authentication) users: name, username, email, status, disabled flag, created and last-access timestamps. Useful for access reviews and for mapping userIds in activity logs.', inputSchema: { page: z.number().int().min(0).optional().describe('Start page, 0-BASED — the API\'s page index (default 0, the first page)'), maxPages: z.number().int().min(1).max(8).optional().describe('Pages to sweep (default 2)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ page, maxPages }: any) => { try {
      const swept = await pagedGet<Record<string, unknown>>('/api/v2/account/users', 'users', {}, { startPage: page ?? 0, maxPages: maxPages ?? 2 })
      return ok({ users: swept.items, pagination: pageMeta(swept) })
    } catch (e) { return fail(e) } })

  server.registerTool('datto_rmm_variables', { title: 'Datto RMM: account/site variables', description: 'Read-only. Variables available to components at account scope (default) or for one site (scope=site + siteUid). Masked variables ALWAYS return value "[MASKED]" — this tool never exposes masked values. Site scope includes the site\'s console link.', inputSchema: { scope: z.enum(['account', 'site']).optional().describe('Default account'), siteUid: z.string().optional().describe('Site UID — required when scope=site'), page: z.number().int().min(0).optional().describe('Start page, 0-BASED — the API\'s page index (default 0, the first page)'), maxPages: z.number().int().min(1).max(8).optional().describe('Pages to sweep (default 2)') } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ scope, siteUid, page, maxPages }: any) => { try {
      const sc = scope ?? 'account'
      if (sc === 'site' && !siteUid) throw new Error('scope=site requires siteUid.')
      const base = sc === 'site' ? `/api/v2/site/${encodeURIComponent(siteUid)}/variables` : '/api/v2/account/variables'
      const swept = await pagedGet<DrmVariable>(base, 'variables', {}, { startPage: page ?? 0, maxPages: maxPages ?? 2 })
      let site: Record<string, unknown> | undefined
      if (sc === 'site') {
        try { const s = (await get(`/api/v2/site/${encodeURIComponent(siteUid)}`)) as DrmSite; site = { uid: s.uid, name: s.name, consoleUrl: s.portalUrl ?? null } } catch { site = { uid: siteUid } }
      }
      return ok({ scope: sc, ...(site ? { site } : {}), variables: redactVariables(swept.items), pagination: pageMeta(swept) })
    } catch (e) { return fail(e) } })
}
