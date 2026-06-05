/**
 * DNSFilter-powered pre-fill for the AI assessment. Piggybacks the EXISTING
 * DNSFilter connection (the compliance_platform_mappings 'dnsfilter' mapping +
 * DNSFILTER_API_TOKEN) — no new integration.
 *
 * Two data sources, best → fallback:
 *  1. CyberSight CSV export (env-configurable) — the rich source: it sees
 *     desktop AI apps and applications, not just DNS domains. Enabled only when
 *     DNSFILTER_CYBERSIGHT_EXPORT_PATH is set (the exact path/columns vary by
 *     account, so we keep it config-driven rather than hard-coding a guess).
 *  2. query_logs (always available) — paginated DNS sample; reliably surfaces
 *     AI tools and cloud/SaaS apps by domain. This is the default + the fallback.
 *
 * Output is suggestions the rep reviews and edits — never a silent autofill.
 */

import { getPool } from '@/lib/db-pool'

export interface PrefillItem { name: string; domain: string; count: number }
export interface DnsfilterPrefill {
  available: boolean
  orgName: string | null
  aiTools: PrefillItem[]
  topApps: PrefillItem[]
  suggestions: Record<string, string>
  note: string | null
}

interface QueryLogRow { domain?: string; fqdn?: string }

// Brand tokens — matched as substrings so they hit both domains (chatgpt.com)
// and CyberSight desktop-app names ("ChatGPT Desktop", "GitHub Copilot").
const AI_TOKENS: { match: string; name: string }[] = [
  { match: 'chatgpt', name: 'ChatGPT' },
  { match: 'openai', name: 'OpenAI / ChatGPT' },
  { match: 'claude', name: 'Claude' },
  { match: 'anthropic', name: 'Claude (Anthropic)' },
  { match: 'gemini', name: 'Google Gemini' },
  { match: 'copilot', name: 'Microsoft Copilot' },
  { match: 'perplexity', name: 'Perplexity' },
  { match: 'midjourney', name: 'Midjourney' },
  { match: 'huggingface', name: 'Hugging Face' },
  { match: 'deepseek', name: 'DeepSeek' },
  { match: 'mistral', name: 'Mistral' },
  { match: 'ollama', name: 'Ollama (local)' },
  { match: 'lm studio', name: 'LM Studio (local)' },
  { match: 'lmstudio', name: 'LM Studio (local)' },
  { match: 'grok', name: 'Grok (xAI)' },
  { match: 'character.ai', name: 'Character.AI' },
  { match: 'poe.com', name: 'Poe' },
  { match: 'elevenlabs', name: 'ElevenLabs' },
  { match: 'jasper', name: 'Jasper' },
  { match: 'copy.ai', name: 'Copy.ai' },
  { match: 'gamma.app', name: 'Gamma' },
]

const SAAS_DOMAINS: { match: string; name: string }[] = [
  { match: 'sharepoint.com', name: 'SharePoint' },
  { match: 'outlook.', name: 'Microsoft 365 (Outlook)' },
  { match: 'office.com', name: 'Microsoft 365' },
  { match: 'office365.com', name: 'Microsoft 365' },
  { match: 'dropbox.com', name: 'Dropbox' },
  { match: 'box.com', name: 'Box' },
  { match: 'salesforce.com', name: 'Salesforce' },
  { match: 'force.com', name: 'Salesforce' },
  { match: 'netsuite.com', name: 'NetSuite' },
  { match: 'hubspot.com', name: 'HubSpot' },
  { match: 'intuit.com', name: 'QuickBooks (Intuit)' },
  { match: 'quickbooks', name: 'QuickBooks' },
  { match: 'slack.com', name: 'Slack' },
  { match: 'zoom.us', name: 'Zoom' },
  { match: 'monday.com', name: 'Monday.com' },
  { match: 'atlassian.net', name: 'Jira / Confluence' },
  { match: 'spscommerce.com', name: 'SPS Commerce' },
  { match: 'zoho.', name: 'Zoho' },
  { match: 'servicenow.com', name: 'ServiceNow' },
  { match: 'workday.com', name: 'Workday' },
  { match: 'adp.com', name: 'ADP' },
  { match: 'docusign', name: 'DocuSign' },
  { match: 'asana.com', name: 'Asana' },
  { match: 'trello.com', name: 'Trello' },
  { match: 'notion.so', name: 'Notion' },
  { match: 'figma.com', name: 'Figma' },
  { match: 'shopify.com', name: 'Shopify' },
  { match: 'autodesk.com', name: 'Autodesk' },
  { match: 'sage.com', name: 'Sage' },
]

