/**
 * Ubiquiti UniFi Cloud API Client
 *
 * Network infrastructure management via UniFi Cloud (ui.com).
 * Provides site inventory, device lists (APs, switches, gateways),
 * firmware status, and client counts for compliance evidence.
 *
 * API docs: https://developer.ui.com/unifi-api/
 * Auth: x-api-key header
 *
 * Required env vars:
 *   UBIQUITI_API_KEY  — API key from unifi.ui.com > Settings > API Keys
 *   UBIQUITI_API_URL  — Cloud API base URL (https://api.ui.com)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnifiDevice {
  id: string
  mac: string
  name: string
  model: string
  shortname: string
  ip: string
  productLine: string | null
  status: string
  version: string
  firmwareStatus: string
  updateAvailable: string | null
  isConsole: boolean | null
  isManaged: boolean | null
  startupTime: string | null
  adoptionTime: string | null
  note: string | null
}

/** The /ea/devices response groups devices by host (console/controller) */
interface UnifiDeviceHost {
  hostId: string
  hostName?: string
  devices: UnifiDevice[]
  updatedAt?: string
}

export interface UnifiSite {
  siteId: string
  meta: {
    desc?: string
    name?: string
    timezone?: string
    gatewayMac?: string
  }
  statistics?: {
    counts?: {
      totalDevice?: number
      totalAdoptedDevice?: number
      totalUnapprovedDevice?: number
      wifiClient?: number
      wiredClient?: number
      wifiDevice?: number
      wiredDevice?: number
      gatewayDevice?: number
    }
    internetIssues?: number
    satisfaction?: number
  }
  isOwner?: boolean
}

