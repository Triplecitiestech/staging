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
import { getControlCountByPolicy } from '@/lib/compliance/policy-generation/framework-mappings'
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
    }))
    return NextResponse.json({
      success: true,
      data: {
        companyId,
        companyName: 'Unknown',
        selectedFrameworks: frameworkIds,
        requiredPolicies,
        stats: { totalRequired: requiredPolicies.length, existing: 0, missing: requiredPolicies.length, drafts: 0, approved: 0, intakeNeeded: 0 },
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

    // Also check existing uploaded policies
    const existingByCategory = new Map<string, { id: string; updatedAt: string }>()
    try {
      const existingPolicies = await client.query<{ id: string; category: string; updatedAt: string }>(
        `SELECT id, category, "updatedAt" FROM compliance_policies
         WHERE "companyId" = $1`,
        [companyId]
      )
      for (const p of existingPolicies.rows) {
        const slug = categoryToSlug(p.category)
        if (slug) existingByCategory.set(slug, { id: p.id, updatedAt: p.updatedAt })
      }
    } catch {
      // compliance_policies may not exist either — proceed without
    }

    // Build control counts
    const controlCounts = getControlCountByPolicy(frameworkIds.length > 0 ? frameworkIds : ['cis-v8'])

    // Build needs analysis
    const requiredPolicies: PolicyNeedItem[] = catalog.map((item) => {
      const genRecord = recordMap.get(item.slug)
      const existing = existingByCategory.get(item.slug)

      let status: PolicyGenStatus = 'missing'
      let existingPolicyId: string | null = null
      let lastUpdated: string | null = null

      if (genRecord) {
        status = genRecord.status as PolicyGenStatus
        existingPolicyId = genRecord.policyId
        lastUpdated = genRecord.updatedAt
      } else if (existing) {
        status = 'missing' // Exists as uploaded but not as generated — still counts as "existing"
        existingPolicyId = existing.id
        lastUpdated = existing.updatedAt
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
      }
    })

    const stats = {
      totalRequired: requiredPolicies.length,
      existing: requiredPolicies.filter((p) => p.existingPolicyId).length,
      missing: requiredPolicies.filter((p) => p.status === 'missing' && !p.existingPolicyId).length,
      drafts: requiredPolicies.filter((p) => p.status === 'draft').length,
      approved: requiredPolicies.filter((p) => p.status === 'approved').length,
      intakeNeeded: requiredPolicies.filter((p) => p.status === 'intake_needed').length,
    }

    const analysis: PolicyNeedsAnalysis = {
      companyId,
      companyName,
      selectedFrameworks: frameworkIds,
      requiredPolicies,
      stats,
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
