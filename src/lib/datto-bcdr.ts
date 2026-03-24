/**
 * Datto BCDR (Backup, Continuity, Disaster Recovery) API Client
 *
 * Authentication: HMAC-based with Public Key + Private Key.
 * The public key is sent in the request, and the private key is used
 * to generate HMAC signatures for authentication.
 *
 * Datto BCDR API docs: https://portal.dattobackup.com/integrations/xml
 * Base URL: https://api.datto.com/v1
 */

// Note: Using HTTP Basic Auth (publicKey:privateKey base64-encoded)
// HMAC signature auth may be needed for certain endpoints in the future

export interface DattoBcdrDevice {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  clientCompanyName: string;
  lastSeenDate: string;
  registrationDate: string;
  localStorageUsedBytes: number;
  localStorageAvailableBytes: number;
  offsiteStorageUsedBytes: number;
  agentCount: number;
  alertCount: number;
}

export interface DattoBcdrAgent {
  id: string;
  name: string;
  agentType: string;
  operatingSystem: string;
  lastSnapshot: string;
  lastOffsite: string;
  localSnapshots: number;
  offsiteSnapshots: number;
  status: string;
  isPaused: boolean;
}

export interface DattoBcdrAlert {
  id: string;
  deviceId: string;
  deviceName: string;
  alertType: string;
  alertMessage: string;
  timestamp: string;
  resolved: boolean;
}

export interface DattoBcdrSummary {
  available: boolean;
  totalDevices: number;
  totalAgents: number;
  totalAlerts: number;
  devicesWithAlerts: number;
  backupSuccessRate: number | null;
  applianceCount: number;       // SIRIS/ALTO on-prem devices
  endpointBackupCount: number;  // EBDR/cloud endpoint backup devices
  cloudDeviceCount: number;     // Azure cloud SIRIS
  deviceDetails: Array<{
    name: string;
    model: string;
    clientCompanyName: string;
    agentCount: number;
    alertCount: number;
    lastSeen: string;
    deviceType: 'appliance' | 'endpoint' | 'cloud';
  }>;
  alertsByType: Array<{ type: string; count: number }>;
  note: string | null;
}

/**
 * Classify a Datto device by its model string.
 * SIRIS/ALTO = on-prem appliance, EBDR = endpoint backup, CLDSIRIS = Azure cloud.
 */
function classifyDevice(model: string): 'appliance' | 'endpoint' | 'cloud' {
  const m = model.toUpperCase();
  if (m.includes('EBDR') || m.includes('ENDPOINT') || m.includes('DEBPC')) return 'endpoint';
  if (m.includes('CLD') || m.includes('AZURE')) return 'cloud';
  return 'appliance'; // SIRIS, ALTO, NAS, etc.
}

export class DattoBcdrClient {
  private publicKey: string;
  private privateKey: string;
  private baseUrl: string;

  constructor() {
    this.publicKey = process.env.DATTO_BCDR_PUBLIC_KEY || '';
    this.privateKey = process.env.DATTO_BCDR_PRIVATE_KEY || '';
    this.baseUrl = process.env.DATTO_BCDR_API_URL || 'https://api.datto.com/v1';
  }

  isConfigured(): boolean {
    return !!(this.publicKey && this.privateKey);
  }

