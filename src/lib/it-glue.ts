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
    'quick-notes'?: string | null
    'quick-notes-updated-at'?: string | null
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

/** Field (schema) of a flexible asset type — its name-key is the trait key. */
export interface ItGlueFlexibleAssetField {
  id: string
  attributes: {
    'flexible-asset-type-id': number
    order: number
    name: string
    kind: string
    'name-key': string
    required: boolean
    hint: string | null
    'tag-type': string | null
    'use-for-title': boolean
    'show-in-list': boolean
  }
}

export interface ItGlueDocument {
  id: string
  attributes: {
    name: string
    'organization-id': number
    'organization-name': string | null
    'resource-url': string | null
    restricted: boolean
    public: boolean
    'document-folder-id': number | null
    archived: boolean
    'created-at': string
    'updated-at': string
  }
}

/** A content block within a document (Text/Heading/Step/Gallery). */
export interface ItGlueDocumentSection {
  id: string
  attributes: {
    'resource-type': string
    content: string | null
    'rendered-content'?: string | null
    level?: number | null
    duration?: number | null
    sort: number
  }
}

/** Pagination metadata surfaced alongside a page of results. */
export interface ItGluePageMeta {
  totalCount: number | null
  totalPages: number | null
  currentPage: number
  pageSize: number
  hasMore: boolean
  /** Raw IT Glue `meta` object, for callers that want the exact keys. */
  raw: Record<string, unknown> | null
}

export interface ItGlueClientOptions {
  apiKey?: string
  baseUrl?: string
}

export class ItGlueClient {
  private apiKey: string
  private baseUrl: string

