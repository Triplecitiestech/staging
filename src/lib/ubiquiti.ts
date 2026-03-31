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
  _id: string
  mac: string
  ip: string
  name: string
  model: string
  model_in_lts: boolean
  model_in_eol: boolean
  type: string // uap, usw, ugw, etc.
  version: string
  adopted: boolean
  site_id: string
  connected_at: number
  uptime: number
  state: number // 1 = connected
  next_interval: number
  overheating: boolean
  num_sta: number // connected client count
  user_num_sta: number
  guest_num_sta: number
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
 * List all devices globally (the /ea/devices endpoint is not per-site).
 */
export async function listDevices(): Promise<UnifiDevice[]> {
  const config = getConfig()
  if (!config) return []

  // Try /ea/devices first (Early Access), then /v1/devices as fallback
  let data = await unifiGet<UnifiDevice[]>(
    '/ea/devices', config.apiKey, config.baseUrl
  )
  if (!data || (Array.isArray(data) && data.length === 0)) {
    // Response might be wrapped in { data: [...] }
    const wrapped = await unifiGet<{ data: UnifiDevice[] }>(
      '/ea/devices', config.apiKey, config.baseUrl
    )
    if (wrapped?.data) data = wrapped.data
  }
  return Array.isArray(data) ? data : []
}

/**
 * Build a full summary of all sites and devices for compliance evidence.
 */
export async function buildSummary(): Promise<UnifiSummary | null> {
  const config = getConfig()
  if (!config) return null

  // Fetch sites and devices in parallel (global endpoint, not per-site)
  const [sites, devices] = await Promise.all([
    listSites(),
    listDevices(),
  ])

  console.log(`[ubiquiti] Found ${sites.length} sites, ${devices.length} devices`)

  if (sites.length === 0 && devices.length === 0) return null

  // Build site name lookup
  const siteNameMap = new Map<string, string>()
  for (const site of sites) {
    siteNameMap.set(site.siteId, site.meta?.desc || site.meta?.name || site.siteId)
  }

  const summary: UnifiSummary = {
    sites: sites.map((s) => ({
      siteId: s.siteId,
      name: s.meta?.desc || s.meta?.name || s.siteId,
      timezone: s.meta?.timezone ?? '',
      totalDevices: s.statistics?.counts?.totalDevice ?? 0,
      adoptedDevices: s.statistics?.counts?.totalAdoptedDevice ?? 0,
      satisfaction: s.statistics?.satisfaction ?? 0,
    })),
    devices: devices.map((d) => ({
      id: d._id,
      hostname: d.name || 'Unknown',
      model: d.model || 'Unknown',
      firmware: d.version || 'Unknown',
      ipAddress: d.ip || '',
      macAddress: d.mac || '',
      uptime: d.uptime || 0,
      siteId: d.site_id || '',
      siteName: siteNameMap.get(d.site_id) || d.site_id || '',
      connectedClients: d.num_sta || 0,
    })),
    totalSites: sites.length,
    totalDevices: devices.length,
    totalClients: devices.reduce((sum, d) => sum + (d.num_sta || 0), 0),
  }

  return summary
}
