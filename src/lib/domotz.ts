/**
 * Domotz API Client
 *
 * Network monitoring and discovery platform.
 * Provides active/passive network scanning, device inventory across VLANs,
 * IP/MAC address tracking, network topology — and the historical telemetry
 * (state-change events, uptime, round-trip-delay, internet speed) used by the
 * WAN reliability reporting module (`src/lib/reporting/wan-reliability`).
 *
 * API docs: https://portal.domotz.com/developers/
 * OpenAPI:  GET {DOMOTZ_API_URL}/meta/open-api-definition
 * Auth: x-api-key header
 *
 * Required env vars:
 *   DOMOTZ_API_KEY  — Full access API key from Domotz Portal
 *   DOMOTZ_API_URL  — Regional API endpoint (e.g. https://api-us-east-1-cell-1.domotz.com/public-api/v1)
 *
 * Resilience: every call is wrapped in `withRetry` (src/lib/resilience) so 429s
 * and transient network errors back off and retry instead of failing the report.
 * History/uptime/RTD/speed endpoints accept ISO-8601 `from`/`to`; the Domotz
 * default window is only one week, so long ranges are split into time chunks and
 * merged (see `requestChunked`).
 */

import { withRetry } from './resilience'

export interface DomotzAgent {
  id: number
  display_name: string
  status: { value: string; last_change: string }
  licence: { id: number; name: string; code: string } | null
  creation_time: string
  timezone: string
  version: { agent: string; package: string } | null
  /** WAN-side info: public IP and its reverse-DNS hostname (ISP is often inferrable from the hostname). */
  wan_info?: { ip: string | null; hostname: string | null } | null
  location?: { latitude: string | null; longitude: string | null } | null
}

/**
 * A device or collector state-change sample from a `history/network/event`
 * endpoint. Device events use type IP_CHANGE|CREATED|UP|DOWN; collector
 * (agent) events use CONNECTION_RECOVERED|CONNECTION_LOST|UP|DOWN.
 */
export interface DomotzNetworkEvent {
  timestamp: string
  type: 'IP_CHANGE' | 'CREATED' | 'UP' | 'DOWN' | 'CONNECTION_LOST' | 'CONNECTION_RECOVERED'
  details?: { new_ip?: string[]; old_ip?: string[] } | null
}

/** Uptime summary for a device or collector over a time window. */
export interface DomotzUptime {
  /** Uptime percentage as a string, e.g. "99.97". */
  uptime: string
  online_seconds: number
  total_seconds: number
  /** Collector uptime percentage (present on the device uptime response). */
  agent_uptime?: string
  agent_id?: number
  /** Down windows within the queried range; start/end are ISO-8601 UTC. */
  downtime_intervals?: Array<{ start: string; end: string }>
}

/**
 * A round-trip-delay history sample. Latency values (`min`/`median`/`max`) are
 * milliseconds encoded as strings; packet loss is derived from
 * lost/sent packet counts.
 */
export interface DomotzRtdSample {
  timestamp: string
  min?: string | null
  median?: string | null
  max?: string | null
  lost_packet_count?: number | null
  sent_packet_count?: number | null
}

/** An internet speed-test sample. `values` is `[downloadBps, uploadBps]`. */
export interface DomotzSpeedSample {
  timestamp: string
  values?: number[] | null
}

/** A monitored device, as returned by the device list/detail endpoints. */
export interface DomotzDeviceDetail extends DomotzDevice {
  agent_reachable?: boolean | null
}

export interface DomotzDevice {
  id: number
  display_name: string
  hw_address: string | null  // MAC address
  ip_addresses: string[]
  protocol: string
  importance: string  // VITAL, FLOATING, etc.
  first_seen_on: string
  last_status_change: string | null
  status: string | null
  type: {
    id: number
    detected_id: number | null
    label: string | null
  } | null
  details: {
    zone: string | null
    room: string | null
    firmware_version: string | null
  } | null
  snmp_status: string | null
  vendor: string | null
  model: string | null
  os: { name: string | null; version: string | null } | null
  user_data: { name: string | null } | null
}

export interface DomotzNetworkSummary {
  available: boolean
  agents: Array<{
    id: number
    name: string
    status: string  // resolved to "ONLINE" / "OFFLINE" string
    deviceCount: number
  }>
  totalDevices: number
  devices: DomotzDevice[]
  discoveryActive: boolean
  note: string | null
}

type QueryParams = Record<string, string | number | boolean | undefined | null>