const NOISE = [
  'windowsupdate', 'telemetry', 'msftncsi', 'msftconnecttest', 'gvt1.com', 'gvt2.com', 'gstatic', 'googleapis',
  'google-analytics', 'doubleclick', 'googlesyndication', 'akamai', 'akadns', 'edgekey', 'edgesuite', 'cloudfront',
  'fastly', 'sentry.io', 'segment.io', 'mixpanel', 'datadoghq', 'newrelic', 'ntp.', 'pool.ntp', 'push.apple',
  'icloud.com', 'msedge', 'azureedge', 'cloudflare', 'fbcdn', 'ytimg', 'scorecardresearch', 'demdex', 'adservice',
  'msn.com', 'windows.com', 'microsoftonline.com', 'msftauth', 'office.net', 'trafficmanager', 'akamaiedge',
]

function firstMatch(s: string, list: { match: string; name: string }[]): { match: string; name: string } | null {
  return list.find((e) => s.includes(e.match)) ?? null
}
function baseDomain(fqdn: string): string {
  const parts = fqdn.split('.').filter(Boolean)
  return parts.length >= 2 ? parts.slice(-2).join('.') : fqdn
}

// Strict company↔org matcher for the data pull — the shared matchesCompanyName
// is too loose ("Tech" ⊂ "Technologies" would match TCT to "A-Line Technologies"
// and pull the WRONG client's data). Require one name's significant words
// (generic suffixes dropped) to be fully contained in the other's.
const GENERIC = new Set(['technologies', 'technology', 'tech', 'inc', 'llc', 'ltd', 'corp', 'corporation', 'co', 'company', 'group', 'holdings', 'services', 'service', 'solutions', 'systems', 'it', 'the', 'and', 'of'])
function sigWords(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !GENERIC.has(w))
}
function strongNameMatch(a: string, b: string): boolean {
  const sa = sigWords(a), sb = sigWords(b)
  if (sa.length === 0 || sb.length === 0) return false
  const setA = new Set(sa), setB = new Set(sb)
  return sa.every((w) => setB.has(w)) || sb.every((w) => setA.has(w))
}

// Minimal CSV → signal extraction for the CyberSight export. Pulls cells from
// any column whose header looks like a domain / app / activity name.
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out
}
function parseCsvSignals(csv: string): string[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim())
  const idxs = header.map((h, i) => (/domain|fqdn|url|host|application|\bapp\b|activity|tool|name/.test(h) ? i : -1)).filter((i) => i >= 0)
  if (idxs.length === 0) return []
  const signals: string[] = []
  for (let i = 1; i < lines.length && i < 5000; i++) {
    const cells = splitCsvLine(lines[i])
    for (const idx of idxs) { const v = (cells[idx] || '').trim().toLowerCase(); if (v) signals.push(v) }
  }
  return signals
}

async function resolveOrg(companyId: string | null, companyName: string, baseUrl: string, headers: Record<string, string>): Promise<{ orgId: string | null; orgName: string | null; skip: boolean }> {
  let mappingExternalId: string | null = null
  let mappingExternalName = ''
  if (companyId) {
    try {
      const pool = getPool()
      const res = await pool.query<{ externalId: string; externalName: string }>(
        `SELECT "externalId", "externalName" FROM compliance_platform_mappings WHERE "companyId" = $1 AND platform = 'dnsfilter' LIMIT 1`,
        [companyId]
      )
      if (res.rows[0]) { mappingExternalId = res.rows[0].externalId; mappingExternalName = res.rows[0].externalName }
    } catch { /* table may not exist */ }
  }
  if (mappingExternalId === '__none__') return { orgId: null, orgName: null, skip: true }

  const orgRes = await fetch(`${baseUrl}/organizations`, { headers, signal: AbortSignal.timeout(15_000) })
  if (!orgRes.ok) throw new Error(`Organizations endpoint failed (${orgRes.status})`)
  const orgJson = (await orgRes.json()) as { data?: Array<{ id: string; attributes?: { name?: string } }> }
  const orgs = orgJson.data ?? []

  if (mappingExternalId) {
    return { orgId: mappingExternalId, orgName: orgs.find((o) => o.id === mappingExternalId)?.attributes?.name ?? mappingExternalName, skip: false }
  }
  if (companyName) {
    const matched = orgs.find((o) => strongNameMatch(companyName, o.attributes?.name ?? ''))
    if (matched) return { orgId: matched.id, orgName: matched.attributes?.name ?? null, skip: false }
  }
  return { orgId: null, orgName: null, skip: false }
}

