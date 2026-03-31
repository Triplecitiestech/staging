/**
 * IT Glue API Client
 *
 * IT documentation and CMDB platform.
 * Stores passwords, network diagrams, procedures, asset configurations,
 * flexible assets, and runbooks.
 *
 * API docs: https://api.itglue.com/developer/
 * Auth: x-api-key header
 * Rate limit: 3000 requests per 5 minutes
 *
 * Required env vars:
 *   IT_GLUE_API_KEY  — API key from IT Glue admin settings
 *   IT_GLUE_API_URL  — Base URL (https://api.itglue.com or https://api.eu.itglue.com)
 */

export interface ItGlueOrganization {
  id: string
  attributes: {
    name: string
    'organization-type-name': string | null
    'organization-status-name': string | null
    'created-at': string
    'updated-at': string
    'short-name': string | null
  }
}

export interface ItGlueConfiguration {
  id: string
  attributes: {
    name: string
    'configuration-type-name': string | null
    'configuration-status-name': string | null
    'organization-id': number
    'primary-ip': string | null
    'mac-address': string | null
    'serial-number': string | null
    hostname: string | null
    'operating-system-notes': string | null
    notes: string | null
    'created-at': string
    'updated-at': string
  }
}

export interface ItGlueFlexibleAssetType {
  id: string
  attributes: {
    name: string
    description: string | null
    icon: string | null
    'created-at': string
    'updated-at': string
  }
}

export interface ItGlueFlexibleAsset {
  id: string
  attributes: {
    name: string
    'flexible-asset-type-id': number
    'organization-id': number
    traits: Record<string, unknown>
    'created-at': string
    'updated-at': string
  }
}

export interface ItGlueDocumentationSummary {
  available: boolean
  organizationCount: number
  organizations: Array<{
    id: string
    name: string
    status: string | null
  }>
  configurationCount: number
  flexibleAssetTypeCount: number
  flexibleAssetTypes: Array<{ id: string; name: string }>
  hasDocumentedPolicies: boolean
  hasDocumentedProcedures: boolean
  hasNetworkDiagrams: boolean
  /** Per-matched-org details */
  matchedOrgName: string | null
  matchedOrgFlexibleAssetCount: number
  matchedOrgFlexibleAssetTypes: string[]
  matchedOrgConfigCount: number
  totalOrgsInAccount: number
  note: string | null
}

/**
 * Normalize a company name for fuzzy matching.
 * Strips common suffixes, punctuation, and whitespace.
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.'"\-]/g, ' ')               // punctuation → space
    .replace(/\b(llc|inc|corp|ltd|co|company|technologies|technology|tech|group|services|solutions|enterprises?)\b/gi, '')
    .replace(/\s+/g, ' ')                     // collapse whitespace
    .trim()
}

/**
 * Fuzzy match a company name against IT Glue organizations.
 * Tries multiple strategies: exact, normalized, word overlap, abbreviation.
 */
function fuzzyMatchOrganization(
  companyName: string,
  orgs: ItGlueOrganization[]
): ItGlueOrganization | null {
  const lowerName = companyName.toLowerCase()
  const normalizedName = normalizeCompanyName(companyName)
  const nameWords = normalizedName.split(' ').filter(Boolean)

  // Strategy 1: Exact substring match (original logic)
  const exact = orgs.find((o) => {
    const orgName = o.attributes.name.toLowerCase()
    return orgName.includes(lowerName) || lowerName.includes(orgName)
  })
  if (exact) return exact

  // Strategy 2: Normalized name match (strips LLC, Inc, punctuation)
  const normalized = orgs.find((o) => {
    const orgNorm = normalizeCompanyName(o.attributes.name)
    return orgNorm.includes(normalizedName) || normalizedName.includes(orgNorm)
  })
  if (normalized) return normalized

  // Strategy 3: Short name match (IT Glue has a short-name field)
  const shortName = orgs.find((o) => {
    const sn = (o.attributes['short-name'] ?? '').toLowerCase()
    return sn && (sn.includes(lowerName) || lowerName.includes(sn))
  })
  if (shortName) return shortName

  // Strategy 4: All significant words present (handles "EZ Red" matching "EZ Red Technologies LLC")
  if (nameWords.length >= 1) {
    const wordMatch = orgs.find((o) => {
      const orgNorm = normalizeCompanyName(o.attributes.name)
      return nameWords.every((w) => orgNorm.includes(w))
    })
    if (wordMatch) return wordMatch
  }

  // Strategy 5: Concatenated match (handles "EZ Red" vs "EZRed" or "EZRED")
  const squished = normalizedName.replace(/\s+/g, '')
  if (squished.length >= 3) {
    const squishedMatch = orgs.find((o) => {
      const orgSquished = normalizeCompanyName(o.attributes.name).replace(/\s+/g, '')
      return orgSquished.includes(squished) || squished.includes(orgSquished)
    })
    if (squishedMatch) return squishedMatch
  }

  return null
}

