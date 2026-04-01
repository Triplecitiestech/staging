/**
 * GET /api/compliance/debug-collectors?companyId=xxx
 *
 * Diagnostic endpoint that tests each collector individually
 * and returns the raw result. For debugging collection_failed errors.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  // Allow auth via session OR migration secret for PowerShell access
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.MIGRATION_SECRET) {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized. Add ?secret=MIGRATION_SECRET or use browser session.' }, { status: 401 })
    }
  }

  const collector = request.nextUrl.searchParams.get('collector') ?? 'domotz'
  const companyName = request.nextUrl.searchParams.get('companyName') ?? 'EZ Red'

  const results: Record<string, unknown> = { collector, companyName, timestamp: new Date().toISOString() }

  try {
    if (collector === 'domotz') {
      // Test Domotz API directly
      const apiKey = process.env.DOMOTZ_API_KEY
      const apiUrl = process.env.DOMOTZ_API_URL
      results.envConfigured = { hasApiKey: !!apiKey, hasApiUrl: !!apiUrl, apiUrl }

      if (!apiKey || !apiUrl) {
        return NextResponse.json({ ...results, error: 'DOMOTZ_API_KEY or DOMOTZ_API_URL not set' })
      }

      // Step 1: Fetch agents
      const agentsRes = await fetch(`${apiUrl}/agent`, {
        headers: { 'x-api-key': apiKey, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      const agentsStatus = agentsRes.status
      const agentsText = await agentsRes.text()
      results.agentsResponse = { status: agentsStatus, bodyLength: agentsText.length, body: agentsText.substring(0, 2000) }

      if (agentsRes.ok) {
        try {
          const agents = JSON.parse(agentsText)
          results.agentCount = Array.isArray(agents) ? agents.length : 'not-array'
          if (Array.isArray(agents) && agents.length > 0) {
            results.agentSample = agents.slice(0, 3).map((a: Record<string, unknown>) => ({
              id: a.id, display_name: a.display_name, status: a.status
            }))

            // Step 2: Fetch devices for first agent
            const firstAgent = agents[0] as { id: number; display_name: string }
            const devicesRes = await fetch(`${apiUrl}/agent/${firstAgent.id}/device`, {
              headers: { 'x-api-key': apiKey, 'Accept': 'application/json' },
              signal: AbortSignal.timeout(15_000),
            })
            const devicesText = await devicesRes.text()
            results.devicesResponse = {
              agentId: firstAgent.id,
              agentName: firstAgent.display_name,
              status: devicesRes.status,
              bodyLength: devicesText.length,
              body: devicesText.substring(0, 2000),
            }
            if (devicesRes.ok) {
              try {
                const devices = JSON.parse(devicesText)
                results.deviceCount = Array.isArray(devices) ? devices.length : 'not-array'
              } catch { results.deviceParseError = 'Failed to parse devices JSON' }
            }
          }
        } catch { results.agentParseError = 'Failed to parse agents JSON' }
      }
    } else if (collector === 'dnsfilter') {
      const apiToken = process.env.DNSFILTER_API_TOKEN
      const apiUrl = process.env.DNSFILTER_API_URL || 'https://api.dnsfilter.com/v1'
      results.envConfigured = { hasToken: !!apiToken, apiUrl }

      if (!apiToken) {
        return NextResponse.json({ ...results, error: 'DNSFILTER_API_TOKEN not set' })
      }

      const headers = { 'Authorization': `Token ${apiToken}`, 'Accept': 'application/json' }

      // Step 1: Get organizations to find org IDs
      const org2Res = await fetch(`${apiUrl}/organizations`, { headers, signal: AbortSignal.timeout(15_000) })
      const orgText = await org2Res.text()
      results.orgsStatus = org2Res.status

      let firstOrgId = ''
      try {
        const orgJson = JSON.parse(orgText)
        const orgs = Array.isArray(orgJson.data) ? orgJson.data : []
        results.orgCount = orgs.length
        results.orgSample = orgs.slice(0, 5).map((o: { id: string; attributes?: { name?: string } }) => ({
          id: o.id, name: o.attributes?.name
        }))
        if (orgs.length > 0) firstOrgId = orgs[0].id
      } catch { results.orgParseError = orgText.substring(0, 300) }

      // Step 2: Probe multiple traffic/stats endpoints with first org ID
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const dateOnly = weekAgo.toISOString().split('T')[0]
      const nowDateOnly = now.toISOString().split('T')[0]

      // Parse first network ID from the networks response
      let firstNetworkId = ''
      try {
        const netRes = await fetch(`${apiUrl}/networks`, { headers, signal: AbortSignal.timeout(10_000) })
        const netJson = JSON.parse(await netRes.text()) as { data?: Array<{ id: string; attributes?: { name?: string; organization_id?: number } }> }
        results.networkCount = netJson.data?.length ?? 0
        results.networkSample = (netJson.data ?? []).slice(0, 5).map((n) => ({
          id: n.id, name: n.attributes?.name, orgId: n.attributes?.organization_id
        }))
        if (netJson.data?.[0]) firstNetworkId = netJson.data[0].id
      } catch { /* continue */ }

      const testEndpoints = [
        // Network-scoped query endpoints (most likely to work)
        `/networks/${firstNetworkId}/filtering_reports/total_queries?start=${dateOnly}&end=${nowDateOnly}`,
        `/networks/${firstNetworkId}/filtering_reports?start=${dateOnly}&end=${nowDateOnly}`,
        `/networks/${firstNetworkId}/query_log_reports/total_queries?start=${dateOnly}&end=${nowDateOnly}`,
        `/networks/${firstNetworkId}/total_queries?start=${dateOnly}&end=${nowDateOnly}`,
        `/networks/${firstNetworkId}/stats?start=${dateOnly}&end=${nowDateOnly}`,
        // Org-scoped
        `/organizations/${firstOrgId}/filtering_reports/total_queries?start=${dateOnly}&end=${nowDateOnly}`,
        `/organizations/${firstOrgId}/filtering_reports?start=${dateOnly}&end=${nowDateOnly}`,
        // Global
        `/filtering_reports/total_queries?start=${dateOnly}&end=${nowDateOnly}`,
        `/filtering_reports?start=${dateOnly}&end=${nowDateOnly}`,
        `/query_log_reports?from=${weekAgo.toISOString()}&to=${now.toISOString()}`,
      ]

      const endpointTests: Array<{ path: string; status: number; body: string }> = []
      for (const path of testEndpoints) {
        try {
          const res = await fetch(`${apiUrl}${path}`, { headers, signal: AbortSignal.timeout(10_000) })
          const body = await res.text()
          endpointTests.push({ path, status: res.status, body: body.substring(0, 500) })
        } catch (err) {
          endpointTests.push({ path, status: 0, body: err instanceof Error ? err.message : String(err) })
        }
      }
      results.endpointTests = endpointTests
    } else if (collector === 'itglue') {
      const apiKey = process.env.IT_GLUE_API_KEY
      const apiUrl = process.env.IT_GLUE_API_URL || 'https://api.itglue.com'
      results.envConfigured = { hasApiKey: !!apiKey, apiUrl }

      if (!apiKey) {
        return NextResponse.json({ ...results, error: 'IT_GLUE_API_KEY not set' })
      }

      const orgRes = await fetch(`${apiUrl}/organizations?page[size]=10`, {
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/vnd.api+json', 'Accept': 'application/vnd.api+json' },
        signal: AbortSignal.timeout(15_000),
      })
      const orgText = await orgRes.text()
      results.orgsResponse = { status: orgRes.status, bodyLength: orgText.length, body: orgText.substring(0, 3000) }
    } else if (collector === 'ubiquiti') {
      const apiKey = process.env.UBIQUITI_API_KEY
      const apiUrl = process.env.UBIQUITI_API_URL || 'https://api.ui.com'
      results.envConfigured = { hasApiKey: !!apiKey, apiUrl }

      if (!apiKey) {
        return NextResponse.json({ ...results, error: 'UBIQUITI_API_KEY not set' })
      }

      // Test sites
      const sitesRes = await fetch(`${apiUrl}/ea/sites`, {
        headers: { 'x-api-key': apiKey, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      const sitesText = await sitesRes.text()
      results.sitesResponse = { status: sitesRes.status, bodyLength: sitesText.length, body: sitesText.substring(0, 2000) }

      // Test devices
      const devicesRes = await fetch(`${apiUrl}/ea/devices`, {
        headers: { 'x-api-key': apiKey, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      const devicesText = await devicesRes.text()
      results.devicesResponse = { status: devicesRes.status, bodyLength: devicesText.length, body: devicesText.substring(0, 2000) }
    } else if (collector === 'saas_alerts') {
      const apiKey = process.env.SAAS_ALERTS_API_KEY
      if (!apiKey) {
        return NextResponse.json({ ...results, error: 'SAAS_ALERTS_API_KEY not set' })
      }
      let baseUrl = (process.env.SAAS_ALERTS_API_URL ?? 'https://manage.saasalerts.com/api').replace(/\/$/, '')
      if (!baseUrl.endsWith('/api')) baseUrl += '/api'
      results.computedBaseUrl = baseUrl
      results.rawEnvUrl = process.env.SAAS_ALERTS_API_URL ?? '(not set)'

      // Test each endpoint + auth pattern combination directly
      const testPaths = ['/reports/customers', '/customers', '/reports/tenants']
      const authHeaders: Array<{ name: string; headers: Record<string, string> }> = [
        { name: 'apikey', headers: { apikey: apiKey, Accept: 'application/json' } },
        { name: 'x-api-key', headers: { 'x-api-key': apiKey, Accept: 'application/json' } },
        { name: 'Bearer', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } },
        { name: 'raw-auth', headers: { Authorization: apiKey, Accept: 'application/json' } },
      ]

      const rawTests: Array<{ path: string; auth: string; status: number; body: string }> = []
      for (const testPath of testPaths) {
        for (const auth of authHeaders) {
          try {
            const res = await fetch(`${baseUrl}${testPath}`, {
              headers: auth.headers,
              signal: AbortSignal.timeout(10_000),
            })
            const body = await res.text()
            rawTests.push({ path: testPath, auth: auth.name, status: res.status, body: body.substring(0, 300) })
            // Stop testing auth patterns for this path if we got a non-auth error
            if (res.status !== 401 && res.status !== 403) break
          } catch (err) {
            rawTests.push({ path: testPath, auth: auth.name, status: 0, body: err instanceof Error ? err.message : String(err) })
          }
        }
      }
      results.rawTests = rawTests
    } else if (collector === 'policies') {
      // Debug: check if controlDetails are populated in policy analyses
      const { getPool } = await import('@/lib/db-pool')
      const { ensureComplianceTables } = await import('@/lib/compliance/ensure-tables')
      await ensureComplianceTables()
      const pool = getPool()
      const client = await pool.connect()
      try {
        // Find the company
        const companyRes = await client.query<{ id: string; displayName: string }>(
          `SELECT id, "displayName" FROM companies WHERE "displayName" ILIKE $1 LIMIT 1`,
          [`%${companyName}%`]
        )
        if (companyRes.rows.length === 0) {
          results.error = `No company matching "${companyName}"`
          return NextResponse.json({ success: false, ...results })
        }
        const company = companyRes.rows[0]
        results.company = { id: company.id, name: company.displayName }

        // Get policies
        const policiesRes = await client.query<{ id: string; title: string }>(
          `SELECT id, title FROM compliance_policies WHERE "companyId" = $1 ORDER BY "createdAt" DESC`,
          [company.id]
        )
        results.policyCount = policiesRes.rows.length

        // Get analyses with controlDetails
        const analysesRes = await client.query<{
          id: string; policyId: string; status: string; analyzedAt: string | null;
          satisfiedCount: number; partialCount: number; missingCount: number;
          controlDetailsLength: number; sampleDetails: string;
        }>(
          `SELECT a.id, a."policyId", a.status, a."analyzedAt",
                  jsonb_array_length(COALESCE(a."satisfiedControls", '[]'::jsonb)) as "satisfiedCount",
                  jsonb_array_length(COALESCE(a."partialControls", '[]'::jsonb)) as "partialCount",
                  jsonb_array_length(COALESCE(a."missingControls", '[]'::jsonb)) as "missingCount",
                  jsonb_array_length(COALESCE(a."controlDetails", '[]'::jsonb)) as "controlDetailsLength",
                  COALESCE(a."controlDetails", '[]'::jsonb)::text as "sampleDetails"
           FROM compliance_policy_analyses a
           JOIN compliance_policies p ON p.id = a."policyId"
           WHERE p."companyId" = $1 AND a.status = 'complete'
           ORDER BY a."analyzedAt" DESC`,
          [company.id]
        )

        results.analyses = analysesRes.rows.map((a) => {
          const policyTitle = policiesRes.rows.find((p) => p.id === a.policyId)?.title ?? 'unknown'
          // Parse and show first 2 controlDetails entries
          let sampleQuotes: unknown[] = []
          try {
            const details = JSON.parse(a.sampleDetails)
            sampleQuotes = (details as Array<{ controlId: string; status: string; quote: string | null }>)
              .filter((d) => d.quote)
              .slice(0, 3)
              .map((d) => ({ controlId: d.controlId, status: d.status, quote: d.quote?.substring(0, 100) }))
          } catch { /* ignore */ }
          return {
            policyTitle,
            status: a.status,
            analyzedAt: a.analyzedAt,
            satisfied: a.satisfiedCount,
            partial: a.partialCount,
            missing: a.missingCount,
            controlDetailsCount: a.controlDetailsLength,
            hasQuotes: sampleQuotes.length > 0,
            sampleQuotes,
          }
        })
      } finally {
        client.release()
      }
    }

    return NextResponse.json({ success: true, ...results })
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      ...results,
    })
  }
}
