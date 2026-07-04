/**
 * UniFi Cloud Connector Proxy client
 *
 * Reaches each console's LOCAL Network Integration API from the cloud via
 * Ubiquiti's Site Manager proxy — no LAN path, no per-console credentials:
 *
 *   GET https://api.ui.com/v1/hosts                                → consoles
 *   GET https://api.ui.com/v1/connector/consoles/{consoleId}
 *         /proxy/network/integration/v1/sites[...]                 → local API
 *
 * Auth is the same x-api-key as src/lib/ubiquiti.ts (UBIQUITI_API_KEY).
 * ~800ms added latency per proxied call. Documented connector limits
 * (developer.ui.com, Site Manager API): 100 proxied requests/min PER CONSOLE
 * (429 + Retry-After), 25s proxied-request timeout (408), 10 MB response cap.
 * Consoles need Network app >= 10.1.84 for the full Integration API — many
 * TCT consoles are behind, so per-console failure is an expected, common case.
 *
 * Unlike ubiquiti.ts (which swallows errors and returns null/[]), this client
 * THROWS UnifiProxyError with a typed code so callers can tell "offline"
 * from "firmware too old" from "empty site". Do not add silent fallbacks.
 *
 * Used by: src/lib/mcp-unifi-site-tools.ts, src/lib/connector/unifi-staged-writes.ts,
 * scripts/probe-unifi-consoles.ts. Leave src/lib/ubiquiti.ts (Site Manager
 * aggregate reads) untouched — different API surface, different consumers.
 */

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export type UnifiProxyErrorCode =
  | 'NOT_CONFIGURED' // UBIQUITI_API_KEY missing
  | 'AUTH_FAILED' // 401/403 — bad key or key lacks scope
  | 'CONSOLE_OFFLINE' // 502/503/504 — Site Manager cannot reach the console
  | 'FIRMWARE_UNSUPPORTED' // Integration API absent — Network app below 10.1.84
  | 'NOT_FOUND' // a specific resource 404s on a console that HAS the API
  | 'RATE_LIMITED' // 429 — retryAfterSeconds carries the server's Retry-After
  | 'TIMEOUT' // no response within the fetch timeout
  | 'BAD_REQUEST' // 400 — invalid payload/parameters (message from the API)
  | 'UPSTREAM_ERROR' // any other 5xx / unexpected status

export class UnifiProxyError extends Error {
  readonly code: UnifiProxyErrorCode
  readonly status?: number
  readonly retryAfterSeconds?: number

  constructor(
    message: string,
    code: UnifiProxyErrorCode,
    opts?: { status?: number; retryAfterSeconds?: number },
  ) {
    super(message)
    this.name = 'UnifiProxyError'
    this.code = code
    this.status = opts?.status
    this.retryAfterSeconds = opts?.retryAfterSeconds
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 30_000 // gotcha #3: every external fetch gets a timeout
const MAX_RETRY_AFTER_WAIT_S = 10 // 429s with a longer Retry-After surface to the caller instead

function getProxyConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.UBIQUITI_API_KEY
  const baseUrl = (process.env.UBIQUITI_API_URL || 'https://api.ui.com').replace(/\/$/, '')
  if (!apiKey) {
    throw new UnifiProxyError(
      'UniFi is not configured: set UBIQUITI_API_KEY (Site Manager API key from unifi.ui.com > Settings > API Keys).',
      'NOT_CONFIGURED',
    )
  }
  return { apiKey, baseUrl }
}

// ---------------------------------------------------------------------------
// Core fetch — one place maps HTTP status → typed error
// ---------------------------------------------------------------------------

async function readErrorBody(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return ''
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string }
    return parsed.message || parsed.error || text.substring(0, 300)
  } catch {
    return text.substring(0, 300)
  }
}

function consoleLabel(consoleId: string | null): string {
  return consoleId ? `Console ${consoleId}` : 'Site Manager'
}

