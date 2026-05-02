/**
 * EasyDMARC Public API Client
 *
 * Queries DMARC, SPF, and DKIM record status for a domain. Used by the
 * compliance engine to evaluate CIS 9.5 (Implement DMARC).
 *
 * API docs: https://developers.easydmarc.com/
 * Auth: Bearer token in Authorization header
 *
 * Required env vars:
 *   EASYDMARC_API_KEY  — API key from EasyDMARC > Settings > API
 *   EASYDMARC_API_URL  — Base URL (default: https://api.easydmarc.com/v1)
 *
 * Endpoint shapes are documented at developers.easydmarc.com. If endpoint
 * paths differ from the assumed shape below, adjust in one place
 * (DMARC_LOOKUP_PATH constant) and the rest will follow.
 */

const DMARC_LOOKUP_PATH = '/lookup/dmarc'
const SPF_LOOKUP_PATH = '/lookup/spf'
const DKIM_LOOKUP_PATH = '/lookup/dkim'

export interface DmarcRecord {
  domain: string
  recordExists: boolean
  rawRecord: string | null
  /** 'none' | 'quarantine' | 'reject' (parsed from p= tag) */
  policy: 'none' | 'quarantine' | 'reject' | null
  /** Subdomain policy (sp= tag) */
  subdomainPolicy: 'none' | 'quarantine' | 'reject' | null
  /** Aggregate report URI (rua= tag) */
  ruaUri: string | null
  /** Forensic report URI (ruf= tag) */
  rufUri: string | null
  /** Percentage of mail subject to policy (pct= tag, default 100) */
  pct: number | null
  /** Whether the record is syntactically valid */
  valid: boolean
  errorMessage: string | null
}

export interface SpfRecord {
  domain: string
  recordExists: boolean
  rawRecord: string | null
  /** 'all' modifier: '+', '-', '~', '?' */
  allMechanism: '+' | '-' | '~' | '?' | null
  /** Number of DNS lookups (max 10 for valid SPF) */
  lookupCount: number | null
  valid: boolean
  errorMessage: string | null
}

export interface DkimRecord {
  domain: string
  selector: string
  recordExists: boolean
  rawRecord: string | null
  publicKeyValid: boolean
  errorMessage: string | null
}

