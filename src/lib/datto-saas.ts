/**
 * Datto SaaS Protection API Client
 *
 * Covers Microsoft 365 and Google Workspace cloud backup data.
 * Uses the same Datto Unified API (api.datto.com/v1) with Basic Auth
 * (same publicKey:privateKey pair as BCDR).
 *
 * API paths:
 *   GET /v1/saas                             — list SaaS customers
 *   GET /v1/saas/{saasCustomerId}/domains     — list protected domains
 *   GET /v1/saas/{saasCustomerId}/domains/{domainId}/seats — list seats (users)
 *   GET /v1/saas/{saasCustomerId}/bulkSeatAssignment — seat assignment overview
 */

// ============================================
// TYPES
// ============================================

export interface DattoSaasCustomer {
  id: number;
  name: string;
  seatCount: number;
  domainCount: number;
  backupsEnabled: boolean;
  saasType: string; // "ms365" | "google" | etc.
}

export interface DattoSaasDomain {
  id: number;
  domain: string;
  saasCustomerId: number;
  seatCount: number;
}

export interface DattoSaasSeat {
  id: number;
  seatType: string;      // "user", "sharedMailbox", "site", "team"
  displayName: string;
  email: string;
  enabled: boolean;
  lastBackupTimestamp: string | null;
  lastBackupStatus: string | null;
  storageUsedBytes: number;
  billable: boolean;
}

