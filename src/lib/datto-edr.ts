/**
 * Datto EDR (Endpoint Detection & Response) API Client
 *
 * Uses API token authentication.
 * Fetches security events, threats, and endpoint status.
 *
 * Datto EDR API docs: https://portal.dattobackup.com/integrations/api
 * (Formerly known as Infocyte / Datto EDR)
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
    // Datto EDR API base URL — may vary by region
    this.baseUrl = process.env.DATTO_EDR_API_URL || 'https://edr.datto.com/api/v1';
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
      throw new Error(`Datto EDR API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Fetch security events/threats within a date range.
   * Note: Exact endpoint paths depend on the Datto EDR API version.
   * The client tries common patterns.
   */
  async getEvents(since: Date, until: Date): Promise<DattoEdrEvent[]> {
    const sinceStr = since.toISOString();
    const untilStr = until.toISOString();

    try {
      // Try the alerts/events endpoint
      const data = await this.request<{
        data?: Array<{
          id?: string;
          type?: string;
          severity?: string;
          description?: string;
          timestamp?: string;
          created_at?: string;
          hostname?: string;
          device_id?: string;
          status?: string;
          category?: string;
          threat_name?: string;
        }>;
        items?: Array<{
          id?: string;
          type?: string;
          severity?: string;
          description?: string;
          timestamp?: string;
          created_at?: string;
          hostname?: string;
          device_id?: string;
          status?: string;
          category?: string;
          threat_name?: string;
        }>;
      }>(`/alerts?since=${encodeURIComponent(sinceStr)}&until=${encodeURIComponent(untilStr)}&limit=1000`);

      const items = data.data || data.items || [];
      return items.map((e) => ({
        id: e.id || '',
        type: e.type || e.category || 'unknown',
        severity: e.severity || 'medium',
        description: e.description || e.threat_name || '',
        timestamp: e.timestamp || e.created_at || '',
        hostname: e.hostname || '',
        deviceId: e.device_id || '',
        status: e.status || 'unknown',
        category: e.category || e.type || 'unknown',
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
