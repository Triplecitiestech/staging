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
 *     Obtain by logging in to manage.saasalerts.com and inspecting the
 *     `idtoken` cookie/header the SPA uses, or ask Kaseya support to
 *     provision a long-lived partner service token.
 *
 * Required env vars:
 *   SAAS_ALERTS_API_KEY      — `api_key` header value
 *   SAAS_ALERTS_ID_TOKEN     — `idtoken` header value
 *
 * Optional env vars:
 *   SAAS_ALERTS_API_URL      — base URL override (defaults to production
 *                              cloudfunctions; alternate envs are qa/dev,
 *                              see SaasAlertsApiEnvironment below)
 *   SAAS_ALERTS_PARTNER_ID   — used to scope filtered event queries;
 *                              NOT required for auth.
 */

const DEFAULT_BASE_URL = 'https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1'

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

export class SaasAlertsClient {
  private apiKey: string
  private idToken: string
  private partnerId: string
  private baseUrl: string

  constructor(opts?: { apiKey?: string; idToken?: string; partnerId?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.SAAS_ALERTS_API_KEY ?? ''
    this.idToken = opts?.idToken ?? process.env.SAAS_ALERTS_ID_TOKEN ?? ''
    this.partnerId = opts?.partnerId ?? process.env.SAAS_ALERTS_PARTNER_ID ?? ''
    this.baseUrl = (opts?.baseUrl ?? process.env.SAAS_ALERTS_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  }

  /** True only when BOTH the api key and the id token are set. */
  isConfigured(): boolean {
    return !!this.apiKey && !!this.idToken
  }

  hasApiKey(): boolean {
    return !!this.apiKey
  }

  hasIdToken(): boolean {
    return !!this.idToken
  }

  hasPartnerId(): boolean {
    return !!this.partnerId
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  /** Returns the missing credential names, for diagnostics. */
  missingCredentials(): string[] {
    const missing: string[] = []
    if (!this.apiKey) missing.push('SAAS_ALERTS_API_KEY')
    if (!this.idToken) missing.push('SAAS_ALERTS_ID_TOKEN')
    return missing
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

    const res = await fetch(url, {
      method,
      headers: {
        api_key: this.apiKey,
        idtoken: this.idToken,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    })

    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `SaaS Alerts auth rejected (${res.status}) on ${path}. ` +
        `Verify SAAS_ALERTS_API_KEY and SAAS_ALERTS_ID_TOKEN. Body: ${text.slice(0, 200)}`
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

      const body: Record<string, unknown> = {
        size: params?.limit ?? 500,
        query: { bool: { must } },
      }

      const data = await this.request<Record<string, unknown>>('/reports/events/query', 'POST', body)
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
    hasIdToken: boolean
    hasPartnerId: boolean
    baseUrl: string
    missingCredentials: string[]
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
        hasIdToken: this.hasIdToken(),
        hasPartnerId: this.hasPartnerId(),
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
      hasIdToken: this.hasIdToken(),
      hasPartnerId: this.hasPartnerId(),
      baseUrl: this.baseUrl,
      missingCredentials: [],
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
