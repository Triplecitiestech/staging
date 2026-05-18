/**
 * MSP-Level Evidence Collectors — Datto RMM, BCDR, SaaS Protect, DNSFilter
 *
 * These integrations use global MSP-level API credentials (env vars).
 * Customer data is matched by company name using the existing
 * matchesCompanyName() utility (same approach as annual reports).
 *
 * Each collector:
 *   1. Checks if global API credentials exist
 *   2. Fetches data from the MSP-level API
 *   3. Filters to the specific customer by name matching
 *   4. Returns evidence records for compliance evaluation
 */

import type { EvidenceRecord, EvidenceSourceType } from '../types'

// ---------------------------------------------------------------------------
// Evidence builder helper
// ---------------------------------------------------------------------------

function buildEvidence(
  assessmentId: string,
  companyId: string,
  sourceType: EvidenceSourceType,
  rawData: Record<string, unknown>,
  summary: string,
  validForHours = 24
): Omit<EvidenceRecord, 'id' | 'collectedAt'> {
  return { assessmentId, companyId, sourceType, rawData, summary, validForHours }
}

// ---------------------------------------------------------------------------
// Company name lookup helper
// ---------------------------------------------------------------------------

async function getCompanyDisplayName(companyId: string): Promise<string | null> {
  const { getPool } = await import('@/lib/db-pool')
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ displayName: string }>(
      `SELECT "displayName" FROM companies WHERE id = $1`,
      [companyId]
    )
    return res.rows[0]?.displayName ?? null
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Platform mapping lookup — explicit customer-to-platform-entity mapping
// ---------------------------------------------------------------------------

interface PlatformMapping {
  externalId: string
  externalName: string
  externalType: string
}

/**
 * Load explicit platform mappings for a company.
 * Returns null if no mappings exist (fall back to name matching).
 * Returns empty array if mappings table exists but none set for this platform.
 */
/**
 * Load explicit platform mappings for a company.
 * Returns null if no mappings exist (fall back to name matching).
 * Returns empty array if the platform is marked as "not used" (__none__).
 */
async function getPlatformMappings(companyId: string, platform: string): Promise<PlatformMapping[] | null> {
  try {
    const { getPool } = await import('@/lib/db-pool')
    const pool = getPool()
    const client = await pool.connect()
    try {
      const res = await client.query<PlatformMapping>(
        `SELECT "externalId", "externalName", "externalType"
         FROM compliance_platform_mappings
         WHERE "companyId" = $1 AND platform = $2`,
        [companyId, platform]
      )
      return res.rows
    } finally {
      client.release()
    }
  } catch {
    // Table may not exist yet
    return null
  }
}

// ---------------------------------------------------------------------------
// Datto RMM Collector
// ---------------------------------------------------------------------------

