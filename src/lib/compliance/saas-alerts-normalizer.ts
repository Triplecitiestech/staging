/**
 * SaaS Alerts Webhook Normalizer
 *
 * Converts inbound SaaS Alerts webhook payloads into a canonical event shape
 * and assigns each event a compliance signal type that feeds into the scoring
 * engine. Also handles the wrapper payload format (partner/customer/product
 * envelope with embedded `events` array) that SaaS Alerts sends as documented
 * at https://help.saasalerts.kaseya.com/help/Content/How-To/webhooks-api-documentation.htm
 *
 * Design notes / known unknowns (Kaseya has NOT documented these formally):
 *   - Payloads may be a single event, an array of events, or the wrapper object.
 *   - The `eventId` field is present on wrapper-embedded events but may be
 *     absent on raw event arrays — we fall back to deterministic hashing.
 *   - `alertStatus` values observed: "low" | "medium" | "high" | "critical".
 *     We also map numeric severity just in case.
 *   - `jointType` uses dotted notation like "login.failure", "alert.impossibletravel",
 *     "device.newdevice". We classify on prefix.
 */

import { createHash } from 'crypto'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SaasAlertsRawEvent {
  eventId?: string | number
  id?: string | number
  time?: string
  timestamp?: string
  user?: { id?: string; name?: string; email?: string } | string
  ip?: string
  sourceIp?: string
  location?: {
    country?: string
    region?: string
    city?: string
    lat?: number
    lon?: number
  } | null
  alertStatus?: string | number
  severity?: string | number
  jointType?: string
  eventType?: string
  type?: string
  jointDesc?: string
  jointDescAdditional?: string | null
  description?: string
  customerName?: string
  customerId?: string | number
  partnerId?: string | number
  productId?: string | number
  productName?: string
  [key: string]: unknown
}

export interface SaasAlertsWrapper {
  partner?: { id?: string | number; name?: string }
  customer?: { id?: string | number; name?: string }
  product?: { id?: string | number; name?: string }
  events?: SaasAlertsRawEvent[]
  // Optional verification token SaaS Alerts echoes back when configured
  token?: string
  // Some deployments echo a webhook secret in the body
  webhookToken?: string
}

/**
 * Compliance signal types derived from SaaS Alerts events. These feed
 * into the compliance scoring engine and SIEM-like dashboards.
 */
export type ComplianceSignalType =
  | 'suspicious_login'
  | 'failed_login'
  | 'impossible_travel'
  | 'new_device'
  | 'mfa_disabled'
  | 'risky_ip'
  | 'privilege_escalation'
  | 'password_change'
  | 'sharing_exposure'
  | 'account_compromise'
  | 'unusual_activity'
  | 'configuration_change'
  | 'policy_violation'
  | 'informational'
  | 'unknown'

export type ComplianceSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface NormalizedSaasAlertsEvent {
  /** Stable external ID suitable for unique-constraint dedup */
  externalId: string
  /** Source event type, lower-cased, dotted (e.g. "login.failure") */
  eventType: string
  severity: ComplianceSeverity
  signalType: ComplianceSignalType
  occurredAt: string
  partnerId: string | null
  customerId: string | null
  productId: string | null
  user: { id: string | null; name: string | null; email: string | null } | null
  ip: string | null
  location: SaasAlertsRawEvent['location'] | null
  description: string
  raw: SaasAlertsRawEvent
}

// -----------------------------------------------------------------------------
// Parsing helpers
// -----------------------------------------------------------------------------

/**
 * Extract a flat event list out of any shape SaaS Alerts might send.
 * Also extracts the optional outer-envelope verification token.
 *
 * Shapes observed/possible:
 *   { partner, customer, product, events: [...], token?: "..." }
 *   [ event, event, event ]
 *   event (single object with jointType/alertStatus)
 */
export function extractEventsAndContext(body: unknown): {
  events: SaasAlertsRawEvent[]
  partnerId: string | null
  customerId: string | null
  productId: string | null
  bodyToken: string | null
} {
  const empty = { events: [] as SaasAlertsRawEvent[], partnerId: null, customerId: null, productId: null, bodyToken: null }
  if (!body) return empty

  // Wrapper object with embedded events array
  if (typeof body === 'object' && !Array.isArray(body)) {
    const b = body as SaasAlertsWrapper & Record<string, unknown>
    if (Array.isArray(b.events)) {
      return {
        events: b.events,
        partnerId: b.partner?.id != null ? String(b.partner.id) : null,
        customerId: b.customer?.id != null ? String(b.customer.id) : null,
        productId: b.product?.id != null ? String(b.product.id) : null,
        bodyToken: typeof b.token === 'string' ? b.token : typeof b.webhookToken === 'string' ? b.webhookToken : null,
      }
    }
    // Single bare event
    return { ...empty, events: [b as SaasAlertsRawEvent] }
  }

  // Bare array of events
  if (Array.isArray(body)) return { ...empty, events: body as SaasAlertsRawEvent[] }

  return empty
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = typeof v === 'string' ? v : String(v)
  return s.length === 0 ? null : s
}

