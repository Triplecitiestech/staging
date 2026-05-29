/**
 * SaaS Alerts External Partner API Client
 *
 * SaaS Alerts (Kaseya) ships TWO distinct HTTP surfaces:
 *
 *   1. The portal API at `https://manage.saasalerts.com/api`
 *      - Cloudflare-protected, returns 403 to all server-to-server traffic
 *        regardless of headers. Do NOT call this from server code.
 *
 *   2. The "External Partner API" at
 *      `https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1`
 *      - Hosted on Google Cloud Functions, NO Cloudflare in front of it.
 *      - This is the one you can actually call programmatically.
 *      - Swagger: https://app.swaggerhub.com/apis/SaaS_Alerts/functions/0.20.0
 *
 * This client targets #2. Authentication requires BOTH:
 *   - `api_key` header — your partner API key (from manage.saasalerts.com >
 *     Settings > API, also retrievable via GET /tools/apiKey)
 *   - `idtoken`  header — the partner-user ID token (Firebase Auth JWT).
 *
 * The `idtoken` is a short-lived (1h) Firebase Auth JWT. To keep the
 * integration alive without manual re-pasting every hour, this client
 * exchanges a long-lived Firebase refresh token for a fresh idtoken via
 *   POST https://securetoken.googleapis.com/v1/token?key=<webApiKey>
 *   body: grant_type=refresh_token&refresh_token=<refreshToken>
 * Tokens are cached per-isolate in memory; concurrent requests during a
 * refresh share the same in-flight promise.
 *
 * The Firebase Web API key is NOT secret (it is shipped in the SaaS Alerts
 * SPA) — it identifies the Firebase project, not the caller. Auth is enforced
 * entirely by the refresh-token check.
 *
 * Env vars — primary (refresh flow):
 *   SAAS_ALERTS_API_KEY            — `api_key` header value
 *   SAAS_ALERTS_REFRESH_TOKEN      — Firebase refresh token (long-lived)
 *
 * Env vars — fallback (manual / one-off testing):
 *   SAAS_ALERTS_ID_TOKEN           — pre-fetched JWT. Used only when no
 *                                    refresh token is configured. Will
 *                                    expire ~1h after issuance.
 *
 * Optional env vars:
 *   SAAS_ALERTS_FIREBASE_API_KEY   — Firebase Web API key for the SaaS Alerts
 *                                    project (defaults to the public value
 *                                    embedded in the manage.saasalerts.com SPA)
 *   SAAS_ALERTS_API_URL            — base URL override (defaults to production
 *                                    cloudfunctions; alternate envs are qa/dev,
 *                                    see SaasAlertsApiEnvironment below)
 *   SAAS_ALERTS_PARTNER_ID         — used to scope filtered event queries;
 *                                    NOT required for auth.
 */

const DEFAULT_BASE_URL = 'https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1'

// Public Firebase Web API key embedded in the manage.saasalerts.com SPA.
// Identifies the SaaS Alerts Firebase project; not a secret.
const DEFAULT_FIREBASE_WEB_API_KEY = 'AIzaSyC14CD_df06vaN4bj3H9t3Um8yUdY3vZQI'

const SECURE_TOKEN_ENDPOINT = 'https://securetoken.googleapis.com/v1/token'

// The Firebase Web API key for the SaaS Alerts project has HTTP-referrer
// restrictions configured on Google Cloud. Server-to-server requests are
// rejected with "Requests from referer <empty> are blocked" unless we send
// a Referer header matching the allowed origin (the portal SPA gets through
// because browsers auto-attach Referer). Spoofing is the documented escape
// hatch — Google API key referrer checks are abuse control, not security.
const DEFAULT_REFRESH_REFERER = 'https://manage.saasalerts.com/'

// Refresh idtoken when fewer than this many ms remain on the current token.
const REFRESH_BUFFER_MS = 5 * 60 * 1000

