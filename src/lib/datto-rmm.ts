/**
 * Datto RMM API Client
 *
 * OAuth2 password grant with public-client credentials.
 * API Key = username, API Secret = password, client_id = public-client.
 * Provides device lookup for SOC technician verification.
 */

export interface DattoDevice {
  id: string;
  hostname: string;
  intIpAddress: string;
  extIpAddress: string;
  lastSeen: string;
  lastUser: string;
  siteId: string;
  siteName: string;
  operatingSystem: string;
  deviceType: string;
}

export interface DattoSite {
  id: string;
  name: string;
  description: string;
  devicesCount: number;
}

export interface DattoAlert {
  alertUid: string;
  alertType: string;
  alertContext: string;
  alertMessage: string;
  priority: string;
  resolved: boolean;
  resolvedAt: string | null;
  timestamp: string;
  deviceUid: string;
  hostname: string;
  siteUid: string;
  siteName: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class DattoRmmClient {
  private apiUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor() {
    this.apiUrl = process.env.DATTO_RMM_API_URL || 'https://concord-api.centrastage.net';
    this.apiKey = process.env.DATTO_RMM_API_KEY || '';
    this.apiSecret = process.env.DATTO_RMM_API_SECRET || '';
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret);
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    // Datto RMM OAuth2 — password grant with public-client credentials
    // Client ID: public-client, Client Secret: public (fixed values for all Datto RMM instances)
    // Username: API Key, Password: API Secret
    const tokenUrl = `${this.apiUrl}/auth/oauth/token`;
    console.log(`[DattoRMM] Auth attempt — URL: ${tokenUrl}`);

    const publicAuth = Buffer.from('public-client:public').toString('base64');

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${publicAuth}`,
      },
      body: `grant_type=password&username=${encodeURIComponent(this.apiKey)}&password=${encodeURIComponent(this.apiSecret)}`,
    });

    let text = await res.text();
    console.log(`[DattoRMM] Auth response: ${res.status}`);

    // Detect HTML response (wrong URL or redirect to login page)
    if (text.trimStart().startsWith('<') || text.includes('<!DOCTYPE')) {
      throw new Error(
        `Datto RMM auth endpoint returned HTML instead of JSON. ` +
        `Token URL: ${tokenUrl} — this usually means DATTO_RMM_API_URL is set to the wrong region. ` +
        `Valid regions: concord-api, pinotage-api, merlot-api, vidal-api, zinfandel-api, syrah-api (.centrastage.net)`
      );
    }

    if (!res.ok) {
      throw new Error(`Datto RMM auth failed (${res.status}): ${text.slice(0, 500)}`);
    }

    let data: TokenResponse;
    try {
      data = JSON.parse(text) as TokenResponse;
    } catch {
      throw new Error(`Datto RMM auth returned invalid JSON (${res.status}): ${text.slice(0, 200)}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.apiUrl}${path}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
      signal: AbortSignal.timeout(15_000),
    });

    // Auto-refresh token on 401
    if (res.status === 401) {
      this.accessToken = null;
      const newToken = await this.getAccessToken();
      const retryRes = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${newToken}`,
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!retryRes.ok) {
        throw new Error(`Datto RMM API error (${retryRes.status}): ${await retryRes.text()}`);
      }
      return retryRes.json() as Promise<T>;
    }

    if (!res.ok) {
      throw new Error(`Datto RMM API error (${res.status}): ${await res.text()}`);
    }

    return res.json() as Promise<T>;
  }

  /** Fetch all devices (paginated). Returns up to maxPages * 250 devices. */
  async getDevices(maxPages = 10): Promise<DattoDevice[]> {
    const devices: DattoDevice[] = [];
    let page = 1;

    while (page <= maxPages) {
      const data = await this.request<{ devices: RawDevice[]; pageDetails: { nextPageUrl?: string } }>(
        `/api/v2/account/devices?page=${page}&max=250`
      );

      for (const d of data.devices || []) {
        devices.push(mapDevice(d));
      }

      if (!data.pageDetails?.nextPageUrl) break;
      page++;
    }

    return devices;
  }

  /** Fetch a single device by ID. */
  async getDevice(deviceId: string): Promise<DattoDevice> {
    const d = await this.request<RawDevice>(`/api/v2/device/${deviceId}`);
    return mapDevice(d);
  }

  /** Fetch all sites. */
  async getSites(): Promise<DattoSite[]> {
    const data = await this.request<{ sites: RawSite[] }>('/api/v2/account/sites');
    return (data.sites || []).map(s => ({
      id: String(s.id || s.uid),
      name: s.name || '',
      description: s.description || '',
      devicesCount: s.devicesStatus?.numberOfDevices || 0,
    }));
  }

  /** Fetch devices for a specific site. */
  async getSiteDevices(siteId: string): Promise<DattoDevice[]> {
    const data = await this.request<{ devices: RawDevice[] }>(`/api/v2/site/${siteId}/devices`);
    return (data.devices || []).map(mapDevice);
  }

  /** Fetch all alerts (paginated). Returns up to maxPages * 250 alerts. */
  async getAlerts(maxPages = 20): Promise<DattoAlert[]> {
    const alerts: DattoAlert[] = [];
    let page = 1;

    while (page <= maxPages) {
      const data = await this.request<{ alerts: RawAlert[]; pageDetails: { nextPageUrl?: string } }>(
        `/api/v2/account/alerts?page=${page}&max=250`
      );

      for (const a of data.alerts || []) {
        alerts.push(mapAlert(a));
      }

      if (!data.pageDetails?.nextPageUrl) break;
      page++;
    }

    return alerts;
  }

  /** Fetch resolved alerts (paginated). */
  async getResolvedAlerts(maxPages = 20): Promise<DattoAlert[]> {
    const alerts: DattoAlert[] = [];
    let page = 1;

    while (page <= maxPages) {
      const data = await this.request<{ alerts: RawAlert[]; pageDetails: { nextPageUrl?: string } }>(
        `/api/v2/account/alerts/resolved?page=${page}&max=250`
      );

      for (const a of data.alerts || []) {
        alerts.push(mapAlert(a));
      }

      if (!data.pageDetails?.nextPageUrl) break;
      page++;
    }

    return alerts;
  }

  /** Fetch open (active) alerts (paginated). */
  async getOpenAlerts(maxPages = 20): Promise<DattoAlert[]> {
    const alerts: DattoAlert[] = [];
    let page = 1;

    while (page <= maxPages) {
      const data = await this.request<{ alerts: RawAlert[]; pageDetails: { nextPageUrl?: string } }>(
        `/api/v2/account/alerts/open?page=${page}&max=250`
      );

      for (const a of data.alerts || []) {
        alerts.push(mapAlert(a));
      }

      if (!data.pageDetails?.nextPageUrl) break;
      page++;
    }

    return alerts;
  }
}

// Raw API response types (Datto RMM API returns camelCase)
interface RawDevice {
  id?: number;
  uid?: string;
  hostname?: string;
  intIpAddress?: string;
  extIpAddress?: string;
  lastSeen?: string;
  lastLoggedInUser?: string;
  siteId?: number;
  siteUid?: string;
  siteName?: string;
  operatingSystem?: string;
  deviceType?: { category?: string };
}

interface RawSite {
  id?: number;
  uid?: string;
  name?: string;
  description?: string;
  devicesStatus?: { numberOfDevices?: number };
}

interface RawAlert {
  alertUid?: string;
  uid?: string;
  alertType?: string;
  alertContext?: string;
  alertMessage?: string;
  priority?: string;
  resolved?: boolean;
  resolvedAt?: string;
  timestamp?: string;
  alertTimestamp?: string;
  deviceUid?: string;
  hostname?: string;
  siteUid?: string;
  siteName?: string;
}

function mapAlert(a: RawAlert): DattoAlert {
  return {
    alertUid: a.alertUid || a.uid || '',
    alertType: a.alertType || 'unknown',
    alertContext: a.alertContext || '',
    alertMessage: a.alertMessage || '',
    priority: a.priority || 'information',
    resolved: a.resolved ?? false,
    resolvedAt: a.resolvedAt || null,
    timestamp: a.timestamp || a.alertTimestamp || '',
    deviceUid: a.deviceUid || '',
    hostname: a.hostname || '',
    siteUid: a.siteUid || '',
    siteName: a.siteName || '',
  };
}

function mapDevice(d: RawDevice): DattoDevice {
  return {
    id: String(d.uid || d.id || ''),
    hostname: d.hostname || '',
    intIpAddress: d.intIpAddress || '',
    extIpAddress: d.extIpAddress || '',
    lastSeen: d.lastSeen || '',
    lastUser: d.lastLoggedInUser || '',
    siteId: String(d.siteUid || d.siteId || ''),
    siteName: d.siteName || '',
    operatingSystem: d.operatingSystem || '',
    deviceType: d.deviceType?.category || 'unknown',
  };
}