function toSeverity(raw: unknown): ComplianceSeverity {
  if (typeof raw === 'number') {
    if (raw >= 4) return 'critical'
    if (raw === 3) return 'high'
    if (raw === 2) return 'medium'
    return 'low'
  }
  const s = String(raw ?? '').toLowerCase().trim()
  if (s === 'critical' || s === 'crit' || s === 'severe') return 'critical'
  if (s === 'high' || s === 'h') return 'high'
  if (s === 'medium' || s === 'med' || s === 'm' || s === 'moderate') return 'medium'
  return 'low'
}

/**
 * Classify jointType / eventType strings into compliance signal types.
 * SaaS Alerts jointType examples (from Kaseya docs + observed events):
 *   login.success / login.failure
 *   alert.impossibletravel / alert.foreignlogin / alert.risky*
 *   device.newdevice / device.untrusted
 *   mfa.disabled / mfa.policychange
 *   user.passwordchange / user.roleassign
 *   sharing.external / sharing.anonymous
 *   policy.violation / config.change
 */
export function classifySignal(eventType: string, description: string): ComplianceSignalType {
  const t = (eventType || '').toLowerCase()
  const d = (description || '').toLowerCase()
  const s = `${t} ${d}`

  if (s.includes('impossibletravel') || s.includes('impossible travel') || s.includes('impossible_travel')) return 'impossible_travel'
  if (s.includes('newdevice') || s.includes('new device') || s.includes('unrecognized device')) return 'new_device'
  if (s.includes('mfa') && (s.includes('disable') || s.includes('off') || s.includes('bypass'))) return 'mfa_disabled'
  if (s.includes('risky') || s.includes('suspicious') || s.includes('foreignlogin') || s.includes('anonymous ip') || s.includes('tor')) return 'suspicious_login'
  if (t.startsWith('login.failure') || s.includes('authentication failure') || s.includes('login failed')) return 'failed_login'
  if (s.includes('privilege') || s.includes('role') && (s.includes('assign') || s.includes('add') || s.includes('grant'))) return 'privilege_escalation'
  if (s.includes('compromise') || s.includes('takeover') || s.includes('hijack')) return 'account_compromise'
  if (s.includes('password') && (s.includes('change') || s.includes('reset'))) return 'password_change'
  if (s.includes('sharing') || s.includes('share') && s.includes('external')) return 'sharing_exposure'
  if (t.startsWith('config.') || s.includes('configuration change')) return 'configuration_change'
  if (s.includes('policy') && s.includes('violation')) return 'policy_violation'
  if (s.includes('risky ip') || s.includes('malicious ip')) return 'risky_ip'
  if (t.startsWith('login.success') || t.startsWith('audit.') || t.startsWith('info.')) return 'informational'
  if (t.startsWith('alert.') || t.includes('unusual')) return 'unusual_activity'
  return 'unknown'
}

/**
 * Pick the event type off any of the known field aliases.
 */
export function pickEventType(raw: SaasAlertsRawEvent): string {
  const t = raw.jointType ?? raw.eventType ?? raw.type
  return (typeof t === 'string' ? t : '').toLowerCase()
}

/**
 * Pick the event description off any known field alias.
 */
export function pickDescription(raw: SaasAlertsRawEvent): string {
  const parts: string[] = []
  if (typeof raw.jointDesc === 'string' && raw.jointDesc) parts.push(raw.jointDesc)
  if (typeof raw.description === 'string' && raw.description && raw.description !== raw.jointDesc) parts.push(raw.description)
  if (typeof raw.jointDescAdditional === 'string' && raw.jointDescAdditional) parts.push(raw.jointDescAdditional)
  return parts.join(' — ')
}

/**
 * Compute a deterministic external ID for an event.
 * Preference: SaaS Alerts' `eventId` → `id` → content hash (type+time+user+ip).
 * Never returns null — guarantees something to dedup on.
 */
export function computeExternalId(raw: SaasAlertsRawEvent, fallbackPrefix: string): string {
  if (raw.eventId != null) return String(raw.eventId)
  if (raw.id != null) return String(raw.id)
  const userStr = typeof raw.user === 'string' ? raw.user : (raw.user?.email ?? raw.user?.id ?? raw.user?.name ?? '')
  const payload = `${pickEventType(raw)}|${raw.time ?? raw.timestamp ?? ''}|${userStr}|${raw.ip ?? ''}|${pickDescription(raw)}`
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 32)
  return `${fallbackPrefix}:${hash}`
}

/**
 * Normalize a single SaaS Alerts raw event into our canonical shape.
 */
