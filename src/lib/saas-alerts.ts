/**
 * SaaS Alerts API Client
 *
 * SaaS security monitoring platform (Kaseya) with three modules:
 *   - Respond: Automated threat response (account lockdown, session termination)
 *   - Unify: Device-to-identity binding (ensures SaaS access from managed devices)
 *   - Fortify: Microsoft 365 security policy enforcement and Secure Score management
 *
 * Auth: API Key + Partner ID headers
 * Portal: manage.saasalerts.com
 * Swagger: https://app.swaggerhub.com/apis/SaaS_Alerts/functions/0.18.0
 *
 * Required env vars:
 *   SAAS_ALERTS_API_KEY     — API key from manage.saasalerts.com > Settings > API
 *   SAAS_ALERTS_PARTNER_ID  — Partner ID from same page
 *   SAAS_ALERTS_API_URL     — Base URL (defaults to https://manage.saasalerts.com/api)
 */

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
  alertStatus?: string  // low, medium, high, critical
  severity?: string
  jointType?: string    // e.g. login.failure, suspicious_login
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

export interface SaasAlertsSummary {
  available: boolean
  totalEvents: number
  eventsBySeverity: Record<string, number>
  eventsByType: Record<string, number>
  customers: SaasAlertCustomer[]
  recentEvents: SaasAlertEvent[]
  note: string | null
  authMethod?: string
  diagnostics?: Record<string, unknown>
}

export class SaasAlertsClient {
  private apiKey: string
  private partnerId: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.SAAS_ALERTS_API_KEY ?? ''
    this.partnerId = process.env.SAAS_ALERTS_PARTNER_ID ?? ''
    // Ensure base URL always ends with /api
    let url = (process.env.SAAS_ALERTS_API_URL ?? 'https://manage.saasalerts.com/api').replace(/\/$/, '')
    if (!url.endsWith('/api')) url += '/api'
    this.baseUrl = url
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  hasPartnerId(): boolean {
    return !!this.partnerId
  }

