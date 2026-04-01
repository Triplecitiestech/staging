/**
 * SaaS Alerts API Client
 *
 * SaaS security monitoring platform with three modules:
 *   - Respond: Automated threat response (account lockdown, session termination)
 *   - Unify: Device-to-identity binding (ensures SaaS access from managed devices)
 *   - Fortify: Microsoft 365 security policy enforcement and Secure Score management
 *
 * API: 8 methods focused on event extraction
 * Portal: manage.saasalerts.com
 *
 * Required env vars:
 *   SAAS_ALERTS_API_KEY  — API key from manage.saasalerts.com > Settings > API
 *   SAAS_ALERTS_API_URL  — Base URL (defaults to https://manage.saasalerts.com/api)
 */

export interface SaasAlertEvent {
  eventId: string
  time: string
  user: { id?: string; name?: string }
  ip: string
  location: {
    country?: string
    region?: string
    city?: string
    lat?: number
    lon?: number
  } | null
  alertStatus: string  // low, medium, high, critical
  jointType: string    // e.g. login.failure, suspicious_login
  jointDesc: string
  jointDescAdditional: string | null
}

export interface SaasAlertCustomer {
  id: string
  name: string
}

export interface SaasAlertsSummary {
  available: boolean
  totalEvents: number
  eventsBySeverity: Record<string, number>
  eventsByType: Record<string, number>
  customers: SaasAlertCustomer[]
  recentEvents: SaasAlertEvent[]
  note: string | null
}

export class SaasAlertsClient {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.SAAS_ALERTS_API_KEY ?? ''
    this.baseUrl = (process.env.SAAS_ALERTS_API_URL ?? 'https://manage.saasalerts.com/api').replace(/\/$/, '')
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  /**
   * Make an API request. SaaS Alerts API auth format is not fully public,
   * so we try multiple common patterns used by Kaseya products.
   */
  private async request<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${path}`

    // Try multiple auth header patterns (exact format not publicly documented)
    const headerPatterns: Array<Record<string, string>> = [
      { 'apikey': this.apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      { 'x-api-key': this.apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      { 'Authorization': this.apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    ]

    let lastError: Error | null = null

    for (const headers of headerPatterns) {
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(30_000),
        })

        if (res.status === 401 || res.status === 403) {
          continue // Try next auth pattern
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`SaaS Alerts API ${path} failed (${res.status}): ${text.substring(0, 200)}`)
        }

        const text = await res.text()
        if (!text || text.trim().length === 0) return {} as T
        return JSON.parse(text) as T
      } catch (err) {
        if (err instanceof Error && (err.message.includes('401') || err.message.includes('403'))) {
          lastError = err
          continue
        }
        throw err
      }
    }

    throw lastError ?? new Error('SaaS Alerts: All authentication methods failed')
  }

  /** List customers/tenants — tries multiple endpoint paths */
  async getCustomers(): Promise<SaasAlertCustomer[]> {
    // Try documented paths in order
    const paths = ['/reports/customers', '/customers', '/reports/tenants']
    for (const path of paths) {
      try {
        const data = await this.request<{ data?: SaasAlertCustomer[]; customers?: SaasAlertCustomer[] } | SaasAlertCustomer[]>(path)
        if (Array.isArray(data) && data.length > 0) return data
        const nested = (data as { data?: SaasAlertCustomer[]; customers?: SaasAlertCustomer[] })
        const result = nested?.data ?? nested?.customers ?? []
        if (result.length > 0) return result
      } catch {
        continue
      }
    }
    return []
  }

  /** Query events — uses documented /reports/ endpoints */
  async getEvents(params?: {
    customerId?: string
    since?: string  // ISO date
    until?: string  // ISO date
    severity?: string
    limit?: number
  }): Promise<SaasAlertEvent[]> {
    // Try POST /reports/event/query first (documented: posts JSON queries to data indexes)
    try {
      // Build Elasticsearch-style query body per API docs
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

      const data = await this.request<{
        data?: { events?: SaasAlertEvent[]; hits?: { hits?: Array<{ _source: SaasAlertEvent }> } }
        events?: SaasAlertEvent[]
        hits?: { hits?: Array<{ _source: SaasAlertEvent }> }
      }>('/reports/event/query', 'POST', body)

      // Handle various response shapes (direct events or Elasticsearch hits)
      if (data?.hits?.hits) return data.hits.hits.map((h) => h._source)
      if (data?.data?.hits?.hits) return data.data.hits.hits.map((h) => h._source)
      if (data?.data?.events) return data.data.events
      return data?.events ?? []
    } catch {
      // Fallback: try GET /reports/events
      try {
        const qs = new URLSearchParams()
        if (params?.since) qs.set('from', params.since)
        if (params?.until) qs.set('to', params.until)
        if (params?.limit) qs.set('size', String(params.limit))

        const data = await this.request<{ events?: SaasAlertEvent[] } | SaasAlertEvent[]>(
          `/reports/events?${qs.toString()}`
        )
        if (Array.isArray(data)) return data
        return (data as { events?: SaasAlertEvent[] }).events ?? []
      } catch {
        return []
      }
    }
  }

  /** Build summary of SaaS security events */
  async buildSummary(): Promise<SaasAlertsSummary> {
    if (!this.isConfigured()) {
      return { available: false, totalEvents: 0, eventsBySeverity: {}, eventsByType: {}, customers: [], recentEvents: [], note: 'SaaS Alerts API not configured' }
    }

    try {
      // Get customers
      const customers = await this.getCustomers()

      // Get recent events (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const events = await this.getEvents({ since: thirtyDaysAgo, limit: 500 })

      const eventsBySeverity: Record<string, number> = {}
      const eventsByType: Record<string, number> = {}

      for (const event of events) {
        const sev = event.alertStatus || 'unknown'
        eventsBySeverity[sev] = (eventsBySeverity[sev] ?? 0) + 1
        const type = event.jointType || 'unknown'
        eventsByType[type] = (eventsByType[type] ?? 0) + 1
      }

      return {
        available: true,
        totalEvents: events.length,
        eventsBySeverity,
        eventsByType,
        customers,
        recentEvents: events.slice(0, 20),
        note: events.length === 0 && customers.length === 0
          ? 'SaaS Alerts API responded but returned no data. Verify API key permissions.'
          : null,
      }
    } catch (err) {
      return {
        available: false,
        totalEvents: 0,
        eventsBySeverity: {},
        eventsByType: {},
        customers: [],
        recentEvents: [],
        note: `SaaS Alerts API error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }
}
