/**
 * Datto SaaS Protection API Client
 *
 * Covers Microsoft 365 and Google Workspace cloud backup data.
 * Uses the same Datto Unified API (api.datto.com/v1) with Basic Auth
 * (same publicKey:privateKey pair as BCDR).
 *
 * API paths:
 *   GET /v1/saas/domains                      — list all SaaS-protected customers/domains
 *   GET /v1/saas/{saasCustomerId}/seats        — list seats (users/mailboxes/sites)
 *   GET /v1/saas/{saasCustomerId}/applications — backup status per application (daysUntil param)
 */

import { matchesCompanyName } from '@/utils';

// ============================================
// TYPES
// ============================================

export interface DattoSaasCustomerDomain {
  saasCustomerId: number;
  saasCustomerName: string;
  organizationName: string;
  domain: string;
  productType: string; // "Office365" | "Google"
  externalSubscriptionId: string;
}

export interface DattoSaasSeat {
  mainId: string;
  name: string;         // email or site name
  seatType: string;     // "User" | "SharedMailbox" | "Site" | "TeamSite" | "Team" (M365) or "User" | "SharedDrive" (Google)
  seatState: string;    // "Active" | "Paused" | "Archived" | "Unprotected"
  billable: boolean;
  dateAdded: string;
  remoteId: string;
}

export interface DattoSaasSummary {
  available: boolean;
  totalCustomers: number;
  totalSeats: number;
  totalDomains: number;
  activeSeats: number;
  pausedSeats: number;
  archivedSeats: number;
  unprotectedSeats: number;
  seatsByType: Array<{ type: string; count: number }>;
  customerDetails: Array<{
    name: string;
    domain: string;
    productType: string;
    seatCount: number;
  }>;
  note: string | null;
}

// ============================================
// CLIENT
// ============================================

export class DattoSaasClient {
  private publicKey: string;
  private privateKey: string;
  private baseUrl: string;

  constructor() {
    // Reuses the same BCDR API keys — Datto Unified API
    this.publicKey = process.env.DATTO_BCDR_PUBLIC_KEY || '';
    this.privateKey = process.env.DATTO_BCDR_PRIVATE_KEY || '';
    this.baseUrl = process.env.DATTO_BCDR_API_URL || 'https://api.datto.com/v1';
  }