export class ItGlueClient {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.IT_GLUE_API_KEY ?? ''
    this.baseUrl = (process.env.IT_GLUE_API_URL ?? 'https://api.itglue.com').replace(/\/$/, '')
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json',
      },
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`IT Glue API ${path} failed (${res.status}): ${text.substring(0, 200)}`)
    }

    return res.json() as Promise<T>
  }

  /** List organizations */
  async getOrganizations(page = 1, pageSize = 50): Promise<ItGlueOrganization[]> {
    const data = await this.request<{ data: ItGlueOrganization[] }>(
      `/organizations?page[size]=${pageSize}&page[number]=${page}`
    )
    return data.data ?? []
  }

  /** List configurations (assets) for an organization */
  async getConfigurations(orgId: string, page = 1, pageSize = 50): Promise<ItGlueConfiguration[]> {
    const data = await this.request<{ data: ItGlueConfiguration[] }>(
      `/configurations?filter[organization-id]=${orgId}&page[size]=${pageSize}&page[number]=${page}`
    )
    return data.data ?? []
  }

  /** List flexible asset types */
  async getFlexibleAssetTypes(): Promise<ItGlueFlexibleAssetType[]> {
    const data = await this.request<{ data: ItGlueFlexibleAssetType[] }>(
      '/flexible_asset_types'
    )
    return data.data ?? []
  }

  /** List flexible assets for an organization */
  async getFlexibleAssets(orgId: string, page = 1, pageSize = 50): Promise<ItGlueFlexibleAsset[]> {
    const data = await this.request<{ data: ItGlueFlexibleAsset[] }>(
      `/flexible_assets?filter[organization-id]=${orgId}&page[size]=${pageSize}&page[number]=${page}`
    )
    return data.data ?? []
  }

  /** Build documentation summary — checks what's documented for an org */
  async buildSummary(companyName?: string): Promise<ItGlueDocumentationSummary> {
    if (!this.isConfigured()) {
      return {
        available: false, organizationCount: 0, organizations: [],
        configurationCount: 0, flexibleAssetTypeCount: 0, flexibleAssetTypes: [],
        matchedOrgName: null, matchedOrgFlexibleAssetCount: 0, matchedOrgFlexibleAssetTypes: [], matchedOrgConfigCount: 0, totalOrgsInAccount: 0,
        hasDocumentedPolicies: false, hasDocumentedProcedures: false, hasNetworkDiagrams: false,
        note: 'IT Glue API not configured',
      }
    }

    try {
      // Get organizations (fetch multiple pages if needed)
      let orgs = await this.getOrganizations(1, 250)
      // If exactly 250 returned, there might be more
      if (orgs.length === 250) {
        const page2 = await this.getOrganizations(2, 250)
        orgs = [...orgs, ...page2]
      }

      // If company name provided, try to match using fuzzy matching
      let targetOrg: ItGlueOrganization | null = null
      if (companyName) {
        targetOrg = fuzzyMatchOrganization(companyName, orgs)

        // Log for debugging
        if (!targetOrg) {
          const orgNames = orgs.map((o) => o.attributes.name).slice(0, 30)
          console.log(`[it-glue] No match for "${companyName}" among ${orgs.length} orgs. First 30: ${orgNames.join(', ')}`)
        }
      }

      // Get flexible asset types to check for policy/procedure documentation
      const flexTypes = await this.getFlexibleAssetTypes()
      const flexTypeNames = flexTypes.map((t) => t.attributes.name.toLowerCase())

      const policyKeywords = ['policy', 'policies', 'security policy', 'acceptable use']
      const procedureKeywords = ['procedure', 'runbook', 'process', 'sop', 'standard operating']
      const networkKeywords = ['network', 'diagram', 'topology', 'vlan']

      const hasDocumentedPolicies = policyKeywords.some((k) => flexTypeNames.some((n) => n.includes(k)))
      const hasDocumentedProcedures = procedureKeywords.some((k) => flexTypeNames.some((n) => n.includes(k)))
      const hasNetworkDiagrams = networkKeywords.some((k) => flexTypeNames.some((n) => n.includes(k)))

      let configurationCount = 0
      let flexibleAssetCount = 0
      let orgFlexibleAssetNames: string[] = []

      if (targetOrg) {
        // Get configuration count for the matched org
        try {
          const configs = await this.getConfigurations(targetOrg.id, 1, 50)
          configurationCount = configs.length
        } catch { /* non-fatal */ }

        // Get flexible assets for the matched org — these are the actual documented items
        try {
          const flexAssets = await this.getFlexibleAssets(targetOrg.id, 1, 50)
          flexibleAssetCount = flexAssets.length
          // Map asset type IDs to names
          const typeMap = new Map(flexTypes.map((t) => [Number(t.id), t.attributes.name]))
          orgFlexibleAssetNames = flexAssets
            .map((a) => typeMap.get(a.attributes['flexible-asset-type-id']) ?? 'Unknown')
            .filter((v, i, arr) => arr.indexOf(v) === i) // dedupe
        } catch { /* non-fatal */ }
      }

      return {
        available: true,
        organizationCount: targetOrg ? 1 : 0,
        organizations: targetOrg
          ? [{ id: targetOrg.id, name: targetOrg.attributes.name, status: targetOrg.attributes['organization-status-name'] }]
          : [],
        configurationCount,
        flexibleAssetTypeCount: flexTypes.length,
        flexibleAssetTypes: flexTypes.map((t) => ({ id: t.id, name: t.attributes.name })),
        hasDocumentedPolicies,
        hasDocumentedProcedures,
        hasNetworkDiagrams,
        // New fields for per-org detail
        matchedOrgName: targetOrg?.attributes.name ?? null,
        matchedOrgFlexibleAssetCount: flexibleAssetCount,
        matchedOrgFlexibleAssetTypes: orgFlexibleAssetNames,
        matchedOrgConfigCount: configurationCount,
        totalOrgsInAccount: orgs.length,
        note: targetOrg
          ? `Matched organization: ${targetOrg.attributes.name} (${configurationCount} configurations, ${flexibleAssetCount} flexible assets)`
          : companyName
            ? `No IT Glue organization matched "${companyName}". ${orgs.length} organizations in the account. Closest names: ${orgs.map((o) => o.attributes.name).slice(0, 15).join(', ')}`
            : null,
      }
    } catch (err) {
      return {
        available: false, organizationCount: 0, organizations: [],
        configurationCount: 0, flexibleAssetTypeCount: 0, flexibleAssetTypes: [],
        hasDocumentedPolicies: false, hasDocumentedProcedures: false, hasNetworkDiagrams: false,
        matchedOrgName: null, matchedOrgFlexibleAssetCount: 0, matchedOrgFlexibleAssetTypes: [], matchedOrgConfigCount: 0, totalOrgsInAccount: 0,
        note: `IT Glue API error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }
}