export interface DattoSaasSummary {
  available: boolean;
  totalCustomers: number;
  totalSeats: number;
  totalDomains: number;
  protectedUsers: number;
  protectedSharedMailboxes: number;
  protectedSites: number;
  protectedTeams: number;
  backupSuccessRate: number | null;
  lastBackupDate: string | null;
  seatsByType: Array<{ type: string; count: number }>;
  customerDetails: Array<{
    name: string;
    saasType: string;
    seatCount: number;
    domainCount: number;
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
   * List all SaaS Protection customers.
   */
  async getCustomers(): Promise<DattoSaasCustomer[]> {
    try {
      const data = await this.request<{
        items?: Array<{
          id?: number;
          name?: string;
          seatsInUse?: number;
          numberOfDomains?: number;
          backupStatus?: string;
          applicationType?: string;
        }>;
        pagination?: { totalItems?: number };
      }>('/saas');

      return (data.items || []).map((c) => ({
        id: c.id || 0,
        name: c.name || '',
        seatCount: c.seatsInUse || 0,
        domainCount: c.numberOfDomains || 0,
        backupsEnabled: c.backupStatus !== 'disabled',
        saasType: c.applicationType || 'ms365',
      }));
    } catch (error) {
      console.error('[DattoSaaS] getCustomers error:', error);
      throw error;
    }
  }

  /**
   * List domains for a SaaS customer.
   */
  async getDomains(saasCustomerId: number): Promise<DattoSaasDomain[]> {
    try {
      const data = await this.request<{
        items?: Array<{
          id?: number;
          domain?: string;
          saasCustomerId?: number;
          seatsInUse?: number;
        }>;
      }>(`/saas/${saasCustomerId}/domains`);

      return (data.items || []).map((d) => ({
        id: d.id || 0,
        domain: d.domain || '',
        saasCustomerId: d.saasCustomerId || saasCustomerId,
        seatCount: d.seatsInUse || 0,
      }));
    } catch (error) {
      console.error(`[DattoSaaS] getDomains(${saasCustomerId}) error:`, error);
      return [];
    }
  }

  /**
   * List seats (protected users/mailboxes/sites) for a domain.
   */
  async getSeats(saasCustomerId: number, domainId: number): Promise<DattoSaasSeat[]> {
    try {
      const data = await this.request<{
        items?: Array<{
          id?: number;
          seatType?: string;
          displayName?: string;
          email?: string;
          enabled?: boolean;
          lastBackupTimestamp?: string;
          lastBackupStatus?: string;
          storageInBytes?: number;
          billable?: boolean;
        }>;
      }>(`/saas/${saasCustomerId}/domains/${domainId}/seats`);

      return (data.items || []).map((s) => ({
        id: s.id || 0,
        seatType: s.seatType || 'user',
        displayName: s.displayName || '',
        email: s.email || '',
        enabled: s.enabled !== false,
        lastBackupTimestamp: s.lastBackupTimestamp || null,
        lastBackupStatus: s.lastBackupStatus || null,
        storageUsedBytes: s.storageInBytes || 0,
        billable: s.billable !== false,
      }));
    } catch (error) {
      console.error(`[DattoSaaS] getSeats(${saasCustomerId}, ${domainId}) error:`, error);
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
        protectedUsers: 0,
        protectedSharedMailboxes: 0,
        protectedSites: 0,
        protectedTeams: 0,
        backupSuccessRate: null,
        lastBackupDate: null,
        seatsByType: [],
        customerDetails: [],
        note: 'Datto SaaS Protection integration not configured. Uses the same DATTO_BCDR_PUBLIC_KEY and DATTO_BCDR_PRIVATE_KEY environment variables.',
      };
    }

    try {
      const customers = await this.getCustomers();

      // Filter by company name if provided
      let filtered = customers;
      if (companyName) {
        const companyWords = companyName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        filtered = customers.filter((c) => {
          const name = c.name.toLowerCase();
          return companyWords.some((w) => name.includes(w));
        });
      }

      if (filtered.length === 0 && companyName) {
        return {
          available: true,
          totalCustomers: 0,
          totalSeats: 0,
          totalDomains: 0,
          protectedUsers: 0,
          protectedSharedMailboxes: 0,
          protectedSites: 0,
          protectedTeams: 0,
          backupSuccessRate: null,
          lastBackupDate: null,
          seatsByType: [],
          customerDetails: [],
          note: `No Datto SaaS Protection customers found matching "${companyName}". There are ${customers.length} total SaaS customers. Customer-to-company mapping may need manual configuration.`,
        };
      }

      // Get seat-level detail for each customer (limited to first 5 to avoid timeout)
      const seatTypeCounts = new Map<string, number>();
      let totalSeatsDetail = 0;
      let successCount = 0;
      let totalBackupCount = 0;
      let latestBackup: string | null = null;

      for (const customer of filtered.slice(0, 5)) {
        try {
          const domains = await this.getDomains(customer.id);
          for (const domain of domains) {
            const seats = await this.getSeats(customer.id, domain.id);
            for (const seat of seats) {
              if (!seat.enabled) continue;
              totalSeatsDetail++;
              const type = seat.seatType || 'user';
              seatTypeCounts.set(type, (seatTypeCounts.get(type) || 0) + 1);

              if (seat.lastBackupStatus) {
                totalBackupCount++;
                if (seat.lastBackupStatus === 'success' || seat.lastBackupStatus === 'completed') {
                  successCount++;
                }
              }

              if (seat.lastBackupTimestamp) {
                if (!latestBackup || seat.lastBackupTimestamp > latestBackup) {
                  latestBackup = seat.lastBackupTimestamp;
                }
              }
            }
          }
        } catch {
          // Continue if individual customer fetch fails
        }
      }

      const totalSeats = filtered.reduce((s, c) => s + c.seatCount, 0);
      const totalDomains = filtered.reduce((s, c) => s + c.domainCount, 0);

      return {
        available: true,
        totalCustomers: filtered.length,
        totalSeats: totalSeats || totalSeatsDetail,
        totalDomains,
        protectedUsers: seatTypeCounts.get('user') || 0,
        protectedSharedMailboxes: seatTypeCounts.get('sharedMailbox') || 0,
        protectedSites: seatTypeCounts.get('site') || 0,
        protectedTeams: seatTypeCounts.get('team') || 0,
        backupSuccessRate: totalBackupCount > 0 ? Math.round((successCount / totalBackupCount) * 100) : null,
        lastBackupDate: latestBackup,
        seatsByType: Array.from(seatTypeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => ({ type, count })),
        customerDetails: filtered.map((c) => ({
          name: c.name,
          saasType: c.saasType,
          seatCount: c.seatCount,
          domainCount: c.domainCount,
        })),
        note: null,
      };
    } catch (error) {
      console.error('[DattoSaaS] buildSummary error:', error);
      return {
        available: false,
        totalCustomers: 0,
        totalSeats: 0,
        totalDomains: 0,
        protectedUsers: 0,
        protectedSharedMailboxes: 0,
        protectedSites: 0,
        protectedTeams: 0,
        backupSuccessRate: null,
        lastBackupDate: null,
        seatsByType: [],
        customerDetails: [],
        note: `Datto SaaS Protection data fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
