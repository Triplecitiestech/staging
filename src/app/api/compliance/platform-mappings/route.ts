/**
 * GET  /api/compliance/platform-mappings?companyId=xxx — Load saved mappings
 * POST /api/compliance/platform-mappings — Save/update a mapping
 * DELETE /api/compliance/platform-mappings — Remove a mapping
 *
 * GET  /api/compliance/platform-mappings?action=list-sources&platform=datto_rmm
 *      — List available sites/orgs/devices from the platform for dropdown selection
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Platform definitions — what each platform calls its grouping
const PLATFORM_META: Record<string, { label: string; itemLabel: string }> = {
  datto_rmm: { label: 'Datto RMM', itemLabel: 'Site' },
  datto_edr: { label: 'Datto EDR', itemLabel: 'Instance' },
  datto_bcdr: { label: 'Datto BCDR', itemLabel: 'Client / Device' },
  datto_saas: { label: 'Datto SaaS Protect', itemLabel: 'Customer' },
  ubiquiti: { label: 'Ubiquiti UniFi', itemLabel: 'Console' },
  domotz: { label: 'Domotz', itemLabel: 'Agent' },
  it_glue: { label: 'IT Glue', itemLabel: 'Organization' },
  saas_alerts: { label: 'SaaS Alerts', itemLabel: 'Customer' },
  dnsfilter: { label: 'DNSFilter', itemLabel: 'Organization' },
}

interface SourceItem {
  id: string
  name: string
  type: string
  detail?: string
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const action = request.nextUrl.searchParams.get('action')

  // List available items from a platform for dropdown selection
  if (action === 'list-sources') {
    const platform = request.nextUrl.searchParams.get('platform')
    if (!platform || !PLATFORM_META[platform]) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }
    try {
      const items = await listPlatformSources(platform)
      return NextResponse.json({ success: true, platform, meta: PLATFORM_META[platform], items })
    } catch (err) {
      return NextResponse.json({
        success: false, error: `Failed to list ${platform} sources: ${err instanceof Error ? err.message : String(err)}`
      }, { status: 500 })
    }
  }

  // Load saved mappings for a company
  const companyId = request.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query(
      `SELECT id, platform, "externalId", "externalName", "externalType", "mappedBy", "mappedAt"
       FROM compliance_platform_mappings WHERE "companyId" = $1 ORDER BY platform, "externalName"`,
      [companyId]
    )
    return NextResponse.json({
      success: true,
      mappings: res.rows,
      platforms: PLATFORM_META,
    })
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as {
    companyId: string
    platform: string
    externalId: string
    externalName: string
    externalType?: string
  }

  if (!body.companyId || !body.platform || !body.externalId) {
    return NextResponse.json({ error: 'companyId, platform, and externalId are required' }, { status: 400 })
  }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO compliance_platform_mappings ("companyId", platform, "externalId", "externalName", "externalType", "mappedBy", "mappedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT ("companyId", platform, "externalId")
       DO UPDATE SET "externalName" = $4, "externalType" = $5, "mappedBy" = $6, "mappedAt" = NOW()`,
      [body.companyId, body.platform, body.externalId, body.externalName ?? '', body.externalType ?? 'site', session.user.email]
    )
    return NextResponse.json({ success: true })
  } finally {
    client.release()
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as { id?: string; companyId?: string; platform?: string }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    if (body.id) {
      await client.query(`DELETE FROM compliance_platform_mappings WHERE id = $1`, [body.id])
    } else if (body.companyId && body.platform) {
      await client.query(
        `DELETE FROM compliance_platform_mappings WHERE "companyId" = $1 AND platform = $2`,
        [body.companyId, body.platform]
      )
    } else {
      return NextResponse.json({ error: 'id or (companyId + platform) required' }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Platform source listing — fetches available items from each integration
// ---------------------------------------------------------------------------

async function listPlatformSources(platform: string): Promise<SourceItem[]> {
  switch (platform) {
    case 'datto_rmm': {
      if (!process.env.DATTO_RMM_API_KEY || !process.env.DATTO_RMM_API_SECRET) throw new Error('Datto RMM not configured')
      const { DattoRmmClient } = await import('@/lib/datto-rmm')
      const client = new DattoRmmClient()
      const sites = await client.getSites()
      return sites.map((s) => ({
        id: s.uid || String(s.id),
        name: s.name,
        type: 'site',
        detail: `${s.devicesCount ?? 0} devices`,
      }))
    }

    case 'datto_edr': {
      if (!process.env.DATTO_EDR_API_TOKEN) throw new Error('Datto EDR not configured')
      const edrToken = process.env.DATTO_EDR_API_TOKEN
      const edrUrl = (process.env.DATTO_EDR_API_URL || 'https://triple5695.infocyte.com/api').replace(/\/$/, '')
      const tokenParam = `access_token=${encodeURIComponent(edrToken)}`

      // Fetch Organizations from Infocyte LoopBack API
      try {
        const orgRes = await fetch(`${edrUrl}/Organizations?${tokenParam}`, {
          headers: { Authorization: edrToken, Accept: 'application/json' },
          signal: AbortSignal.timeout(15_000),
        })
        if (orgRes.ok) {
          const orgData = await orgRes.json() as Array<{ id?: string; name?: string; description?: string; deviceCount?: number; locationCount?: number }>
          if (Array.isArray(orgData) && orgData.length > 0) {
            return orgData.map((o) => ({
              id: String(o.id ?? o.name ?? 'unknown'),
              name: o.name ?? 'Unknown',
              type: 'organization',
              detail: `${o.deviceCount ?? 0} devices, ${o.locationCount ?? 0} location(s)`,
            }))
          }
        }
      } catch { /* continue to fallback */ }

      return [{ id: 'msp_wide', name: 'All Managed Endpoints (MSP-wide)', type: 'instance' }]
    }

    case 'datto_saas': {
      if (!process.env.DATTO_BCDR_PUBLIC_KEY || !process.env.DATTO_BCDR_PRIVATE_KEY) throw new Error('Datto SaaS Protect not configured (uses BCDR credentials)')
      const { DattoSaasClient } = await import('@/lib/datto-saas')
      const saasClient = new DattoSaasClient()
      const domains = await saasClient.getCustomerDomains()
      // Group by unique customer name
      const customerMap = new Map<string, { id: number; domain: string }>()
      for (const d of domains) {
        const name = d.saasCustomerName || d.organizationName || 'Unknown'
        if (!customerMap.has(name)) {
          customerMap.set(name, { id: d.saasCustomerId, domain: d.domain })
        }
      }
      return Array.from(customerMap.entries()).map(([name, info]) => ({
        id: String(info.id),
        name,
        type: 'customer',
        detail: `Domain: ${info.domain}`,
      }))
    }

    case 'datto_bcdr': {
      if (!process.env.DATTO_BCDR_PUBLIC_KEY || !process.env.DATTO_BCDR_PRIVATE_KEY) throw new Error('Datto BCDR not configured')
      const { DattoBcdrClient } = await import('@/lib/datto-bcdr')
      const client = new DattoBcdrClient()
      const devices = await client.getDevices()
      // Show individual devices so admin can pick exactly which ones belong to this customer
      return devices.map((d) => ({
        id: d.serialNumber || d.name,
        name: d.name,
        type: 'device',
        detail: `Client: ${d.clientCompanyName || 'Unknown'} | Model: ${d.model || 'Unknown'}`,
      }))
    }

    case 'ubiquiti': {
      if (!process.env.UBIQUITI_API_KEY) throw new Error('Ubiquiti not configured')
      // Use host/console names — these are the customer-facing names
      // (site names from /ea/sites are all "Default")
      const { listHosts } = await import('@/lib/ubiquiti')
      const hosts = await listHosts()
      return hosts.map((h) => ({
        id: h.hostId,
        name: h.hostName,
        type: 'console',
        detail: `${h.deviceCount} device(s)`,
      }))
    }

    case 'domotz': {
      if (!process.env.DOMOTZ_API_KEY) throw new Error('Domotz not configured')
      const { DomotzClient } = await import('@/lib/domotz')
      const client = new DomotzClient()
      const agents = await client.getAgents()
      return agents.map((a: { id: number; display_name: string; status?: { value?: string } }) => ({
        id: String(a.id),
        name: a.display_name,
        type: 'agent',
        detail: `Status: ${typeof a.status === 'object' ? a.status?.value : a.status ?? 'unknown'}`,
      }))
    }

    case 'it_glue': {
      if (!process.env.IT_GLUE_API_KEY) throw new Error('IT Glue not configured')
      const { ItGlueClient } = await import('@/lib/it-glue')
      const client = new ItGlueClient()
      const orgs = await client.getOrganizations(1, 250)
      return orgs.map((o) => ({
        id: o.id,
        name: o.attributes?.name ?? 'Unknown',
        type: 'organization',
        detail: o.attributes?.['short-name'] ? `Short: ${o.attributes['short-name']}` : undefined,
      }))
    }

    case 'saas_alerts': {
      if (!process.env.SAAS_ALERTS_API_KEY) throw new Error('SaaS Alerts not configured')
      const { SaasAlertsClient } = await import('@/lib/saas-alerts')
      const client = new SaasAlertsClient()
      const customers = await client.getCustomers()
      return customers.map((c) => ({
        id: c.id,
        name: c.name,
        type: 'customer',
      }))
    }

    case 'dnsfilter': {
      if (!process.env.DNSFILTER_API_TOKEN) throw new Error('DNSFilter not configured')
      const apiToken = process.env.DNSFILTER_API_TOKEN
      const baseUrl = (process.env.DNSFILTER_API_URL || 'https://api.dnsfilter.com/v1').replace(/\/$/, '')
      const res = await fetch(`${baseUrl}/organizations`, {
        headers: { 'Authorization': `Token ${apiToken}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`DNSFilter orgs failed: ${res.status}`)
      const json = await res.json() as { data?: Array<{ id: string; attributes?: { name?: string } }> }
      return (json.data ?? []).map((o) => ({
        id: o.id,
        name: o.attributes?.name ?? 'Unknown',
        type: 'organization',
      }))
    }

    default:
      return []
  }
}
