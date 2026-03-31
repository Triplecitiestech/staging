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
  /** Whether key documentation types exist (policies, procedures, etc.) */
  hasDocumentedPolicies: boolean
  hasDocumentedProcedures: boolean
  hasNetworkDiagrams: boolean
  note: string | null
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
        hasDocumentedPolicies: false, hasDocumentedProcedures: false, hasNetworkDiagrams: false,
        note: 'IT Glue API not configured',
      }
    }

    try {
      // Get organizations
      const orgs = await this.getOrganizations()

      // If company name provided, try to match
      let targetOrg: ItGlueOrganization | null = null
      if (companyName) {
        const lowerName = companyName.toLowerCase()
        targetOrg = orgs.find((o) => {
          const orgName = o.attributes.name.toLowerCase()
          return orgName.includes(lowerName) || lowerName.includes(orgName)
        }) ?? null
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
      if (targetOrg) {
        try {
          const configs = await this.getConfigurations(targetOrg.id, 1, 1)
          // The API returns paginated — we just need to know configs exist
          configurationCount = configs.length > 0 ? configs.length : 0
        } catch { /* non-fatal */ }
      }

      return {
        available: true,
        organizationCount: orgs.length,
        organizations: orgs.slice(0, 20).map((o) => ({
          id: o.id,
          name: o.attributes.name,
          status: o.attributes['organization-status-name'],
        })),
        configurationCount,
        flexibleAssetTypeCount: flexTypes.length,
        flexibleAssetTypes: flexTypes.map((t) => ({ id: t.id, name: t.attributes.name })),
        hasDocumentedPolicies,
        hasDocumentedProcedures,
        hasNetworkDiagrams,
        note: targetOrg
          ? `Matched organization: ${targetOrg.attributes.name}`
          : companyName
            ? `No IT Glue organization matched "${companyName}". ${orgs.length} organizations available.`
            : null,
      }
    } catch (err) {
      return {
        available: false, organizationCount: 0, organizations: [],
        configurationCount: 0, flexibleAssetTypeCount: 0, flexibleAssetTypes: [],
        hasDocumentedPolicies: false, hasDocumentedProcedures: false, hasNetworkDiagrams: false,
        note: `IT Glue API error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }
}
