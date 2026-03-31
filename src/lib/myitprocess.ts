/**
 * MyITProcess (MyITP) Reporting API Client
 *
 * vCIO platform for IT standards, alignment assessments, reviews,
 * recommendations, and QBR meetings.
 *
 * API docs: https://reporting.live.myitprocess.com/index.html
 * Auth: mitp-api-key header (raw API key, not Bearer)
 * Rate limit: 50 requests per minute per IT Provider
 * Note: v1 API is read-only (GET only)
 *
 * Required env vars:
 *   MYITP_API_KEY  — API key from MyITProcess > Account settings > API keys
 *   MYITP_API_URL  — Base URL (https://reporting.live.myitprocess.com)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MyItpPaginatedResponse<T> {
  page: number
  pageSize: number
  totalCount: number
  items: T[]
}

export interface MyItpClient {
  id: number
  name: string
  createdDate: string
  isActive: boolean
  deactivatedDate: string | null
  lastReviewDate: string | null
  lastAssignedMemberActivityDate: string | null
  alignmentScore: number | null
}

export interface MyItpReview {
  id: number
  name: string
  status: string
  assignedEngineer: { id: number; fullName: string } | null
  assignedVCIO: { id: number; fullName: string } | null
  createdDate: string
  lastUpdatedDate: string
  client: { id: number; name: string }
}

export interface MyItpFinding {
  id: number
  question: { label: string; text: string }
  review: { id: number; name: string }
  vcioAnswerType: string
  isArchived: boolean
}

export interface MyItpInitiative {
  id: number
  client: { id: number; name: string }
  title: string
  description: string
  isArchived: boolean
  recommendationsIds: number[]
}

export interface MyItpRecommendation {
  id: number
  parentId: number | null
  client: { id: number; name: string }
  initiative: { id: number } | null
  name: string
  description: string
  budget: number | null
  budgetMonth: string | null
  hours: number | null
  type: string | null
  responsibleParty: string | null
  status: string | null
  priority: string | null
  isArchived: boolean
  recommendationFeedback: string | null
  findingsIds: number[]
}

export interface MyItpMeeting {
  id: number
  status: string
  title: string
  purpose: string | null
  startDate: string
  endDate: string
  location: string | null
  summaryDescription: string | null
  recommendationIds: number[]
  client: { id: number; name: string }
  createdBy: { id: number; fullName: string } | null
}

export interface MyItpUser {
  id: number
  firstName: string
  lastName: string
  roleName: string
  lastLoginDate: string | null
}

// ---------------------------------------------------------------------------
// Summary for compliance evidence
// ---------------------------------------------------------------------------

export interface MyItpComplianceSummary {
  available: boolean
  /** Matched client in MyITP */
  matchedClient: MyItpClient | null
  /** All clients (for debugging if no match) */
  totalClients: number
  clientNames: string[]
  /** Reviews for matched client */
  reviews: MyItpReview[]
  /** Findings for matched client's reviews */
  findings: MyItpFinding[]
  /** Active recommendations */
  recommendations: MyItpRecommendation[]
  /** Initiatives */
  initiatives: MyItpInitiative[]
  /** Alignment score (from client record) */
  alignmentScore: number | null
  note: string | null
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