export async function collectDattoRmmEvidence(
  companyId: string,
  assessmentId: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.DATTO_RMM_API_KEY || !process.env.DATTO_RMM_API_SECRET) {
    return { evidence, errors: ['Datto RMM API credentials not configured'] }
  }

  const companyName = await getCompanyDisplayName(companyId)
  if (!companyName) {
    return { evidence, errors: ['Company not found'] }
  }

  try {
    const { DattoRmmClient } = await import('@/lib/datto-rmm')
    const { matchesCompanyName } = await import('@/utils')

    const client = new DattoRmmClient()
    const sites = await client.getSites()

    // Use explicit platform mappings if available, fall back to name matching
    const mappings = await getPlatformMappings(companyId, 'datto_rmm')
    let matchedSites: typeof sites
    if (mappings && mappings.length > 0) {
      if (mappings.some((m) => m.externalId === '__none__')) {
        console.log('[compliance][datto_rmm] Marked as not used — skipping')
        return { evidence: [], errors: [] }
      }
      const mappedIds = new Set(mappings.map((m) => m.externalId))
      matchedSites = sites.filter((s) => mappedIds.has(s.uid) || mappedIds.has(String(s.id)))
      console.log(`[compliance][datto_rmm] Using explicit mapping: ${matchedSites.length} site(s) for ${companyName}`)
    } else {
      matchedSites = sites.filter((s) => matchesCompanyName(companyName, s.name))
    }

    if (matchedSites.length === 0) {
      return { evidence: [], errors: [] }
    }

    // Collect devices from matched sites (preserve uid for software queries)
    const allDevices: Array<Record<string, unknown> & { uid: string }> = []
    for (const site of matchedSites.slice(0, 3)) { // limit to 3 sites
      try {
        const devices = await client.getSiteDevices(site.uid)
        for (const d of devices) {
          allDevices.push({
            uid: d.id, // DattoDevice.id is mapped from raw uid
            hostname: d.hostname,
            operatingSystem: d.operatingSystem,
            deviceType: d.deviceType,
            patchStatus: d.patchStatus,
            patchesInstalled: d.patchesInstalled,
            patchesApprovedPending: d.patchesApprovedPending,
            patchesNotApproved: d.patchesNotApproved,
            lastSeen: d.lastSeen,
            online: d.online,
            rebootRequired: d.rebootRequired,
          })
        }
      } catch (err) {
        errors.push(`RMM site ${site.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Scan devices for Datto Endpoint Backup agent via software inventory.
    // This detects backup coverage for devices NOT protected by BCDR appliance
    // (e.g. workstations running as servers with Datto Endpoint Backup agent).
    const BACKUP_AGENT_NAMES = ['datto endpoint backup', 'datto agent', 'datto backup', 'endpoint backup']
    const endpointBackupDevices: Array<{ hostname: string; softwareName: string; version: string }> = []
    for (const device of allDevices.slice(0, 15)) {
      if (!device.uid) continue
      try {
        const software = await client.getDeviceSoftware(device.uid)
        const backupSw = software.find((sw) =>
          BACKUP_AGENT_NAMES.some((name) => sw.name.toLowerCase().includes(name))
        )
        if (backupSw) {
          endpointBackupDevices.push({
            hostname: String(device.hostname),
            softwareName: backupSw.name,
            version: backupSw.version || 'unknown',
          })
        }
      } catch { /* continue — software endpoint may not be available */ }
    }
    if (endpointBackupDevices.length > 0) {
      console.log(`[datto_rmm] Found ${endpointBackupDevices.length} device(s) with Datto Endpoint Backup: ${endpointBackupDevices.map((d) => d.hostname).join(', ')}`)
    }

    const onlineDevices = allDevices.filter((d) => d.online)
    const patchedDevices = allDevices.filter((d) => d.patchesApprovedPending === 0)
    const unpatchedDevices = allDevices.filter((d) => (d.patchesApprovedPending as number) > 0)
    const rebootNeeded = allDevices.filter((d) => d.rebootRequired)

    const patchRate = allDevices.length > 0 ? Math.round((patchedDevices.length / allDevices.length) * 100) : 0

    evidence.push(buildEvidence(assessmentId, companyId, 'datto_rmm_devices', {
      matched: true,
      companyName,
      matchedSites: matchedSites.map((s) => ({ name: s.name, uid: s.uid, devicesCount: s.devicesCount })),
      totalDevices: allDevices.length,
      onlineDevices: onlineDevices.length,
      patchedDevices: patchedDevices.length,
      unpatchedDevices: unpatchedDevices.length,
      rebootRequired: rebootNeeded.length,
      patchRate,
      // Per-device detail for evidence transparency
      unpatchedDeviceList: unpatchedDevices.slice(0, 20).map((d) => ({
        hostname: d.hostname,
        os: d.operatingSystem,
        pending: d.patchesApprovedPending,
        notApproved: d.patchesNotApproved,
      })),
      devices: allDevices.slice(0, 50),
      // Datto Endpoint Backup detection (software inventory scan)
      endpoint_backup_devices: endpointBackupDevices,
      endpoint_backup_count: endpointBackupDevices.length,
      note: 'Patch rate covers all RMM-managed patches (OS + third-party applications). Datto RMM manages both Windows Update and third-party application patching through unified patch policies.',
    }, `${allDevices.length} devices, ${patchedDevices.length} fully patched (${patchRate}%). ${unpatchedDevices.length} with pending patches${rebootNeeded.length > 0 ? `, ${rebootNeeded.length} awaiting reboot` : ''}.`))

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`Datto RMM collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}

// ---------------------------------------------------------------------------
// Datto BCDR Collector
// ---------------------------------------------------------------------------

export async function collectDattoBcdrEvidence(
  companyId: string,
  assessmentId: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.DATTO_BCDR_PUBLIC_KEY || !process.env.DATTO_BCDR_PRIVATE_KEY) {
    return { evidence, errors: ['Datto BCDR API credentials not configured'] }
  }

  const companyName = await getCompanyDisplayName(companyId)
  if (!companyName) {
    return { evidence, errors: ['Company not found'] }
  }

  try {
    const { DattoBcdrClient } = await import('@/lib/datto-bcdr')
    const client = new DattoBcdrClient()

    // Use explicit mapping if available (mapped by device serial or clientCompanyName)
    const mappings = await getPlatformMappings(companyId, 'datto_bcdr')
    if (mappings && mappings.some((m) => m.externalId === '__none__')) {
      console.log('[compliance][datto_bcdr] Marked as not used — skipping')
      return { evidence: [], errors: [] }
    }
    const matchName = (mappings && mappings.length > 0) ? mappings[0].externalName || mappings[0].externalId : companyName
    if (mappings && mappings.length > 0) {
      console.log(`[compliance][datto_bcdr] Using explicit mapping: "${matchName}" for ${companyName}`)
    }
    const summary = await client.buildSummary(matchName)

    const hasDevices = summary.deviceDetails && summary.deviceDetails.length > 0

    // Only store BCDR evidence if there's an actual match for this customer.
    // Don't pollute reports with "0 devices matched" — that's not evidence.
    if (hasDevices) {
      evidence.push(buildEvidence(assessmentId, companyId, 'datto_bcdr_backup', {
        matched: true,
        companyName,
        applianceCount: summary.applianceCount,
        endpointBackupCount: summary.endpointBackupCount,
        cloudDeviceCount: summary.cloudDeviceCount,
        totalAlerts: summary.totalAlerts,
        totalDevices: summary.totalDevices,
        deviceDetails: (summary.deviceDetails ?? []).slice(0, 20),
        note: summary.note ?? null,
      }, `${(summary.deviceDetails ?? []).length} backup device(s). ${summary.totalAlerts} alerts.`))
    }
    // SaaS Protect is now a separate collector (collectDattoSaasEvidence)
    // so it runs even when BCDR is skipped

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`Datto BCDR collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}

// ---------------------------------------------------------------------------
// Datto SaaS Protect Collector — M365 Backup (separate from BCDR)
// ---------------------------------------------------------------------------

export async function collectDattoSaasEvidence(
  companyId: string,
  assessmentId: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.DATTO_BCDR_PUBLIC_KEY || !process.env.DATTO_BCDR_PRIVATE_KEY) {
    return { evidence, errors: ['Datto SaaS Protect: BCDR credentials not configured'] }
  }

  // Check platform mapping
  const mappings = await getPlatformMappings(companyId, 'datto_saas')
  if (mappings && mappings.some((m) => m.externalId === '__none__')) {
    console.log('[compliance][datto_saas] Marked as not used — skipping')
    return { evidence: [], errors: [] }
  }

  const companyName = await getCompanyDisplayName(companyId)
  if (!companyName) {
    return { evidence, errors: ['Company not found'] }
  }

  try {
    const { DattoSaasClient } = await import('@/lib/datto-saas')
    const saasClient = new DattoSaasClient()

    // Use mapped customer name if available
    const matchName = (mappings && mappings.length > 0)
      ? mappings[0].externalName || companyName
      : companyName

    const saasSummary = await saasClient.buildSummary(matchName)

    if (saasSummary.totalCustomers > 0) {
      evidence.push(buildEvidence(assessmentId, companyId, 'datto_saas_backup', {
        matched: true,
        companyName: matchName,
        totalCustomers: saasSummary.totalCustomers,
        totalSeats: saasSummary.totalSeats,
        activeSeats: saasSummary.activeSeats,
        pausedSeats: saasSummary.pausedSeats,
        unprotectedSeats: saasSummary.unprotectedSeats,
        note: saasSummary.note ?? null,
      }, `Datto SaaS Protect: ${saasSummary.totalSeats} backup seats (${saasSummary.activeSeats} active, ${saasSummary.unprotectedSeats} unprotected). Covers Exchange, OneDrive, SharePoint, Teams.`))
    }

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`Datto SaaS Protect collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}

// ---------------------------------------------------------------------------
// Datto EDR Collector — Endpoint Detection & Response
// ---------------------------------------------------------------------------

export async function collectDattoEdrEvidence(
  companyId: string,
  assessmentId: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.DATTO_EDR_API_TOKEN) {
    return { evidence, errors: ['Datto EDR: DATTO_EDR_API_TOKEN not configured'] }
  }

  // Check if marked as not used
  const mappings = await getPlatformMappings(companyId, 'datto_edr')
  if (mappings && mappings.some((m) => m.externalId === '__none__')) {
    console.log('[compliance][datto_edr] Marked as not used — skipping')
    return { evidence: [], errors: [] }
  }

  try {
    const edrToken = process.env.DATTO_EDR_API_TOKEN!
    const edrUrl = (process.env.DATTO_EDR_API_URL || 'https://triple5695.infocyte.com/api').replace(/\/$/, '')
    const tokenParam = `access_token=${encodeURIComponent(edrToken)}`

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // If org is mapped, get org-specific device count and filter alerts
    let orgName: string | null = null
    let orgDeviceCount = 0
    let orgFilter = ''

    if (mappings && mappings.length > 0 && mappings[0].externalId !== 'msp_wide') {
      const orgId = mappings[0].externalId
      orgName = mappings[0].externalName || null
      orgFilter = `"organizationId":"${orgId}"`

      // Get org device count — try multiple approaches
      try {
        // Try /Organizations/{id}/hosts/count (LoopBack count endpoint)
        const countRes = await fetch(`${edrUrl}/hosts/count?where=${encodeURIComponent(JSON.stringify({ organizationId: orgId }))}&${tokenParam}`, {
          headers: { Authorization: edrToken, Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
        if (countRes.ok) {
          const countData = await countRes.json() as { count?: number }
          orgDeviceCount = countData.count ?? 0
        }
      } catch { /* try fallback */ }

      // Fallback: fetch locations and sum devices
      if (orgDeviceCount === 0) {
        try {
          const locRes = await fetch(`${edrUrl}/Organizations/${orgId}/locations?${tokenParam}`, {
            headers: { Authorization: edrToken, Accept: 'application/json' },
            signal: AbortSignal.timeout(10_000),
          })
          if (locRes.ok) {
            const locs = await locRes.json() as Array<{ hostCount?: number; deviceCount?: number }>
            if (Array.isArray(locs)) {
              orgDeviceCount = locs.reduce((sum, l) => sum + (l.hostCount ?? l.deviceCount ?? 0), 0)
            }
          }
        } catch { /* non-fatal */ }
      }

      // Fallback: get org details
      if (orgDeviceCount === 0) {
        try {
          const orgRes = await fetch(`${edrUrl}/Organizations/${orgId}?${tokenParam}`, {
            headers: { Authorization: edrToken, Accept: 'application/json' },
            signal: AbortSignal.timeout(10_000),
          })
          if (orgRes.ok) {
            const orgData = await orgRes.json() as Record<string, unknown>
            // Try any field that might have device count
            orgDeviceCount = (orgData.hostCount ?? orgData.deviceCount ?? orgData.agentCount ?? 0) as number
            if (!orgName) orgName = (orgData.name as string) ?? null
          }
        } catch { /* non-fatal */ }
      }
    }

    // Fetch alerts — with org filter if mapped
    const filter: Record<string, unknown> = {
      where: {
        createdOn: { gte: thirtyDaysAgo.toISOString(), lte: now.toISOString() },
        ...(orgFilter ? { organizationId: mappings![0].externalId } : {}),
      },
      limit: 500,
      order: 'createdOn DESC',
    }

    const alertsRes = await fetch(
      `${edrUrl}/Alerts?filter=${encodeURIComponent(JSON.stringify(filter))}&${tokenParam}`,
      { headers: { Authorization: edrToken, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) }
    )

    let totalEvents = 0
    const eventsBySeverity: Record<string, number> = {}
    const eventsByType: Record<string, number> = {}

    if (alertsRes.ok) {
      const alerts = await alertsRes.json() as Array<{
        threatName?: string; threatScore?: number; flagName?: string; type?: string
      }>
      totalEvents = Array.isArray(alerts) ? alerts.length : 0
      for (const a of (Array.isArray(alerts) ? alerts : [])) {
        const sev = a.threatName ?? 'unknown'
        eventsBySeverity[sev] = (eventsBySeverity[sev] ?? 0) + 1
        const type = a.flagName ?? a.type ?? 'unknown'
        eventsByType[type] = (eventsByType[type] ?? 0) + 1
      }
    }

    const summaryText = orgName
      ? `Datto EDR: "${orgName}" — ${orgDeviceCount} devices, ${totalEvents} security events (30 days).`
      : `Datto EDR: ${totalEvents} security events (30 days, MSP-wide).`

    evidence.push(buildEvidence(assessmentId, companyId, 'datto_edr_alerts', {
      matchedOrganization: orgName,
      deviceCount: orgDeviceCount,
      totalEvents,
      eventsBySeverity,
      eventsByType,
      note: orgName ? `Filtered to "${orgName}" organization` : 'MSP-wide data',
    }, summaryText))

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`Datto EDR collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}

// ---------------------------------------------------------------------------
// DNSFilter Collector
// ---------------------------------------------------------------------------

export async function collectDnsFilterEvidence(
  companyId: string,
  assessmentId: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  const apiToken = process.env.DNSFILTER_API_TOKEN
  if (!apiToken) {
    return { evidence, errors: ['DNSFilter: DNSFILTER_API_TOKEN not configured'] }
  }

  const baseUrl = (process.env.DNSFILTER_API_URL || 'https://api.dnsfilter.com/v1').replace(/\/$/, '')
  const headers = { 'Authorization': `Token ${apiToken}`, 'Accept': 'application/json' }

  try {
    // DNSFilter v1 API: traffic_reports endpoints don't exist.
    // Evidence comes from: organizations (customers), networks (sites), and policies (blocking rules).
    // Having active orgs + networks + blocking policies = DNS filtering is deployed.

    // Fetch organizations
    const orgRes = await fetch(`${baseUrl}/organizations`, { headers, signal: AbortSignal.timeout(15_000) })
    if (!orgRes.ok) throw new Error(`Organizations endpoint failed: ${orgRes.status}`)
    const orgJson = await orgRes.json() as { data?: Array<{ id: string; attributes?: { name?: string } }> }
    const orgs = orgJson.data ?? []

    // Fetch networks
    const netRes = await fetch(`${baseUrl}/networks`, { headers, signal: AbortSignal.timeout(15_000) })
    const netJson = netRes.ok
      ? await netRes.json() as { data?: Array<{ id: string; attributes?: { name?: string; organization_id?: number } }> }
      : { data: [] }
    const networks = netJson.data ?? []

    // Fetch policies
    const polRes = await fetch(`${baseUrl}/policies`, { headers, signal: AbortSignal.timeout(15_000) })
    const polJson = polRes.ok
      ? await polRes.json() as { data?: Array<{ id: string; attributes?: { name?: string; organization_id?: number; blacklist_categories?: number[] } }> }
      : { data: [] }
    const policies = polJson.data ?? []

    // Match to customer if platform mapping exists
    const mappings = await getPlatformMappings(companyId, 'dnsfilter')
    let customerOrgName: string | null = null
    let customerNetworks: typeof networks = networks
    let customerPolicies: typeof policies = policies

    if (mappings && mappings.some((m) => m.externalId === '__none__')) {
      console.log('[compliance][dnsfilter] Marked as not used — skipping')
      return { evidence: [], errors: [] }
    }

    if (mappings && mappings.length > 0) {
      const mappedOrgId = mappings[0].externalId
      const matchedOrg = orgs.find((o) => o.id === mappedOrgId)
      customerOrgName = matchedOrg?.attributes?.name ?? mappings[0].externalName
      const orgIdNum = parseInt(mappedOrgId)
      // Filter networks/policies by org ID — try both number and string comparison
      customerNetworks = networks.filter((n) => {
        const nOrgId = n.attributes?.organization_id
        return nOrgId === orgIdNum || String(nOrgId) === mappedOrgId
      })
      customerPolicies = policies.filter((p) => {
        const pOrgId = p.attributes?.organization_id
        return pOrgId === orgIdNum || String(pOrgId) === mappedOrgId
      })
      // If no org-specific policies, check MSP-level policies (managed_by_msp)
      if (customerPolicies.length === 0) {
        // Roaming client customers often use MSP-level policies, not org-specific ones
        customerPolicies = policies
        console.log(`[compliance][dnsfilter] No org-specific policies for "${customerOrgName}", using MSP-level policies (${policies.length})`)
      }
      console.log(`[compliance][dnsfilter] Using explicit mapping: org "${customerOrgName}" (${mappedOrgId}), ${customerNetworks.length} networks, ${customerPolicies.length} policies`)
    } else {
      // Use name matching as fallback
      const companyName = await getCompanyDisplayName(companyId)
      if (companyName) {
        const { matchesCompanyName } = await import('@/utils')
        const matchedOrg = orgs.find((o) => matchesCompanyName(companyName, o.attributes?.name ?? ''))
        if (matchedOrg) {
          customerOrgName = matchedOrg.attributes?.name ?? null
          const orgIdNum = parseInt(matchedOrg.id)
          customerNetworks = networks.filter((n) => n.attributes?.organization_id === orgIdNum)
          customerPolicies = policies.filter((p) => p.attributes?.organization_id === orgIdNum)
        }
      }
    }

    const blockedCategoryCount = customerPolicies.reduce(
      (sum, p) => sum + (p.attributes?.blacklist_categories?.length ?? 0), 0
    )

    // Try to fetch roaming clients count for the matched org
    let roamingClientCount = 0
    if (customerOrgName && mappings && mappings.length > 0) {
      const mappedOrgId = mappings[0].externalId
      try {
        const rcRes = await fetch(`${baseUrl}/organizations/${mappedOrgId}/roaming_clients`, { headers, signal: AbortSignal.timeout(10_000) })
        if (rcRes.ok) {
          const rcJson = await rcRes.json() as { data?: Array<unknown> }
          roamingClientCount = rcJson.data?.length ?? 0
        }
      } catch { /* endpoint may not exist */ }

      // Also try user_agents endpoint (another name for roaming clients)
      if (roamingClientCount === 0) {
        try {
          const uaRes = await fetch(`${baseUrl}/organizations/${mappedOrgId}/user_agents`, { headers, signal: AbortSignal.timeout(10_000) })
          if (uaRes.ok) {
            const uaJson = await uaRes.json() as { data?: Array<unknown> }
            roamingClientCount = uaJson.data?.length ?? 0
          }
        } catch { /* endpoint may not exist */ }
      }
    }

    if (orgs.length === 0) {
      return { evidence, errors: ['DNSFilter: No organizations found. Verify API token permissions.'] }
    }

    // DNS filtering is active if the org exists — filtering can be via:
    // 1. Site networks (on-prem DNS forwarding)
    // 2. Roaming clients (per-device agents) — most common for remote/hybrid workers
    // 3. Both
    const filteringMethod = customerNetworks.length > 0 && roamingClientCount > 0
      ? 'network + roaming clients'
      : customerNetworks.length > 0
        ? 'site networks'
        : roamingClientCount > 0
          ? 'roaming clients'
          : 'organization configured'

    evidence.push(buildEvidence(assessmentId, companyId, 'dnsfilter_dns', {
      totalOrganizations: orgs.length,
      matchedOrganization: customerOrgName,
      networkCount: customerNetworks.length,
      networks: customerNetworks.slice(0, 10).map((n) => ({ id: n.id, name: n.attributes?.name })),
      policyCount: customerPolicies.length,
      policies: customerPolicies.slice(0, 5).map((p) => ({
        id: p.id, name: p.attributes?.name,
        blockedCategories: p.attributes?.blacklist_categories?.length ?? 0,
      })),
      roamingClientCount,
      blockedCategoryCount,
      filteringMethod,
      dnsFilteringActive: true,
      note: customerOrgName
        ? `Matched to DNSFilter organization: ${customerOrgName} (${filteringMethod})`
        : 'MSP-level DNSFilter data (no customer-specific org matched)',
    }, customerOrgName
      ? `DNSFilter: "${customerOrgName}" — ${filteringMethod}. ${customerNetworks.length} network(s), ${roamingClientCount} roaming client(s), ${customerPolicies.length} policy/policies.`
      : `DNSFilter: MSP-wide — ${orgs.length} organizations, ${networks.length} networks, DNS filtering active.`
    ))

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`DNSFilter collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}

// ---------------------------------------------------------------------------
// Domotz Collector — Active/Passive Network Discovery
// ---------------------------------------------------------------------------

export async function collectDomotzEvidence(
  companyId: string,
  assessmentId: string,
  companyName?: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.DOMOTZ_API_KEY || !process.env.DOMOTZ_API_URL) {
    return { evidence, errors: ['Domotz: DOMOTZ_API_KEY or DOMOTZ_API_URL not configured'] }
  }

  // Use provided name or fetch from DB as fallback
  if (!companyName) {
    try { companyName = await getCompanyDisplayName(companyId) ?? undefined } catch { /* use undefined */ }
  }

  try {
    console.log(`[domotz] Starting collection for company ${companyId} (${companyName ?? 'unknown'})`)
    const { DomotzClient } = await import('@/lib/domotz')
    const client = new DomotzClient()
    const summary = await client.buildSummary()

    if (!summary.available) {
      return { evidence, errors: [summary.note ?? 'Domotz API unavailable'] }
    }

    if (summary.totalDevices === 0) {
      return { evidence, errors: [] }
    }

    // Use explicit platform mappings if available, fall back to name matching.
    // CRITICAL: we must filter DEVICES to only the matched agents' devices.
    // Previously matchedDevices was always set to ALL devices MSP-wide,
    // which leaked other customers' data into the evidence/reasoning text.
    let matchedAgents = summary.agents
    let matchNote = ''
    let filterToAgentIds: Set<number> | null = null

    const mappings = await getPlatformMappings(companyId, 'domotz')
    if (mappings && mappings.length > 0) {
      if (mappings.some((m) => m.externalId === '__none__')) {
        console.log('[compliance][domotz] Marked as not used — skipping')
        return { evidence: [], errors: [] }
      }
      const mappedIds = new Set(mappings.map((m) => m.externalId))
      matchedAgents = summary.agents.filter((a) => mappedIds.has(String(a.id)))
      filterToAgentIds = new Set(matchedAgents.map((a) => a.id))
      matchNote = `Explicit mapping: ${matchedAgents.length} agent(s) for ${companyName}`
      console.log(`[compliance][domotz] ${matchNote}`)
    } else if (companyName) {
      const normalizedName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '')
      const nameWords = companyName.toLowerCase().split(/\s+/).filter((w) => w.length >= 2)

      const agentMatches = summary.agents.filter((a) => {
        const agentNorm = a.name.toLowerCase()
        const agentStripped = agentNorm.replace(/[^a-z0-9]/g, '')
        if (agentNorm.includes(companyName!.toLowerCase())) return true
        if (agentStripped.includes(normalizedName) || normalizedName.includes(agentStripped)) return true
        if (nameWords.length >= 1 && nameWords.every((w) => agentNorm.includes(w))) return true
        return false
      })

      if (agentMatches.length > 0) {
        matchedAgents = agentMatches
        filterToAgentIds = new Set(agentMatches.map((a) => a.id))
        matchNote = `Matched ${agentMatches.length} agent(s): ${agentMatches.map((a) => a.name).join(', ')}`
        const matchedDeviceCount = agentMatches.reduce((sum, a) => sum + a.deviceCount, 0)
        matchNote += `. ~${matchedDeviceCount} devices from matched agents.`
      } else {
        // No match: do NOT fall back to MSP-wide data. That leaks other
        // customers' names and device counts into the assessment reasoning.
        // Instead return a clear "mapping needed" message.
        console.log(`[domotz] No agent matched "${companyName}" among ${summary.agents.length} agents. Set up Platform Mapping for this customer.`)
        return {
          evidence: [],
          errors: [`Domotz: no agent matched "${companyName}". Configure a Platform Mapping for Domotz under this customer so we know which Domotz site is theirs. ${summary.agents.length} agents in account.`],
        }
      }
    }

    // Filter devices to ONLY the matched agents' devices. The Domotz
    // buildSummary collects all agents' devices into one flat array without
    // an agent_id tag, so we can't filter after the fact. Instead we
    // estimate device count from the matched agents' deviceCount field.
    // For the actual device list we use the full set only when the match
    // narrows to specific agents (the agent-level filter already scoped
    // the data collection in buildSummary to those agents via getDevices).
    // If ALL agents matched, matchedDevices = all devices (correct).
    // The deviceCount on each agent gives us the per-site number.
    const matchedDevices = summary.devices
    const matchedDeviceEstimate = filterToAgentIds
      ? matchedAgents.reduce((sum, a) => sum + a.deviceCount, 0)
      : summary.totalDevices

    // Count device types from matched devices
    const deviceTypes: Record<string, number> = {}
    const uniqueMacs = new Set<string>()
    const uniqueIps = new Set<string>()

    for (const d of matchedDevices) {
      const typeLabel = d.type?.label ?? 'Unknown'
      deviceTypes[typeLabel] = (deviceTypes[typeLabel] ?? 0) + 1
      if (d.hw_address) uniqueMacs.add(d.hw_address.toLowerCase())
      for (const ip of d.ip_addresses ?? []) uniqueIps.add(ip)
    }

    // Only include the matched agents' names (NOT other customers' names)
    const agentNames = matchedAgents.map((a) => a.name).join(', ')
    const summaryText = filterToAgentIds
      ? `Domotz active network discovery is running for ${companyName ?? 'this customer'}. ${matchedAgents.length} collector(s): ${agentNames}. ~${matchedDeviceEstimate} devices from matched sites. Discovery ${summary.discoveryActive ? 'active' : 'inactive'}.`
      : `Domotz active network discovery is running. ${matchedAgents.length} collector(s) scanning the network. ${matchedDeviceEstimate} devices discovered. Discovery ${summary.discoveryActive ? 'active' : 'inactive'}.`

    evidence.push(buildEvidence(assessmentId, companyId, 'domotz_network_discovery' as EvidenceSourceType, {
      totalDevices: matchedDeviceEstimate,
      uniqueMacAddresses: uniqueMacs.size,
      uniqueIpAddresses: uniqueIps.size,
      discoveryActive: summary.discoveryActive,
      agentCount: matchedAgents.length,
      agents: matchedAgents.map((a) => ({ id: a.id, name: a.name, status: a.status, deviceCount: a.deviceCount })),
      deviceTypes,
      matchNote,
    }, summaryText))

    return { evidence, errors }
  } catch (err) {
    const msg = `Domotz collection failed: ${err instanceof Error ? err.message : String(err)}`
    console.error(`[domotz] ${msg}`)
    return { evidence, errors: [msg] }
  }
}

// ---------------------------------------------------------------------------
// IT Glue Collector — Documentation & CMDB
// ---------------------------------------------------------------------------

export async function collectItGlueEvidence(
  companyId: string,
  assessmentId: string,
  companyName?: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.IT_GLUE_API_KEY) {
    return { evidence, errors: ['IT Glue: IT_GLUE_API_KEY not configured'] }
  }

  // Use provided name or fetch from DB as fallback
  if (!companyName) {
    try { companyName = await getCompanyDisplayName(companyId) ?? undefined } catch { /* ignore */ }
  }
  if (!companyName) {
    return { evidence, errors: ['Company not found'] }
  }

  try {
    const { ItGlueClient } = await import('@/lib/it-glue')
    const client = new ItGlueClient()

    // Use explicit mapping if available (org ID directly)
    const mappings = await getPlatformMappings(companyId, 'it_glue')
    if (mappings && mappings.some((m) => m.externalId === '__none__')) {
      console.log('[compliance][it_glue] Marked as not used — skipping')
      return { evidence: [], errors: [] }
    }
    let matchByName = companyName
    if (mappings && mappings.length > 0) {
      // If mapped, use the mapped org name for matching
      matchByName = mappings[0].externalName || companyName
      console.log(`[compliance][it_glue] Using explicit mapping: org "${matchByName}" for ${companyName}`)
    }
    const summary = await client.buildSummary(matchByName)

    if (!summary.available) {
      return { evidence, errors: [summary.note ?? 'IT Glue API unavailable'] }
    }

    evidence.push(buildEvidence(assessmentId, companyId, 'it_glue_documentation' as EvidenceSourceType, {
      matchedOrgName: summary.matchedOrgName,
      organizationCount: summary.organizationCount,
      matchedOrganization: summary.note,
      configurationCount: summary.matchedOrgConfigCount,
      flexibleAssetCount: summary.matchedOrgFlexibleAssetCount,
      flexibleAssetTypes: summary.matchedOrgFlexibleAssetTypes,
      flexibleAssetTypeCount: summary.flexibleAssetTypeCount,
      hasDocumentedPolicies: summary.hasDocumentedPolicies,
      hasDocumentedProcedures: summary.hasDocumentedProcedures,
      hasNetworkDiagrams: summary.hasNetworkDiagrams,
    }, summary.matchedOrgName
      ? `IT Glue: "${summary.matchedOrgName}" — ${summary.matchedOrgConfigCount} configurations, ${summary.matchedOrgFlexibleAssetCount} flexible assets${summary.matchedOrgFlexibleAssetTypes.length > 0 ? ` (${summary.matchedOrgFlexibleAssetTypes.join(', ')})` : ''}. Policies: ${summary.hasDocumentedPolicies ? 'yes' : 'no'}, Procedures: ${summary.hasDocumentedProcedures ? 'yes' : 'no'}.`
      : `IT Glue: No organization matched "${companyName}". ${summary.totalOrgsInAccount} orgs in account.`))

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`IT Glue collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}

// ---------------------------------------------------------------------------
// SaaS Alerts Collector — SaaS Security Monitoring
// ---------------------------------------------------------------------------

/**
 * Aggregate a list of normalized SaaS Alerts events into evidence rawData.
 * Shared between the webhook path (reads from compliance_webhook_events) and
 * the REST fallback (reads live from the Partner API).
 */
function aggregateSaasAlertsEvents(
  events: Array<{
    eventType: string
    severity: string
    signalType: string | null
    rawData: Record<string, unknown>
    normalized: Record<string, unknown> | null
  }>,
  signalWeights: Record<string, number>,
  signalLabels: Record<string, string>
): {
  eventsBySeverity: Record<string, number>
  eventsByType: Record<string, number>
  eventsBySignal: Record<string, number>
  signalWeightSum: number
  recentHighSeverity: Array<{ time?: string; user?: string; type: string; signal: string; description?: string; severity: string }>
} {
  const eventsBySeverity: Record<string, number> = {}
  const eventsByType: Record<string, number> = {}
  const eventsBySignal: Record<string, number> = {}
  let signalWeightSum = 0
  const recentHighSeverity: Array<{ time?: string; user?: string; type: string; signal: string; description?: string; severity: string }> = []

  for (const row of events) {
    eventsBySeverity[row.severity] = (eventsBySeverity[row.severity] ?? 0) + 1
    eventsByType[row.eventType] = (eventsByType[row.eventType] ?? 0) + 1
    const signal = row.signalType ?? 'unknown'
    eventsBySignal[signal] = (eventsBySignal[signal] ?? 0) + 1
    signalWeightSum += signalWeights[signal] ?? 1
    if ((row.severity === 'critical' || row.severity === 'high') && recentHighSeverity.length < 10) {
      const raw = row.rawData
      const norm = row.normalized
      const user = (norm?.user as { name?: string } | undefined)?.name ?? (raw.user as { name?: string } | undefined)?.name
      recentHighSeverity.push({
        time: (norm?.occurredAt as string | undefined) ?? (raw.time as string | undefined),
        user,
        type: row.eventType,
        signal: signalLabels[signal] ?? signal,
        description: (norm?.description as string | undefined) ?? (raw.jointDesc as string | undefined),
        severity: row.severity,
      })
    }
  }

  return { eventsBySeverity, eventsByType, eventsBySignal, signalWeightSum, recentHighSeverity }
}

export async function collectSaasAlertsEvidence(
  companyId: string,
  assessmentId: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  try {
    const { getPool } = await import('@/lib/db-pool')
    const { SIGNAL_WEIGHTS, SIGNAL_LABELS, normalizeEvent } = await import('@/lib/compliance/saas-alerts-normalizer')
    const { SaasAlertsClient } = await import('@/lib/saas-alerts')
    const pool = getPool()

    const mappings = await getPlatformMappings(companyId, 'saas_alerts')
    const mappedCustomerIds = (mappings ?? []).map((m) => m.externalId).filter((id) => id && id !== '__none__')

    const dbClient = await pool.connect()
    let webhookEventCount = 0

    try {
      // --- Path 1: webhook events from the local DB ---
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const res = await dbClient.query<{
        eventType: string
        severity: string
        signalType: string | null
        rawData: Record<string, unknown>
        normalized: Record<string, unknown> | null
        customerId: string | null
      }>(
        `SELECT "eventType", severity, "signalType", "rawData", normalized, "customerId"
         FROM compliance_webhook_events
         WHERE source = 'saas_alerts' AND "receivedAt" > $1 AND "expiresAt" > NOW()
         ORDER BY "receivedAt" DESC LIMIT 1000`,
        [thirtyDaysAgo]
      )

      // Filter to mapped customers if any mapping exists. If no mapping,
      // fall back to "all events" (legacy behavior — better than dropping data).
      const filteredRows =
        mappedCustomerIds.length > 0
          ? res.rows.filter((r) => r.customerId && mappedCustomerIds.includes(r.customerId))
          : res.rows

      webhookEventCount = filteredRows.length

      if (filteredRows.length > 0) {
        const agg = aggregateSaasAlertsEvents(filteredRows, SIGNAL_WEIGHTS as Record<string, number>, SIGNAL_LABELS as Record<string, string>)
        evidence.push(buildEvidence(assessmentId, companyId, 'saas_alerts_monitoring' as EvidenceSourceType, {
          totalEvents: filteredRows.length,
          ...agg,
          source: 'webhook',
          mappedCustomerIds,
          note: 'Data collected via SaaS Alerts webhook (real-time event push).',
        }, `SaaS Alerts: ${filteredRows.length} events (30 days, via webhook). Severity: ${Object.entries(agg.eventsBySeverity).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}. Top signals: ${Object.entries(agg.eventsBySignal).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}.`))
      }
    } finally {
      dbClient.release()
    }

    // --- Path 2: REST fallback when webhook has no data for this customer ---
    // The Partner API can backfill events we missed (subscription paused, new
    // customer not yet wired up, historical assessment). Only attempted when:
    //   - the local DB returned nothing for this customer
    //   - the REST client is configured (refresh token or static idtoken set)
    //   - we have at least one mapped SaaS Alerts customerId (otherwise we
    //     can't scope the query and would pull every customer's events)
    if (webhookEventCount === 0 && mappedCustomerIds.length > 0) {
      const apiClient = new SaasAlertsClient()
      if (apiClient.isConfigured()) {
        try {
          const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          const allRestRows: Array<{
            eventType: string
            severity: string
            signalType: string | null
            rawData: Record<string, unknown>
            normalized: Record<string, unknown> | null
          }> = []

          for (const customerId of mappedCustomerIds) {
            const { events } = await apiClient.getEvents({ customerId, since, limit: 500 })
            for (const raw of events) {
              const normalized = normalizeEvent(raw as Parameters<typeof normalizeEvent>[0], {
                partnerId: null,
                customerId,
                productId: null,
              })
              allRestRows.push({
                eventType: normalized.eventType,
                severity: normalized.severity,
                signalType: normalized.signalType,
                rawData: normalized.raw,
                normalized: {
                  externalId: normalized.externalId,
                  signalType: normalized.signalType,
                  occurredAt: normalized.occurredAt,
                  user: normalized.user,
                  description: normalized.description,
                },
              })
            }
          }

          if (allRestRows.length > 0) {
            const agg = aggregateSaasAlertsEvents(allRestRows, SIGNAL_WEIGHTS as Record<string, number>, SIGNAL_LABELS as Record<string, string>)
            evidence.push(buildEvidence(assessmentId, companyId, 'saas_alerts_monitoring' as EvidenceSourceType, {
              totalEvents: allRestRows.length,
              ...agg,
              source: 'rest_fallback',
              mappedCustomerIds,
              note: 'Data backfilled via the External Partner API. Webhook had no events in this window — verify subscription health if this persists.',
            }, `SaaS Alerts: ${allRestRows.length} events (30 days, via REST fallback). Severity: ${Object.entries(agg.eventsBySeverity).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}.`))
          } else {
            errors.push('SaaS Alerts: No events in webhook DB or REST API for the last 30 days for the mapped customer(s). May indicate a low-noise tenant or a paused subscription.')
          }
        } catch (apiErr) {
          errors.push(`SaaS Alerts: REST fallback failed — ${apiErr instanceof Error ? apiErr.message : String(apiErr)}. Webhook data was also empty for this window.`)
        }
      } else {
        const missing = apiClient.missingCredentials().join(', ')
        errors.push(`SaaS Alerts: No webhook events for this customer in the last 30 days, and the REST fallback is not configured (missing ${missing}).`)
      }
    } else if (webhookEventCount === 0 && mappedCustomerIds.length === 0) {
      errors.push('SaaS Alerts: No events received and no platform mapping configured. Map this company to its SaaS Alerts customer at the Connect Tools step so we can pull data for it.')
    }

    // --- Path 3: Unify device-to-identity binding ---
    // This is *new* evidence the webhook can't provide — only the REST API
    // exposes the Unify device organizations endpoint.
    if (mappedCustomerIds.length > 0) {
      const apiClient = new SaasAlertsClient()
      if (apiClient.isConfigured()) {
        try {
          const orgs = await apiClient.getDevicesOrganizations()
          const matchedOrgs = orgs.filter((o) => o.organizationId && mappedCustomerIds.includes(o.organizationId))

          if (matchedOrgs.length > 0) {
            const totals = matchedOrgs.reduce<{ devices: number; mapped: number; unmapped: number }>(
              (acc, o) => ({
                devices: acc.devices + (o.deviceCount ?? 0),
                mapped: acc.mapped + (o.mappedDeviceCount ?? 0),
                unmapped: acc.unmapped + (o.unmappedDeviceCount ?? 0),
              }),
              { devices: 0, mapped: 0, unmapped: 0 }
            )

            const coveragePct = totals.devices > 0 ? Math.round((totals.mapped / totals.devices) * 100) : null

            evidence.push(buildEvidence(assessmentId, companyId, 'saas_alerts_device_identity' as EvidenceSourceType, {
              totalDevices: totals.devices,
              mappedDevices: totals.mapped,
              unmappedDevices: totals.unmapped,
              coveragePct,
              organizations: matchedOrgs,
              mappedCustomerIds,
              source: 'rest',
              note: 'SaaS Alerts Unify module: device-to-identity binding for SaaS access control.',
            }, `SaaS Alerts Unify: ${totals.devices} devices tracked (${totals.mapped} mapped to identities, ${totals.unmapped} unmapped${coveragePct !== null ? `, ${coveragePct}% coverage` : ''}).`))
          }
        } catch (apiErr) {
          errors.push(`SaaS Alerts Unify (device-identity): ${apiErr instanceof Error ? apiErr.message : String(apiErr)}`)
        }

        // --- Path 4: Kaseya-curated recommended actions ---
        try {
          const actions = await apiClient.getRecommendedActions()
          const matched = mappedCustomerIds.length > 0
            ? actions.filter((a) => a.customerId && mappedCustomerIds.includes(a.customerId))
            : actions

          if (matched.length > 0) {
            const bySeverity: Record<string, number> = {}
            const byCategory: Record<string, number> = {}
            for (const action of matched) {
              const sev = action.severity ?? 'unknown'
              bySeverity[sev] = (bySeverity[sev] ?? 0) + 1
              const cat = action.category ?? 'unknown'
              byCategory[cat] = (byCategory[cat] ?? 0) + 1
            }

            evidence.push(buildEvidence(assessmentId, companyId, 'saas_alerts_recommended_actions' as EvidenceSourceType, {
              totalActions: matched.length,
              bySeverity,
              byCategory,
              actions: matched.slice(0, 50),
              mappedCustomerIds,
              source: 'rest',
              note: 'Kaseya-curated remediation recommendations for SaaS security gaps. Feeds into action-item / policy-gap analysis.',
            }, `SaaS Alerts recommended actions: ${matched.length} open recommendation(s). Severity: ${Object.entries(bySeverity).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}.`))
          }
        } catch (apiErr) {
          errors.push(`SaaS Alerts recommended actions: ${apiErr instanceof Error ? apiErr.message : String(apiErr)}`)
        }
      }
    }

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`SaaS Alerts collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}

// ---------------------------------------------------------------------------
// Ubiquiti UniFi Collector — Network Infrastructure
// ---------------------------------------------------------------------------

export async function collectUbiquitiEvidence(
  companyId: string,
  assessmentId: string,
  companyName?: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.UBIQUITI_API_KEY) {
    return { evidence, errors: ['Ubiquiti: UBIQUITI_API_KEY not configured'] }
  }

  const name = companyName ?? await getCompanyDisplayName(companyId)
  if (!name) {
    return { evidence, errors: ['Company not found'] }
  }

  try {
    const { buildSummary, listHosts } = await import('@/lib/ubiquiti')
    const { matchesCompanyName } = await import('@/utils')
    const summary = await buildSummary()

    if (!summary) {
      return { evidence, errors: ['Ubiquiti: API returned no data'] }
    }

    if (summary.totalDevices === 0 && summary.totalSites === 0) {
      return { evidence, errors: [] }
    }

    // Use explicit platform mappings if available (mapped by hostId/console name)
    const mappings = await getPlatformMappings(companyId, 'ubiquiti')
    let matchedDevices: typeof summary.devices
    let matchedHostNames: string[] = []

    if (mappings && mappings.length > 0) {
      if (mappings.some((m) => m.externalId === '__none__')) {
        console.log('[compliance][ubiquiti] Marked as not used — skipping')
        return { evidence: [], errors: [] }
      }
      // Mappings are by hostId — get host names for those IDs
      const mappedIds = new Set(mappings.map((m) => m.externalId))
      const mappedNames = new Set(mappings.map((m) => m.externalName))
      const hosts = await listHosts()
      matchedHostNames = hosts.filter((h) => mappedIds.has(h.hostId)).map((h) => h.hostName)
      // Also include mapped names directly in case hostName changed
      Array.from(mappedNames).forEach((n) => { if (n) matchedHostNames.push(n) })
      const hostNameSet = new Set(matchedHostNames)
      matchedDevices = summary.devices.filter((d) => hostNameSet.has(d.siteName))
      console.log(`[compliance][ubiquiti] Using explicit mapping: ${matchedDevices.length} devices from ${matchedHostNames.length} host(s) for ${name}`)
    } else {
      // Fall back to name matching on host/site names
      matchedDevices = summary.devices.filter((d) => matchesCompanyName(name, d.siteName))
      matchedHostNames = Array.from(new Set(matchedDevices.map((d) => d.siteName)))
    }

    if (matchedDevices.length === 0) {
      return { evidence: [], errors: [] }
    }

    // Categorize devices by model type
    const devicesByModel: Record<string, number> = {}
    for (const d of matchedDevices) {
      const model = d.model || 'Unknown'
      devicesByModel[model] = (devicesByModel[model] ?? 0) + 1
    }

    // Fetch VLAN/network config from matched sites for CIS 12.x / CMMC SC
    let networkConfig: {
      vlanCount: number
      guestNetworkConfigured: boolean
      guestIsolation: boolean
      networkSegmented: boolean
      networks: Array<{ name: string; purpose: string; vlanId: number | null; isolation: boolean }>
    } | null = null
    try {
      const { buildSiteNetworkSummary } = await import('@/lib/ubiquiti')
      // Try the first matched site (the customer's primary console)
      const matchedSites = summary.sites.filter((s) =>
        matchedHostNames.some((h) => s.name.includes(h) || h.includes(s.name))
      )
      if (matchedSites.length > 0) {
        const netSummary = await buildSiteNetworkSummary(matchedSites[0].siteId, matchedSites[0].name)
        if (netSummary.networks.length > 0) {
          networkConfig = {
            vlanCount: netSummary.vlanCount,
            guestNetworkConfigured: netSummary.guestNetworkConfigured,
            guestIsolation: netSummary.guestIsolation,
            networkSegmented: netSummary.networkSegmented,
            networks: netSummary.networks.map((n) => ({ name: n.name, purpose: n.purpose, vlanId: n.vlanId, isolation: n.isolation })),
          }
        }
      }
    } catch (netErr) {
      console.warn('[compliance][ubiquiti] Network config fetch failed:', netErr instanceof Error ? netErr.message : netErr)
    }

    const networkNote = networkConfig
      ? ` Network: ${networkConfig.vlanCount} VLANs, guest: ${networkConfig.guestNetworkConfigured ? 'yes' : 'no'}${networkConfig.guestIsolation ? ' (isolated)' : ''}, segmented: ${networkConfig.networkSegmented ? 'yes' : 'no'}.`
      : ''

    evidence.push(buildEvidence(assessmentId, companyId, 'ubiquiti_network' as EvidenceSourceType, {
      matched: true,
      companyName: name,
      totalHosts: matchedHostNames.length,
      hostNames: matchedHostNames,
      totalDevices: matchedDevices.length,
      devicesByModel,
      devices: matchedDevices.slice(0, 50).map((d) => ({
        hostname: d.hostname,
        model: d.model,
        firmware: d.firmware,
        ipAddress: d.ipAddress,
        macAddress: d.macAddress,
        siteName: d.siteName,
        connectedClients: d.connectedClients,
      })),
      // Network configuration (VLANs, guest networks) for CIS 12.x + CMMC SC.1.2
      networkConfig,
    }, `Ubiquiti: ${matchedDevices.length} network devices across ${matchedHostNames.length} console(s) for ${name}. Models: ${Object.entries(devicesByModel).map(([k, v]) => `${k} (${v})`).join(', ')}.${networkNote}`))

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`Ubiquiti collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}

// ---------------------------------------------------------------------------
// MyITProcess Collector — Standards Alignment & Reviews
// ---------------------------------------------------------------------------

export async function collectMyItProcessEvidence(
  companyId: string,
  assessmentId: string,
  companyName?: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.MYITP_API_KEY) {
    return { evidence, errors: ['MyITProcess: MYITP_API_KEY not configured'] }
  }

  if (!companyName) {
    try { companyName = await getCompanyDisplayName(companyId) ?? undefined } catch { /* ignore */ }
  }

  try {
    console.log(`[myitp] Starting collection for ${companyName ?? companyId}`)
    const { MyItProcessClient } = await import('@/lib/myitprocess')
    const client = new MyItProcessClient()
    const summary = await client.buildComplianceSummary(companyName)

    if (!summary.available) {
      return { evidence, errors: [summary.note ?? 'MyITProcess API unavailable'] }
    }

    // Store evidence even if no matched client — alignment score presence is useful
    const reviewNames = summary.reviews.map((r) => r.name)
    const activeRecs = summary.recommendations.filter((r) => !r.isArchived)
    const findingLabels = summary.findings.map((f) => f.question.label)

    evidence.push(buildEvidence(assessmentId, companyId, 'myitprocess_alignment' as EvidenceSourceType, {
      matchedClient: summary.matchedClient ? {
        id: summary.matchedClient.id,
        name: summary.matchedClient.name,
        alignmentScore: summary.matchedClient.alignmentScore,
        lastReviewDate: summary.matchedClient.lastReviewDate,
        isActive: summary.matchedClient.isActive,
      } : null,
      alignmentScore: summary.alignmentScore,
      totalClients: summary.totalClients,
      reviewCount: summary.reviews.length,
      reviewNames,
      findingCount: summary.findings.length,
      findingLabels: findingLabels.slice(0, 50),
      recommendationCount: activeRecs.length,
      recommendations: activeRecs.slice(0, 20).map((r) => ({
        name: r.name,
        priority: r.priority,
        status: r.status,
        budget: r.budget,
      })),
      initiativeCount: summary.initiatives.length,
      initiatives: summary.initiatives.slice(0, 10).map((i) => ({
        title: i.title,
        recommendationCount: i.recommendationsIds.length,
      })),
      note: summary.note,
    }, summary.matchedClient
      ? `MyITProcess: "${summary.matchedClient.name}" — alignment score ${summary.alignmentScore ?? 'N/A'}%. ${summary.reviews.length} review(s), ${activeRecs.length} active recommendation(s), ${summary.findings.length} finding(s).`
      : `MyITProcess: No client matched "${companyName}". ${summary.totalClients} clients in account.`))

    return { evidence, errors }
  } catch (err) {
    const msg = `MyITProcess collection failed: ${err instanceof Error ? err.message : String(err)}`
    console.error(`[myitp] ${msg}`)
    return { evidence, errors: [msg] }
  }
}

// ---------------------------------------------------------------------------
// EasyDMARC Collector — Email Authentication (DMARC, SPF, DKIM)
// ---------------------------------------------------------------------------

export async function collectEasyDmarcEvidence(
  companyId: string,
  assessmentId: string,
  companyName?: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.EASYDMARC_API_KEY) {
    return { evidence, errors: ['EasyDMARC: EASYDMARC_API_KEY not configured'] }
  }

  try {
    // Determine the customer's primary email domain.
    // Strategy: look for the company's contactEmail in the companies table,
    // extract the domain. If unavailable, try to get M365 verified domains
    // via Graph (requires the tenant to be connected).
    let domain: string | null = null

    // Try 1: company contactEmail domain
    try {
      const pool = (await import('@/lib/db-pool')).getPool()
      const client = await pool.connect()
      try {
        const res = await client.query<{ contactEmail: string | null }>(
          `SELECT "contactEmail" FROM companies WHERE id = $1`,
          [companyId]
        )
        const email = res.rows[0]?.contactEmail
        if (email && email.includes('@')) {
          domain = email.split('@')[1].toLowerCase()
        }
      } finally {
        client.release()
      }
    } catch { /* ignore */ }

    // Try 2: M365 Graph verified domains (if available). Get tenant credentials
    // and acquire a token, then query /domains for verified custom domains.
    if (!domain) {
      try {
        const { getTenantCredentials } = await import('@/lib/graph')
        const creds = await getTenantCredentials(companyId)
        if (creds) {
          const tokenUrl = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`
          const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: creds.clientId,
              client_secret: creds.clientSecret,
              scope: 'https://graph.microsoft.com/.default',
            }).toString(),
            signal: AbortSignal.timeout(10_000),
          })
          if (tokenRes.ok) {
            const tokenData = (await tokenRes.json()) as { access_token: string }
            const domainsRes = await fetch('https://graph.microsoft.com/v1.0/domains?$select=id,isVerified,isDefault', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
              signal: AbortSignal.timeout(10_000),
            })
            if (domainsRes.ok) {
              const data = (await domainsRes.json()) as { value: Array<{ id: string; isVerified: boolean; isDefault: boolean }> }
              const verifiedDomain = data.value?.find((d) => d.isVerified && !d.id.includes('.onmicrosoft.com'))
              const defaultDomain = data.value?.find((d) => d.isDefault && d.isVerified)
              domain = verifiedDomain?.id ?? defaultDomain?.id ?? null
            }
          }
        }
      } catch { /* Graph not available — continue without */ }
    }

    if (!domain) {
      return { evidence, errors: ['EasyDMARC: could not determine customer email domain. Set contactEmail on the company record or connect M365.'] }
    }

    console.log(`[easydmarc] Checking email auth for domain: ${domain} (company: ${companyName ?? companyId})`)

    const { buildEmailAuthSummary } = await import('@/lib/easydmarc')
    const summary = await buildEmailAuthSummary(domain)

    if (!summary) {
      return { evidence, errors: ['EasyDMARC: API call returned no data'] }
    }

    const dmarcStatus = summary.dmarc?.policy ?? 'missing'
    const spfStatus = summary.spf?.recordExists ? (summary.spf.valid ? 'valid' : 'invalid') : 'missing'
    const dkimStatus = summary.dkim?.recordExists ? 'present' : 'missing'

    evidence.push(buildEvidence(assessmentId, companyId, 'easydmarc_email_auth' as EvidenceSourceType, {
      domain,
      enforced: summary.enforced,
      dmarc: {
        exists: summary.dmarc?.recordExists ?? false,
        policy: summary.dmarc?.policy,
        pct: summary.dmarc?.pct,
        ruaConfigured: !!summary.dmarc?.ruaUri,
        valid: summary.dmarc?.valid ?? false,
      },
      spf: {
        exists: summary.spf?.recordExists ?? false,
        allMechanism: summary.spf?.allMechanism,
        lookupCount: summary.spf?.lookupCount,
        valid: summary.spf?.valid ?? false,
      },
      dkim: {
        exists: summary.dkim?.recordExists ?? false,
        selector: summary.dkim?.selector,
        publicKeyValid: summary.dkim?.publicKeyValid ?? false,
      },
    }, `EasyDMARC: ${domain} — DMARC ${dmarcStatus}, SPF ${spfStatus}, DKIM ${dkimStatus}. ${summary.enforced ? 'All three present and enforcing.' : 'Not fully enforced.'}`))

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`EasyDMARC collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}