async function rawFetch(
  url: string,
  apiKey: string,
  init: { method: string; body?: unknown },
  consoleId: string | null,
  pathForMessages: string,
): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/abort|timeout/i.test(msg)) {
      throw new UnifiProxyError(
        `${consoleLabel(consoleId)}: no response for ${pathForMessages} within ${FETCH_TIMEOUT_MS / 1000}s. The console may be offline or the proxy is slow — retry once before escalating.`,
        'TIMEOUT',
      )
    }
    throw new UnifiProxyError(`${consoleLabel(consoleId)}: network error on ${pathForMessages}: ${msg}`, 'UPSTREAM_ERROR')
  }
  return res
}

async function throwForStatus(
  res: Response,
  consoleId: string | null,
  pathForMessages: string,
  isCapabilityProbe: boolean,
): Promise<never> {
  const status = res.status
  const body = await readErrorBody(res)
  const label = consoleLabel(consoleId)

  if (status === 401 || status === 403) {
    throw new UnifiProxyError(
      `${label}: authentication failed (${status}) on ${pathForMessages} — the UBIQUITI_API_KEY is invalid, revoked, or lacks access to this console. Rotate/check the key in unifi.ui.com > Settings > API Keys.${body ? ` API said: ${body}` : ''}`,
      'AUTH_FAILED',
      { status },
    )
  }
  if (status === 429) {
    const retryAfter = Number(res.headers.get('retry-after')) || undefined
    throw new UnifiProxyError(
      `${label}: rate-limited (429) on ${pathForMessages}.${retryAfter ? ` Retry after ${retryAfter}s.` : ''} The Cloud Connector Proxy allows 100 requests/min per console.`,
      'RATE_LIMITED',
      { status, retryAfterSeconds: retryAfter },
    )
  }
  if (status === 408) {
    throw new UnifiProxyError(
      `${label}: the console did not answer within the proxy's 25s window (408) on ${pathForMessages} — it may be overloaded or losing cloud connectivity. Retry once before escalating.`,
      'TIMEOUT',
      { status },
    )
  }
  if (status === 404 || status === 501) {
    if (consoleId && isCapabilityProbe) {
      throw new UnifiProxyError(
        `${label}: local Integration API unavailable (${status}) — Network app likely below 10.1.84. Update the console's firmware/Network app in Site Manager, then retry.`,
        'FIRMWARE_UNSUPPORTED',
        { status },
      )
    }
    throw new UnifiProxyError(
      `${label}: ${pathForMessages} returned ${status}. Either this resource does not exist at this site, or this console's Network app does not expose this endpoint yet (needs >= 10.1.84 — check with unifi_console_capabilities).${body ? ` API said: ${body}` : ''}`,
      'NOT_FOUND',
      { status },
    )
  }
  if (status === 502 || status === 503 || status === 504) {
    throw new UnifiProxyError(
      `${label}: unreachable through the Cloud Connector Proxy (${status}) — the console is offline, rebooting, or has lost its Site Manager connection. Check the console's cloud connectivity, then retry.`,
      'CONSOLE_OFFLINE',
      { status },
    )
  }
  if (status === 400) {
    throw new UnifiProxyError(
      `${label}: rejected ${pathForMessages} (400)${body ? `: ${body}` : ' — invalid parameters or payload.'}`,
      'BAD_REQUEST',
      { status },
    )
  }
  throw new UnifiProxyError(
    `${label}: unexpected ${status} on ${pathForMessages}${body ? `: ${body}` : ''}`,
    'UPSTREAM_ERROR',
    { status },
  )
}

/**
 * One HTTP call with typed-error mapping and a single bounded 429 retry that
 * honors Retry-After (vendor-documented behavior — deliberately not the
 * generic withRetry(), whose backoff cannot follow the server's hint).
 */