export function normalizeEvent(
  raw: SaasAlertsRawEvent,
  envelopeContext: {
    partnerId: string | null
    customerId: string | null
    productId: string | null
  }
): NormalizedSaasAlertsEvent {
  const eventType = pickEventType(raw) || 'unknown'
  const description = pickDescription(raw)
  const severity = toSeverity(raw.alertStatus ?? raw.severity)
  const signalType = classifySignal(eventType, description)
  const occurredAt = typeof raw.time === 'string' ? raw.time : typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString()

  let user: NormalizedSaasAlertsEvent['user'] = null
  if (typeof raw.user === 'string') {
    user = { id: null, name: raw.user, email: null }
  } else if (raw.user && typeof raw.user === 'object') {
    user = {
      id: str(raw.user.id),
      name: str(raw.user.name),
      email: str(raw.user.email),
    }
  }

  const externalId = computeExternalId(raw, 'saas-alerts')

  return {
    externalId,
    eventType,
    severity,
    signalType,
    occurredAt,
    partnerId: envelopeContext.partnerId ?? str(raw.partnerId),
    customerId: envelopeContext.customerId ?? str(raw.customerId),
    productId: envelopeContext.productId ?? str(raw.productId),
    user,
    ip: str(raw.ip) ?? str(raw.sourceIp),
    location: raw.location ?? null,
    description,
    raw,
  }
}

/**
 * Normalize a whole SaaS Alerts webhook body to a list of canonical events.
 */
export function normalizeWebhookBody(body: unknown): {
  events: NormalizedSaasAlertsEvent[]
  bodyToken: string | null
} {
  const { events, partnerId, customerId, productId, bodyToken } = extractEventsAndContext(body)
  const normalized = events.map((e) => normalizeEvent(e, { partnerId, customerId, productId }))
  return { events: normalized, bodyToken }
}

// -----------------------------------------------------------------------------
// Compliance mapping
// -----------------------------------------------------------------------------

/**
 * Map signal types to their "evidence weight" for compliance scoring.
 * Higher values push the compliance risk needle harder when aggregating.
 */
export const SIGNAL_WEIGHTS: Record<ComplianceSignalType, number> = {
  impossible_travel: 10,
  account_compromise: 10,
  privilege_escalation: 8,
  mfa_disabled: 8,
  suspicious_login: 6,
  risky_ip: 5,
  new_device: 4,
  sharing_exposure: 4,
  policy_violation: 4,
  failed_login: 2,
  password_change: 1,
  configuration_change: 1,
  unusual_activity: 2,
  informational: 0,
  unknown: 1,
}

/**
 * Human-friendly description for the compliance dashboard.
 */
export const SIGNAL_LABELS: Record<ComplianceSignalType, string> = {
  suspicious_login: 'Suspicious login',
  failed_login: 'Failed login',
  impossible_travel: 'Impossible travel',
  new_device: 'New device sign-in',
  mfa_disabled: 'MFA disabled or bypassed',
  risky_ip: 'Risky IP address',
  privilege_escalation: 'Privilege escalation',
  password_change: 'Password change',
  sharing_exposure: 'External sharing exposure',
  account_compromise: 'Account compromise',
  unusual_activity: 'Unusual activity',
  configuration_change: 'Configuration change',
  policy_violation: 'Policy violation',
  informational: 'Informational',
  unknown: 'Unknown',
}

// -----------------------------------------------------------------------------
// Sample payload (used by debug POST mode + documentation)
// -----------------------------------------------------------------------------

export const SAMPLE_SAAS_ALERTS_WEBHOOK: SaasAlertsWrapper = {
  partner: { id: '5000', name: 'Triple Cities Tech' },
  customer: { id: '9001', name: 'Acme Industries' },
  product: { id: 'm365', name: 'Microsoft 365' },
  events: [
    {
      eventId: 'evt_sample_001',
      time: new Date().toISOString(),
      user: { id: 'u123', name: 'Jane User', email: 'jane@acme.com' },
      ip: '203.0.113.42',
      location: { country: 'US', region: 'NY', city: 'Binghamton' },
      alertStatus: 'high',
      jointType: 'login.failure',
      jointDesc: 'IAM Event - Authentication Failure',
      jointDescAdditional: 'Agent - Edge / Method - Unknown / Activity - OAuth2:Authorize',
    },
    {
      eventId: 'evt_sample_002',
      time: new Date().toISOString(),
      user: { id: 'u123', name: 'Jane User', email: 'jane@acme.com' },
      ip: '185.220.101.5',
      location: { country: 'RU', region: 'Moscow', city: 'Moscow' },
      alertStatus: 'critical',
      jointType: 'alert.impossibletravel',
      jointDesc: 'Impossible Travel Detected',
      jointDescAdditional: 'User signed in from New York and Moscow within 12 minutes',
    },
  ],
}