export interface UnifiSummary {
  sites: Array<{
    siteId: string
    name: string
    timezone: string
    totalDevices: number
    adoptedDevices: number
    satisfaction: number
  }>
  devices: Array<{
    id: string
    hostname: string
    model: string
    firmware: string
    ipAddress: string
    macAddress: string
    uptime: number
    siteId: string
    siteName: string
    connectedClients: number
  }>
  totalSites: number
  totalDevices: number
  totalClients: number
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function getConfig(): { apiKey: string; baseUrl: string } | null {
  const apiKey = process.env.UBIQUITI_API_KEY
  const baseUrl = process.env.UBIQUITI_API_URL || 'https://api.ui.com'
  if (!apiKey) return null
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') }
}

async function unifiGet<T>(path: string, apiKey: string, baseUrl: string): Promise<T | null> {
  const url = `${baseUrl}${path}`
  try {
    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[ubiquiti] ${path} failed (${res.status}): ${text.substring(0, 300)}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.error(`[ubiquiti] ${path} error:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all UniFi sites accessible with the API key.
 */
export async function listSites(): Promise<UnifiSite[]> {
  const config = getConfig()
  if (!config) return []

  const data = await unifiGet<{ data: UnifiSite[] }>(
    '/ea/sites', config.apiKey, config.baseUrl
  )
  return data?.data ?? []
}

/**
 * List all hosts (consoles/controllers). Each host typically represents one
 * customer site with a UDM/UDR/UCK console. The host name is the customer-facing
 * name visible in UniFi Site Manager (e.g., "EZ Red - New York").
 */
export async function listHosts(): Promise<Array<{ hostId: string; hostName: string; deviceCount: number }>> {
  const config = getConfig()
  if (!config) return []

  const response = await unifiGet<{ data: UnifiDeviceHost[] }>(
    '/ea/devices', config.apiKey, config.baseUrl
  )

  if (!response?.data) return []

  return response.data.map((host) => ({
    hostId: host.hostId,
    hostName: host.hostName ?? host.hostId ?? 'Unknown',
    deviceCount: host.devices?.length ?? 0,
  }))
}

/**
 * List all devices globally. The /ea/devices endpoint returns devices
 * grouped by host (console/controller): { data: [{ hostId, hostName, devices: [...] }] }
 */
export async function listDevices(): Promise<{ device: UnifiDevice; hostName: string }[]> {
  const config = getConfig()
  if (!config) return []

  const response = await unifiGet<{ data: UnifiDeviceHost[] }>(
    '/ea/devices', config.apiKey, config.baseUrl
  )

  if (!response?.data) return []

  // Flatten: extract devices from each host
  const allDevices: { device: UnifiDevice; hostName: string }[] = []
  for (const host of response.data) {
    const hostName = host.hostName ?? host.hostId ?? 'Unknown'
    for (const device of host.devices ?? []) {
      allDevices.push({ device, hostName })
    }
  }

  console.log(`[ubiquiti] Found ${response.data.length} hosts with ${allDevices.length} total devices`)
  return allDevices
}

/**
 * Build a full summary of all sites and devices for compliance evidence.
 */
export async function buildSummary(): Promise<UnifiSummary | null> {
  const config = getConfig()
  if (!config) return null

  // Fetch sites and devices in parallel
  const [sites, deviceEntries] = await Promise.all([
    listSites(),
    listDevices(),
  ])

  console.log(`[ubiquiti] Found ${sites.length} sites, ${deviceEntries.length} devices`)

  if (sites.length === 0 && deviceEntries.length === 0) return null

  // Count clients from site statistics
  let totalClients = 0
  const siteSummaries = sites.map((s) => {
    const wifiClients = s.statistics?.counts?.wifiClient ?? 0
    const wiredClients = s.statistics?.counts?.wiredClient ?? 0
    totalClients += wifiClients + wiredClients
    return {
      siteId: s.siteId,
      name: s.meta?.desc || s.meta?.name || s.siteId,
      timezone: s.meta?.timezone ?? '',
      totalDevices: s.statistics?.counts?.totalDevice ?? 0,
      adoptedDevices: s.statistics?.counts?.totalAdoptedDevice ?? 0,
      satisfaction: s.statistics?.satisfaction ?? 0,
    }
  })

  const summary: UnifiSummary = {
    sites: siteSummaries,
    devices: deviceEntries.map(({ device, hostName }) => ({
      id: device.id,
      hostname: device.name || 'Unknown',
      model: device.model || device.shortname || 'Unknown',
      firmware: device.version || 'Unknown',
      ipAddress: device.ip || '',
      macAddress: device.mac || '',
      uptime: 0, // Not available in EA API response
      siteId: '',
      siteName: hostName,
      connectedClients: 0,
    })),
    totalSites: sites.length,
    totalDevices: deviceEntries.length,
    totalClients,
  }

  return summary
}

// ---------------------------------------------------------------------------
// Site-level network configuration (VLANs, guest networks)
// ---------------------------------------------------------------------------

export interface UnifiNetworkConfig {
  id: string
  name: string
  purpose: string // 'corporate' | 'guest' | 'remote-user-vpn' | 'vlan-only' | 'wan'
  vlanId: number | null
  isDefault: boolean
  dhcpEnabled: boolean
  ipSubnet: string | null
  gatewayIp: string | null
  isolation: boolean // guest isolation / client isolation
}

export interface UnifiSiteNetworkSummary {
  siteId: string
  siteName: string
  networks: UnifiNetworkConfig[]
  vlanCount: number
  guestNetworkConfigured: boolean
  guestIsolation: boolean
  networkSegmented: boolean // true when 2+ VLANs exist
}

/**
 * Fetch network configuration for a specific site.
 * Uses the Site Manager API: GET /ea/sites/{siteId}/networks
 * Falls back gracefully if the endpoint isn't available (newer API versions).
 */
export async function getSiteNetworks(siteId: string): Promise<UnifiNetworkConfig[]> {
  const config = getConfig()
  if (!config) return []

  // Try the Site Manager EA API endpoint
  const data = await unifiGet<{ data: Array<Record<string, unknown>> }>(
    `/ea/sites/${siteId}/networks`, config.apiKey, config.baseUrl
  )

  if (!data?.data) {
    // Try alternative path used by some API versions
    const alt = await unifiGet<{ data: Array<Record<string, unknown>> }>(
      `/v1/sites/${siteId}/networks`, config.apiKey, config.baseUrl
    )
    if (!alt?.data) return []
    return parseNetworkConfigs(alt.data)
  }

  return parseNetworkConfigs(data.data)
}

function parseNetworkConfigs(raw: Array<Record<string, unknown>>): UnifiNetworkConfig[] {
  return raw.map((n) => ({
    id: String(n.id ?? n._id ?? ''),
    name: String(n.name ?? 'Unnamed'),
    purpose: String(n.purpose ?? n.network_type ?? 'corporate'),
    vlanId: typeof n.vlan === 'number' ? n.vlan
      : typeof n.vlan_id === 'number' ? n.vlan_id
      : typeof n.networkgroup === 'string' && n.networkgroup !== 'LAN' ? parseInt(String(n.vlan ?? '0'), 10) || null
      : null,
    isDefault: !!n.is_default || n.name === 'Default',
    dhcpEnabled: n.dhcpd_enabled === true || n.dhcp_enabled === true,
    ipSubnet: typeof n.ip_subnet === 'string' ? n.ip_subnet : null,
    gatewayIp: typeof n.gateway_ip === 'string' ? n.gateway_ip
      : typeof n.gateway === 'string' ? n.gateway : null,
    isolation: !!n.guest_isolation || !!n.isolation || n.purpose === 'guest',
  }))
}

/**
 * Build a network-config summary for a site, suitable for evidence rawData.
 */
export async function buildSiteNetworkSummary(siteId: string, siteName: string): Promise<UnifiSiteNetworkSummary> {
  const networks = await getSiteNetworks(siteId)
  const vlanCount = networks.filter((n) => n.vlanId != null && n.vlanId > 0).length
  const guestNetworks = networks.filter((n) => n.purpose === 'guest')
  const guestNetworkConfigured = guestNetworks.length > 0
  const guestIsolation = guestNetworks.some((n) => n.isolation)
  const networkSegmented = vlanCount >= 2 || (vlanCount >= 1 && guestNetworkConfigured)

  return {
    siteId, siteName, networks,
    vlanCount, guestNetworkConfigured, guestIsolation, networkSegmented,
  }
}
