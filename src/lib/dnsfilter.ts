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
   * List the organizations visible to this API token (MSP sub-orgs). Used to
   * resolve a customer's org by name when there is no explicit mapping — the
   * same approach the SOC enrichment and compliance collectors use.
   */
  async listOrganizations(): Promise<Array<{ id: string; name: string }>> {
    const orgData = await this.request<{
      data?: Array<{ id?: string; attributes?: { name?: string } }>;
    }>('/organizations');
    return (orgData.data ?? [])
      .filter((o): o is { id: string; attributes?: { name?: string } } => !!o.id)
      .map((o) => ({ id: o.id, name: o.attributes?.name ?? '' }));
  }

  /**
   * Fetch traffic/threat reports for a date range.
   * Uses the `/traffic_reports/query_logs` endpoint (the same one the SOC
   * enrichment uses) — `organization_id` is a query param and `data.page.total`
   * is the match count.
   *
   * `from`/`to` MUST be sent as DATE-ONLY (`YYYY-MM-DD`): with full-ISO
   * timestamps the API rejects any `from` more than 9 days before now with
   * HTTP 400 ("Time period (from now) is greater than 9 days"); date-only
   * values lift that cap (a 30-day date-only window returns 200).
   *
   * The blocked-traffic breakdown is aggregated CLIENT-SIDE from query_logs
   * rows (`categories_names[]`, `domain`/`fqdn`) — `top_categories` and
   * `top_domains` silently ignore `result=blocked` (they return TOTAL
   * traffic), so they are not a reliable blocked-breakdown source.
   *
   * @param orgId  When provided, scopes the pull to exactly this organization
   *   via `organization_id`. When omitted the query is account-wide (MSP) — used
   *   only by internal MSP roll-ups, never for a single customer's report.
   * @param opts.includeBreakdown  When false, only the totals are fetched (one
   *   row per call) — used by the monthly-trend loop, which discards breakdowns.
   */
  async getTrafficReport(
    since: Date,
    until: Date,
    orgId?: string,
    opts?: { includeBreakdown?: boolean },
  ): Promise<{
    total_queries: number;
    blocked_queries: number;
    threats: Array<{ category: string; count: number }>;
    top_blocked: Array<{ domain: string; count: number }>;
    /** True when the blocked-row pull hit the page cap — breakdown is from a partial sample; totals stay exact. */
    breakdown_partial: boolean;
  }> {
    const includeBreakdown = opts?.includeBreakdown !== false;
    // Date-only (UTC) — full-ISO triggers the API's 9-day from-now cap.
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const queryLogs = (params: Record<string, string>) => {
      const qs = new URLSearchParams({ from: fmt(since), to: fmt(until), ...params });
      if (orgId) qs.set('organization_id', orgId);
      return this.request<{
        data?: {
          values?: Array<{ domain?: string; fqdn?: string; threat?: boolean; categories_names?: string[] }>;
          page?: { total?: number };
        };
      }>(`/traffic_reports/query_logs?${qs.toString()}`);
    };

    console.log(`[dnsfilter] query_logs org=${orgId ?? '(account-wide)'} ${fmt(since)}..${fmt(until)}`);

    // Total queries — only the count is needed, so request the smallest page.
    const totalRes = await queryLogs({ 'page[size]': '1' });
    const total_queries = totalRes.data?.page?.total ?? 0;

    // Blocked queries — `result=blocked` filters query_logs to blocked rows;
    // `data.page.total` is the exact blocked total.
    const PAGE_SIZE = 100;
    const MAX_PAGES = 50; // hard cap: 5,000 rows per window — marked partial if hit
    // First page: no page[number] (server default) — identical to the
    // live-verified call shape. Subsequent pages use page[number]=2.. (1-based).
    const firstPage = await queryLogs({
      result: 'blocked',
      'page[size]': String(PAGE_SIZE),
    });
    const blocked_queries = firstPage.data?.page?.total ?? firstPage.data?.values?.length ?? 0;

    const catCounts = new Map<string, number>();
    const domCounts = new Map<string, number>();
    let breakdown_partial = false;

    if (includeBreakdown) {
      const tally = (vals: Array<{ domain?: string; fqdn?: string; categories_names?: string[] }>) => {
        for (const v of vals) {
          for (const c of v.categories_names ?? []) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
          const d = v.domain || v.fqdn || '';
          if (d) domCounts.set(d, (domCounts.get(d) ?? 0) + 1);
        }
      };

      tally(firstPage.data?.values ?? []);

      // Paginate every remaining page up to the exact blocked total — a single
      // page truncates the category/domain counts.
      const totalPages = Math.ceil(blocked_queries / PAGE_SIZE);
      const pagesToFetch = Math.min(totalPages, MAX_PAGES);
      for (let page = 2; page <= pagesToFetch; page++) {
        const res = await queryLogs({
          result: 'blocked',
          'page[size]': String(PAGE_SIZE),
          'page[number]': String(page),
        });
        const vals = res.data?.values ?? [];
        tally(vals);
        if (vals.length === 0) break; // server ran dry early — stop paging
      }
      if (totalPages > MAX_PAGES) {
        breakdown_partial = true;
        console.warn(`[dnsfilter] blocked breakdown truncated at ${MAX_PAGES * PAGE_SIZE} of ${blocked_queries} rows (page cap)`);
      }
    }

    return {
      total_queries,
      blocked_queries,
      threats: Array.from(catCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({ category, count })),
      top_blocked: Array.from(domCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([domain, count]) => ({ domain, count })),
      breakdown_partial,
    };
  }

  /**
   * Build a summary for reporting.
   *
   * @param orgId  When provided, scopes the whole summary (totals + monthly
   *   trends) to that single organization with no account-wide fallback — use
   *   this for per-customer reports. See {@link getTrafficReport}.
   */
  async buildSummary(periodStart: Date, periodEnd: Date, orgId?: string): Promise<DnsFilterSummary> {
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
      const report = await this.getTrafficReport(periodStart, periodEnd, orgId);

      // Build monthly trends by querying month by month (counts only — the
      // per-month breakdowns are never used, so skip the row pagination).
      const monthlyTrends: Array<{ month: string; label: string; blocked: number; total: number }> = [];
      const cursor = new Date(periodStart);

      while (cursor < periodEnd) {
        const monthStart = new Date(cursor);
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
        const effectiveEnd = monthEnd > periodEnd ? periodEnd : monthEnd;

        try {
          const monthReport = await this.getTrafficReport(monthStart, effectiveEnd, orgId, { includeBreakdown: false });
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
        note: report.breakdown_partial
          ? `Blocked totals are exact; the category/domain breakdown was computed from the first 5,000 of ${report.blocked_queries.toLocaleString()} blocked queries (page cap).`
          : null,
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
