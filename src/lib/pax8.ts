/**
 * pax8.ts — Pax8 API Client
 * Triple Cities Tech Customer Portal — Phase 2 (license management)
 *
 * Usage:
 *   import { pax8 } from '@/lib/pax8'
 *   const companies = await pax8.getCompanies()
 *
 * Environment variables required:
 *   PAX8_CLIENT_ID      — OAuth2 client ID
 *   PAX8_CLIENT_SECRET  — OAuth2 client secret
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Pax8Company {
  id: string
  name: string
  status: string
}

export interface Pax8Subscription {
  id: string
  productId: string
  productName?: string
  quantity: number
  status: string
  companyId: string
}

/**
 * Maps M365 SKU part numbers to known Pax8 product name substrings.
 * Used for fuzzy matching when looking up Pax8 subscriptions by M365 license type.
 * Add entries as new license types are encountered.
 */
export const SKU_TO_PAX8_PRODUCT: Record<string, string[]> = {
  'O365_BUSINESS_ESSENTIALS':      ['Business Basic'],
  'SMB_BUSINESS':                  ['Apps for Business'],
  'O365_BUSINESS_PREMIUM':         ['Business Premium'],
  'SMB_BUSINESS_PREMIUM':          ['Business Premium'],
  'SPB':                           ['Business Premium'],
  'EXCHANGESTANDARD':              ['Exchange Online (Plan 1)', 'Exchange Online Plan 1'],
  'EXCHANGEENTERPRISE':            ['Exchange Online (Plan 2)', 'Exchange Online Plan 2'],
  'ENTERPRISEPACK':                ['Office 365 E3', 'Microsoft 365 E3'],
  'ENTERPRISEPREMIUM':             ['Office 365 E5', 'Microsoft 365 E5'],
  'SPE_E3':                        ['Microsoft 365 E3'],
  'SPE_E5':                        ['Microsoft 365 E5'],
  'SPE_F1':                        ['Microsoft 365 F1'],
  'DESKLESSPACK':                  ['Microsoft 365 F1', 'Office 365 F3'],
  'PROJECTPREMIUM':                ['Project Plan 5', 'Project Online Premium'],
  'PROJECTPROFESSIONAL':           ['Project Plan 3', 'Project Online Professional'],
  'VISIOCLIENT':                   ['Visio Plan 2'],
  'POWER_BI_PRO':                  ['Power BI Pro'],
  'ATP_ENTERPRISE':                ['Defender for Office 365'],
  'THREAT_INTELLIGENCE':           ['Defender for Office 365 Plan 2'],
  'EMSPREMIUM':                    ['Enterprise Mobility + Security E5', 'EMS E5'],
  'EMS':                           ['Enterprise Mobility + Security E3', 'EMS E3'],
  'STREAM':                        ['Microsoft Stream'],
  'FLOW_FREE':                     ['Power Automate'],
  'POWERAPPS_VIRAL':               ['Power Apps'],
  'WIN_DEF_ATP':                   ['Defender for Endpoint'],
  'IDENTITY_THREAT_PROTECTION':    ['Defender for Identity'],
  'M365_F1':                       ['Microsoft 365 F1'],
}

export interface Pax8Product {
  id: string
  name: string
  vendorName: string
  vendorSku: string
}

export interface Pax8OrderLineItem {
  productId: string
  quantity: number
}

export interface Pax8Order {
  id: string
  status: string
  lineItems: Pax8OrderLineItem[]
}

export interface Pax8LicenseAvailability {
  available: number
  total: number
}

interface Pax8TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

interface Pax8PagedResponse<T> {
  content: T[]
  page: {
    size: number
    totalElements: number
    totalPages: number
    number: number
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAX8_TOKEN_URL = 'https://login.pax8.com/oauth/token'
const PAX8_AUDIENCE  = 'https://api.pax8.com'
const PAX8_BASE_URL  = 'https://api.pax8.com/v1'

// ---------------------------------------------------------------------------
// Pax8Client
// ---------------------------------------------------------------------------

class Pax8Client {
  private accessToken: string | null = null
  private tokenExpiry: Date | null = null

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  /**
   * Obtain (or reuse) a valid OAuth2 access token.
   * Called automatically before every API request.
   */
  async authenticate(): Promise<void> {
    // Return early if we have a valid, non-expired token (with 60s buffer)
    if (this.accessToken && this.tokenExpiry) {
      const bufferMs = 60 * 1000
      if (new Date(this.tokenExpiry.getTime() - bufferMs) > new Date()) {
        return
      }
    }

    const clientId     = process.env.PAX8_CLIENT_ID
    const clientSecret = process.env.PAX8_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error(
        'PAX8_CLIENT_ID and PAX8_CLIENT_SECRET environment variables are required'
      )
    }

    const res = await fetch(PAX8_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     clientId,
        client_secret: clientSecret,
        audience:      PAX8_AUDIENCE,
        grant_type:    'client_credentials',
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Pax8 authentication failed (${res.status}): ${body}`)
    }

    const data: Pax8TokenResponse = await res.json()
    this.accessToken = data.access_token
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000)
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.authenticate()

    const url = `${PAX8_BASE_URL}${path}`
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        ...(options.headers ?? {}),
      },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Pax8 API error [${res.status}] ${path}: ${body}`)
    }

    // 204 No Content
    if (res.status === 204) {
      return undefined as T
    }

    return res.json() as Promise<T>
  }