export class DomotzClient {
  private apiKey: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.DOMOTZ_API_KEY ?? ''
    this.baseUrl = (process.env.DOMOTZ_API_URL ?? '').replace(/\/$/, '')
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.baseUrl)
  }

  private buildUrl(path: string, params?: QueryParams): string {
    const url = `${this.baseUrl}${path}`
    if (!params) return url
    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) qs.set(key, String(value))
    }
    const query = qs.toString()
    return query ? `${url}?${query}` : url
  }

  /**
   * Issue a GET against the Domotz API. Wrapped in `withRetry` so 429 (rate
   * limit) and transient network/5xx errors back off and retry; the status code
   * is included in the thrown message so `classifyError` can categorise it.
   */
  private async request<T>(path: string, params?: QueryParams): Promise<T> {
    const url = this.buildUrl(path, params)
    return withRetry(
      async () => {
        const res = await fetch(url, {
          headers: { 'x-api-key': this.apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Domotz API ${path} failed (${res.status}): ${text.substring(0, 200)}`)
        }
        return res.json() as Promise<T>
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 12_000,
        onRetry: (attempt, err, delay) =>
          console.warn(`[domotz] retry ${attempt} on ${path} after ${err.category} (${Math.round(delay)}ms): ${err.message}`),
      },
    )
  }

  /**
   * Run a time-series GET over a long `[from, to]` window by splitting it into
   * sequential chunks (the Domotz default window is only one week and large
   * pulls can be capped server-side), then concatenating the results. Chunks
   * run with limited concurrency to stay friendly with the rate limiter.
   */
  private async requestChunked<T>(
    pathFor: (fromIso: string, toIso: string) => { path: string; params: QueryParams },
    from: Date,
    to: Date,
    chunkDays = 30,
  ): Promise<T[]> {
    const chunks: Array<{ from: string; to: string }> = []
    const chunkMs = chunkDays * 86_400_000
    let cursor = from.getTime()
    const end = to.getTime()
    while (cursor < end) {
      const next = Math.min(cursor + chunkMs, end)
      chunks.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() })
      cursor = next
    }
    if (chunks.length === 0) return []

    const results: T[][] = new Array(chunks.length)
    const CONCURRENCY = 4
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY)
      const settled = await Promise.all(
        batch.map(async (c, j) => {
          const { path, params } = pathFor(c.from, c.to)
          const rows = await this.request<T[]>(path, params)
          return { idx: i + j, rows: Array.isArray(rows) ? rows : [] }
        }),
      )
      for (const { idx, rows } of settled) results[idx] = rows
    }
    return results.flat()
  }

  /** List all agents/collectors */
  async getAgents(): Promise<DomotzAgent[]> {
    return this.request<DomotzAgent[]>('/agent')
  }

  /** List all devices for a specific agent */
  async getDevices(agentId: number): Promise<DomotzDevice[]> {
    return this.request<DomotzDevice[]>(`/agent/${agentId}/device`)
  }

  /** Build a summary of all discovered devices across all agents */
  async buildSummary(): Promise<DomotzNetworkSummary> {
    if (!this.isConfigured()) {
      return { available: false, agents: [], totalDevices: 0, devices: [], discoveryActive: false, note: 'Domotz API not configured' }
    }

    try {
      const agents = await this.getAgents()

      if (agents.length === 0) {
        return { available: true, agents: [], totalDevices: 0, devices: [], discoveryActive: false, note: 'No Domotz agents/collectors found' }
      }

      const allDevices: DomotzDevice[] = []
      const agentSummaries: DomotzNetworkSummary['agents'] = []

      // Collect devices from up to 10 agents IN PARALLEL to avoid timeout
      const agentBatch = agents.slice(0, 10)
      const deviceResults = await Promise.allSettled(
        agentBatch.map(async (agent) => {
          try {
            const devices = await this.getDevices(agent.id)
            return { agent, devices }
          } catch (err) {
            console.error(`[domotz] Failed to get devices for agent ${agent.id} (${agent.display_name}):`, err instanceof Error ? err.message : String(err))
            return { agent, devices: [] as DomotzDevice[] }
          }
        })
      )

      for (const settled of deviceResults) {
        if (settled.status === 'fulfilled') {
          const { agent, devices } = settled.value
          allDevices.push(...devices)
          // agent.status is { value: "ONLINE", last_change: "..." }
          const statusValue = typeof agent.status === 'object' && agent.status !== null
            ? (agent.status as { value?: string }).value ?? 'UNKNOWN'
            : String(agent.status)
          agentSummaries.push({
            id: agent.id,
            name: agent.display_name,
            status: statusValue,
            deviceCount: devices.length,
          })
        } else {
          // Promise rejected — shouldn't happen since we catch inside, but just in case
          console.error(`[domotz] Agent fetch rejected:`, settled.reason)
        }
      }

      const agentStatuses = agentSummaries.map((a) => `${a.name}: ${a.status} (${a.deviceCount} devices)`)
      console.log(`[domotz] Agents: ${agentStatuses.join(', ')}`)

      // Check for online/active status (Domotz may use ONLINE, online, or ACTIVE)
      const isActive = agentSummaries.some((a) => {
        const s = (a.status ?? '').toUpperCase()
        return s === 'ONLINE' || s === 'ACTIVE' || s === 'OK'
      })

      return {
        available: true,
        agents: agentSummaries,
        totalDevices: allDevices.length,
        devices: allDevices,
        discoveryActive: isActive || allDevices.length > 0, // If we got devices, discovery is working
        note: agents.length > 10 ? `Showing devices from 10 of ${agents.length} agents` : null,
      }
    } catch (err) {
      return {
        available: false,
        agents: [],
        totalDevices: 0,
        devices: [],
        discoveryActive: false,
        note: `Domotz API error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  // -------------------------------------------------------------------------
  // Reliability reporting — agents, devices, and historical telemetry.
  // (`getAgents`/`getDevices`/`buildSummary` above are left untouched for the
  // compliance collector; the methods below add pagination + history.)
  // -------------------------------------------------------------------------

  /**
   * List ALL collectors, following pagination (the `/agent` endpoint defaults
   * to page_size 10, so a single call silently truncates large accounts).
   * Optionally filter server-side by display name.
   */
  async getAllAgents(opts: { displayName?: string; pageSize?: number; maxPages?: number } = {}): Promise<DomotzAgent[]> {
    const pageSize = opts.pageSize ?? 100
    const maxPages = opts.maxPages ?? 50
    const all: DomotzAgent[] = []
    for (let page = 0; page < maxPages; page++) {
      const batch = await this.request<DomotzAgent[]>('/agent', {
        page_size: pageSize,
        page_number: page,
        display_name: opts.displayName,
      })
      if (!Array.isArray(batch) || batch.length === 0) break
      all.push(...batch)
      if (batch.length < pageSize) break
    }
    return all
  }

  /** Full detail for a single collector (timezone, wan_info, status, location). */
  async getAgent(agentId: number): Promise<DomotzAgent> {
    return this.request<DomotzAgent>(`/agent/${agentId}`)
  }

  /** Full detail for a single device. */
  async getDevice(agentId: number, deviceId: number): Promise<DomotzDeviceDetail> {
    return this.request<DomotzDeviceDetail>(`/agent/${agentId}/device/${deviceId}`)
  }

  /** Device uptime % + downtime intervals over a window (the primary outage source for a monitored device). */
  async getDeviceUptime(agentId: number, deviceId: number, from: Date, to: Date): Promise<DomotzUptime> {
    return this.request<DomotzUptime>(`/agent/${agentId}/device/${deviceId}/uptime`, {
      from: from.toISOString(),
      to: to.toISOString(),
    })
  }

  /** Collector (WAN) uptime % + downtime intervals over a window. */
  async getAgentUptime(agentId: number, from: Date, to: Date): Promise<DomotzUptime> {
    return this.request<DomotzUptime>(`/agent/${agentId}/uptime`, {
      from: from.toISOString(),
      to: to.toISOString(),
    })
  }

  /** Device state-change events (UP/DOWN/IP_CHANGE/CREATED), chunked + merged, sorted ascending. */
  async getDeviceEventHistory(agentId: number, deviceId: number, from: Date, to: Date): Promise<DomotzNetworkEvent[]> {
    const rows = await this.requestChunked<DomotzNetworkEvent>(
      (f, t) => ({ path: `/agent/${agentId}/device/${deviceId}/history/network/event`, params: { from: f, to: t } }),
      from,
      to,
    )
    return sortByTimestamp(rows)
  }

  /** Collector internet events (CONNECTION_LOST/CONNECTION_RECOVERED/UP/DOWN), chunked + merged, sorted ascending. */
  async getAgentEventHistory(agentId: number, from: Date, to: Date): Promise<DomotzNetworkEvent[]> {
    const rows = await this.requestChunked<DomotzNetworkEvent>(
      (f, t) => ({ path: `/agent/${agentId}/history/network/event`, params: { from: f, to: t } }),
      from,
      to,
    )
    return sortByTimestamp(rows)
  }

  /** Round-trip-delay history (latency min/median/max + packet counts), chunked + merged, sorted ascending. */
  async getDeviceRtdHistory(agentId: number, deviceId: number, from: Date, to: Date): Promise<DomotzRtdSample[]> {
    const rows = await this.requestChunked<DomotzRtdSample>(
      (f, t) => ({ path: `/agent/${agentId}/device/${deviceId}/history/rtd`, params: { from: f, to: t } }),
      from,
      to,
    )
    return sortByTimestamp(rows)
  }

  /** Internet speed-test history (download/upload bps), chunked + merged, sorted ascending. */
  async getNetworkSpeedHistory(agentId: number, from: Date, to: Date): Promise<DomotzSpeedSample[]> {
    const rows = await this.requestChunked<DomotzSpeedSample>(
      (f, t) => ({ path: `/agent/${agentId}/history/network/speed`, params: { from: f, to: t } }),
      from,
      to,
    )
    return sortByTimestamp(rows)
  }
}

/** Stable ascending sort of timestamped samples (invalid timestamps sort last). */
function sortByTimestamp<T extends { timestamp: string }>(rows: T[]): T[] {
  return rows
    .filter((r) => r && typeof r.timestamp === 'string')
    .sort((a, b) => {
      const ta = Date.parse(a.timestamp)
      const tb = Date.parse(b.timestamp)
      if (Number.isNaN(ta)) return 1
      if (Number.isNaN(tb)) return -1
      return ta - tb
    })
}
