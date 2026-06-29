/**
 * GET /api/reports/wan-reliability/sites
 *
 * Selector data for the WAN reliability report UI, served from the existing
 * Domotz integration. Staff session required.
 *
 *   (no params)        → list Domotz collectors ("sites"): id, name, status, publicIp, ISP hint.
 *   ?q=<text>          → same, filtered server-side by display name.
 *   ?agentId=<id>      → list that collector's devices, with the likely WAN gateway flagged first.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { DomotzClient, type DomotzDevice } from '@/lib/domotz'
import { inferIspFromHostname } from '@/lib/reporting/wan-reliability'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = new DomotzClient()
  if (!client.isConfigured()) {
    return NextResponse.json(
      { error: 'Domotz is not configured (DOMOTZ_API_KEY / DOMOTZ_API_URL are unset).' },
      { status: 503 },
    )
  }

  const sp = request.nextUrl.searchParams
  const agentIdParam = sp.get('agentId')

  try {
    // --- Devices for a site --------------------------------------------------
    if (agentIdParam) {
      const agentId = parseInt(agentIdParam, 10)
      if (!Number.isFinite(agentId)) {
        return NextResponse.json({ error: 'Invalid agentId.' }, { status: 400 })
      }
      const devices = await client.getDevices(agentId)
      const mapped = devices
        .map((d) => ({
          id: d.id,
          name: d.display_name,
          vendor: d.vendor ?? null,
          model: d.model ?? null,
          type: d.type?.label ?? null,
          ip: Array.isArray(d.ip_addresses) ? d.ip_addresses[0] ?? null : null,
          importance: d.importance ?? null,
          status: d.status ?? null,
          likelyGateway: isLikelyGateway(d),
        }))
        // Likely gateways first, then VITAL devices, then the rest by name.
        .sort(
          (a, b) =>
            Number(b.likelyGateway) - Number(a.likelyGateway) ||
            Number(b.importance === 'VITAL') - Number(a.importance === 'VITAL') ||
            a.name.localeCompare(b.name),
        )
      return NextResponse.json({ success: true, agentId, devices: mapped })
    }

    // --- Sites (collectors) --------------------------------------------------
    const q = sp.get('q')?.trim()
    const agents = await client.getAllAgents({ displayName: q && q.length >= 1 ? q : undefined })
    const sites = agents
      .map((a) => ({
        id: a.id,
        name: a.display_name,
        status: typeof a.status === 'object' ? a.status?.value ?? null : (a.status ?? null),
        timezone: a.timezone ?? null,
        publicIp: a.wan_info?.ip ?? null,
        ispHint: inferIspFromHostname(a.wan_info?.hostname ?? null),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ success: true, sites })
  } catch (err) {
    return NextResponse.json(
      { error: `Domotz request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}

/** Heuristic: does this device look like the WAN gateway / router / firewall? */
function isLikelyGateway(d: DomotzDevice): boolean {
  const haystack = [d.display_name, d.type?.label, d.vendor, d.model].filter(Boolean).join(' ').toLowerCase()
  return /gateway|router|firewall|\bmx\d|meraki|edgerouter|fortigate|sonicwall|sd-?wan|\budm\b|usg/.test(haystack)
}