async function proxyFetch<T>(
  url: string,
  init: { method: string; body?: unknown },
  consoleId: string | null,
  pathForMessages: string,
  isCapabilityProbe = false,
): Promise<T> {
  const { apiKey } = getProxyConfig()

  for (let attempt = 0; ; attempt++) {
    const res = await rawFetch(url, apiKey, init, consoleId, pathForMessages)
    if (res.ok) {
      if (res.status === 204) return undefined as T
      const text = await res.text()
      if (!text) return undefined as T
      try {
        return JSON.parse(text) as T
      } catch {
        throw new UnifiProxyError(
          `${consoleLabel(consoleId)}: non-JSON response from ${pathForMessages} (${text.substring(0, 120)}…)`,
          'UPSTREAM_ERROR',
          { status: res.status },
        )
      }
    }
    if (res.status === 429 && attempt === 0) {
      const retryAfter = Number(res.headers.get('retry-after'))
      if (retryAfter > 0 && retryAfter <= MAX_RETRY_AFTER_WAIT_S) {
        await res.text().catch(() => '') // drain before retrying
        await new Promise((r) => setTimeout(r, retryAfter * 1000))
        continue
      }
    }
    return throwForStatus(res, consoleId, pathForMessages, isCapabilityProbe)
  }
}

// ---------------------------------------------------------------------------
// Proxied Integration API verbs (per-console)
// ---------------------------------------------------------------------------

function integrationUrl(baseUrl: string, consoleId: string, path: string): string {
  return `${baseUrl}/v1/connector/consoles/${encodeURIComponent(consoleId)}/proxy/network/integration/v1${path}`
}

/**
 * GET an Integration API path on one console. `path` is relative to
 * /proxy/network/integration/v1 (e.g. `/sites/{siteId}/devices`).
 * Set isCapabilityProbe=true only for the paths every supported console has
 * (`/sites`, `/info`) so a 404 maps to FIRMWARE_UNSUPPORTED instead of NOT_FOUND.
 */
export async function proxyGet<T = unknown>(
  consoleId: string,
  path: string,
  opts?: { isCapabilityProbe?: boolean },
): Promise<T> {
  const { baseUrl } = getProxyConfig()
  return proxyFetch<T>(integrationUrl(baseUrl, consoleId, path), { method: 'GET' }, consoleId, path, opts?.isCapabilityProbe ?? false)
}

export async function proxyPost<T = unknown>(consoleId: string, path: string, body: unknown): Promise<T> {
  const { baseUrl } = getProxyConfig()
  return proxyFetch<T>(integrationUrl(baseUrl, consoleId, path), { method: 'POST', body }, consoleId, path)
}

export async function proxyPut<T = unknown>(consoleId: string, path: string, body: unknown): Promise<T> {
  const { baseUrl } = getProxyConfig()
  return proxyFetch<T>(integrationUrl(baseUrl, consoleId, path), { method: 'PUT', body }, consoleId, path)
}

export async function proxyDelete<T = unknown>(consoleId: string, path: string): Promise<T> {
  const { baseUrl } = getProxyConfig()
  return proxyFetch<T>(integrationUrl(baseUrl, consoleId, path), { method: 'DELETE' }, consoleId, path)
}

// ---------------------------------------------------------------------------
// Paginated list reads
// ---------------------------------------------------------------------------

/** Integration API list envelope: { offset, limit, count, totalCount, data }. */
export interface UnifiPage<T> {
  offset: number
  limit: number
  count: number
  totalCount: number
  data: T[]
}

export interface UnifiListResult<T> {
  items: T[]
  totalCount: number
  /** True when totalCount exceeded maxItems and the tail was not fetched. */
  truncated: boolean
}

const PAGE_LIMIT = 200 // Integration API max page size
const DEFAULT_MAX_ITEMS = 2000

/**
 * Fetch every page of an Integration API list endpoint (offset/limit),
 * stopping at maxItems. Truncation is reported, never silent.
 */