  /**
   * Make an authenticated API request.
   * Tries auth patterns in priority order:
   * 1. apikey + partnerid headers (most likely for Kaseya products)
   * 2. Authorization: Bearer + partnerid
   * 3. x-api-key header
   * 4. apikey header only (legacy fallback)
   */
  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ): Promise<{ data: T; authMethod: string }> {
    const url = `${this.baseUrl}${path}`

    const headerPatterns: Array<{ headers: Record<string, string>; label: string }> = []

    // If Partner ID is available, try it first (most likely to work)
    if (this.partnerId) {
      headerPatterns.push({
        label: 'apikey+partnerid',
        headers: {
          'apikey': this.apiKey,
          'partnerid': this.partnerId,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })
      headerPatterns.push({
        label: 'bearer+partnerid',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'partnerid': this.partnerId,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })
      headerPatterns.push({
        label: 'x-api-key+x-partner-id',
        headers: {
          'x-api-key': this.apiKey,
          'x-partner-id': this.partnerId,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })
    }

    // Fallbacks without Partner ID
    headerPatterns.push({
      label: 'apikey-only',
      headers: {
        'apikey': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    })
    headerPatterns.push({
      label: 'bearer-only',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    })

    let lastError: Error | null = null
    const triedMethods: string[] = []

    for (const { headers, label } of headerPatterns) {
      triedMethods.push(label)
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(30_000),
        })

        // Auth failure — try next pattern
        if (res.status === 401 || res.status === 403) {
          const text = await res.text().catch(() => '')
          console.log(`[saas-alerts] ${method} ${path} auth "${label}" → ${res.status}: ${text.substring(0, 100)}`)
          lastError = new Error(`Auth failed (${label}): ${res.status}`)
          continue
        }

        // Cloudflare block
        if (res.status === 503 || (res.headers.get('server')?.includes('cloudflare') && !res.ok)) {
          console.log(`[saas-alerts] ${method} ${path} blocked by Cloudflare (${res.status})`)
          throw new Error(`Cloudflare blocked the request (${res.status}). SaaS Alerts API may not support server-to-server calls.`)
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`SaaS Alerts API ${path} failed (${res.status}): ${text.substring(0, 200)}`)
        }

        const text = await res.text()
        console.log(`[saas-alerts] ${method} ${path} (auth: ${label}) → ${res.status}, body length: ${text.length}`)
        if (!text || text.trim().length === 0) return { data: {} as T, authMethod: label }
        return { data: JSON.parse(text) as T, authMethod: label }
      } catch (err) {
        if (err instanceof Error && (err.message.includes('401') || err.message.includes('403'))) {
          lastError = err
          continue
        }
        // Non-auth error — don't try other patterns
        throw err
      }
    }

    throw new Error(
      `SaaS Alerts: All auth methods failed (tried: ${triedMethods.join(', ')}). ` +
      `Last error: ${lastError?.message ?? 'unknown'}`
    )
  }

  /** List customers/tenants */
  async getCustomers(): Promise<{ customers: SaasAlertCustomer[]; authMethod: string }> {
    const paths = ['/reports/customers', '/customers', '/organizations', '/reports/tenants']
    for (const path of paths) {
      try {
        const { data, authMethod } = await this.request<
          | SaasAlertCustomer[]
          | { data?: SaasAlertCustomer[]; customers?: SaasAlertCustomer[]; organizations?: SaasAlertCustomer[] }
        >(path)

        if (Array.isArray(data) && data.length > 0) return { customers: data, authMethod }
        const nested = data as Record<string, unknown>
        const result = (nested?.data ?? nested?.customers ?? nested?.organizations ?? []) as SaasAlertCustomer[]
        if (result.length > 0) return { customers: result, authMethod }
      } catch (err) {
        // If Cloudflare blocked, stop trying other paths
        if (err instanceof Error && err.message.includes('Cloudflare')) throw err
        continue
      }
    }
    return { customers: [], authMethod: 'none-worked' }
  }

  /** Query events */
  async getEvents(params?: {
    customerId?: string
    since?: string
    until?: string
    severity?: string
    limit?: number
  }): Promise<{ events: SaasAlertEvent[]; authMethod: string }> {
    // Try POST query first (Elasticsearch-style)
    try {
      const must: Array<Record<string, unknown>> = []
      if (params?.since || params?.until) {
        const range: Record<string, string> = {}
        if (params?.since) range.gte = params.since
        if (params?.until) range.lte = params.until
        must.push({ range: { time: range } })
      }
      if (params?.severity) {
        must.push({ term: { 'alertStatus.keyword': params.severity } })
      }
      if (params?.customerId) {
        must.push({ term: { 'customerId.keyword': params.customerId } })
      }

      const body: Record<string, unknown> = {
        size: params?.limit ?? 500,
        ...(must.length > 0 ? { query: { bool: { must } } } : {}),
      }

      const { data, authMethod } = await this.request<Record<string, unknown>>('/reports/event/query', 'POST', body)

      const events = extractEvents(data)
      if (events.length > 0) return { events, authMethod }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cloudflare')) throw err
    }

    // Fallback: GET /reports/events
    try {
      const qs = new URLSearchParams()
      if (params?.since) qs.set('from', params.since)
      if (params?.until) qs.set('to', params.until)
      if (params?.limit) qs.set('size', String(params.limit))

      const { data, authMethod } = await this.request<Record<string, unknown>>(
        `/reports/events${qs.toString() ? '?' + qs.toString() : ''}`
      )

      return { events: extractEvents(data), authMethod }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cloudflare')) throw err
      return { events: [], authMethod: 'none-worked' }
    }
  }

  /** Test connectivity — returns diagnostic info without failing */
  async testConnection(): Promise<{
    configured: boolean
    hasPartnerId: boolean
    baseUrl: string
    results: Array<{ endpoint: string; status: string; authMethod?: string; error?: string; dataPreview?: string }>
  }> {
    const results: Array<{ endpoint: string; status: string; authMethod?: string; error?: string; dataPreview?: string }> = []

    const testEndpoints = [
      { path: '/reports/customers', label: 'List Customers' },
      { path: '/customers', label: 'Customers (alt)' },
      { path: '/organizations', label: 'Organizations' },
    ]

    for (const { path, label } of testEndpoints) {
      try {
        const { data, authMethod } = await this.request<unknown>(path)
        const preview = JSON.stringify(data).substring(0, 200)
        results.push({ endpoint: `${label} (${path})`, status: 'success', authMethod, dataPreview: preview })
      } catch (err) {
        results.push({
          endpoint: `${label} (${path})`,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return {
      configured: this.isConfigured(),
      hasPartnerId: this.hasPartnerId(),
      baseUrl: this.baseUrl,
      results,
    }
  }

  /** Build summary of SaaS security events */
  async buildSummary(): Promise<SaasAlertsSummary> {
    if (!this.isConfigured()) {
      return {
        available: false, totalEvents: 0, eventsBySeverity: {}, eventsByType: {},
        customers: [], recentEvents: [],
        note: 'SaaS Alerts API not configured (SAAS_ALERTS_API_KEY not set)',
      }
    }

    try {
      const { customers, authMethod: custAuth } = await this.getCustomers()

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { events, authMethod: evtAuth } = await this.getEvents({ since: thirtyDaysAgo, limit: 500 })

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
        authMethod: custAuth || evtAuth,
        note: events.length === 0 && customers.length === 0
          ? 'SaaS Alerts API responded but returned no data. Verify API key permissions and Partner ID.'
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
        diagnostics: { error: message, hasPartnerId: this.hasPartnerId(), baseUrl: this.baseUrl },
      }
    }
  }
}

/** Extract events from various API response shapes */
function extractEvents(data: unknown): SaasAlertEvent[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>

  // Direct array
  if (Array.isArray(d)) return d

  // Elasticsearch hits
  if (d.hits && typeof d.hits === 'object') {
    const hits = d.hits as Record<string, unknown>
    if (Array.isArray(hits.hits)) {
      return hits.hits.map((h: Record<string, unknown>) => (h._source ?? h) as SaasAlertEvent)
    }
  }

  // Nested data.hits
  if (d.data && typeof d.data === 'object') {
    const nested = d.data as Record<string, unknown>
    if (nested.hits && typeof nested.hits === 'object') {
      const hits = nested.hits as Record<string, unknown>
      if (Array.isArray(hits.hits)) {
        return hits.hits.map((h: Record<string, unknown>) => (h._source ?? h) as SaasAlertEvent)
      }
    }
    if (Array.isArray(nested.events)) return nested.events
  }

  // Direct events array
  if (Array.isArray(d.events)) return d.events
  if (Array.isArray(d.data)) return d.data

  return []
}
