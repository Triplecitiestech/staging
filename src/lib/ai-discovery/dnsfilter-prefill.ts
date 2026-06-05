/**
 * DNSFilter-powered pre-fill for the AI assessment. Piggybacks the EXISTING
 * DNSFilter connection (the compliance_platform_mappings 'dnsfilter' mapping +
 * DNSFILTER_API_TOKEN) and the same /traffic_reports/query_logs endpoint the
 * SOC enrichment already uses — no new integration.
 *
 * Scope: high-confidence "AI + systems" fields only. DNS shows the *domains* a
 * client reaches, so we can reliably surface (a) which AI tools are in use
 * (chatgpt.com, claude.ai, copilot…) and (b) the top cloud/SaaS apps. It does
 * NOT see desktop apps or exact per-user time (that's CyberSight agent
 * telemetry — a possible future upgrade via the CyberSight CSV export). Output
 * is suggestions the rep reviews and edits — never a silent autofill.
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

const AI_DOMAINS: { match: string; name: string }[] = [
  { match: 'chatgpt.com', name: 'ChatGPT' },
  { match: 'openai.com', name: 'OpenAI / ChatGPT' },
  { match: 'claude.ai', name: 'Claude' },
  { match: 'anthropic.com', name: 'Claude (Anthropic)' },
  { match: 'gemini.google.com', name: 'Google Gemini' },
  { match: 'copilot.microsoft.com', name: 'Microsoft Copilot' },
  { match: 'copilot.cloud.microsoft', name: 'Microsoft 365 Copilot' },
  { match: 'perplexity.ai', name: 'Perplexity' },
  { match: 'poe.com', name: 'Poe' },
  { match: 'character.ai', name: 'Character.AI' },
  { match: 'midjourney.com', name: 'Midjourney' },
  { match: 'huggingface.co', name: 'Hugging Face' },
  { match: 'x.ai', name: 'Grok (xAI)' },
  { match: 'deepseek.com', name: 'DeepSeek' },
  { match: 'mistral.ai', name: 'Mistral' },
  { match: 'cohere.com', name: 'Cohere' },
  { match: 'jasper.ai', name: 'Jasper' },
  { match: 'copy.ai', name: 'Copy.ai' },
  { match: 'elevenlabs.io', name: 'ElevenLabs' },
  { match: 'runwayml.com', name: 'Runway' },
  { match: 'suno.com', name: 'Suno' },
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

function firstMatch(fqdn: string, list: { match: string; name: string }[]): { match: string; name: string } | null {
  return list.find((e) => fqdn.includes(e.match)) ?? null
}

// Strict company↔org matcher for the data pull — the app's shared
// matchesCompanyName is too loose for this (e.g. "Tech" ⊂ "Technologies" would
// match TCT to "A-Line Technologies" and pull the WRONG client's data). Require
// one name's significant words (generic suffixes dropped) to be fully contained
// in the other's, as whole tokens.
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
function baseDomain(fqdn: string): string {
  const parts = fqdn.split('.').filter(Boolean)
  return parts.length >= 2 ? parts.slice(-2).join('.') : fqdn
}

async function resolveOrg(companyId: string | null, companyName: string, baseUrl: string, headers: Record<string, string>): Promise<{ orgId: string | null; orgName: string | null; skip: boolean }> {
  // Explicit mapping (compliance_platform_mappings) first.
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

  // Pull a recent sample of query logs for the org (last 30 days). page[size]=100
  // mirrors the proven SOC call; we try without a result filter, then retry with
  // result=allowed if the API rejects it (we need allowed traffic, not blocked).
  const now = Date.now()
  const fmt = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const fromIso = fmt(now - 30 * 24 * 60 * 60 * 1000)
  const toIso = fmt(now)

  async function fetchLogs(extra?: Record<string, string>): Promise<{ ok: boolean; status: number; body: string; rows: QueryLogRow[] }> {
    const qs = new URLSearchParams()
    qs.set('organization_id', oid)
    qs.set('from', fromIso)
    qs.set('to', toIso)
    qs.set('page[size]', '100')
    if (extra) for (const [k, v] of Object.entries(extra)) qs.set(k, v)
    const res = await fetch(`${baseUrl}/traffic_reports/query_logs?${qs.toString()}`, { headers, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return { ok: false, status: res.status, body: (await res.text().catch(() => '')).slice(0, 300), rows: [] }
    const json = (await res.json()) as { data?: { values?: QueryLogRow[] } }
    return { ok: true, status: 200, body: '', rows: json.data?.values ?? [] }
  }

  let rows: QueryLogRow[] = []
  try {
    let r = await fetchLogs()
    if (!r.ok && r.status === 400) r = await fetchLogs({ result: 'allowed' })
    if (!r.ok) return empty(`DNSFilter query_logs failed (${r.status}) for org "${orgName}"${r.body ? `: ${r.body}` : ''}`)
    rows = r.rows
  } catch (err) {
    return empty(`DNSFilter query_logs error: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Aggregate.
  const ai = new Map<string, PrefillItem>()
  const apps = new Map<string, PrefillItem>()
  for (const row of rows) {
    const fqdn = (row.fqdn || row.domain || '').toLowerCase()
    if (!fqdn) continue
    const aiHit = firstMatch(fqdn, AI_DOMAINS)
    if (aiHit) {
      const cur = ai.get(aiHit.name) ?? { name: aiHit.name, domain: aiHit.match, count: 0 }
      cur.count++; ai.set(aiHit.name, cur)
      continue
    }
    if (NOISE.some((n) => fqdn.includes(n))) continue
    const saasHit = firstMatch(fqdn, SAAS_DOMAINS)
    const key = saasHit ? saasHit.name : baseDomain(fqdn)
    const cur = apps.get(key) ?? { name: key, domain: saasHit ? saasHit.match : baseDomain(fqdn), count: 0 }
    cur.count++; apps.set(key, cur)
  }

  const aiTools = Array.from(ai.values()).sort((a, b) => b.count - a.count)
  const topApps = Array.from(apps.values()).sort((a, b) => b.count - a.count).slice(0, 12)
  const namedApps = topApps.filter((a) => SAAS_DOMAINS.some((s) => s.name === a.name))

  const suggestions: Record<string, string> = {}
  // Maps to the discovery question ids (questions.ts): ai_state is a choice
  // whose value must match a label exactly; lob_apps / must_connect are text.
  suggestions.ai_state = aiTools.length > 0 ? 'Some, ungoverned' : 'None yet'
  if (topApps.length > 0) suggestions.lob_apps = topApps.map((a) => a.name).join(', ')
  if (namedApps.length > 0) suggestions.must_connect = namedApps.map((a) => a.name).join(', ')

  const note = rows.length === 0
    ? `Connected to DNSFilter org "${orgName}", but no recent query sample was returned.`
    : `From a recent DNSFilter sample for "${orgName}" (${rows.length} queries). DNS shows domains, not desktop apps — confirm on the call.`

  return { available: true, orgName, aiTools, topApps, suggestions, note }
}