export interface EmailAuthSummary {
  domain: string
  dmarc: DmarcRecord | null
  spf: SpfRecord | null
  dkim: DkimRecord | null
  /** Overall verdict: are all three records present and DMARC enforcing? */
  enforced: boolean
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface EasyDmarcConfig { apiKey: string; baseUrl: string }

function getConfig(): EasyDmarcConfig | null {
  const apiKey = process.env.EASYDMARC_API_KEY
  const baseUrl = process.env.EASYDMARC_API_URL || 'https://api.easydmarc.com/v1'
  if (!apiKey) return null
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') }
}

async function easydmarcGet<T>(path: string, params: Record<string, string>, config: EasyDmarcConfig): Promise<T | null> {
  const url = new URL(`${config.baseUrl}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[easydmarc] ${path} failed (${res.status}): ${text.substring(0, 300)}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.error(`[easydmarc] ${path} error:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

// ---------------------------------------------------------------------------
// Parsers — parse DMARC/SPF tag-value strings even if EasyDMARC's response
// shape varies. We accept either a parsed-record JSON or the raw record string.
// ---------------------------------------------------------------------------

function parseDmarcRecord(raw: string): Pick<DmarcRecord, 'policy' | 'subdomainPolicy' | 'ruaUri' | 'rufUri' | 'pct' | 'valid'> {
  if (!raw || !raw.startsWith('v=DMARC1')) {
    return { policy: null, subdomainPolicy: null, ruaUri: null, rufUri: null, pct: null, valid: false }
  }
  const tags = new Map<string, string>()
  for (const part of raw.split(';').map((p) => p.trim()).filter(Boolean)) {
    const [k, ...rest] = part.split('=')
    if (k && rest.length) tags.set(k.trim(), rest.join('=').trim())
  }
  const policy = tags.get('p') as 'none' | 'quarantine' | 'reject' | undefined
  const sp = tags.get('sp') as 'none' | 'quarantine' | 'reject' | undefined
  const pctStr = tags.get('pct')
  const pct = pctStr ? parseInt(pctStr, 10) : 100
  return {
    policy: policy ?? null,
    subdomainPolicy: sp ?? policy ?? null,
    ruaUri: tags.get('rua') ?? null,
    rufUri: tags.get('ruf') ?? null,
    pct: Number.isFinite(pct) ? pct : 100,
    valid: !!policy,
  }
}

function parseSpfRecord(raw: string): Pick<SpfRecord, 'allMechanism' | 'valid'> {
  if (!raw || !raw.startsWith('v=spf1')) return { allMechanism: null, valid: false }
  const match = raw.match(/([+\-~?])all\b/)
  return {
    allMechanism: (match?.[1] as '+' | '-' | '~' | '?' | null) ?? null,
    valid: true,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isConfigured(): boolean {
  return !!process.env.EASYDMARC_API_KEY
}

/**
 * Look up the DMARC record for a domain. Returns null if EasyDMARC isn't
 * configured or the call failed.
 */
export async function lookupDmarc(domain: string): Promise<DmarcRecord | null> {
  const config = getConfig()
  if (!config) return null

  type Resp = { record?: string; error?: string; valid?: boolean }
  const data = await easydmarcGet<Resp>(DMARC_LOOKUP_PATH, { domain }, config)
  if (!data) return null

  const rawRecord = data.record ?? null
  if (!rawRecord) {
    return {
      domain, recordExists: false, rawRecord: null,
      policy: null, subdomainPolicy: null, ruaUri: null, rufUri: null, pct: null,
      valid: false, errorMessage: data.error ?? 'No DMARC record found',
    }
  }
  const parsed = parseDmarcRecord(rawRecord)
  return {
    domain, recordExists: true, rawRecord, ...parsed,
    errorMessage: data.error ?? null,
  }
}

/**
 * Look up the SPF record for a domain.
 */
export async function lookupSpf(domain: string): Promise<SpfRecord | null> {
  const config = getConfig()
  if (!config) return null

  type Resp = { record?: string; lookupCount?: number; error?: string }
  const data = await easydmarcGet<Resp>(SPF_LOOKUP_PATH, { domain }, config)
  if (!data) return null

  const rawRecord = data.record ?? null
  if (!rawRecord) {
    return {
      domain, recordExists: false, rawRecord: null,
      allMechanism: null, lookupCount: null, valid: false,
      errorMessage: data.error ?? 'No SPF record found',
    }
  }
  const parsed = parseSpfRecord(rawRecord)
  return {
    domain, recordExists: true, rawRecord,
    allMechanism: parsed.allMechanism, valid: parsed.valid,
    lookupCount: data.lookupCount ?? null, errorMessage: data.error ?? null,
  }
}

/**
 * Look up the DKIM record for a domain at a given selector. Common selectors:
 * default, google, selector1 (M365), k1 (Mailchimp).
 */
export async function lookupDkim(domain: string, selector = 'selector1'): Promise<DkimRecord | null> {
  const config = getConfig()
  if (!config) return null

  type Resp = { record?: string; valid?: boolean; error?: string }
  const data = await easydmarcGet<Resp>(DKIM_LOOKUP_PATH, { domain, selector }, config)
  if (!data) return null

  return {
    domain, selector,
    recordExists: !!data.record, rawRecord: data.record ?? null,
    publicKeyValid: data.valid ?? !!data.record,
    errorMessage: data.error ?? null,
  }
}

/**
 * Build a combined email-authentication summary for a domain. Tries DKIM
 * with M365 (selector1) first, falls back to "default" selector. Result
 * `enforced` is true only when DMARC policy is quarantine/reject AND SPF
 * is `-all` or `~all` AND DKIM is published.
 */
export async function buildEmailAuthSummary(domain: string): Promise<EmailAuthSummary | null> {
  const config = getConfig()
  if (!config) return null

  const [dmarc, spf, dkimSelector1, dkimDefault] = await Promise.all([
    lookupDmarc(domain),
    lookupSpf(domain),
    lookupDkim(domain, 'selector1'),
    lookupDkim(domain, 'default'),
  ])

  // Pick the DKIM result that actually has a record (M365 publishes selector1)
  const dkim = (dkimSelector1?.recordExists ? dkimSelector1 : null) ?? dkimDefault ?? null

  const dmarcEnforcing = !!dmarc && (dmarc.policy === 'quarantine' || dmarc.policy === 'reject')
  const spfStrict = !!spf?.recordExists && (spf.allMechanism === '-' || spf.allMechanism === '~')
  const dkimPresent = !!dkim?.recordExists

  return {
    domain,
    dmarc, spf, dkim,
    enforced: dmarcEnforcing && spfStrict && dkimPresent,
  }
}