export async function buildDnsfilterPrefill(companyId: string | null, companyName: string): Promise<DnsfilterPrefill> {
  const empty = (note: string): DnsfilterPrefill => ({ available: false, orgName: null, aiTools: [], topApps: [], suggestions: {}, note })

  const token = process.env.DNSFILTER_API_TOKEN
  if (!token) return empty('DNSFilter not configured (DNSFILTER_API_TOKEN not set).')

  const baseUrl = (process.env.DNSFILTER_API_URL || 'https://api.dnsfilter.com/v1').replace(/\/$/, '')
  const headers = { Authorization: `Token ${token}`, Accept: 'application/json' }

  let orgId: string | null, orgName: string | null
  try {
    const r = await resolveOrg(companyId, companyName, baseUrl, headers)
    if (r.skip) return empty('This company is marked as not using DNSFilter.')
    orgId = r.orgId; orgName = r.orgName
  } catch (err) {
    return empty(`DNSFilter lookup failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!orgId) return empty(`No DNSFilter organization mapped or matched for "${companyName}". Map it in Compliance → Connect Tools, then retry.`)
  const oid = orgId

  const now = Date.now()
  const fmt = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const fromIso = fmt(now - 30 * 24 * 60 * 60 * 1000)
  const toIso = fmt(now)

  // ---- Source 1: CyberSight CSV export (env-configurable; the rich source) ----
  async function cybersightSignals(): Promise<{ signals: string[]; note: string | null } | null> {
    const createPath = process.env.DNSFILTER_CYBERSIGHT_EXPORT_PATH
    if (!createPath) return null // not configured → use DNS
    try {
      const startRes = await fetch(`${baseUrl}${createPath.startsWith('/') ? '' : '/'}${createPath}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: process.env.DNSFILTER_CYBERSIGHT_REPORT_TYPE || 'activity', start_at: fromIso, end_at: toIso, organization_id: oid }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!startRes.ok) return { signals: [], note: `CyberSight export start failed (${startRes.status})` }
      const sj = (await startRes.json()) as { data?: { id?: string; uuid?: string; attributes?: { url?: string } }; id?: string; uuid?: string }
      const id = sj.data?.id || sj.data?.uuid || sj.id || sj.uuid
      let downloadUrl: string | null = sj.data?.attributes?.url ?? null
      if (!id && !downloadUrl) return { signals: [], note: 'CyberSight export returned no id/url' }

      const statusBase = process.env.DNSFILTER_CYBERSIGHT_STATUS_PATH || createPath
      for (let i = 0; i < 6 && !downloadUrl && id; i++) {
        await new Promise((r) => setTimeout(r, 2500))
        const stat = await fetch(`${baseUrl}${statusBase.startsWith('/') ? '' : '/'}${statusBase}/${id}`, { headers, signal: AbortSignal.timeout(15_000) })
        if (!stat.ok) continue
        const stj = (await stat.json()) as { data?: { attributes?: { url?: string; download_url?: string } } }
        downloadUrl = stj.data?.attributes?.url || stj.data?.attributes?.download_url || null
      }
      if (!downloadUrl) return { signals: [], note: 'CyberSight export did not produce a download URL in time' }

      const csvRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(20_000) })
      if (!csvRes.ok) return { signals: [], note: `CyberSight CSV download failed (${csvRes.status})` }
      return { signals: parseCsvSignals(await csvRes.text()), note: null }
    } catch (err) {
      return { signals: [], note: `CyberSight export error: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  // ---- Source 2: query_logs (paginated DNS sample; default + fallback) ----
  async function queryLogSignals(): Promise<{ signals: string[]; note: string | null }> {
    const collected: string[] = []
    let resultFilter: string | undefined
    for (let page = 1; page <= 5; page++) {
      const qs = new URLSearchParams()
      qs.set('organization_id', oid); qs.set('from', fromIso); qs.set('to', toIso)
      qs.set('page[size]', '100'); qs.set('page[number]', String(page))
      if (resultFilter) qs.set('result', resultFilter)
      const res = await fetch(`${baseUrl}/traffic_reports/query_logs?${qs.toString()}`, { headers, signal: AbortSignal.timeout(30_000) })
      if (!res.ok) {
        if (page === 1 && res.status === 400 && !resultFilter) { resultFilter = 'allowed'; page = 0; continue }
        const body = (await res.text().catch(() => '')).slice(0, 200)
        return { signals: collected, note: `query_logs failed (${res.status})${body ? ': ' + body : ''}` }
      }
      const json = (await res.json()) as { data?: { values?: QueryLogRow[] } }
      const vals = json.data?.values ?? []
      for (const v of vals) { const d = (v.fqdn || v.domain || '').toLowerCase(); if (d) collected.push(d) }
      if (vals.length < 100) break
    }
    return { signals: collected, note: null }
  }

  // Prefer CyberSight; fall back to DNS on miss/failure.
  let signals: string[] = []
  let source: 'CyberSight' | 'DNS' = 'DNS'
  let fetchNote: string | null = null
  const cs = await cybersightSignals()
  if (cs && cs.signals.length > 0) {
    signals = cs.signals; source = 'CyberSight'; fetchNote = cs.note
  } else {
    const ql = await queryLogSignals()
    signals = ql.signals; source = 'DNS'
    fetchNote = ql.note || cs?.note || null
    if (!ql.signals.length && ql.note) {
      return empty(`DNSFilter ${ql.note} for org "${orgName}".`)
    }
  }

  // ---- Aggregate signals → AI tools + top apps ----
  const ai = new Map<string, PrefillItem>()
  const apps = new Map<string, PrefillItem>()
  for (const s of signals) {
    if (!s) continue
    const aiHit = firstMatch(s, AI_TOKENS)
    if (aiHit) {
      const cur = ai.get(aiHit.name) ?? { name: aiHit.name, domain: aiHit.match, count: 0 }
      cur.count++; ai.set(aiHit.name, cur)
      continue
    }
    if (NOISE.some((n) => s.includes(n))) continue
    const saasHit = firstMatch(s, SAAS_DOMAINS)
    const key = saasHit ? saasHit.name : baseDomain(s)
    const cur = apps.get(key) ?? { name: key, domain: saasHit ? saasHit.match : baseDomain(s), count: 0 }
    cur.count++; apps.set(key, cur)
  }

  const aiTools = Array.from(ai.values()).sort((a, b) => b.count - a.count)
  const topApps = Array.from(apps.values()).sort((a, b) => b.count - a.count).slice(0, 12)
  const namedApps = topApps.filter((a) => SAAS_DOMAINS.some((sd) => sd.name === a.name))

  const suggestions: Record<string, string> = {}
  suggestions.ai_state = aiTools.length > 0 ? 'Some, ungoverned' : 'None yet'
  if (topApps.length > 0) suggestions.lob_apps = topApps.map((a) => a.name).join(', ')
  if (namedApps.length > 0) suggestions.must_connect = namedApps.map((a) => a.name).join(', ')

  const srcLabel = source === 'CyberSight' ? 'CyberSight activity' : 'a DNS sample'
  const note = signals.length === 0
    ? `Connected to DNSFilter org "${orgName}", but no activity was returned${fetchNote ? ` (${fetchNote})` : ''}.`
    : `From ${srcLabel} for "${orgName}" (${signals.length} signals). ${source === 'DNS' ? 'DNS shows domains, not desktop apps — confirm on the call.' : 'Includes desktop apps.'}`

  return { available: true, orgName, aiTools, topApps, suggestions, note }
}
