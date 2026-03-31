/**
 * Domotz API Client
 *
 * Network monitoring and discovery platform.
 * Provides active/passive network scanning, device inventory across VLANs,
 * IP/MAC address tracking, and network topology.
 *
 * API docs: https://portal.domotz.com/developers/
 * Auth: x-api-key header
 *
 * Required env vars:
 *   DOMOTZ_API_KEY  — Full access API key from Domotz Portal
 *   DOMOTZ_API_URL  — Regional API endpoint (e.g. https://api-us-east-1-cell-1.domotz.com/public-api/v1)
 */

export interface DomotzAgent {
  id: number
  display_name: string
  status: string
  licence: { id: number; name: string } | null
  creation_time: string
  last_status_change: string
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
    status: string
    deviceCount: number
  }>
  totalDevices: number
  devices: DomotzDevice[]
  discoveryActive: boolean
  note: string | null
}

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

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      headers: {
        'x-api-key': this.apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Domotz API ${path} failed (${res.status}): ${text.substring(0, 200)}`)
    }

    return res.json() as Promise<T>
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
          agentSummaries.push({
            id: agent.id,
            name: agent.display_name,
            status: agent.status,
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
}
