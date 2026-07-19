/**
 * Datto EDR (Endpoint Detection & Response) API Client
 *
 * Built on Infocyte LoopBack 3 framework.
 * Instance URL pattern: https://<instance>.infocyte.com/api
 * API Explorer: https://<instance>.infocyte.com/explorer/#/
 *
 * Key API entities: Alerts, Events, HostScanResults, Agents, Applications,
 * Vulnerabilities, ActivityTraces, FileDetails, ResponseResults, TargetGroups
 *
 * Auth: API token passed as access_token query parameter (LoopBack convention)
 * Generate tokens at: Admin > Users & Tokens > API Tokens
 * Tokens expire 1 year from creation.
 */

export interface DattoEdrEvent {
  id: string;
  type: string;
  severity: string;
  description: string;
  timestamp: string;
  hostname: string;
  deviceId: string;
  status: string;
  category: string;
}

export interface DattoEdrSummary {
  available: boolean;
  totalEvents: number;
  eventsBySeverity: Array<{ severity: string; count: number }>;
  eventsByType: Array<{ type: string; count: number }>;
  monthlyTrends: Array<{ month: string; label: string; events: number }>;
  topThreats: Array<{ threat: string; count: number }>;
  note: string | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export class DattoEdrClient {
  private apiToken: string;
  private baseUrl: string;

  constructor() {
    this.apiToken = process.env.DATTO_EDR_API_TOKEN || '';
    // Datto EDR uses instance-specific Infocyte LoopBack API:
    // https://<instance>.infocyte.com/api
    // Set DATTO_EDR_API_URL to your instance base (e.g. https://triple5695.infocyte.com/api)
    this.baseUrl = process.env.DATTO_EDR_API_URL || 'https://triple5695.infocyte.com/api';
  }

  isConfigured(): boolean {
    return !!this.apiToken;
  }

  /**
   * List EDR organizations (Infocyte). Used to resolve a customer's org by name
   * when there is no explicit `datto_edr` platform mapping — mirrors the SOC
   * enrichment's org resolution so per-customer scoping is consistent.
   */
  async listOrganizations(): Promise<Array<{ id: string; name: string }>> {
    const orgs = await this.request<Array<{ id?: string | number; name?: string }>>('/Organizations');
    return (Array.isArray(orgs) ? orgs : [])
      .filter((o) => o.id != null)
      .map((o) => ({ id: String(o.id), name: o.name ?? '' }));
  }

  /**
   * LoopBack APIs use access_token as a query parameter for auth.
   * Some instances also accept Authorization header — we send both for compatibility.
   */
  private async request<T>(path: string): Promise<T> {
    // Append access_token to the URL (LoopBack convention)
    const separator = path.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${path}${separator}access_token=${encodeURIComponent(this.apiToken)}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': this.apiToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Datto EDR API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Fetch alerts from the Infocyte /Alerts endpoint.
   * LoopBack filter syntax: ?filter[where][createdOn][gte]=<ISO date>
   *
   * The Alerts LIST model carries `severity`, `name`, `description`, `type`,
   * `mitreTactic`, and host identity fields — it does NOT carry threatName,
   * threatScore, flagName, hashes, or compromised/malicious booleans (those
   * exist only on AlertDetail via GET /api/Alerts/{id}, or nested under a row's
   * `data` object where the SOC enrichment reads them). Never read the
   * threat-intel fields off list rows: they are always undefined there, and do
   * NOT add per-alert detail fetches to this bulk path (N+1) — native list
   * `severity` is sufficient for reporting.
   */
  async getEvents(since: Date, until: Date, organizationId?: string): Promise<DattoEdrEvent[]> {
    const sinceStr = since.toISOString();
    const untilStr = until.toISOString();

    try {
      // Paginate through all alerts in the date range (LoopBack API)
      const allEvents: DattoEdrEvent[] = [];
      const PAGE_SIZE = 500;
      let skip = 0;

      for (let page = 0; page < 20; page++) { // Safety cap at 10,000 events
        // organizationId scopes to one customer's org — the same LoopBack filter
        // the SOC enrichment uses. Without it the query is MSP-wide.
        const where: Record<string, unknown> = {
          createdOn: { gte: sinceStr, lte: untilStr },
        };
        if (organizationId) where.organizationId = organizationId;
        const filter = JSON.stringify({
          where,
          limit: PAGE_SIZE,
          skip,
          order: 'createdOn DESC',
        });

        const items = await this.request<Array<{
          id?: string;
          type?: string;
          name?: string;
          description?: string;
          severity?: string; // native vendor severity — the authoritative list field
          mitreTactic?: string;
          hostname?: string;
          hostId?: string;
          deviceId?: string;
          createdOn?: string;
        }>>(`/Alerts?filter=${encodeURIComponent(filter)}`);

        // LoopBack returns arrays directly (not wrapped in {data:} or {items:})
        const list = Array.isArray(items) ? items : [];
        const mapped = list.map((e) => ({
          id: e.id || '',
          type: e.type || 'unknown',
          severity: mapVendorSeverity(e.severity),
          description: e.name || e.description || '',
          timestamp: e.createdOn || '',
          hostname: e.hostname || '',
          deviceId: e.hostId || e.deviceId || '',
          // The list model has no compromise/containment state — that lives on
          // AlertDetail only. Never fabricate one here.
          status: 'unknown',
          category: e.mitreTactic || e.type || 'unknown',
        }));
        allEvents.push(...mapped);

        // If we got fewer than PAGE_SIZE, we've reached the end
        if (list.length < PAGE_SIZE) break;
        skip += PAGE_SIZE;
      }

      console.log(`[DattoEDR] Fetched ${allEvents.length} events for period ${sinceStr} to ${untilStr}`);
      return allEvents;
    } catch (error) {
      console.error('[DattoEDR] getEvents error:', error);
      throw error;
    }
  }

  /**
   * Build a summary of EDR data for reporting.
   * Filters events by date range and aggregates.
   */
  async buildSummary(periodStart: Date, periodEnd: Date, organizationId?: string): Promise<DattoEdrSummary> {
    if (!this.isConfigured()) {
      return {
        available: false,
        totalEvents: 0,
        eventsBySeverity: [],
        eventsByType: [],
        monthlyTrends: [],
        topThreats: [],
        note: 'Datto EDR integration not configured. Set DATTO_EDR_API_TOKEN environment variable.',
      };
    }

    try {
      const events = await this.getEvents(periodStart, periodEnd, organizationId);

      // Aggregate by severity
      const sevCounts = new Map<string, number>();
      for (const e of events) {
        sevCounts.set(e.severity, (sevCounts.get(e.severity) || 0) + 1);
      }

      // Aggregate by type
      const typeCounts = new Map<string, number>();
      for (const e of events) {
        typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
      }

      // Monthly trends
      const monthlyTrends = buildMonthlyTrends(events, periodStart, periodEnd);

      // Top threats (by description)
      const threatCounts = new Map<string, number>();
      for (const e of events) {
        if (e.description) {
          threatCounts.set(e.description, (threatCounts.get(e.description) || 0) + 1);
        }
      }
      const topThreats = Array.from(threatCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([threat, count]) => ({ threat, count }));

      return {
        available: true,
        totalEvents: events.length,
        eventsBySeverity: Array.from(sevCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([severity, count]) => ({ severity, count })),
        eventsByType: Array.from(typeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => ({ type, count })),
        monthlyTrends,
        topThreats,
        note: null,
      };
    } catch (error) {
      console.error('[DattoEDR] buildSummary error:', error);
      return {
        available: false,
        totalEvents: 0,
        eventsBySeverity: [],
        eventsByType: [],
        monthlyTrends: [],
        topThreats: [],
        note: `Datto EDR data fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

/**
 * Map the Alerts list model's native `severity` to our internal levels
 * (critical / high / medium / low). Unrecognized vendor values pass through
 * lowercased so counts stay truthful; a missing value maps to "unknown" —
 * never to a fabricated "medium".
 */
function mapVendorSeverity(severity?: string): string {
  const s = (severity || '').trim().toLowerCase();
  if (!s) return 'unknown';
  switch (s) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    case 'info':
    case 'informational': return 'low';
    default: return s;
  }
}

function buildMonthlyTrends(
  events: DattoEdrEvent[],
  periodStart: Date,
  periodEnd: Date,
): Array<{ month: string; label: string; events: number }> {
  const trends: Array<{ month: string; label: string; events: number }> = [];
  const cursor = new Date(periodStart);

  while (cursor < periodEnd) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = events.filter((e) => {
      const d = new Date(e.timestamp);
      return d >= monthStart && d <= monthEnd;
    }).length;

    const m = cursor.getMonth() + 1;
    trends.push({
      month: `${cursor.getFullYear()}-${m < 10 ? '0' + m : m}`,
      label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`,
      events: count,
    });

    cursor.setMonth(cursor.getMonth() + 1);
    cursor.setDate(1);
  }

  return trends;
}