  private generateAuthHeaders(): Record<string, string> {
    // Datto BCDR uses HTTP Basic Auth with public:private key pair
    const credentials = Buffer.from(`${this.publicKey}:${this.privateKey}`).toString('base64');
    return {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = this.generateAuthHeaders();

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Datto BCDR API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Fetch all BCDR devices (appliances).
   */
  async getDevices(): Promise<DattoBcdrDevice[]> {
    try {
      const data = await this.request<{
        items?: Array<{
          id?: number;
          name?: string;
          model?: string;
          serialNumber?: string;
          clientCompanyName?: string;
          lastSeenDate?: string;
          registrationDate?: string;
          localStorageUsed?: { size?: number };
          localStorageAvailable?: { size?: number };
          offsiteStorageUsed?: { size?: number };
          numberOfAgents?: number;
          numberOfAlerts?: number;
        }>;
        pagination?: { totalItems?: number };
      }>('/bcdr/device');

      return (data.items || []).map((d) => ({
        id: String(d.id || ''),
        name: d.name || '',
        model: d.model || '',
        serialNumber: d.serialNumber || '',
        clientCompanyName: d.clientCompanyName || '',
        lastSeenDate: d.lastSeenDate || '',
        registrationDate: d.registrationDate || '',
        localStorageUsedBytes: d.localStorageUsed?.size || 0,
        localStorageAvailableBytes: d.localStorageAvailable?.size || 0,
        offsiteStorageUsedBytes: d.offsiteStorageUsed?.size || 0,
        agentCount: d.numberOfAgents || 0,
        alertCount: d.numberOfAlerts || 0,
      }));
    } catch (error) {
      console.error('[DattoBCDR] getDevices error:', error);
      throw error;
    }
  }

  /**
   * Fetch agents (protected machines) for a device.
   * Datto BCDR API uses serialNumber as the device identifier.
   */
  async getDeviceAgents(serialNumber: string): Promise<DattoBcdrAgent[]> {
    try {
      const data = await this.request<{
        items?: Array<{
          id?: number;
          name?: string;
          type?: string;
          os?: string;
          lastSnapshot?: string;
          lastOffsite?: string;
          localSnapshots?: number;
          offsiteSnapshots?: number;
          backupStatus?: string;
          isPaused?: boolean;
        }>;
      }>(`/bcdr/device/${serialNumber}/asset/agent`);

      return (data.items || []).map((a) => ({
        id: String(a.id || ''),
        name: a.name || '',
        agentType: a.type || 'unknown',
        operatingSystem: a.os || '',
        lastSnapshot: a.lastSnapshot || '',
        lastOffsite: a.lastOffsite || '',
        localSnapshots: a.localSnapshots || 0,
        offsiteSnapshots: a.offsiteSnapshots || 0,
        status: a.backupStatus || 'unknown',
        isPaused: a.isPaused || false,
      }));
    } catch (error) {
      console.error('[DattoBCDR] getDeviceAgents error:', error);
      throw error;
    }
  }

  /**
   * Fetch alerts for a device.
   * Datto BCDR API uses serialNumber as the device identifier.
   */
  async getDeviceAlerts(serialNumber: string): Promise<DattoBcdrAlert[]> {
    try {
      const data = await this.request<{
        items?: Array<{
          id?: number;
          alertType?: string;
          alertMessage?: string;
          timestamp?: string;
          resolved?: boolean;
        }>;
      }>(`/bcdr/device/${serialNumber}/alert`);

      return (data.items || []).map((a) => ({
        id: String(a.id || ''),
        deviceId: serialNumber,
        deviceName: '',
        alertType: a.alertType || 'unknown',
        alertMessage: a.alertMessage || '',
        timestamp: a.timestamp || '',
        resolved: a.resolved || false,
      }));
    } catch (error) {
      console.error('[DattoBCDR] getDeviceAlerts error:', error);
      return [];
    }
  }

  /**
   * Build a summary for reporting.
   * Fetches all devices and aggregates backup/alert data.
   */
  async buildSummary(companyName?: string): Promise<DattoBcdrSummary> {
    if (!this.isConfigured()) {
      return {
        available: false,
        totalDevices: 0,
        totalAgents: 0,
        totalAlerts: 0,
        devicesWithAlerts: 0,
        backupSuccessRate: null,
        applianceCount: 0,
        endpointBackupCount: 0,
        cloudDeviceCount: 0,
        deviceDetails: [],
        alertsByType: [],
        note: 'Datto BCDR integration not configured. Set DATTO_BCDR_PUBLIC_KEY and DATTO_BCDR_PRIVATE_KEY environment variables.',
      };
    }

    try {
      const devices = await this.getDevices();

      // Filter by company name if provided
      let filtered = devices;
      if (companyName) {
        const companyWords = companyName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        filtered = devices.filter((d) => {
          const name = d.clientCompanyName.toLowerCase();
          return companyWords.some((w) => name.includes(w));
        });
      }

      const totalAgents = filtered.reduce((s, d) => s + d.agentCount, 0);
      const totalAlerts = filtered.reduce((s, d) => s + d.alertCount, 0);
      const devicesWithAlerts = filtered.filter((d) => d.alertCount > 0).length;

      // Collect alerts for type aggregation
      const alertTypeCounts = new Map<string, number>();
      for (const device of filtered) {
        if (device.alertCount > 0) {
          try {
            const alerts = await this.getDeviceAlerts(device.serialNumber);
            for (const alert of alerts) {
              alertTypeCounts.set(alert.alertType, (alertTypeCounts.get(alert.alertType) || 0) + 1);
            }
          } catch {
            // Continue if individual device alert fetch fails
          }
        }
      }

      // Classify devices by model type
      const applianceCount = filtered.filter((d) => classifyDevice(d.model) === 'appliance').length;
      const endpointBackupCount = filtered.filter((d) => classifyDevice(d.model) === 'endpoint').length;
      const cloudDeviceCount = filtered.filter((d) => classifyDevice(d.model) === 'cloud').length;

      return {
        available: true,
        totalDevices: filtered.length,
        totalAgents,
        totalAlerts,
        devicesWithAlerts,
        backupSuccessRate: null,
        applianceCount,
        endpointBackupCount,
        cloudDeviceCount,
        deviceDetails: filtered.map((d) => ({
          name: d.name,
          model: d.model,
          clientCompanyName: d.clientCompanyName,
          agentCount: d.agentCount,
          alertCount: d.alertCount,
          lastSeen: d.lastSeenDate,
          deviceType: classifyDevice(d.model),
        })),
        alertsByType: Array.from(alertTypeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => ({ type, count })),
        note: filtered.length === 0 && companyName
          ? `No Datto BCDR devices found matching "${companyName}". Device-to-company mapping may need manual configuration.`
          : null,
      };
    } catch (error) {
      console.error('[DattoBCDR] buildSummary error:', error);
      return {
        available: false,
        totalDevices: 0,
        totalAgents: 0,
        totalAlerts: 0,
        devicesWithAlerts: 0,
        backupSuccessRate: null,
        applianceCount: 0,
        endpointBackupCount: 0,
        cloudDeviceCount: 0,
        deviceDetails: [],
        alertsByType: [],
        note: `Datto BCDR data fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