export async function proxyGetAll<T = Record<string, unknown>>(
  consoleId: string,
  path: string,
  opts?: { maxItems?: number; query?: Record<string, string> },
): Promise<UnifiListResult<T>> {
  const maxItems = opts?.maxItems ?? DEFAULT_MAX_ITEMS
  const items: T[] = []
  let totalCount = 0

  for (let offset = 0; ; ) {
    const params = new URLSearchParams({ ...(opts?.query ?? {}), offset: String(offset), limit: String(PAGE_LIMIT) })
    const sep = path.includes('?') ? '&' : '?'
    const page = await proxyGet<UnifiPage<T>>(consoleId, `${path}${sep}${params.toString()}`)

    // Some endpoints return a bare array instead of the paged envelope.
    if (Array.isArray(page)) {
      return { items: page as T[], totalCount: (page as T[]).length, truncated: false }
    }
    if (!page || !Array.isArray(page.data)) {
      throw new UnifiProxyError(
        `${consoleLabel(consoleId)}: unexpected list shape from ${path} — expected { data: [...] }.`,
        'UPSTREAM_ERROR',
      )
    }

    items.push(...page.data)
    totalCount = page.totalCount ?? items.length
    offset = items.length
    if (items.length >= totalCount || page.data.length === 0) {
      return { items, totalCount, truncated: false }
    }
    if (items.length >= maxItems) {
      return { items, totalCount, truncated: true }
    }
  }
}

// ---------------------------------------------------------------------------
// Console inventory (Site Manager /v1/hosts — NOT proxied)
// ---------------------------------------------------------------------------

/** Minimal console identity extracted defensively from a /v1/hosts entry. */
export interface UnifiConsoleInfo {
  consoleId: string
  name: string
  ipAddress: string | null
  isOnlineInSiteManager: boolean | null
}

interface RawHost {
  id?: string
  ipAddress?: string
  isBlocked?: boolean
  reportedState?: {
    name?: string
    hostname?: string
    state?: string
    ip?: string
  }
  nickname?: string
  [key: string]: unknown
}

/** All consoles visible to the API key, via GET /v1/hosts. */
export async function listUnifiConsoles(): Promise<UnifiConsoleInfo[]> {
  const { baseUrl } = getProxyConfig()
  const res = await proxyFetch<{ data?: RawHost[] } | RawHost[]>(
    `${baseUrl}/v1/hosts`,
    { method: 'GET' },
    null,
    '/v1/hosts',
  )
  const hosts = Array.isArray(res) ? res : (res?.data ?? [])
  return hosts
    .filter((h): h is RawHost & { id: string } => typeof h?.id === 'string' && h.id.length > 0)
    .map((h) => ({
      consoleId: h.id,
      name:
        (typeof h.reportedState?.name === 'string' && h.reportedState.name) ||
        (typeof h.reportedState?.hostname === 'string' && h.reportedState.hostname) ||
        (typeof h.nickname === 'string' && h.nickname) ||
        h.id,
      ipAddress:
        (typeof h.ipAddress === 'string' && h.ipAddress) ||
        (typeof h.reportedState?.ip === 'string' && h.reportedState.ip) ||
        null,
      isOnlineInSiteManager:
        typeof h.reportedState?.state === 'string' ? h.reportedState.state.toLowerCase() === 'connected' : null,
    }))
}

/** A local site on one console, via the proxied GET /sites. */
export interface UnifiLocalSite {
  id: string
  internalReference?: string
  name?: string
  [key: string]: unknown
}

/**
 * Local site list for one console — also the capability probe: throws
 * FIRMWARE_UNSUPPORTED / CONSOLE_OFFLINE / AUTH_FAILED with the reason
 * instead of pretending the console has zero sites.
 */
export async function listLocalSites(consoleId: string): Promise<UnifiLocalSite[]> {
  const result = await proxyGetAll<UnifiLocalSite>(consoleId, '/sites')
  return result.items
}

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

const SECRET_KEY_PATTERN =
  /pass(word|phrase)?$|^psk$|secret|private[_-]?key|preshared|^x?_?passphrase$|auth[_-]?key|wpa[_-]?psk|radius.*(secret|password)/i

export const REDACTED = '[REDACTED]'

/**
 * Deep-copy `value`, replacing every string value whose key looks like a
 * credential (WLAN passphrases, VPN keys, RADIUS secrets) with [REDACTED].
 * All read tools apply this by default — techs who need the actual secret
 * get it from unifi.ui.com, not from the connector.
 */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v)) as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k) && typeof v === 'string' && v.length > 0) {
        out[k] = REDACTED
      } else {
        out[k] = redactSecrets(v)
      }
    }
    return out as T
  }
  return value
}
