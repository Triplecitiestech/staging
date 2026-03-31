/**
 * DNSFilter API Client
 *
 * API token authentication via Authorization header (Token prefix).
 * Fetches DNS filtering stats, blocked queries, and threat reports.
 *
 * DNSFilter API docs: https://api.dnsfilter.com/docs
 * SwaggerHub: https://app.swaggerhub.com/apis-docs/DNSFilter/dns-filter_api/1.0.13
 * Base URL: https://api.dnsfilter.com/v1
 *
 * Key endpoints:
 *   GET /v1/msp/organizations        — list MSP sub-organizations
 *   GET /v1/organizations             — get current organization
 *   GET /v1/organizations/{id}/stats  — get org-level query stats
 *   GET /v1/networks                  — list networks
 *   GET /v1/traffic_reports           — traffic report data
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
    // DNSFilter uses "Token" prefix (not "Bearer") for JWT auth
    const res = await fetch(url, {
      headers: {
        'Authorization': `Token ${this.apiToken}`,
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
   * Get the current organization info to find org ID.
   */
  private async getOrganizationId(): Promise<string | null> {
    try {
      // The /organizations endpoint returns { data: [{ id: "123", type: "organizations", ... }] }
      const orgData = await this.request<{
        data?: Array<{ id?: string; type?: string; attributes?: { name?: string } }> | { id?: string };
      }>('/organizations');

      // Handle array response (MSP with multiple orgs)
      if (Array.isArray(orgData.data) && orgData.data.length > 0) {
        console.log(`[dnsfilter] Found ${orgData.data.length} organizations. Using first: ${orgData.data[0].attributes?.name ?? orgData.data[0].id}`);
        return orgData.data[0].id ?? null;
      }
      // Handle single object response
      if (orgData.data && !Array.isArray(orgData.data)) {
        return (orgData.data as { id?: string }).id ?? null;
      }
      return null;
    } catch (err) {
      console.error('[dnsfilter] Failed to get org ID:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * Fetch traffic/threat reports for a date range.
   * Tries multiple endpoint patterns since DNSFilter API docs aren't fully public.
   */
  async getTrafficReport(since: Date, until: Date): Promise<{
    total_queries: number;
    blocked_queries: number;
    threats: Array<{ category: string; count: number }>;
    top_blocked: Array<{ domain: string; count: number }>;
  }> {
    // DNSFilter uses ISO datetime with from/to params on /traffic_reports/query_logs
    const sinceStr = since.toISOString();
    const untilStr = until.toISOString();
    const sinceDateOnly = since.toISOString().split('T')[0];
    const untilDateOnly = until.toISOString().split('T')[0];

    const orgId = await this.getOrganizationId();
    console.log(`[dnsfilter] Org ID: ${orgId}, date range: ${sinceDateOnly} to ${untilDateOnly}`);

    // Build endpoints to try — org-scoped first (required for most accounts)
    const endpoints: string[] = [];
    if (orgId) {
      endpoints.push(
        `/organizations/${orgId}/filtering_report?start=${sinceDateOnly}&end=${untilDateOnly}`,
        `/organizations/${orgId}/total_queries?start=${sinceDateOnly}&end=${untilDateOnly}`,
        `/organizations/${orgId}/traffic_reports?from=${sinceStr}&to=${untilStr}`,
        `/organizations/${orgId}/traffic_reports?start_date=${sinceDateOnly}&end_date=${untilDateOnly}`,
      );
    }
    // Global fallbacks
    endpoints.push(
      `/traffic_reports?from=${sinceStr}&to=${untilStr}`,
      `/traffic_reports?start_date=${sinceDateOnly}&end_date=${untilDateOnly}`,
    );

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        const data = await this.request<{
          data?: {
            total_queries?: number;
            blocked_queries?: number;
            allowed_queries?: number;
            categories?: Array<{ name?: string; count?: number }>;
            top_blocked_domains?: Array<{ domain?: string; count?: number }>;
          };
          total_queries?: number;
          blocked_queries?: number;
          allowed_queries?: number;
        }>(endpoint);

        const inner = data.data || data;
        const totalQ = inner.total_queries || 0;
        const blockedQ = inner.blocked_queries || 0;

        // If we got data, return it
        if (totalQ > 0 || blockedQ > 0) {
          return {
            total_queries: totalQ,
            blocked_queries: blockedQ,
            threats: ((data.data?.categories) || []).map((c) => ({
              category: c.name || 'Unknown',
              count: c.count || 0,
            })),
            top_blocked: ((data.data?.top_blocked_domains) || []).map((d) => ({
              domain: d.domain || '',
              count: d.count || 0,
            })),
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Try next endpoint
        continue;
      }
    }

    // If all endpoints returned 0 but no error, return zeros
    if (!lastError) {
      return { total_queries: 0, blocked_queries: 0, threats: [], top_blocked: [] };
    }

    throw new Error(
      `DNSFilter data fetch failed after trying ${endpoints.length} endpoints. ` +
      `Last error: ${lastError.message}. ` +
      `Base URL: ${this.baseUrl}. Verify DNSFILTER_API_TOKEN and DNSFILTER_API_URL are correct.`
    );
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