  constructor(opts?: ItGlueClientOptions) {
    this.apiKey = opts?.apiKey ?? process.env.IT_GLUE_API_KEY ?? ''
    this.baseUrl = (opts?.baseUrl ?? process.env.IT_GLUE_API_URL ?? 'https://api.itglue.com').replace(/\/$/, '')
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  /**
   * Low-level JSON:API request. GET by default; `body` is JSON-encoded for
   * POST/PATCH. Handles empty response bodies (e.g. publish).
   */
  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      method,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`IT Glue API ${method} ${path} failed (${res.status}): ${text.substring(0, 300)}`)
    }

    const text = await res.text()
    return (text ? JSON.parse(text) : {}) as T
  }

  private request<T>(path: string): Promise<T> {
    return this.send<T>('GET', path)
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

  // ── Reads (extended for the connector) ──────────────────────────────────

  /** Get one organization by id. */
  async getOrganization(id: string): Promise<ItGlueOrganization | null> {
    const data = await this.request<{ data: ItGlueOrganization }>(`/organizations/${id}`)
    return data.data ?? null
  }

  /**
   * Search organizations by (partial) name. Fetches up to two pages and
   * returns those whose normalized name matches, best fuzzy match first.
   */
  async searchOrganizations(query: string): Promise<ItGlueOrganization[]> {
    let orgs = await this.getOrganizations(1, 250)
    if (orgs.length === 250) {
      const page2 = await this.getOrganizations(2, 250)
      orgs = [...orgs, ...page2]
    }
    const q = normalizeCompanyName(query)
    const words = q.split(' ').filter(Boolean)
    const matches = orgs.filter((o) => {
      const n = normalizeCompanyName(o.attributes.name)
      return n.includes(q) || q.includes(n) || (words.length > 0 && words.every((w) => n.includes(w)))
    })
    const best = fuzzyMatchOrganization(query, orgs)
    if (best && !matches.some((m) => m.id === best.id)) matches.unshift(best)
    return matches.slice(0, 25)
  }

  /** Fields (schema) for a flexible asset type — the name-keys are the trait keys. */
  async getFlexibleAssetTypeFields(typeId: string): Promise<ItGlueFlexibleAssetField[]> {
    const data = await this.request<{ data: ItGlueFlexibleAssetType; included?: ItGlueFlexibleAssetField[] }>(
      `/flexible_asset_types/${typeId}?include=flexible_asset_fields`
    )
    return data.included ?? []
  }

  /** Flexible assets for an org, filtered by type (IT Glue requires the type id). */
  async getFlexibleAssetsByType(orgId: string, flexibleAssetTypeId: string, page = 1, pageSize = 50): Promise<ItGlueFlexibleAsset[]> {
    const data = await this.request<{ data: ItGlueFlexibleAsset[] }>(
      `/flexible_assets?filter[flexible-asset-type-id]=${flexibleAssetTypeId}&filter[organization-id]=${orgId}&page[size]=${pageSize}&page[number]=${page}`
    )
    return data.data ?? []
  }

  /** Get one flexible asset by id (includes current traits). */
  async getFlexibleAsset(id: string): Promise<ItGlueFlexibleAsset | null> {
    const data = await this.request<{ data: ItGlueFlexibleAsset }>(`/flexible_assets/${id}`)
    return data.data ?? null
  }

  /**
   * List ONE page of an org's documents (never passwords), with pagination meta.
   *
   * IMPORTANT: IT Glue's documents index returns ONLY root-level documents when
   * filter[document_folder_id] is omitted. To get the whole library (docs inside
   * folders too) you must pass filter[document_folder_id]=null. We therefore
   * default the folder filter to 'null' (= ALL documents); pass '0' for root-only
   * or a specific folder id to scope. Page size is capped at IT Glue's max (1000).
   */
  async getDocumentsPage(
    orgId: string,
    opts?: { page?: number; pageSize?: number; documentFolderId?: string }
  ): Promise<{ documents: ItGlueDocument[]; meta: ItGluePageMeta }> {
    const page = opts?.page ?? 1
    const pageSize = Math.min(Math.max(opts?.pageSize ?? 100, 1), 1000)
    const folder = opts?.documentFolderId ?? 'null' // 'null' = ALL documents (root + in folders)
    const body = await this.request<{ data: ItGlueDocument[]; meta?: Record<string, unknown> }>(
      `/organizations/${orgId}/relationships/documents?filter[document_folder_id]=${encodeURIComponent(folder)}&page[size]=${pageSize}&page[number]=${page}`
    )
    const documents = body.data ?? []
    const raw = body.meta ?? null
    const num = (v: unknown): number | null =>
      typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : null
    const totalPages = raw ? num(raw['total-pages']) : null
    return {
      documents,
      meta: {
        totalCount: raw ? num(raw['total-count']) : null,
        totalPages,
        currentPage: (raw ? num(raw['current-page']) : null) ?? page,
        pageSize,
        // Prefer authoritative meta; fall back to a full-page heuristic.
        hasMore: totalPages != null ? page < totalPages : documents.length === pageSize,
        raw,
      },
    }
  }

  /** Page through ALL of an org's documents (folder=null). Capped for safety. */
  async getAllDocuments(orgId: string, documentFolderId?: string): Promise<ItGlueDocument[]> {
    const all: ItGlueDocument[] = []
    for (let page = 1; page <= 50; page++) {
      const { documents, meta } = await this.getDocumentsPage(orgId, { page, pageSize: 1000, documentFolderId })
      all.push(...documents)
      if (!meta.hasMore || documents.length === 0) break
    }
    return all
  }

  /**
   * Search an org's documents by name. IT Glue has no documented server-side
   * name filter for documents, so this pages the full library and matches by
   * name (all whitespace-separated terms must appear, case-insensitive).
   */
  async searchDocuments(orgId: string, query: string): Promise<ItGlueDocument[]> {
    const all = await this.getAllDocuments(orgId)
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return all
    return all.filter((d) => {
      const name = (d.attributes.name ?? '').toLowerCase()
      return terms.every((t) => name.includes(t))
    })
  }

  /** Full (untruncated) Quick Notes HTML for an org, from the Organization record. */
  async getOrganizationQuickNotes(
    orgId: string
  ): Promise<{ organizationId: string; name: string | null; quickNotesHtml: string | null; updatedAt: string | null }> {
    const org = await this.getOrganization(orgId)
    return {
      organizationId: orgId,
      name: org?.attributes.name ?? null,
      quickNotesHtml: org?.attributes['quick-notes'] ?? null,
      updatedAt: org?.attributes['quick-notes-updated-at'] ?? null,
    }
  }

  /** List the content sections of a document. */
  async getDocumentSections(documentId: string): Promise<ItGlueDocumentSection[]> {
    const data = await this.request<{ data: ItGlueDocumentSection[] }>(
      `/documents/${documentId}/relationships/sections`
    )
    return data.data ?? []
  }

  // ── Writes (documents + flexible assets; NEVER /passwords) ───────────────

  /**
   * Convert response-shaped traits (tag fields as `{ type, values: [{ id }] }`)
   * into write-shaped traits (tag fields as arrays of ids). Scalars pass through.
   * The response-only `type` discriminator is dropped.
   */
  private traitsForWrite(traits: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(traits ?? {})) {
      if (v && typeof v === 'object' && Array.isArray((v as { values?: unknown }).values)) {
        out[k] = (v as { values: Array<{ id: number | string }> }).values.map((x) => x.id)
      } else {
        out[k] = v
      }
    }
    return out
  }

  /** Create a flexible asset. */
  async createFlexibleAsset(input: { organizationId: string | number; flexibleAssetTypeId: string | number; traits: Record<string, unknown> }): Promise<ItGlueFlexibleAsset> {
    const body = {
      data: {
        type: 'flexible-assets',
        attributes: {
          'organization-id': Number(input.organizationId),
          'flexible-asset-type-id': Number(input.flexibleAssetTypeId),
          traits: input.traits,
        },
      },
    }
    const data = await this.send<{ data: ItGlueFlexibleAsset }>('POST', '/flexible_assets', body)
    return data.data
  }

  /**
   * Update a flexible asset's traits. IT Glue PATCH is DESTRUCTIVE — any trait
   * omitted from the payload is deleted — so this GETs the current asset,
   * merges the caller's changed traits over the full existing set (converted to
   * write shape), and PATCHes the complete object.
   */
  async updateFlexibleAsset(id: string, traitChanges: Record<string, unknown>): Promise<ItGlueFlexibleAsset> {
    const current = await this.getFlexibleAsset(id)
    if (!current) throw new Error(`Flexible asset ${id} not found`)
    // Existing traits are converted to write shape; caller-supplied changes are
    // trusted as already write-shaped (tag traits as arrays of ids) per the tool docs.
    const merged = { ...this.traitsForWrite(current.attributes.traits as Record<string, unknown>), ...traitChanges }
    const body = {
      data: {
        type: 'flexible-assets',
        attributes: {
          'flexible-asset-type-id': current.attributes['flexible-asset-type-id'],
          traits: merged,
        },
      },
    }
    const data = await this.send<{ data: ItGlueFlexibleAsset }>('PATCH', `/flexible_assets/${id}`, body)
    return data.data
  }

  /** Create a native document shell under an organization. */
  async createDocument(input: { organizationId: string | number; name: string; public?: boolean; documentFolderId?: string | number | null }): Promise<ItGlueDocument> {
    const attributes: Record<string, unknown> = {
      organization_id: Number(input.organizationId),
      name: input.name,
      is_uploaded: false,
    }
    if (input.public !== undefined) attributes.public = input.public
    if (input.documentFolderId != null) attributes.document_folder_id = Number(input.documentFolderId)
    const data = await this.send<{ data: ItGlueDocument }>('POST', '/documents', { data: { type: 'documents', attributes } })
    return data.data
  }

  /** Append a content section to a document. resourceType defaults to Text. */
  async addDocumentSection(documentId: string, input: { content: string; resourceType?: 'Document::Text' | 'Document::Heading' | 'Document::Step'; level?: number; duration?: number }): Promise<ItGlueDocumentSection> {
    const attributes: Record<string, unknown> = {
      'resource-type': input.resourceType ?? 'Document::Text',
      content: input.content,
    }
    if (input.level !== undefined) attributes.level = input.level
    if (input.duration !== undefined) attributes.duration = input.duration
    const data = await this.send<{ data: ItGlueDocumentSection }>('POST', `/documents/${documentId}/relationships/sections`, { data: { type: 'document-sections', attributes } })
    return data.data
  }

  /** Replace the content of an existing document section. */
  async updateDocumentSection(documentId: string, sectionId: string, input: { content: string; resourceType?: string; level?: number }): Promise<ItGlueDocumentSection> {
    const attributes: Record<string, unknown> = { content: input.content }
    if (input.resourceType) attributes['resource-type'] = input.resourceType
    if (input.level !== undefined) attributes.level = input.level
    const data = await this.send<{ data: ItGlueDocumentSection }>('PATCH', `/documents/${documentId}/relationships/sections/${sectionId}`, { data: { type: 'document-sections', attributes } })
    return data.data
  }

  /** Update a document's metadata (name / public / folder). */
  async updateDocument(id: string, input: { name?: string; public?: boolean; documentFolderId?: string | number | null }): Promise<ItGlueDocument> {
    const attributes: Record<string, unknown> = {}
    if (input.name !== undefined) attributes.name = input.name
    if (input.public !== undefined) attributes.public = input.public
    if (input.documentFolderId !== undefined) attributes.document_folder_id = input.documentFolderId == null ? null : Number(input.documentFolderId)
    const data = await this.send<{ data: ItGlueDocument }>('PATCH', `/documents/${id}`, { data: { type: 'documents', attributes } })
    return data.data
  }

  /** Publish a document. */
  async publishDocument(id: string): Promise<unknown> {
    return this.send('PATCH', `/documents/${id}/publish`, { data: { type: 'documents', attributes: {} } })
  }

  /**
   * Convenience: create a document with a single rich-text (Text) body section
   * and optionally publish it.
   */
  async createDocumentWithBody(input: { organizationId: string | number; name: string; html: string; public?: boolean; documentFolderId?: string | number | null; publish?: boolean }): Promise<{ document: ItGlueDocument; section: ItGlueDocumentSection }> {
    const document = await this.createDocument({ organizationId: input.organizationId, name: input.name, public: input.public, documentFolderId: input.documentFolderId })
    const section = await this.addDocumentSection(document.id, { content: input.html, resourceType: 'Document::Text' })
    if (input.publish) await this.publishDocument(document.id)
    return { document, section }
  }
}
