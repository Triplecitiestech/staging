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
