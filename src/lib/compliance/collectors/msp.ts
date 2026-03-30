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
    return { evidence, errors: ['DNSFilter API token not configured'] }
  }

  try {
    const { DnsFilterClient } = await import('@/lib/dnsfilter')
    const client = new DnsFilterClient()

    // Try 7-day window first (more likely to have data than 30 days on some API configs)
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    let summary = await client.buildSummary(sevenDaysAgo, now)
    let periodDays = 7

    // If 7-day returns zero, try 30-day
    if (summary.totalQueries === 0) {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      summary = await client.buildSummary(thirtyDaysAgo, now)
      periodDays = 30
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
