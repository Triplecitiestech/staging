/**
 * GET /api/compliance/workflow-status?companyId=xxx
 *
 * Returns the compliance guided workflow step completion state for a company.
 * Derives status from existing data rather than a separate progress table:
 *   Step 1 (Prerequisites): M365 configured/verified + Autotask synced
 *   Step 2 (Tool Config): At least one tool deployed for company
 *   Step 3 (Platform Mapping): At least one platform mapped for company
 *   Step 4 (Initial Assessment): At least one completed assessment
 *   Step 5 (Policy Generation): Org profile started + at least one policy generated
 *   Step 6 (Final Assessment): Two or more completed assessments
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import type { PoolClient } from 'pg'

export const dynamic = 'force-dynamic'

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
    await ensureComplianceTables()
    const pool = getPool()
    client = await pool.connect()

    // Step 1: Prerequisites — M365 + Autotask
    const companyRes = await client.query<{
      autotaskCompanyId: string | null
      m365SetupStatus: string | null
    }>(
      `SELECT "autotaskCompanyId", "m365SetupStatus" FROM company WHERE id = $1`,
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
    let toolCount = 0
    try {
      const toolsRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM compliance_company_tools
         WHERE "companyId" = $1 AND deployed = true`,
        [companyId]
      )
      toolCount = parseInt(toolsRes.rows[0]?.count ?? '0', 10)
    } catch {
      // Table may not exist yet
    }
    const step2Complete = toolCount > 0

    // Step 3: Platform mapping — any platforms mapped
    let mappingCount = 0
    try {
      const mappingRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM compliance_platform_mappings
         WHERE "companyId" = $1`,
        [companyId]
      )
      mappingCount = parseInt(mappingRes.rows[0]?.count ?? '0', 10)
    } catch {
      // Table may not exist yet
    }
    const step3Complete = mappingCount > 0

    // Step 4: Initial assessment — at least one completed
    let assessmentCount = 0
    try {
      const assessRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM compliance_assessments
         WHERE "companyId" = $1 AND status = 'complete'`,
        [companyId]
      )
      assessmentCount = parseInt(assessRes.rows[0]?.count ?? '0', 10)
    } catch {
      // Table may not exist yet
    }
    const step4Complete = assessmentCount >= 1

    // Step 5: Policy generation — org profile exists + at least one policy
    let hasOrgProfile = false
    let policyCount = 0
    try {
      const orgRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM policy_org_profiles
         WHERE "companyId" = $1`,
        [companyId]
      )
      hasOrgProfile = parseInt(orgRes.rows[0]?.count ?? '0', 10) > 0
    } catch {
      // Table may not exist yet
    }
    try {
      const policyRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM compliance_policies
         WHERE "companyId" = $1 AND status IN ('draft', 'under_review', 'approved', 'exported')`,
        [companyId]
      )
      policyCount = parseInt(policyRes.rows[0]?.count ?? '0', 10)
    } catch {
      // Table may not exist yet
    }
    const step5Complete = hasOrgProfile && policyCount > 0

    // Step 6: Final assessment — 2+ completed assessments
    const step6Complete = assessmentCount >= 2

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
          5: { complete: step5Complete, label: 'Policy Generation', hasOrgProfile, policyCount },
          6: { complete: step6Complete, label: 'Final Assessment', assessmentCount },
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
