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

    // Find sites matching this company
    const matchedSites = sites.filter((s) => matchesCompanyName(companyName, s.name))

    if (matchedSites.length === 0) {
      // No match — don't store evidence. The evaluator will report not_assessed.
      return { evidence: [], errors: [] }
    }

    // Collect devices from matched sites
    const allDevices: Array<Record<string, unknown>> = []
    for (const site of matchedSites.slice(0, 3)) { // limit to 3 sites
      try {
        const devices = await client.getSiteDevices(site.uid)
        for (const d of devices) {
          allDevices.push({
            hostname: d.hostname,
            operatingSystem: d.operatingSystem,
            deviceType: d.deviceType,
            patchStatus: d.patchStatus,
            patchesApprovedPending: d.patchesApprovedPending,
            antivirusProduct: d.antivirusProduct,
            antivirusStatus: d.antivirusStatus,
            lastSeen: d.lastSeen,
            online: d.online,
            rebootRequired: d.rebootRequired,
          })
        }
      } catch (err) {
        errors.push(`RMM site ${site.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const onlineDevices = allDevices.filter((d) => d.online)
    const patchedDevices = allDevices.filter((d) => d.patchesApprovedPending === 0)
    const avActive = allDevices.filter((d) => d.antivirusStatus === 'On')

    evidence.push(buildEvidence(assessmentId, companyId, 'datto_rmm_devices', {
      matched: true,
      companyName,
      matchedSites: matchedSites.map((s) => ({ name: s.name, uid: s.uid, devicesCount: s.devicesCount })),
      totalDevices: allDevices.length,
      onlineDevices: onlineDevices.length,
      patchedDevices: patchedDevices.length,
      patchRate: allDevices.length > 0 ? Math.round((patchedDevices.length / allDevices.length) * 100) : 0,
      avActiveDevices: avActive.length,
      avRate: allDevices.length > 0 ? Math.round((avActive.length / allDevices.length) * 100) : 0,
      devices: allDevices.slice(0, 50), // cap at 50 for storage
    }, `${allDevices.length} devices across ${matchedSites.length} site(s). ${patchedDevices.length} fully patched, ${avActive.length} AV active.`))

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
    const summary = await client.buildSummary(companyName)

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
    // If no match, don't store evidence — the evaluator will use noEvidence()
    // which correctly reports "not_assessed" or "needs_review" based on connector state

    // SaaS Protect uses same credentials
    try {
      const { DattoSaasClient } = await import('@/lib/datto-saas')
      const saasClient = new DattoSaasClient()
      const saasSummary = await saasClient.buildSummary(companyName)

      const hasSaas = saasSummary.totalCustomers > 0

      // Only store SaaS evidence if there's an actual customer match
      if (hasSaas) {
        evidence.push(buildEvidence(assessmentId, companyId, 'datto_saas_backup', {
          matched: true,
          companyName,
          totalCustomers: saasSummary.totalCustomers,
          totalSeats: saasSummary.totalSeats,
          activeSeats: saasSummary.activeSeats,
          pausedSeats: saasSummary.pausedSeats,
          unprotectedSeats: saasSummary.unprotectedSeats,
          note: saasSummary.note ?? null,
        }, `${saasSummary.totalSeats} SaaS backup seats. ${saasSummary.activeSeats} active, ${saasSummary.unprotectedSeats} unprotected.`))
      }
    } catch (err) {
      errors.push(`Datto SaaS Protect: ${err instanceof Error ? err.message : String(err)}`)
    }

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`Datto BCDR collection failed: ${err instanceof Error ? err.message : String(err)}`] }
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

  if (!process.env.DNSFILTER_API_TOKEN) {
    return { evidence, errors: ['DNSFilter: DNSFILTER_API_TOKEN not configured'] }
  }

  try {
    const { DnsFilterClient } = await import('@/lib/dnsfilter')
    const client = new DnsFilterClient()

    // Try 7-day window first (more likely to have data than 30 days on some API configs)
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    let summary: Awaited<ReturnType<typeof client.buildSummary>>
    let periodDays = 7

    try {
      summary = await client.buildSummary(sevenDaysAgo, now)
    } catch (err) {
      console.error('[compliance][dnsfilter] 7-day buildSummary failed:', err instanceof Error ? err.message : String(err))
      // Try 30-day as fallback
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      summary = await client.buildSummary(thirtyDaysAgo, now)
      periodDays = 30
    }

    // If 7-day returned zero, try 30-day
    if (summary.totalQueries === 0 && periodDays === 7) {
      try {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        const summary30 = await client.buildSummary(thirtyDaysAgo, now)
        if (summary30.totalQueries > 0) {
          summary = summary30
          periodDays = 30
        }
      } catch {
        // Keep the 7-day result
      }
    }

    // Only store evidence if we got actual query data
    if (summary.totalQueries > 0 || summary.blockedQueries > 0) {
      evidence.push(buildEvidence(assessmentId, companyId, 'dnsfilter_dns', {
        totalQueries: summary.totalQueries,
        blockedQueries: summary.blockedQueries,
        blockRate: summary.totalQueries > 0 ? Math.round((summary.blockedQueries / summary.totalQueries) * 100) : 0,
        threatsByCategory: summary.threatsByCategory,
        topBlockedDomains: (summary.topBlockedDomains ?? []).slice(0, 10),
        monthlyTrends: summary.monthlyTrends,
        periodDays,
        note: 'DNSFilter data is MSP-level (covers all customers).',
      }, `DNS: ${summary.totalQueries.toLocaleString()} queries, ${summary.blockedQueries.toLocaleString()} blocked (${periodDays}-day period). MSP-level data.`))
    } else {
      // 0 queries across both windows — the API may not be returning data for this endpoint format
      errors.push('DNSFilter returned 0 queries for both 7-day and 30-day windows. API endpoint may need configuration.')
    }

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

    // Try to match agents to this specific customer by name
    // Domotz agents are usually named per-customer/site (e.g. "EZ Red - Main Office")
    let matchedAgents = summary.agents
    const matchedDevices = summary.devices
    let matchNote = ''

    if (companyName) {
      const normalizedName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '')
      const nameWords = companyName.toLowerCase().split(/\s+/).filter((w) => w.length >= 2)

      const agentMatches = summary.agents.filter((a) => {
        const agentNorm = a.name.toLowerCase()
        const agentStripped = agentNorm.replace(/[^a-z0-9]/g, '')
        // Exact substring
        if (agentNorm.includes(companyName.toLowerCase())) return true
        // Stripped comparison
        if (agentStripped.includes(normalizedName) || normalizedName.includes(agentStripped)) return true
        // All significant words present
        if (nameWords.length >= 1 && nameWords.every((w) => agentNorm.includes(w))) return true
        return false
      })

      if (agentMatches.length > 0) {
        matchedAgents = agentMatches
        matchNote = `Matched ${agentMatches.length} agent(s): ${agentMatches.map((a) => a.name).join(', ')}`
        // buildSummary() already fetched devices per agent, but they're combined.
        // Use agent device counts for the matched total; devices array stays MSP-wide
        // (we don't have agent ID on each device to filter without re-fetching).
        const matchedDeviceCount = agentMatches.reduce((sum, a) => sum + a.deviceCount, 0)
        matchNote += `. ~${matchedDeviceCount} devices from matched agents.`
      } else {
        matchNote = `No agent matched "${companyName}". All ${summary.agents.length} agents: ${summary.agents.map((a) => a.name).join(', ')}. Showing MSP-wide data.`
        console.log(`[domotz] ${matchNote}`)
      }
    }

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

    evidence.push(buildEvidence(assessmentId, companyId, 'domotz_network_discovery' as EvidenceSourceType, {
      totalDevices: matchedDevices.length,
      uniqueMacAddresses: uniqueMacs.size,
      uniqueIpAddresses: uniqueIps.size,
      discoveryActive: summary.discoveryActive,
      agentCount: matchedAgents.length,
      agents: matchedAgents,
      deviceTypes,
      matchNote,
      mspWideTotalDevices: summary.totalDevices,
      mspWideTotalAgents: summary.agents.length,
      deviceSample: matchedDevices.slice(0, 50).map((d) => ({
        displayName: d.display_name,
        ipAddresses: d.ip_addresses,
        macAddress: d.hw_address,
        type: d.type?.label,
        vendor: d.vendor,
        importance: d.importance,
        firstSeen: d.first_seen_on,
      })),
    }, matchNote
      ? `Domotz: ${matchedDevices.length} devices (${uniqueMacs.size} unique MACs) from ${matchedAgents.length} agent(s). ${matchNote}. Discovery ${summary.discoveryActive ? 'active' : 'inactive'}.`
      : `Domotz: ${matchedDevices.length} devices discovered (${uniqueMacs.size} unique MACs, ${uniqueIps.size} unique IPs) across ${matchedAgents.length} collector(s). Discovery ${summary.discoveryActive ? 'active' : 'inactive'}.`))

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
    const summary = await client.buildSummary(companyName)

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

export async function collectSaasAlertsEvidence(
  companyId: string,
  assessmentId: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.SAAS_ALERTS_API_KEY) {
    return { evidence, errors: ['SaaS Alerts: SAAS_ALERTS_API_KEY not configured'] }
  }

  try {
    const { SaasAlertsClient } = await import('@/lib/saas-alerts')
    const client = new SaasAlertsClient()
    const summary = await client.buildSummary()

    if (!summary.available) {
      return { evidence, errors: [summary.note ?? 'SaaS Alerts API unavailable'] }
    }

    // Store evidence even if 0 events — having the connection working is itself evidence
    evidence.push(buildEvidence(assessmentId, companyId, 'saas_alerts_monitoring' as EvidenceSourceType, {
      totalEvents: summary.totalEvents,
      eventsBySeverity: summary.eventsBySeverity,
      eventsByType: summary.eventsByType,
      customerCount: summary.customers.length,
      customers: summary.customers.slice(0, 20),
      recentHighSeverity: summary.recentEvents
        .filter((e) => e.alertStatus === 'high' || e.alertStatus === 'critical')
        .slice(0, 10)
        .map((e) => ({
          time: e.time,
          user: e.user?.name,
          type: e.jointType,
          description: e.jointDesc,
          severity: e.alertStatus,
          ip: e.ip,
        })),
      note: summary.note,
    }, `SaaS Alerts: ${summary.totalEvents} events (30 days). ${summary.customers.length} monitored tenants. Severity breakdown: ${Object.entries(summary.eventsBySeverity).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}.`))

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
  assessmentId: string
): Promise<{ evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>; errors: string[] }> {
  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  if (!process.env.UBIQUITI_API_KEY) {
    return { evidence, errors: ['Ubiquiti: UBIQUITI_API_KEY not configured'] }
  }

  try {
    const { buildSummary } = await import('@/lib/ubiquiti')
    const summary = await buildSummary()

    if (!summary) {
      return { evidence, errors: ['Ubiquiti: API returned no data'] }
    }

    if (summary.totalDevices === 0 && summary.totalSites === 0) {
      return { evidence, errors: [] }
    }

    // Categorize devices by model type
    const devicesByModel: Record<string, number> = {}
    for (const d of summary.devices) {
      const model = d.model || 'Unknown'
      devicesByModel[model] = (devicesByModel[model] ?? 0) + 1
    }

    // Calculate uptime health (devices with >24h uptime are healthy)
    const healthyDevices = summary.devices.filter((d) => d.uptime > 86400).length

    evidence.push(buildEvidence(assessmentId, companyId, 'ubiquiti_network' as EvidenceSourceType, {
      totalSites: summary.totalSites,
      totalDevices: summary.totalDevices,
      totalClients: summary.totalClients,
      healthyDevices,
      devicesByModel,
      sites: summary.sites.map((s) => ({
        name: s.name,
        totalDevices: s.totalDevices,
        adoptedDevices: s.adoptedDevices,
        satisfaction: s.satisfaction,
      })),
      devices: summary.devices.slice(0, 100).map((d) => ({
        hostname: d.hostname,
        model: d.model,
        firmware: d.firmware,
        ipAddress: d.ipAddress,
        macAddress: d.macAddress,
        uptimeHours: Math.round(d.uptime / 3600),
        siteName: d.siteName,
        connectedClients: d.connectedClients,
      })),
    }, `Ubiquiti: ${summary.totalDevices} network devices across ${summary.totalSites} site(s). ${summary.totalClients} connected clients. Models: ${Object.entries(devicesByModel).map(([k, v]) => `${k} (${v})`).join(', ')}.`))

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`Ubiquiti collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}
