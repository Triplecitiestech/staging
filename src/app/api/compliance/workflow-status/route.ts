/**
 * GET /api/compliance/workflow-status?companyId=xxx
 *
 * Returns the compliance guided workflow step completion state for a company.
 * Derives status from existing data rather than a separate progress table:
 *   Step 1 (Prerequisites): M365 configured/verified + Autotask synced
 *   Step 2 (Tool Config): At least one tool deployed for company
 *   Step 3 (Platform Mapping): At least one platform mapped for company
 *   Step 4 (Initial Assessment): At least one completed assessment
 *   Step 5 (Policies): Org profile started + at least one policy (uploaded or generated)
 *   Step 6 (Final Assessment): 2+ completed assessments AND newer than latest policy change
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import type { PoolClient } from 'pg'

export const dynamic = 'force-dynamic'

async function safeCount(client: PoolClient, query: string, params: unknown[]): Promise<number> {
  try {
    const res = await client.query<{ count: string }>(query, params)
    return parseInt(res.rows[0]?.count ?? '0', 10)
  } catch {
    return 0
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  let client: PoolClient | null = null

  try {
    const pool = getPool()
    client = await pool.connect()

    // Step 1: Prerequisites — M365 + Autotask
    const companyRes = await client.query<{
      autotaskCompanyId: string | null
      m365SetupStatus: string | null
    }>(
      `SELECT "autotaskCompanyId", m365_setup_status AS "m365SetupStatus" FROM companies WHERE id = $1`,
      [companyId]
    )
    const company = companyRes.rows[0]
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const m365Ready = company.m365SetupStatus === 'verified' || company.m365SetupStatus === 'configured'
    const autotaskReady = !!company.autotaskCompanyId
    const step1Complete = m365Ready && autotaskReady

    // Step 2: Tool configuration — any tools deployed for this company
    const toolCount = await safeCount(
      client,
      `SELECT COUNT(*)::text as count FROM compliance_company_tools WHERE "companyId" = $1 AND deployed = true`,
      [companyId]
    )
    const step2Complete = toolCount > 0

    // Step 3: Platform mapping — any platforms mapped
    const mappingCount = await safeCount(
      client,
      `SELECT COUNT(*)::text as count FROM compliance_platform_mappings WHERE "companyId" = $1`,
      [companyId]
    )
    const step3Complete = mappingCount > 0

    // Step 4: Initial assessment — at least one completed
    const assessmentCount = await safeCount(
      client,
      `SELECT COUNT(*)::text as count FROM compliance_assessments WHERE "companyId" = $1 AND status = 'complete'`,
      [companyId]
    )
    const step4Complete = assessmentCount >= 1

    // Step 5: Policies — need uploaded/generated policies AND org profile started
    // Check org profile exists and has at least some required answers filled
    let orgProfileCompletion = 0
    let hasOrgProfile = false
    try {
      const orgRes = await client.query<{ answers: Record<string, unknown> }>(
        `SELECT answers FROM policy_org_profiles WHERE "companyId" = $1`,
        [companyId]
      )
      if (orgRes.rows[0]) {
        hasOrgProfile = true
        const answers = orgRes.rows[0].answers
        // Count how many of the key required fields are filled
        const requiredFields = ['org_legal_name', 'org_industry', 'org_employee_count', 'org_handles_phi', 'org_handles_pii']
        const filled = requiredFields.filter((f) => {
          const v = answers[f]
          return v !== undefined && v !== null && v !== ''
        }).length
        orgProfileCompletion = Math.round((filled / requiredFields.length) * 100)
      }
    } catch {
      // Table may not exist yet
    }

    // Count uploaded policies (from Policy Analysis tab)
    const uploadedPolicyCount = await safeCount(
      client,
      `SELECT COUNT(*)::text as count FROM compliance_policies WHERE "companyId" = $1`,
      [companyId]
    )

    // Count generated policies (from Policy Generation tab)
    const generatedPolicyCount = await safeCount(
      client,
      `SELECT COUNT(*)::text as count FROM policy_generation_records WHERE "companyId" = $1 AND status IN ('draft', 'under_review', 'approved', 'exported')`,
      [companyId]
    )

    // Step 5 requires: org profile with at least 50% of key fields + at least one policy
    const totalPolicyCount = uploadedPolicyCount + generatedPolicyCount
    const step5Complete = orgProfileCompletion >= 60 && totalPolicyCount > 0

    // Step 6: Final assessment — 2+ assessments (the second one is the "final" post-policy assessment)
    // Also check if the latest assessment is newer than the latest policy activity
    let latestAssessmentDate: Date | null = null
    let latestPolicyDate: Date | null = null
    try {
      const latestAssess = await client.query<{ latest: string | null }>(
        `SELECT MAX("completedAt") as latest FROM compliance_assessments WHERE "companyId" = $1 AND status = 'complete'`,
        [companyId]
      )
      latestAssessmentDate = latestAssess.rows[0]?.latest ? new Date(latestAssess.rows[0].latest) : null
    } catch { /* table may not exist */ }

    try {
      const latestPolicy = await client.query<{ latest: string | null }>(
        `SELECT MAX("createdAt") as latest FROM compliance_policies WHERE "companyId" = $1`,
        [companyId]
      )
      latestPolicyDate = latestPolicy.rows[0]?.latest ? new Date(latestPolicy.rows[0].latest) : null
    } catch { /* table may not exist */ }

    // Step 6 is complete only if: 2+ assessments AND the most recent one was run AFTER the latest policy was added
    const hasPostPolicyAssessment = latestAssessmentDate && latestPolicyDate
      ? latestAssessmentDate > latestPolicyDate
      : false
    const step6Complete = assessmentCount >= 2 && hasPostPolicyAssessment

    return NextResponse.json({
      success: true,
      data: {
        companyId,
        prerequisites: {
          m365Ready,
          autotaskReady,
        },
        steps: {
          1: { complete: step1Complete, label: 'Prerequisites' },
          2: { complete: step2Complete, label: 'Tool Configuration', toolCount },
          3: { complete: step3Complete, label: 'Platform Mapping', mappingCount },
          4: { complete: step4Complete, label: 'Initial Assessment', assessmentCount },
          5: {
            complete: step5Complete,
            label: 'Policies',
            hasOrgProfile,
            orgProfileCompletion,
            uploadedPolicyCount,
            generatedPolicyCount,
            totalPolicyCount,
          },
          6: {
            complete: step6Complete,
            label: 'Final Assessment',
            assessmentCount,
            hasPostPolicyAssessment,
          },
        },
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[compliance/workflow-status] Error:', msg, err)
    return NextResponse.json({ success: false, error: `Failed to load workflow status: ${msg}` }, { status: 500 })
  } finally {
    if (client) client.release()
  }
}