export class MyItProcessClient {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.MYITP_API_KEY ?? ''
    this.baseUrl = (process.env.MYITP_API_URL ?? 'https://reporting.live.myitprocess.com').replace(/\/$/, '')
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<MyItpPaginatedResponse<T>> {
    const url = new URL(`${this.baseUrl}/public-api/v1${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v)
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        'mitp-api-key': this.apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`MyITProcess API ${path} failed (${res.status}): ${text.substring(0, 300)}`)
    }

    return res.json() as Promise<MyItpPaginatedResponse<T>>
  }

  // --- Core endpoints ---

  async getClients(page = 1, pageSize = 100): Promise<MyItpPaginatedResponse<MyItpClient>> {
    return this.request<MyItpClient>('/clients', { page: String(page), pageSize: String(pageSize) })
  }

  async getReviews(page = 1, pageSize = 100, clientId?: number): Promise<MyItpPaginatedResponse<MyItpReview>> {
    const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) }
    if (clientId !== undefined) {
      params.filter_field = 'client.id'
      params.filter_predicate = 'equal'
      params.filter_condition = String(clientId)
    }
    return this.request<MyItpReview>('/reviews', params)
  }

  async getFindings(page = 1, pageSize = 100, reviewId?: number): Promise<MyItpPaginatedResponse<MyItpFinding>> {
    const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) }
    if (reviewId !== undefined) {
      params.filter_field = 'review.id'
      params.filter_predicate = 'equal'
      params.filter_condition = String(reviewId)
    }
    return this.request<MyItpFinding>('/findings', params)
  }

  async getInitiatives(page = 1, pageSize = 100, clientId?: number): Promise<MyItpPaginatedResponse<MyItpInitiative>> {
    const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) }
    if (clientId !== undefined) {
      params.filter_field = 'client.id'
      params.filter_predicate = 'equal'
      params.filter_condition = String(clientId)
    }
    return this.request<MyItpInitiative>('/initiatives', params)
  }

  async getRecommendations(page = 1, pageSize = 100, clientId?: number): Promise<MyItpPaginatedResponse<MyItpRecommendation>> {
    const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) }
    if (clientId !== undefined) {
      params.filter_field = 'client.id'
      params.filter_predicate = 'equal'
      params.filter_condition = String(clientId)
    }
    return this.request<MyItpRecommendation>('/recommendations', params)
  }

  async getMeetings(page = 1, pageSize = 100, clientId?: number): Promise<MyItpPaginatedResponse<MyItpMeeting>> {
    const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) }
    if (clientId !== undefined) {
      params.filter_field = 'client.id'
      params.filter_predicate = 'equal'
      params.filter_condition = String(clientId)
    }
    return this.request<MyItpMeeting>('/meetings', params)
  }

  async getUsers(): Promise<MyItpPaginatedResponse<MyItpUser>> {
    return this.request<MyItpUser>('/users', { pageSize: '100' })
  }

  // --- Fuzzy client matching ---

  async findClientByName(companyName: string): Promise<MyItpClient | null> {
    const allClients = await this.getClients(1, 100)
    const lowerName = companyName.toLowerCase()
    const normalized = lowerName.replace(/[^a-z0-9]/g, '')

    // Strategy 1: exact substring
    let match = allClients.items.find((c) => {
      const cn = c.name.toLowerCase()
      return cn.includes(lowerName) || lowerName.includes(cn)
    })
    if (match) return match

    // Strategy 2: normalized (strip punctuation)
    match = allClients.items.find((c) => {
      const cn = c.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      return cn.includes(normalized) || normalized.includes(cn)
    })
    if (match) return match

    // Strategy 3: all words present
    const words = lowerName.split(/\s+/).filter((w) => w.length >= 2)
    if (words.length >= 1) {
      match = allClients.items.find((c) => {
        const cn = c.name.toLowerCase()
        return words.every((w) => cn.includes(w))
      })
    }
    return match ?? null
  }

  // --- Compliance summary builder ---

  async buildComplianceSummary(companyName?: string): Promise<MyItpComplianceSummary> {
    if (!this.isConfigured()) {
      return {
        available: false, matchedClient: null, totalClients: 0, clientNames: [],
        reviews: [], findings: [], recommendations: [], initiatives: [],
        alignmentScore: null, note: 'MyITProcess API not configured',
      }
    }

    try {
      const clientsRes = await this.getClients(1, 100)
      const allClients = clientsRes.items
      const clientNames = allClients.map((c) => c.name)

      let matchedClient: MyItpClient | null = null
      if (companyName) {
        matchedClient = await this.findClientByName(companyName)
        if (!matchedClient) {
          console.log(`[myitp] No client matched "${companyName}" among ${allClients.length} clients: ${clientNames.slice(0, 20).join(', ')}`)
        }
      }

      if (!matchedClient) {
        return {
          available: true, matchedClient: null,
          totalClients: allClients.length, clientNames: clientNames.slice(0, 30),
          reviews: [], findings: [], recommendations: [], initiatives: [],
          alignmentScore: null,
          note: companyName
            ? `No MyITProcess client matched "${companyName}". ${allClients.length} clients in account.`
            : null,
        }
      }

      // Fetch reviews, recommendations, and initiatives for the matched client
      const [reviewsRes, recsRes, initsRes] = await Promise.all([
        this.getReviews(1, 100, matchedClient.id),
        this.getRecommendations(1, 100, matchedClient.id),
        this.getInitiatives(1, 100, matchedClient.id),
      ])

      // Fetch findings for the most recent review
      let findings: MyItpFinding[] = []
      if (reviewsRes.items.length > 0) {
        const latestReview = reviewsRes.items[0] // already sorted by most recent
        const findingsRes = await this.getFindings(1, 100, latestReview.id)
        findings = findingsRes.items
      }

      return {
        available: true,
        matchedClient,
        totalClients: allClients.length,
        clientNames: clientNames.slice(0, 30),
        reviews: reviewsRes.items,
        findings,
        recommendations: recsRes.items,
        initiatives: initsRes.items,
        alignmentScore: matchedClient.alignmentScore,
        note: `Matched client: ${matchedClient.name} (alignment score: ${matchedClient.alignmentScore ?? 'N/A'})`,
      }
    } catch (err) {
      return {
        available: false, matchedClient: null, totalClients: 0, clientNames: [],
        reviews: [], findings: [], recommendations: [], initiatives: [],
        alignmentScore: null,
        note: `MyITProcess API error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }
}
