/**
 * Datto RMM API Client
 *
 * OAuth2 client credentials grant for server-to-server auth.
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

    const tokenUrl = `${this.apiUrl}/auth/oauth/token`;
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.apiKey,
        client_secret: this.apiSecret,
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Datto RMM auth failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as TokenResponse;
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