  isConfigured(): boolean {
    return !!(this.publicKey && this.privateKey);
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const credentials = Buffer.from(`${this.publicKey}:${this.privateKey}`).toString('base64');

    const res = await fetch(url, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Datto SaaS API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * List all SaaS-protected customers/domains.
   * Returns one entry per domain — a customer with multiple domains appears multiple times.
   */
  async getCustomerDomains(): Promise<DattoSaasCustomerDomain[]> {
    try {
      const data = await this.request<{
        items?: Array<{
          saasCustomerId?: number;
          saasCustomerName?: string;
          organizationName?: string;
          domain?: string;
          productType?: string;
          externalSubscriptionId?: string;
        }>;
        pagination?: { page?: number; perPage?: number; totalPages?: number };
      }>('/saas/domains');

      return (data.items || []).map((c) => ({
        saasCustomerId: c.saasCustomerId || 0,
        saasCustomerName: c.saasCustomerName || '',
        organizationName: c.organizationName || '',
        domain: c.domain || '',
        productType: c.productType || 'Office365',
        externalSubscriptionId: c.externalSubscriptionId || '',
      }));
    } catch (error) {
      console.error('[DattoSaaS] getCustomerDomains error:', error);
      throw error;
    }
  }

  /**
   * List seats (protected users/mailboxes/sites) for a SaaS customer.
   */
  async getSeats(saasCustomerId: number): Promise<DattoSaasSeat[]> {
    try {
      const data = await this.request<{
        items?: Array<{
          mainId?: string;
          name?: string;
          seatType?: string;
          seatState?: string;
          billable?: boolean;
          dateAdded?: string;
          remoteId?: string;
        }>;
        pagination?: { page?: number; perPage?: number; totalPages?: number };
      }>(`/saas/${saasCustomerId}/seats`);

      return (data.items || []).map((s) => ({
        mainId: s.mainId || '',
        name: s.name || '',
        seatType: s.seatType || 'User',
        seatState: s.seatState || 'Unprotected',
        billable: s.billable !== false,
        dateAdded: s.dateAdded || '',
        remoteId: s.remoteId || '',
      }));
    } catch (error) {
      console.error(`[DattoSaaS] getSeats(${saasCustomerId}) error:`, error);
      return [];
    }
  }

  /**
   * Build a summary for the annual report.
   * Optionally filter by company name.
   */
  async buildSummary(companyName?: string): Promise<DattoSaasSummary> {
    if (!this.isConfigured()) {
      return {
        available: false,
        totalCustomers: 0,
        totalSeats: 0,
        totalDomains: 0,
        activeSeats: 0,
        pausedSeats: 0,
        archivedSeats: 0,
        unprotectedSeats: 0,
        seatsByType: [],
        customerDetails: [],
        note: 'Datto SaaS Protection integration not configured. Uses the same DATTO_BCDR_PUBLIC_KEY and DATTO_BCDR_PRIVATE_KEY environment variables.',
      };
    }

    try {
      const allDomains = await this.getCustomerDomains();

      // Deduplicate customers (one customer can have multiple domains)
      const customerMap = new Map<number, { name: string; domains: string[]; productType: string }>();
      for (const d of allDomains) {
        const existing = customerMap.get(d.saasCustomerId);
        if (existing) {
          existing.domains.push(d.domain);
        } else {
          customerMap.set(d.saasCustomerId, {
            name: d.saasCustomerName || d.organizationName,
            domains: [d.domain],
            productType: d.productType,
          });
        }
      }

      // Filter by company name if provided
      let customerIds = Array.from(customerMap.keys());
      if (companyName) {
        customerIds = customerIds.filter((id) => {
          const c = customerMap.get(id)!;
          return matchesCompanyName(companyName, c.name);
        });
      }

      if (customerIds.length === 0 && companyName) {
        return {
          available: true,
          totalCustomers: 0,
          totalSeats: 0,
          totalDomains: 0,
          activeSeats: 0,
          pausedSeats: 0,
          archivedSeats: 0,
          unprotectedSeats: 0,
          seatsByType: [],
          customerDetails: [],
          note: `No Datto SaaS Protection customers found matching "${companyName}". There are ${customerMap.size} total SaaS customers. Customer-to-company mapping may need manual configuration.`,
        };
      }

      // Get seat-level detail for each customer (limit to 10 to avoid timeout)
      const seatTypeCounts = new Map<string, number>();
      let totalSeats = 0;
      let activeSeats = 0;
      let pausedSeats = 0;
      let archivedSeats = 0;
      let unprotectedSeats = 0;
      const customerDetails: DattoSaasSummary['customerDetails'] = [];

      for (const customerId of customerIds.slice(0, 10)) {
        const customer = customerMap.get(customerId)!;
        try {
          const seats = await this.getSeats(customerId);
          const customerSeatCount = seats.length;
          totalSeats += customerSeatCount;

          for (const seat of seats) {
            // Count by type
            seatTypeCounts.set(seat.seatType, (seatTypeCounts.get(seat.seatType) || 0) + 1);

            // Count by state
            switch (seat.seatState) {
              case 'Active': activeSeats++; break;
              case 'Paused': pausedSeats++; break;
              case 'Archived': archivedSeats++; break;
              case 'Unprotected': unprotectedSeats++; break;
              default: unprotectedSeats++; break;
            }
          }

          customerDetails.push({
            name: customer.name,
            domain: customer.domains[0] || '',
            productType: customer.productType,
            seatCount: customerSeatCount,
          });
        } catch {
          // Continue if individual customer fetch fails
          customerDetails.push({
            name: customer.name,
            domain: customer.domains[0] || '',
            productType: customer.productType,
            seatCount: 0,
          });
        }
      }

      const totalDomains = customerIds.reduce((s, id) => {
        const c = customerMap.get(id);
        return s + (c?.domains.length || 0);
      }, 0);

      return {
        available: true,
        totalCustomers: customerIds.length,
        totalSeats,
        totalDomains,
        activeSeats,
        pausedSeats,
        archivedSeats,
        unprotectedSeats,
        seatsByType: Array.from(seatTypeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => ({ type, count })),
        customerDetails,
        note: null,
      };
    } catch (error) {
      console.error('[DattoSaaS] buildSummary error:', error);
      return {
        available: false,
        totalCustomers: 0,
        totalSeats: 0,
        totalDomains: 0,
        activeSeats: 0,
        pausedSeats: 0,
        archivedSeats: 0,
        unprotectedSeats: 0,
        seatsByType: [],
        customerDetails: [],
        note: `Datto SaaS Protection data fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
