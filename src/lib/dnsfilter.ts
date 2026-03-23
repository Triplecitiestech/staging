/**
 * DNSFilter API Client
 *
 * API token authentication via Authorization header.
 * Fetches DNS filtering events, blocked queries, and threat reports.
 *
 * DNSFilter API docs: https://app.dnsfilter.com/api/docs
 * Base URL: https://api.dnsfilter.com/v1
 */

export interface DnsFilterEvent {
  id: string;
  domain: string;
  category: string;
  action: string;
  timestamp: string;
  networkId: string;
  networkName: string;
  threatType: string;
}

export interface DnsFilterSummary {
  available: boolean;
  totalQueries: number;
  blockedQueries: number;
  threatsByCategory: Array<{ category: string; count: number }>;
  topBlockedDomains: Array<{ domain: string; count: number }>;
  monthlyTrends: Array<{ month: string; label: string; blocked: number; total: number }>;
  note: string | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export class DnsFilterClient {
  private apiToken: string;
  private baseUrl: string;

  constructor() {
    this.apiToken = process.env.DNSFILTER_API_TOKEN || '';
    this.baseUrl = process.env.DNSFILTER_API_URL || 'https://api.dnsfilter.com/v1';
  }

  isConfigured(): boolean {
    return !!this.apiToken;
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DNSFilter API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Fetch traffic/threat reports for a date range.
   */
  async getTrafficReport(since: Date, until: Date): Promise<{
    total_queries: number;
    blocked_queries: number;
    threats: Array<{ category: string; count: number }>;
    top_blocked: Array<{ domain: string; count: number }>;
  }> {
    const sinceStr = since.toISOString().split('T')[0];
    const untilStr = until.toISOString().split('T')[0];

    try {
      const data = await this.request<{
        data?: {
          total_queries?: number;
          blocked_queries?: number;
          categories?: Array<{ name?: string; count?: number }>;
          top_blocked_domains?: Array<{ domain?: string; count?: number }>;
        };
        total_queries?: number;
        blocked_queries?: number;
      }>(`/traffic_reports?start_date=${sinceStr}&end_date=${untilStr}`);

      const inner = data.data || data;
      return {
        total_queries: inner.total_queries || 0,
        blocked_queries: inner.blocked_queries || 0,
        threats: ((data.data?.categories) || []).map((c) => ({
          category: c.name || 'Unknown',
          count: c.count || 0,
        })),
        top_blocked: ((data.data?.top_blocked_domains) || []).map((d) => ({
          domain: d.domain || '',
          count: d.count || 0,
        })),
      };
    } catch (error) {
      console.error('[DNSFilter] getTrafficReport error:', error);
      throw error;
    }
  }

  /**
   * Build a summary for reporting.
   */
  async buildSummary(periodStart: Date, periodEnd: Date): Promise<DnsFilterSummary> {
    if (!this.isConfigured()) {
      return {
        available: false,
        totalQueries: 0,
        blockedQueries: 0,
        threatsByCategory: [],
        topBlockedDomains: [],
        monthlyTrends: [],
        note: 'DNSFilter integration not configured. Set DNSFILTER_API_TOKEN environment variable.',
      };
    }

    try {
      const report = await this.getTrafficReport(periodStart, periodEnd);

      // Build monthly trends by querying month by month
      const monthlyTrends: Array<{ month: string; label: string; blocked: number; total: number }> = [];
      const cursor = new Date(periodStart);

      while (cursor < periodEnd) {
        const monthStart = new Date(cursor);
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
        const effectiveEnd = monthEnd > periodEnd ? periodEnd : monthEnd;

        try {
          const monthReport = await this.getTrafficReport(monthStart, effectiveEnd);
          const m = cursor.getMonth() + 1;
          monthlyTrends.push({
            month: `${cursor.getFullYear()}-${m < 10 ? '0' + m : m}`,
            label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`,
            blocked: monthReport.blocked_queries,
            total: monthReport.total_queries,
          });
        } catch {
          // If monthly query fails, add zero entry
          const m = cursor.getMonth() + 1;
          monthlyTrends.push({
            month: `${cursor.getFullYear()}-${m < 10 ? '0' + m : m}`,
            label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`,
            blocked: 0,
            total: 0,
          });
        }

        cursor.setMonth(cursor.getMonth() + 1);
        cursor.setDate(1);
      }

      return {
        available: true,
        totalQueries: report.total_queries,
        blockedQueries: report.blocked_queries,
        threatsByCategory: report.threats.sort((a, b) => b.count - a.count),
        topBlockedDomains: report.top_blocked.slice(0, 10),
        monthlyTrends,
        note: null,
      };
    } catch (error) {
      console.error('[DNSFilter] buildSummary error:', error);
      return {
        available: false,
        totalQueries: 0,
        blockedQueries: 0,
        threatsByCategory: [],
        topBlockedDomains: [],
        monthlyTrends: [],
        note: `DNSFilter data fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
