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

export interface UnifiHost {
  id: string
  reportedState: {
    hostname?: string
    firmwareVersion?: string
    hardwareModel?: string
    isManaged?: boolean
    ipAddress?: string
    macAddress?: string
    uptime?: number
    features?: Record<string, unknown>
    overview?: {
      connectedUserNum?: number
      wifiScore?: number
      cpuLoadPercentage?: number
      memoryUsagePercentage?: number
    }
  }
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
 * List all hosts (network devices) for a site.
 */
export async function listHosts(siteId: string): Promise<UnifiHost[]> {
  const config = getConfig()
  if (!config) return []

  const data = await unifiGet<{ data: UnifiHost[] }>(
    `/ea/sites/${siteId}/hosts`, config.apiKey, config.baseUrl
  )
  return data?.data ?? []
}

/**
 * Build a full summary of all sites and devices for compliance evidence.
 */
export async function buildSummary(): Promise<UnifiSummary | null> {
  const config = getConfig()
  if (!config) return null

  const sites = await listSites()
  if (sites.length === 0) return null

  const summary: UnifiSummary = {
    sites: [],
    devices: [],
    totalSites: sites.length,
    totalDevices: 0,
    totalClients: 0,
  }

  for (const site of sites) {
    const siteName = site.meta?.desc || site.meta?.name || site.siteId
    const totalDevices = site.statistics?.counts?.totalDevice ?? 0
    const adoptedDevices = site.statistics?.counts?.totalAdoptedDevice ?? 0

    summary.sites.push({
      siteId: site.siteId,
      name: siteName,
      timezone: site.meta?.timezone ?? '',
      totalDevices,
      adoptedDevices,
      satisfaction: site.statistics?.satisfaction ?? 0,
    })

    // Fetch hosts for each site
    const hosts = await listHosts(site.siteId)
    for (const host of hosts) {
      const rs = host.reportedState ?? {}
      const clients = rs.overview?.connectedUserNum ?? 0
      summary.totalClients += clients

      summary.devices.push({
        id: host.id,
        hostname: rs.hostname ?? 'Unknown',
        model: rs.hardwareModel ?? 'Unknown',
        firmware: rs.firmwareVersion ?? 'Unknown',
        ipAddress: rs.ipAddress ?? '',
        macAddress: rs.macAddress ?? '',
        uptime: rs.uptime ?? 0,
        siteId: site.siteId,
        siteName: siteName,
        connectedClients: clients,
      })
    }
  }

  summary.totalDevices = summary.devices.length

  return summary
}