  private async getPaged<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const allItems: T[] = []
    let page = 0
    const size = 100

    while (true) {
      const query = new URLSearchParams({
        page: String(page),
        size: String(size),
        ...(params ?? {}),
      })

      const data = await this.request<Pax8PagedResponse<T>>(`${path}?${query}`)
      allItems.push(...data.content)

      if (page >= data.page.totalPages - 1 || data.content.length === 0) {
        break
      }
      page += 1
    }

    return allItems
  }

  // -------------------------------------------------------------------------
  // Companies
  // -------------------------------------------------------------------------

  /**
   * Returns all companies in the Pax8 partner account.
   */
  async getCompanies(): Promise<Pax8Company[]> {
    return this.getPaged<Pax8Company>('/companies')
  }

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  /**
   * Returns all subscriptions for a given Pax8 company.
   */
  async getSubscriptions(companyId: string): Promise<Pax8Subscription[]> {
    return this.getPaged<Pax8Subscription>('/subscriptions', { companyId })
  }

  /**
   * Increase (or decrease) the quantity of an existing subscription.
   */
  async increaseSubscriptionQuantity(
    subscriptionId: string,
    newQuantity: number
  ): Promise<void> {
    await this.request<void>(`/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: newQuantity }),
    })
  }

  /**
   * Find the active Pax8 subscription that corresponds to an M365 SKU part number.
   * Uses the SKU_TO_PAX8_PRODUCT map for fuzzy name matching.
   * Returns the first matching active subscription, or null.
   */
  async findSubscriptionForSku(
    companyId: string,
    skuPartNumber: string
  ): Promise<Pax8Subscription | null> {
    const productPatterns = SKU_TO_PAX8_PRODUCT[skuPartNumber.toUpperCase()]
    if (!productPatterns || productPatterns.length === 0) return null

    const subscriptions = await this.getSubscriptions(companyId)
    const active = subscriptions.filter((s) => s.status === 'Active')

    for (const sub of active) {
      const name = (sub.productName ?? '').toLowerCase()
      for (const pattern of productPatterns) {
        if (name.includes(pattern.toLowerCase())) {
          return sub
        }
      }
    }

    return null
  }

  /**
   * Increase a subscription by a given number of seats and wait briefly
   * for Pax8/Microsoft provisioning to propagate.
   * Returns the new total quantity.
   */
  async addSeatsAndWait(
    subscriptionId: string,
    currentQuantity: number,
    seatsToAdd: number,
    waitMs: number = 10000
  ): Promise<number> {
    const newQuantity = currentQuantity + seatsToAdd
    await this.increaseSubscriptionQuantity(subscriptionId, newQuantity)

    // Brief wait for Pax8 → Microsoft provisioning propagation
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }

    return newQuantity
  }

  // -------------------------------------------------------------------------
  // Products
  // -------------------------------------------------------------------------

  /**
   * Returns available products, optionally filtered by vendor name.
   */
  async getProducts(filters?: { vendorName?: string }): Promise<Pax8Product[]> {
    const params: Record<string, string> = {}
    if (filters?.vendorName) params.vendorName = filters.vendorName
    return this.getPaged<Pax8Product>('/products', params)
  }

  // -------------------------------------------------------------------------
  // License availability
  // -------------------------------------------------------------------------

  /**
   * Check how many licenses of a given product are available vs total
   * for a specific company.
   */
  async checkLicenseAvailability(
    companyId: string,
    productId: string
  ): Promise<Pax8LicenseAvailability> {
    const subscriptions = await this.getSubscriptions(companyId)
    const matching = subscriptions.filter(
      (s) => s.productId === productId && s.status === 'Active'
    )

    if (matching.length === 0) {
      return { available: 0, total: 0 }
    }

    // Sum quantities across all active subscriptions for this product
    const total = matching.reduce((sum, s) => sum + s.quantity, 0)

    // For "available", we'd need usage data from a separate endpoint.
    // Return total as a starting point; override if your Pax8 tier provides usage.
    return { available: total, total }
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  /**
   * Create a new order for a product.
   */
  async createOrder(
    companyId: string,
    productId: string,
    quantity: number
  ): Promise<Pax8Order> {
    return this.request<Pax8Order>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        lineItems: [{ productId, quantity }],
      }),
    })
  }

  /**
   * Retrieve an existing order by ID.
   */
  async getOrder(orderId: string): Promise<Pax8Order> {
    return this.request<Pax8Order>(`/orders/${orderId}`)
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const pax8 = new Pax8Client()
