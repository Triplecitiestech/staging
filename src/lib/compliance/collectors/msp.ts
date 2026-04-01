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

    evidence.push(buildEvidence(assessmentId, companyId, 'datto_rmm_devices', {
      matched: true,
      companyName,
      matchedSites: matchedSites.map((s) => ({ name: s.name, uid: s.uid, devicesCount: s.devicesCount })),
      totalDevices: allDevices.length,
      onlineDevices: onlineDevices.length,
      patchedDevices: patchedDevices.length,
      patchRate: allDevices.length > 0 ? Math.round((patchedDevices.length / allDevices.length) * 100) : 0,
      devices: allDevices.slice(0, 50), // cap at 50 for storage
    }, `${allDevices.length} devices across ${matchedSites.length} site(s). ${patchedDevices.length} fully patched (${allDevices.length > 0 ? Math.round((patchedDevices.length / allDevices.length) * 100) : 0}% patch rate).`))

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
    console.log('[dnsfilter] Starting collection')
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
    const msg = `DNSFilter collection failed: ${err instanceof Error ? err.message : String(err)}`
    console.error(`[dnsfilter] ${msg}`)
    return { evidence, errors: [msg] }
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

    // Use explicit platform mappings if available, fall back to name matching
    let matchedAgents = summary.agents
    const matchedDevices = summary.devices
    let matchNote = ''

    const mappings = await getPlatformMappings(companyId, 'domotz')
    if (mappings && mappings.length > 0) {
      if (mappings.some((m) => m.externalId === '__none__')) {
        console.log('[compliance][domotz] Marked as not used — skipping')
        return { evidence: [], errors: [] }
      }
      const mappedIds = new Set(mappings.map((m) => m.externalId))
      matchedAgents = summary.agents.filter((a) => mappedIds.has(String(a.id)))
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
        matchNote = `Matched ${agentMatches.length} agent(s): ${agentMatches.map((a) => a.name).join(', ')}`
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

    // Only store evidence if there's actual data (customers or events)
    if (summary.customers.length === 0 && summary.totalEvents === 0) {
      errors.push('SaaS Alerts API connected but returned 0 customers and 0 events. Verify the API key has proper permissions and customers are onboarded in manage.saasalerts.com.')
      return { evidence, errors }
    }

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
    }, `Ubiquiti: ${matchedDevices.length} network devices across ${matchedHostNames.length} console(s) for ${name}. Models: ${Object.entries(devicesByModel).map(([k, v]) => `${k} (${v})`).join(', ')}.`))

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