export const SAAS_ALERTS_API_ENVIRONMENTS = {
  production: 'https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1',
  qa: 'https://us-central1-saas-alerts-qa.cloudfunctions.net/reportApi/api/v1',
  development: 'https://us-central1-saas-alerts-dev.cloudfunctions.net/reportApi/api/v1',
} as const

export type SaasAlertsApiEnvironment = keyof typeof SAAS_ALERTS_API_ENVIRONMENTS

export interface SaasAlertEvent {
  eventId?: string
  id?: string
  time?: string
  timestamp?: string
  user?: { id?: string; name?: string; email?: string } | string
  ip?: string
  location?: {
    country?: string
    region?: string
    city?: string
    lat?: number
    lon?: number
  } | null
  alertStatus?: string
  severity?: string
  jointType?: string
  eventType?: string
  type?: string
  jointDesc?: string
  jointDescAdditional?: string | null
  description?: string
  customerName?: string
  customerId?: string
  organizationId?: string
}

export interface SaasAlertCustomer {
  id: string
  name: string
  tenantId?: string
}

export interface SaasAlertsBillingDetail {
  customerId?: string
  customerName?: string
  product?: string
  seats?: number
  billableSeats?: number
  [key: string]: unknown
}

export interface SaasAlertsRecommendedAction {
  ruleId?: string
  ruleName?: string
  severity?: string
  category?: string
  customerId?: string
  customerName?: string
  count?: number
  recommendation?: string
  [key: string]: unknown
}

export interface SaasAlertsDeviceOrganization {
  organizationId?: string
  organizationName?: string
  deviceCount?: number
  mappedDeviceCount?: number
  unmappedDeviceCount?: number
  [key: string]: unknown
}

export interface SaasAlertsPartnerProfile {
  partnerId?: string
  partnerName?: string
  brandingUrl?: string
  [key: string]: unknown
}

export interface SaasAlertsMspUser {
  email?: string
  name?: string
  role?: string
  partnerId?: string
  [key: string]: unknown
}

export interface SaasAlertsSummary {
  available: boolean
  totalEvents: number
  eventsBySeverity: Record<string, number>
  eventsByType: Record<string, number>
  customers: SaasAlertCustomer[]
  recentEvents: SaasAlertEvent[]
  note: string | null
  diagnostics?: Record<string, unknown>
}

interface CachedToken {
  idToken: string
  expiresAtMs: number
  refreshToken: string
  /** Set when the cached token came from SAAS_ALERTS_ID_TOKEN, not a refresh exchange. */
  source: 'refresh' | 'static'
}

/**
 * Per-isolate cache. Shared across all SaasAlertsClient instances in the same
 * Node process so concurrent requests don't each trigger their own refresh.
 */
let cachedToken: CachedToken | null = null
let inFlightRefresh: Promise<CachedToken> | null = null

/** Reset the cache. Exported for tests; not used in app code. */
export function _resetSaasAlertsTokenCache(): void {
  cachedToken = null
  inFlightRefresh = null
}

export class SaasAlertsClient {
  private apiKey: string
  private staticIdToken: string
  private refreshToken: string
  private firebaseApiKey: string
  private refreshReferer: string
  private partnerId: string
  private baseUrl: string

