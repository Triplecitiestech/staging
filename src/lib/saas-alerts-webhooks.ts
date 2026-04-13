/**
 * SaaS Alerts — Processed Event Webhooks API client.
 *
 * This is the "outgoing webhooks" management API, documented at
 *   https://app.swaggerhub.com/apis/SaaS_Alerts/webhooks
 * and served from Google Cloud Functions at
 *   https://us-central1-the-byway-248217.cloudfunctions.net/outgoingWebhookApi/api/v1
 *
 * It is a DIFFERENT host and auth surface from `manage.saasalerts.com/api`
 * (which is Cloudflare-blocked from server-to-server — see src/lib/saas-alerts.ts).
 * This client is NOT Cloudflare-blocked; the Cloud Functions host serves
 * the partner API directly.
 *
 * Auth: single header `api_key: <Webhooks API Key>`. The key comes from
 * manage.saasalerts.com > Settings > API > Webhook API > Show Api Key.
 * The same header satisfies all three declared security schemes in the
 * Swagger (`apiKey`, `whApiKey`, `x-api-key`). We always send `api_key`.
 *
 * Why this exists: the SaaS Alerts UI does NOT offer a field for the
 * inbound webhook URL. The URL and filters are registered via
 * `POST /subscriptions` on this API, and that's what this client does.
 */

const DEFAULT_BASE_URL = 'https://us-central1-the-byway-248217.cloudfunctions.net/outgoingWebhookApi/api/v1'

export type SaasAlertsAlertStatus = 'critical' | 'medium' | 'low'

export interface SaasAlertsAlertSettings {
  /** Explicit recipients list. Max 20. Empty / absent = all partner users. */
  recipients?: string[]
}

export interface SaasAlertsSubscriptionCreateParams {
  /** Must be HTTPS, no IP, no fragment, no userinfo. Max 256 chars. */
  url: string
  /** Optional shared token, ≤ 128 chars — SaaS Alerts echoes this back on every delivery. */
  token?: string
  /** Default true. */
  enabled?: boolean
  /** Filter by severity. Mutually exclusive with eventTypes. Omit for "all". */
  alertStatuses?: SaasAlertsAlertStatus[]
  /** Filter by event type (e.g. `login.failure`). Mutually exclusive with alertStatuses. */
  eventTypes?: string[]
  /** Restrict to a list of customer/organization IDs. Max 50. */
  customerIds?: string[]
  /** ISO / locale-formatted expiration. Omit for no expiration. */
  expiration?: string
  /** Optional client-supplied UUID-ish channelId. Omit to let the API generate one. */
  channelId?: string
  /** Control which users are alerted on delivery failures. */
  alertSettings?: SaasAlertsAlertSettings
  /** Skip suppressed events (PowerFilters). */
  skipSuppressed?: boolean
}

export type SaasAlertsSubscriptionUpdateParams = Partial<SaasAlertsSubscriptionCreateParams>

export interface SaasAlertsSubscription {
  channelId: string
  partnerId: string
  url: string
  token?: string
  enabled?: boolean
  alertStatuses?: SaasAlertsAlertStatus[]
  eventTypes?: string[]
  customerIds?: string[]
  expiration?: string
  created: string
  disabledTime?: string
  alertSettings?: SaasAlertsAlertSettings
  skipSuppressed?: boolean
  failedAttempts?: Array<{ message: string; time: unknown }>
  postponeTill?: string
}

export interface SaasAlertsTestEventParams {
  alertStatus?: SaasAlertsAlertStatus
  jointType?: string
  partnerId?: string
}

export class SaasAlertsWebhooksApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
    public url: string,
  ) {
    super(message)
    this.name = 'SaasAlertsWebhooksApiError'
  }
}

export class SaasAlertsWebhooksClient {
  private apiKey: string
  private baseUrl: string

  constructor(opts: { apiKey?: string; baseUrl?: string } = {}) {
    this.apiKey =
      opts.apiKey ??
      // Prefer a dedicated env var so ops can keep the reporting-API key (which is Cloudflare-
      // blocked) separate from the Webhooks API key.
      process.env.SAAS_ALERTS_WEBHOOKS_API_KEY ??
      process.env.SAAS_ALERTS_API_KEY ??
      ''
    this.baseUrl = (opts.baseUrl ?? process.env.SAAS_ALERTS_WEBHOOKS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) {
      throw new SaasAlertsWebhooksApiError(
        'SaaS Alerts Webhooks API key is not configured (SAAS_ALERTS_WEBHOOKS_API_KEY).',
        0,
        '',
        `${this.baseUrl}${path}`,
      )
    }
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      method,
      headers: {
        // The API accepts api_key (apiKey / whApiKey schemes) as well as x-api-key.
        // We send the same value in both to cover all three declared schemes.
        api_key: this.apiKey,
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })

    const text = await res.text().catch(() => '')
    if (!res.ok) {
      throw new SaasAlertsWebhooksApiError(
        `SaaS Alerts Webhooks ${method} ${path} failed with ${res.status}: ${text.slice(0, 500)}`,
        res.status,
        text,
        url,
      )
    }
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      return text as unknown as T
    }
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  async createSubscription(params: SaasAlertsSubscriptionCreateParams): Promise<SaasAlertsSubscription> {
    validateCreateParams(params)
    return this.request<SaasAlertsSubscription>('POST', '/subscriptions', params)
  }

  async listSubscriptions(): Promise<SaasAlertsSubscription[]> {
    return this.request<SaasAlertsSubscription[]>('GET', '/subscriptions')
  }

  async listDisabledSubscriptions(): Promise<SaasAlertsSubscription[]> {
    return this.request<SaasAlertsSubscription[]>('GET', '/subscriptions/disabled')
  }

  async updateSubscription(channelId: string, params: SaasAlertsSubscriptionUpdateParams): Promise<SaasAlertsSubscription> {
    return this.request<SaasAlertsSubscription>('PATCH', `/subscriptions/${encodeURIComponent(channelId)}`, params)
  }

  async deleteSubscription(channelId: string): Promise<SaasAlertsSubscription> {
    return this.request<SaasAlertsSubscription>('DELETE', `/subscriptions/${encodeURIComponent(channelId)}`)
  }

  // ---------------------------------------------------------------------------
  // Misc / test
  // ---------------------------------------------------------------------------

  async sendTestEvent(params: SaasAlertsTestEventParams = {}): Promise<unknown> {
    return this.request<unknown>('POST', '/misc/sendTestEvent', params)
  }

  async listCustomers(): Promise<Array<{ id: string; name: string }>> {
    return this.request<Array<{ id: string; name: string }>>('GET', '/misc/customers')
  }

  async listAlertTypes(): Promise<string[]> {
    return this.request<string[]>('GET', '/misc/alertTypes')
  }

  async listQueue(): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/queue')
  }

  // ---------------------------------------------------------------------------
  // Domains (also manageable in the UI)
  // ---------------------------------------------------------------------------

  async listDomains(): Promise<Array<{ id: string; domain: string; partnerId: string; created: unknown }>> {
    return this.request('GET', '/domains')
  }
}

// ---------------------------------------------------------------------------
// Validation — enforced client-side so ops see the exact rule the API will.
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_URL_REGEX =
  /^https:\/\/(?![0-9.]+(?::\d{1,5})?(?:\/|$))(?!.*@)(?!.*#)(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:\/[^\s#]*)?$/

function validateCreateParams(p: SaasAlertsSubscriptionCreateParams): void {
  if (!p.url) throw new Error('SaaS Alerts subscription: `url` is required.')
  if (p.url.length > 256) throw new Error('SaaS Alerts subscription: `url` must be ≤ 256 chars.')
  if (!SUBSCRIPTION_URL_REGEX.test(p.url)) {
    throw new Error(
      'SaaS Alerts subscription: `url` must be HTTPS with a valid hostname, no IP literal, no userinfo, no fragment.',
    )
  }
  if (p.token && p.token.length > 128) {
    throw new Error('SaaS Alerts subscription: `token` must be ≤ 128 chars.')
  }
  if (p.alertStatuses?.length && p.eventTypes?.length) {
    throw new Error('SaaS Alerts subscription: `alertStatuses` and `eventTypes` are mutually exclusive.')
  }
  if (p.customerIds && p.customerIds.length > 50) {
    throw new Error('SaaS Alerts subscription: `customerIds` max 50.')
  }
  if (p.alertSettings?.recipients && p.alertSettings.recipients.length > 20) {
    throw new Error('SaaS Alerts subscription: `alertSettings.recipients` max 20.')
  }
}
