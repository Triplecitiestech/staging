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
   */
  async getEvents(since: Date, until: Date): Promise<DattoEdrEvent[]> {
    const sinceStr = since.toISOString();
    const untilStr = until.toISOString();

    try {
      // Infocyte LoopBack /Alerts endpoint with where filter
      const filter = JSON.stringify({
        where: {
          createdOn: { gte: sinceStr, lte: untilStr },
        },
        limit: 1000,
        order: 'createdOn DESC',
      });

      const items = await this.request<Array<{
        id?: string;
        alertType?: string;
        type?: string;
        severity?: string;
        threatName?: string;
        name?: string;
        description?: string;
        createdOn?: string;
        hostname?: string;
        hostId?: string;
        status?: string;
        flagName?: string;
        category?: string;
      }>>(`/Alerts?filter=${encodeURIComponent(filter)}`);

      // LoopBack returns arrays directly (not wrapped in {data:} or {items:})
      const list = Array.isArray(items) ? items : [];
      return list.map((e) => ({
        id: e.id || '',
        type: e.alertType || e.type || e.flagName || 'unknown',
        severity: e.severity || 'medium',
        description: e.threatName || e.name || e.description || '',
        timestamp: e.createdOn || '',
        hostname: e.hostname || '',
        deviceId: e.hostId || '',
        status: e.status || 'unknown',
        category: e.category || e.alertType || e.type || 'unknown',
      }));
    } catch (error) {
      console.error('[DattoEDR] getEvents error:', error);
      throw error;
    }
  }

  /**
   * Build a summary of EDR data for reporting.
   * Filters events by date range and aggregates.
   */
  async buildSummary(periodStart: Date, periodEnd: Date): Promise<DattoEdrSummary> {
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
      const events = await this.getEvents(periodStart, periodEnd);

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
