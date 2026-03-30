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
      return {
        evidence: [buildEvidence(assessmentId, companyId, 'datto_rmm_devices', {
          matched: false,
          companyName,
          totalSites: sites.length,
          note: `No Datto RMM site matched company name "${companyName}"`,
        }, `No RMM site matched "${companyName}" out of ${sites.length} sites`)],
        errors: [],
      }
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

    evidence.push(buildEvidence(assessmentId, companyId, 'datto_bcdr_backup', {
      matched: hasDevices,
      companyName,
      applianceCount: summary.applianceCount,
      endpointBackupCount: summary.endpointBackupCount,
      cloudDeviceCount: summary.cloudDeviceCount,
      totalAlerts: summary.totalAlerts,
      totalDevices: summary.totalDevices,
      deviceDetails: (summary.deviceDetails ?? []).slice(0, 20),
      note: summary.note ?? null,
    }, hasDevices
      ? `${(summary.deviceDetails ?? []).length} backup device(s). ${summary.totalAlerts} alerts.`
      : `No BCDR devices matched "${companyName}"`))

    // SaaS Protect uses same credentials
    try {
      const { DattoSaasClient } = await import('@/lib/datto-saas')
      const saasClient = new DattoSaasClient()
      const saasSummary = await saasClient.buildSummary(companyName)

      const hasSaas = saasSummary.totalCustomers > 0

      evidence.push(buildEvidence(assessmentId, companyId, 'datto_saas_backup', {
        matched: hasSaas,
        companyName,
        totalCustomers: saasSummary.totalCustomers,
        totalSeats: saasSummary.totalSeats,
        activeSeats: saasSummary.activeSeats,
        pausedSeats: saasSummary.pausedSeats,
        unprotectedSeats: saasSummary.unprotectedSeats,
        note: saasSummary.note ?? null,
      }, hasSaas
        ? `${saasSummary.totalSeats} SaaS backup seats. ${saasSummary.activeSeats} active, ${saasSummary.unprotectedSeats} unprotected.`
        : `No SaaS Protect customer matched "${companyName}"`))
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
    return { evidence, errors: ['DNSFilter API token not configured'] }
  }

  try {
    const { DnsFilterClient } = await import('@/lib/dnsfilter')
    const client = new DnsFilterClient()

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const summary = await client.buildSummary(thirtyDaysAgo, now)

    evidence.push(buildEvidence(assessmentId, companyId, 'dnsfilter_dns', {
      totalQueries: summary.totalQueries,
      blockedQueries: summary.blockedQueries,
      blockRate: summary.totalQueries > 0 ? Math.round((summary.blockedQueries / summary.totalQueries) * 100) : 0,
      threatsByCategory: summary.threatsByCategory,
      topBlockedDomains: (summary.topBlockedDomains ?? []).slice(0, 10),
      monthlyTrends: summary.monthlyTrends,
      periodDays: 30,
      note: 'DNSFilter data is MSP-level (covers all customers). Per-customer filtering requires DNSFilter org mapping.',
    }, `DNS: ${summary.totalQueries.toLocaleString()} queries, ${summary.blockedQueries.toLocaleString()} blocked (30 days). MSP-level data.`))

    return { evidence, errors }
  } catch (err) {
    return { evidence, errors: [`DNSFilter collection failed: ${err instanceof Error ? err.message : String(err)}`] }
  }
}