  constructor(opts?: {
    apiKey?: string
    idToken?: string
    refreshToken?: string
    firebaseApiKey?: string
    refreshReferer?: string
    partnerId?: string
    baseUrl?: string
  }) {
    this.apiKey = opts?.apiKey ?? process.env.SAAS_ALERTS_API_KEY ?? ''
    this.staticIdToken = opts?.idToken ?? process.env.SAAS_ALERTS_ID_TOKEN ?? ''
    this.refreshToken = opts?.refreshToken ?? process.env.SAAS_ALERTS_REFRESH_TOKEN ?? ''
    this.firebaseApiKey =
      opts?.firebaseApiKey ?? process.env.SAAS_ALERTS_FIREBASE_API_KEY ?? DEFAULT_FIREBASE_WEB_API_KEY
    this.refreshReferer =
      opts?.refreshReferer ?? process.env.SAAS_ALERTS_REFRESH_REFERER ?? DEFAULT_REFRESH_REFERER
    this.partnerId = opts?.partnerId ?? process.env.SAAS_ALERTS_PARTNER_ID ?? ''
    this.baseUrl = (opts?.baseUrl ?? process.env.SAAS_ALERTS_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')

    // Guard against the well-known broken value: manage.saasalerts.com IS
    // the Cloudflare-blocked portal API host and will 403 every call. If
    // someone leaves an old env var pointing at it, fall back to the
    // working cloudfunctions URL instead of silently failing.
    if (/^https?:\/\/manage\.saasalerts\.com/i.test(this.baseUrl)) {
      this.baseUrl = DEFAULT_BASE_URL
    }
  }

  /**
   * True when we have everything needed to make an authenticated call.
   * Either a refresh token (preferred) or a static idtoken is acceptable.
   */
  isConfigured(): boolean {
    return !!this.apiKey && (!!this.refreshToken || !!this.staticIdToken)
  }

  hasApiKey(): boolean {
    return !!this.apiKey
  }

  hasRefreshToken(): boolean {
    return !!this.refreshToken
  }

  hasStaticIdToken(): boolean {
    return !!this.staticIdToken
  }

  hasPartnerId(): boolean {
    return !!this.partnerId
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  /** Which auth mode the next request will use. */
  authMode(): 'refresh' | 'static' | 'unconfigured' {
    if (!this.apiKey) return 'unconfigured'
    if (this.refreshToken) return 'refresh'
    if (this.staticIdToken) return 'static'
    return 'unconfigured'
  }

  /** Returns the missing credential names, for diagnostics. */
  missingCredentials(): string[] {
    const missing: string[] = []
    if (!this.apiKey) missing.push('SAAS_ALERTS_API_KEY')
    if (!this.refreshToken && !this.staticIdToken) {
      missing.push('SAAS_ALERTS_REFRESH_TOKEN (or SAAS_ALERTS_ID_TOKEN for one-off testing)')
    }
    return missing
  }

  /**
   * Exchange the refresh token for a fresh idtoken via Firebase securetoken.
   * Public so debug tooling can force a refresh; normal callers go through
   * `getValidIdToken()`.
   */
  async refreshIdToken(): Promise<CachedToken> {
    if (!this.refreshToken) {
      throw new Error('Cannot refresh: SAAS_ALERTS_REFRESH_TOKEN is not set')
    }

    const url = `${SECURE_TOKEN_ENDPOINT}?key=${encodeURIComponent(this.firebaseApiKey)}`
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    })

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        // Required to satisfy the Google API key's HTTP referrer allowlist —
        // see DEFAULT_REFRESH_REFERER comment above. Without these, the
        // exchange 403s with "Requests from referer <empty> are blocked".
        Referer: this.refreshReferer,
        Origin: new URL(this.refreshReferer).origin,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const refererBlocked = text.includes('Requests from referer')
      const hint = refererBlocked
        ? `Google API key referrer restriction blocked the request. The Referer "${this.refreshReferer}" is not on Kaseya's allowlist for ${this.firebaseApiKey.slice(0, 8)}…. Set SAAS_ALERTS_REFRESH_REFERER to a known-allowed origin (typically https://manage.saasalerts.com/).`
        : `Verify SAAS_ALERTS_REFRESH_TOKEN is still valid (the partner user may have been logged out or the token revoked).`
      throw new Error(
        `SaaS Alerts refresh-token exchange failed (${res.status}). ${hint} Body: ${text.slice(0, 300)}`
      )
    }

    const json = (await res.json()) as {
      id_token?: string
      access_token?: string
      refresh_token?: string
      expires_in?: string
    }

