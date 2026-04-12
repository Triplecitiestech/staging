/**
 * GET /api/compliance/policies/catalog — Get the master policy catalog
 *
 * Query params:
 *   frameworks — comma-separated framework IDs to filter (e.g., "cis-v8,hipaa")
 *   companyId  — if provided, includes generation status for each policy
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { POLICY_CATALOG, getCatalogForFrameworks, getCategoryLabel } from '@/lib/compliance/policy-generation/catalog'
import { getControlCountByPolicy, FRAMEWORK_POLICY_MAPPINGS } from '@/lib/compliance/policy-generation/framework-mappings'
import { getPool } from '@/lib/db-pool'
import type { PolicyGenStatus, PolicyNeedsAnalysis, PolicyNeedItem } from '@/lib/compliance/policy-generation/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const frameworkParam = request.nextUrl.searchParams.get('frameworks')
  const companyId = request.nextUrl.searchParams.get('companyId')

  const frameworkIds = frameworkParam
    ? frameworkParam.split(',').map((f) => f.trim()).filter(Boolean)
    : []

  // Get catalog items
  const catalog = frameworkIds.length > 0
    ? getCatalogForFrameworks(frameworkIds)
    : POLICY_CATALOG

  // If no companyId, just return the catalog
  if (!companyId) {
    return NextResponse.json({
      success: true,
      data: {
        catalog: catalog.map((item) => ({
          ...item,
          categoryLabel: getCategoryLabel(item.category),
        })),
      },
    })
  }

  // With companyId: build a needs analysis
  const pool = getPool()
  let client: import('pg').PoolClient | null = null

  try {
    client = await pool.connect()
  } catch (connErr) {
    // If DB connection fails, return catalog without per-company status
    console.error('[compliance/policies/catalog] DB connection failed:', connErr instanceof Error ? connErr.message : connErr)
    const controlCounts = getControlCountByPolicy(frameworkIds.length > 0 ? frameworkIds : ['cis-v8'])
    const requiredPolicies: PolicyNeedItem[] = catalog.map((item) => ({
      slug: item.slug,
      name: item.name,
      category: item.category,
      requirement: 'required' as const,
      frameworks: item.frameworkRelevance.map((r) => r.frameworkId),
      status: 'missing' as PolicyGenStatus,
      existingPolicyId: null,
      controlCount: controlCounts.get(item.slug) ?? 0,
      lastUpdated: null,
      coverageStatus: 'none' as const,
      coverageRatio: 0,
      coveredBy: [],
    }))
    return NextResponse.json({
      success: true,
      data: {
        companyId,
        companyName: 'Unknown',
        selectedFrameworks: frameworkIds,
        requiredPolicies,
        stats: { totalRequired: requiredPolicies.length, existing: 0, missing: requiredPolicies.length, drafts: 0, approved: 0, intakeNeeded: 0, notGenerated: requiredPolicies.length, needsEnhancement: 0, coveredByExisting: 0, generating: 0 },
        latestPolicyActivityAt: null,
        latestAssessmentAt: null,
        needsNewAssessment: false,
      } satisfies PolicyNeedsAnalysis,
    })
  }

  try {
    // Get company name (Prisma column is "displayName", not "name")
    const companyRes = await client.query<{ displayName: string }>(
      `SELECT "displayName" FROM companies WHERE id = $1`, [companyId]
    )
    const companyName = companyRes.rows[0]?.displayName ?? 'Unknown'

    // Get existing generation records for this company (graceful if table missing)
    let recordMap = new Map<string, { policySlug: string; status: string; policyId: string | null; updatedAt: string }>()
    try {
      // First, auto-reset any "generating" records older than 5 minutes — these are stuck
      // due to Vercel 60s function timeout. This lets the UI show accurate state without
      // requiring the user to manually re-trigger generation.
      try {
        await client.query(
          `UPDATE policy_generation_records
           SET status = CASE WHEN "policyId" IS NOT NULL THEN 'draft' ELSE 'ready_to_generate' END,
               "updatedAt" = NOW()
           WHERE "companyId" = $1 AND status = 'generating' AND "updatedAt" < NOW() - INTERVAL '5 minutes'`,
          [companyId]
        )
      } catch { /* ignore if table doesn't exist */ }

      const genRecords = await client.query<{
        policySlug: string; status: string; policyId: string | null; updatedAt: string
      }>(
        `SELECT "policySlug", status, "policyId", "updatedAt"
         FROM policy_generation_records WHERE "companyId" = $1`,
        [companyId]
      )
      recordMap = new Map(genRecords.rows.map((r) => [r.policySlug, r]))
    } catch (tableErr) {
      // Table may not exist yet on first deploy — proceed without generation records
      console.warn('[compliance/policies/catalog] policy_generation_records query failed (table may not exist):', tableErr instanceof Error ? tableErr.message : tableErr)
    }

    // Also check existing uploaded policies + their AI analyses for control coverage.
    // This is how we determine whether a catalog policy is already covered by
    // something the customer already has, so we don't ask the tech to regenerate
    // 21 policies when 18 are already uploaded and cover most of the controls.
    const existingByCategory = new Map<string, { id: string; title: string; updatedAt: string }>()
    const uploadedPolicies: Array<{ id: string; title: string; category: string; updatedAt: string }> = []
    try {
      const existingPolicies = await client.query<{ id: string; title: string; category: string; updatedAt: string }>(
        `SELECT id, title, category, "updatedAt" FROM compliance_policies
         WHERE "companyId" = $1`,
        [companyId]
      )
      for (const p of existingPolicies.rows) {
        uploadedPolicies.push(p)
        const slug = categoryToSlug(p.category)
        if (slug) existingByCategory.set(slug, { id: p.id, title: p.title, updatedAt: p.updatedAt })
      }
    } catch {
      // compliance_policies may not exist either — proceed without
    }

    // Load analyses so we can determine which controls are covered by each policy.
    // We use actual control coverage (not just category matching) because a policy
    // named "Written Information Security Policy" might cover many controls that
    // span multiple catalog entries.
    type AnalysisRow = {
      policyId: string
      satisfiedControls: string[] | null
      partialControls: string[] | null
    }
    const analysesByPolicyId = new Map<string, AnalysisRow>()
    try {
      const analysesRes = await client.query<AnalysisRow>(
        `SELECT "policyId", "satisfiedControls", "partialControls"
         FROM compliance_policy_analyses
         WHERE "companyId" = $1 AND status = 'complete'`,
        [companyId]
      )
      for (const a of analysesRes.rows) {
        analysesByPolicyId.set(a.policyId, a)
      }
    } catch { /* table may not exist yet */ }

    // Build a map: controlId -> list of uploaded policies that satisfy/partially-cover it
    const controlToExistingPolicies = new Map<string, Array<{ policyId: string; title: string; level: 'satisfied' | 'partial' }>>()
    for (const p of uploadedPolicies) {
      const a = analysesByPolicyId.get(p.id)
      if (!a) continue
      for (const c of a.satisfiedControls ?? []) {
        if (!controlToExistingPolicies.has(c)) controlToExistingPolicies.set(c, [])
        controlToExistingPolicies.get(c)!.push({ policyId: p.id, title: p.title, level: 'satisfied' })
      }
      for (const c of a.partialControls ?? []) {
        if (!controlToExistingPolicies.has(c)) controlToExistingPolicies.set(c, [])
        controlToExistingPolicies.get(c)!.push({ policyId: p.id, title: p.title, level: 'partial' })
      }
    }

    // Build control counts
    const controlCounts = getControlCountByPolicy(frameworkIds.length > 0 ? frameworkIds : ['cis-v8'])

    // Build needs analysis
    const activeFrameworks = frameworkIds.length > 0 ? frameworkIds : ['cis-v8']
    const requiredPolicies: PolicyNeedItem[] = catalog.map((item) => {
      const genRecord = recordMap.get(item.slug)
      const existing = existingByCategory.get(item.slug)

      // --- Compute coverage from uploaded policies ---
      // What controls does THIS catalog policy aim to cover?
      const catalogControls = FRAMEWORK_POLICY_MAPPINGS
        .filter((m) => m.policySlug === item.slug && activeFrameworks.includes(m.frameworkId))
        .map((m) => m.controlId)
      const uniqueCatalogControls = Array.from(new Set(catalogControls))

      // Which of those are already covered by uploaded policies?
      const satisfiedCovered = new Set<string>()
      const partialCovered = new Set<string>()
      const coveringPolicyTitles = new Set<string>()
      for (const c of uniqueCatalogControls) {
        const covers = controlToExistingPolicies.get(c) ?? []
        let hasSatisfied = false
        let hasPartial = false
        for (const cov of covers) {
          coveringPolicyTitles.add(cov.title)
          if (cov.level === 'satisfied') hasSatisfied = true
          else hasPartial = true
        }
        if (hasSatisfied) satisfiedCovered.add(c)
        else if (hasPartial) partialCovered.add(c)
      }
      const totalControls = uniqueCatalogControls.length
      const coveredRatio = totalControls > 0 ? satisfiedCovered.size / totalControls : 0
      const anyCoverage = satisfiedCovered.size + partialCovered.size > 0

      // Determine coverage status (existing uploaded content):
      //   'covered' — existing policies satisfy >=80% of controls → offer Enhance, not Generate New
      //   'partial' — some coverage but gaps → offer Enhance to fill gaps
      //   'none'    — no uploaded policy covers these controls → must Generate New
      let coverageStatus: 'covered' | 'partial' | 'none' = 'none'
      if (coveredRatio >= 0.8) coverageStatus = 'covered'
      else if (anyCoverage) coverageStatus = 'partial'

      // Derive status with the existing uploaded content in mind.
      // Priority: generation record (what the AI has done) > category match > coverage match.
      let status: PolicyGenStatus = 'missing'
      let existingPolicyId: string | null = null
      let lastUpdated: string | null = null

      if (genRecord) {
        // AI has generated or is generating this policy — use that status
        status = genRecord.status as PolicyGenStatus
        existingPolicyId = genRecord.policyId
        lastUpdated = genRecord.updatedAt
      } else if (existing) {
        // Uploaded policy matches this catalog by category name
        existingPolicyId = existing.id
        lastUpdated = existing.updatedAt
        status = 'missing'
      } else if (coverageStatus !== 'none') {
        // No direct category match but the customer has policies covering these controls
        lastUpdated = null
        status = 'missing'
      }

      // Determine highest requirement level
      const relevantFrameworks = item.frameworkRelevance
        .filter((r) => frameworkIds.length === 0 || frameworkIds.includes(r.frameworkId))
      const requirement = relevantFrameworks.some((r) => r.requirement === 'required')
        ? 'required' as const
        : relevantFrameworks.some((r) => r.requirement === 'recommended')
          ? 'recommended' as const
          : 'supporting' as const

      return {
        slug: item.slug,
        name: item.name,
        category: item.category,
        requirement,
        frameworks: relevantFrameworks.map((r) => r.frameworkId),
        status,
        existingPolicyId,
        controlCount: controlCounts.get(item.slug) ?? 0,
        lastUpdated,
        coverageStatus,
        coverageRatio: Math.round(coveredRatio * 100),
        coveredBy: Array.from(coveringPolicyTitles),
      }
    })

    // Counts that reflect real user-visible work:
    //   coveredByExisting — uploaded policies already satisfy most controls, nothing to generate
    //   needsEnhancement  — partial coverage, user can choose to enhance
    //   notGenerated      — truly missing (no uploaded coverage, no AI generation)
    const isUngenerated = (p: PolicyNeedItem) =>
      (p.status === 'missing' || p.status === 'intake_needed' || p.status === 'ready_to_generate')
    const coveredByExisting = requiredPolicies.filter(
      (p) => isUngenerated(p) && p.coverageStatus === 'covered'
    ).length
    const needsEnhancement = requiredPolicies.filter(
      (p) => isUngenerated(p) && p.coverageStatus === 'partial'
    ).length
    const notGenerated = requiredPolicies.filter(
      (p) => isUngenerated(p) && p.coverageStatus === 'none'
    ).length

    const stats = {
      totalRequired: requiredPolicies.length,
      existing: requiredPolicies.filter((p) => p.existingPolicyId).length,
      missing: requiredPolicies.filter((p) => p.status === 'missing' && !p.existingPolicyId && p.coverageStatus === 'none').length,
      drafts: requiredPolicies.filter((p) => p.status === 'draft').length,
      approved: requiredPolicies.filter((p) => p.status === 'approved').length,
      intakeNeeded: requiredPolicies.filter((p) => p.status === 'intake_needed').length,
      notGenerated,
      needsEnhancement,
      coveredByExisting,
      generating: requiredPolicies.filter((p) => p.status === 'generating').length,
    }

    // Determine whether policies have changed since the customer's last
    // completed assessment. If so, the UI nudges the tech to re-run the
    // assessment to see the updated compliance score.
    let latestPolicyActivityAt: string | null = null
    let latestAssessmentAt: string | null = null
    try {
      const policyActivity = await client.query<{ latest: string | null }>(
        `SELECT GREATEST(
           COALESCE((SELECT MAX("updatedAt") FROM compliance_policies WHERE "companyId" = $1), 'epoch'::timestamptz),
           COALESCE((SELECT MAX("updatedAt") FROM policy_generation_records WHERE "companyId" = $1), 'epoch'::timestamptz)
         ) as latest`,
        [companyId]
      )
      const raw = policyActivity.rows[0]?.latest
      if (raw && raw !== '1970-01-01T00:00:00.000Z') {
        latestPolicyActivityAt = new Date(raw).toISOString()
      }
    } catch { /* tables may not exist */ }

    try {
      const assessActivity = await client.query<{ latest: string | null }>(
        `SELECT MAX("completedAt") as latest FROM compliance_assessments
         WHERE "companyId" = $1 AND status = 'complete'`,
        [companyId]
      )
      if (assessActivity.rows[0]?.latest) {
        latestAssessmentAt = new Date(assessActivity.rows[0].latest).toISOString()
      }
    } catch { /* table may not exist */ }

    const needsNewAssessment = latestPolicyActivityAt !== null
      && (!latestAssessmentAt || new Date(latestPolicyActivityAt) > new Date(latestAssessmentAt))

    const analysis: PolicyNeedsAnalysis = {
      companyId,
      companyName,
      selectedFrameworks: frameworkIds,
      requiredPolicies,
      stats,
      latestPolicyActivityAt,
      latestAssessmentAt,
      needsNewAssessment,
    }

    return NextResponse.json({ success: true, data: analysis })
  } catch (err) {
    console.error('[compliance/policies/catalog] GET error:', err)
    return NextResponse.json({
      error: `Failed to load catalog: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  } finally {
    client?.release()
  }
}

/** Map a policy category string to a catalog slug (best-effort) */
function categoryToSlug(category: string): string | null {
  const map: Record<string, string> = {
    'Acceptable Use Policy': 'acceptable-use-policy',
    'Access Control Policy': 'access-control-policy',
    'Backup & Recovery Policy': 'backup-disaster-recovery-policy',
    'Change Management Policy': 'change-management-policy',
    'Data Classification Policy': 'data-classification-policy',
    'Data Retention Policy': 'data-retention-policy',
    'Disaster Recovery Plan': 'backup-disaster-recovery-policy',
    'Encryption Policy': 'encryption-policy',
    'Incident Response Plan': 'incident-response-policy',
    'Information Security Policy': 'information-security-policy',
    'Mobile Device Policy': 'mobile-device-policy',
    'Network Security Policy': 'network-security-policy',
    'Password Policy': 'password-policy',
    'Patch Management Policy': 'patch-management-policy',
    'Remote Access Policy': 'remote-access-policy',
    'Risk Assessment Policy': 'risk-assessment-policy',
    'Security Awareness Training Policy': 'security-awareness-training-policy',
    'Vendor Management Policy': 'vendor-management-policy',
  }
  return map[category] ?? null
}