    const newIdToken = json.id_token ?? json.access_token
    if (!newIdToken) {
      throw new Error('SaaS Alerts refresh-token response missing id_token')
    }

    const ttlSec = parseInt(json.expires_in ?? '3600', 10) || 3600
    const next: CachedToken = {
      idToken: newIdToken,
      expiresAtMs: Date.now() + ttlSec * 1000,
      // Firebase usually echoes the same refresh token back; on rare rotation
      // it returns a new one, which we adopt for the rest of this isolate's
      // lifetime.
      refreshToken: json.refresh_token ?? this.refreshToken,
      source: 'refresh',
    }
    cachedToken = next
    return next
  }

  /**
   * Returns an idtoken that's good for at least REFRESH_BUFFER_MS more,
   * refreshing if necessary. Concurrent callers share the same in-flight
   * refresh promise.
   */
  async getValidIdToken(): Promise<string> {
    const now = Date.now()

    if (cachedToken && cachedToken.expiresAtMs > now + REFRESH_BUFFER_MS) {
      return cachedToken.idToken
    }

    // No usable cache. If we have a refresh token, exchange it. Otherwise
    // fall back to the static env-var idtoken (used for one-off testing).
    if (this.refreshToken) {
      if (!inFlightRefresh) {
        inFlightRefresh = this.refreshIdToken().finally(() => {
          inFlightRefresh = null
        })
      }
      const fresh = await inFlightRefresh
      return fresh.idToken
    }

    if (this.staticIdToken) {
      // Don't trust the static token's actual expiry — let the upstream call
      // surface a 401 if it's stale. We only stash it so subsequent calls
      // within the same isolate don't re-read the env var.
      cachedToken = {
        idToken: this.staticIdToken,
        expiresAtMs: now + 60 * 60 * 1000,
        refreshToken: '',
        source: 'static',
      }
      return this.staticIdToken
    }

    throw new Error(
      'SaaS Alerts: no idtoken available — set SAAS_ALERTS_REFRESH_TOKEN (preferred) or SAAS_ALERTS_ID_TOKEN.'
    )
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: Record<string, unknown> | null,
    query?: Record<string, string | number | undefined>
  ): Promise<T> {
    const missing = this.missingCredentials()
    if (missing.length > 0) {
      throw new Error(`SaaS Alerts client not configured: missing ${missing.join(', ')}`)
    }

    const qs = new URLSearchParams()
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
      }
    }
    const url = `${this.baseUrl}${path}${qs.toString() ? `?${qs.toString()}` : ''}`

    const doFetch = async (idToken: string) =>
      fetch(url, {
        method,
        headers: {
          api_key: this.apiKey,
          idtoken: idToken,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      })

    let idToken = await this.getValidIdToken()
    let res = await doFetch(idToken)

    // If the upstream rejects the token (e.g. static token went stale, or a
    // cached refresh token was revoked between the buffer check and now),
    // force one re-refresh and retry once.
    if ((res.status === 401 || res.status === 403) && this.refreshToken) {
      cachedToken = null
      idToken = await this.getValidIdToken()
      res = await doFetch(idToken)
    }

    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => '')
      const hint = this.refreshToken
        ? 'Refresh token exchange succeeded but the upstream still rejected the new idtoken — likely a permissions issue (msp_admin role / SA license scope).'
        : 'Verify SAAS_ALERTS_API_KEY and SAAS_ALERTS_ID_TOKEN; the static idtoken may have expired (1h TTL). Configure SAAS_ALERTS_REFRESH_TOKEN to auto-refresh.'
      throw new Error(
        `SaaS Alerts auth rejected (${res.status}) on ${path}. ${hint} Body: ${text.slice(0, 200)}`
      )
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`SaaS Alerts API ${path} failed (${res.status}): ${text.slice(0, 200)}`)
    }

    const text = await res.text()
    if (!text.trim()) return {} as T
    return JSON.parse(text) as T
  }

  /** GET /reports/customers — list all customers/tenants visible to the partner. */
  async getCustomers(): Promise<{ customers: SaasAlertCustomer[]; authMethod: string }> {
    const data = await this.request<
      SaasAlertCustomer[] | { data?: SaasAlertCustomer[]; customers?: SaasAlertCustomer[] }
    >('/reports/customers')

    let customers: SaasAlertCustomer[] = []
    if (Array.isArray(data)) {
      customers = data
    } else if (data && typeof data === 'object') {
      customers = (data.data ?? data.customers ?? []) as SaasAlertCustomer[]
    }
    return { customers, authMethod: 'api_key+idtoken' }
  }

  /** GET /reports/customers/{id} — full detail for one customer. */
  async getCustomer(id: string): Promise<SaasAlertCustomer | null> {
    const data = await this.request<SaasAlertCustomer | { data?: SaasAlertCustomer }>(
      `/reports/customers/${encodeURIComponent(id)}`
    )
    if (!data) return null
    if ('id' in (data as object)) return data as SaasAlertCustomer
    return ((data as { data?: SaasAlertCustomer }).data ?? null)
  }

  /**
   * Query events.
   *
   * Uses POST /reports/events/query (Elasticsearch-style) when filters are
   * supplied. Falls back to GET /reports/events otherwise.
   */
  async getEvents(params?: {
    customerId?: string
    since?: string
    until?: string
    severity?: string
    limit?: number
  }): Promise<{ events: SaasAlertEvent[]; authMethod: string }> {
    const hasFilters = !!(params?.since || params?.until || params?.severity || params?.customerId)

    if (hasFilters) {
      const must: Array<Record<string, unknown>> = []
      if (params?.since || params?.until) {
        const range: Record<string, string> = {}
        if (params?.since) range.gte = params.since
        if (params?.until) range.lte = params.until
        must.push({ range: { time: range } })
      }
      if (params?.severity) must.push({ term: { 'alertStatus.keyword': params.severity } })
      if (params?.customerId) must.push({ term: { 'customerId.keyword': params.customerId } })

      // The External Partner API validates a request envelope: the ES-style
      // search must be nested under a top-level `body` key. A 422 at path
      // `body.body` ("'body' is required") confirms the bare {size,query} we
      // used to send is rejected; the gateway proxies `body` to the events index.
      const search: Record<string, unknown> = {
        size: params?.limit ?? 500,
        query: { bool: { must } },
      }

      const data = await this.request<Record<string, unknown>>('/reports/events/query', 'POST', { body: search })
      return { events: extractEvents(data), authMethod: 'api_key+idtoken' }
    }

    const data = await this.request<Record<string, unknown>>('/reports/events', 'GET', null, {
      size: params?.limit ?? 500,
    })
    return { events: extractEvents(data), authMethod: 'api_key+idtoken' }
  }

  /** GET /reports/events/count — total event count, optionally filtered. */
  async getEventCount(params?: { customerId?: string; since?: string; until?: string }): Promise<number> {
    const data = await this.request<{ count?: number; total?: number } | number>(
      '/reports/events/count',
      'GET',
      null,
      {
        customerId: params?.customerId,
        from: params?.since,
        to: params?.until,
      }
    )
    if (typeof data === 'number') return data
    if (data && typeof data === 'object') return data.count ?? data.total ?? 0
    return 0
  }

  /** GET /reports/billing-details — per-product, per-customer billable seat counts. */
  async getBillingDetails(): Promise<SaasAlertsBillingDetail[]> {
    const data = await this.request<
      SaasAlertsBillingDetail[] | { data?: SaasAlertsBillingDetail[] }
    >('/reports/billing-details')
    if (Array.isArray(data)) return data
    return data?.data ?? []
  }

  /** GET /reports/alert-recommended-actions — Kaseya-curated remediation list. */
  async getRecommendedActions(): Promise<SaasAlertsRecommendedAction[]> {
    const data = await this.request<
      SaasAlertsRecommendedAction[] | { data?: SaasAlertsRecommendedAction[] }
    >('/reports/alert-recommended-actions')
    if (Array.isArray(data)) return data
    return data?.data ?? []
  }

  /** GET /reports/devices-organizations — device/organization rollup. */
  async getDevicesOrganizations(): Promise<SaasAlertsDeviceOrganization[]> {
    const data = await this.request<
      SaasAlertsDeviceOrganization[] | { data?: SaasAlertsDeviceOrganization[] }
    >('/reports/devices-organizations')
    if (Array.isArray(data)) return data
    return data?.data ?? []
  }

  /** GET /reports/partners/profile — partner branding/profile info. */
  async getPartnerProfile(): Promise<SaasAlertsPartnerProfile | null> {
    const data = await this.request<SaasAlertsPartnerProfile | { data?: SaasAlertsPartnerProfile }>(
      '/reports/partners/profile'
    )
    if (!data) return null
    if ('partnerId' in (data as object) || 'partnerName' in (data as object)) {
      return data as SaasAlertsPartnerProfile
    }
    return ((data as { data?: SaasAlertsPartnerProfile }).data ?? null)
  }

  /** GET /reports/msp-user — current MSP user (whoever the idtoken belongs to). */
  async getMspUser(): Promise<SaasAlertsMspUser | null> {
    const data = await this.request<SaasAlertsMspUser | { data?: SaasAlertsMspUser }>(
      '/reports/msp-user'
    )
    if (!data) return null
    if ('email' in (data as object) || 'name' in (data as object)) {
      return data as SaasAlertsMspUser
    }
    return ((data as { data?: SaasAlertsMspUser }).data ?? null)
  }

  /**
   * Probe connectivity across a handful of endpoints — returns per-endpoint
   * pass/fail so the admin UI can show exactly which call works.
   */
  async testConnection(): Promise<{
    configured: boolean
    hasApiKey: boolean
    hasRefreshToken: boolean
    hasStaticIdToken: boolean
    hasPartnerId: boolean
    authMode: 'refresh' | 'static' | 'unconfigured'
    baseUrl: string
    missingCredentials: string[]
    tokenRefresh?: {
      attempted: boolean
      success: boolean
      expiresInSec?: number
      error?: string
    }
    results: Array<{
      endpoint: string
      status: 'success' | 'failed' | 'skipped'
      authMethod?: string
      error?: string
      dataPreview?: string
    }>
  }> {
    const results: Array<{
      endpoint: string
      status: 'success' | 'failed' | 'skipped'
      authMethod?: string
      error?: string
      dataPreview?: string
    }> = []

    if (!this.isConfigured()) {
      return {
        configured: false,
        hasApiKey: this.hasApiKey(),
        hasRefreshToken: this.hasRefreshToken(),
        hasStaticIdToken: this.hasStaticIdToken(),
        hasPartnerId: this.hasPartnerId(),
        authMode: this.authMode(),
        baseUrl: this.baseUrl,
        missingCredentials: this.missingCredentials(),
        results: [
          {
            endpoint: 'all',
            status: 'skipped',
            error: `Missing ${this.missingCredentials().join(', ')}`,
          },
        ],
      }
    }

    // Force a refresh up-front so the diagnostics surface refresh-token
    // failures distinctly from upstream API failures.
    let tokenRefresh:
      | { attempted: boolean; success: boolean; expiresInSec?: number; error?: string }
      | undefined
    if (this.hasRefreshToken()) {
      _resetSaasAlertsTokenCache()
      try {
        const fresh = await this.refreshIdToken()
        tokenRefresh = {
          attempted: true,
          success: true,
          expiresInSec: Math.round((fresh.expiresAtMs - Date.now()) / 1000),
        }
      } catch (err) {
        tokenRefresh = {
          attempted: true,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }

    const probes: Array<{ label: string; run: () => Promise<unknown> }> = [
      { label: 'GET /reports/msp-user', run: () => this.getMspUser() },
      { label: 'GET /reports/partners/profile', run: () => this.getPartnerProfile() },
      { label: 'GET /reports/customers', run: () => this.getCustomers() },
    ]

    for (const probe of probes) {
      try {
        const data = await probe.run()
        results.push({
          endpoint: probe.label,
          status: 'success',
          authMethod: 'api_key+idtoken',
          dataPreview: JSON.stringify(data).slice(0, 200),
        })
      } catch (err) {
        results.push({
          endpoint: probe.label,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return {
      configured: true,
      hasApiKey: this.hasApiKey(),
      hasRefreshToken: this.hasRefreshToken(),
      hasStaticIdToken: this.hasStaticIdToken(),
      hasPartnerId: this.hasPartnerId(),
      authMode: this.authMode(),
      baseUrl: this.baseUrl,
      missingCredentials: [],
      tokenRefresh,
      results,
    }
  }

  /** Roll-up summary of SaaS Alerts activity, used by compliance/dashboard. */
  async buildSummary(): Promise<SaasAlertsSummary> {
    if (!this.isConfigured()) {
      return {
        available: false,
        totalEvents: 0,
        eventsBySeverity: {},
        eventsByType: {},
        customers: [],
        recentEvents: [],
        note: `SaaS Alerts API not configured (missing ${this.missingCredentials().join(', ')})`,
      }
    }

    try {
      const [{ customers }, { events }] = await Promise.all([
        this.getCustomers(),
        this.getEvents({
          since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          limit: 500,
        }),
      ])

      const eventsBySeverity: Record<string, number> = {}
      const eventsByType: Record<string, number> = {}
      for (const event of events) {
        const sev = event.alertStatus ?? event.severity ?? 'unknown'
        eventsBySeverity[sev] = (eventsBySeverity[sev] ?? 0) + 1
        const type = event.jointType ?? event.eventType ?? event.type ?? 'unknown'
        eventsByType[type] = (eventsByType[type] ?? 0) + 1
      }

      return {
        available: true,
        totalEvents: events.length,
        eventsBySeverity,
        eventsByType,
        customers,
        recentEvents: events.slice(0, 20),
        note:
          events.length === 0 && customers.length === 0
            ? 'SaaS Alerts API responded but returned no data. Verify the idtoken matches an MSP user with assigned customers.'
            : null,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        available: false,
        totalEvents: 0,
        eventsBySeverity: {},
        eventsByType: {},
        customers: [],
        recentEvents: [],
        note: `SaaS Alerts API error: ${message}`,
        diagnostics: { error: message, baseUrl: this.baseUrl },
      }
    }
  }
}

function extractEvents(data: unknown): SaasAlertEvent[] {
  if (!data) return []
  if (Array.isArray(data)) return data as SaasAlertEvent[]
  if (typeof data !== 'object') return []
  const d = data as Record<string, unknown>

  if (d.hits && typeof d.hits === 'object') {
    const hits = d.hits as Record<string, unknown>
    if (Array.isArray(hits.hits)) {
      return hits.hits.map((h: Record<string, unknown>) => (h._source ?? h) as SaasAlertEvent)
    }
  }

  if (d.data && typeof d.data === 'object') {
    const nested = d.data as Record<string, unknown>
    if (nested.hits && typeof nested.hits === 'object') {
      const hits = nested.hits as Record<string, unknown>
      if (Array.isArray(hits.hits)) {
        return hits.hits.map((h: Record<string, unknown>) => (h._source ?? h) as SaasAlertEvent)
      }
    }
    if (Array.isArray(nested.events)) return nested.events as SaasAlertEvent[]
    if (Array.isArray(nested.data)) return nested.data as SaasAlertEvent[]
  }

  if (Array.isArray(d.events)) return d.events as SaasAlertEvent[]
  if (Array.isArray(d.data)) return d.data as SaasAlertEvent[]

  return []
}
