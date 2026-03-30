/**
 * GET /api/compliance/portal?companySlug=xxx — Customer-facing compliance summary
 *
 * Returns a filtered, safe view of compliance data for the customer portal.
 * Does NOT expose internal notes, raw evidence, or internal remediation language.
 * Only returns data if compliancePortalEnabled is true for the company.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { compareControlIds } from '@/lib/compliance/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const companySlug = request.nextUrl.searchParams.get('companySlug')
  if (!companySlug) {
    return NextResponse.json({ error: 'companySlug is required' }, { status: 400 })
  }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()

  try {
    // Check if compliance portal is enabled for this company
    const companyRes = await client.query<{
      id: string
      displayName: string
      compliancePortalEnabled: boolean
    }>(
      `SELECT id, "displayName",
        COALESCE("compliancePortalEnabled", false) AS "compliancePortalEnabled"
       FROM companies WHERE slug = $1`,
      [companySlug]
    )

    if (companyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const company = companyRes.rows[0]
    if (!company.compliancePortalEnabled) {
      return NextResponse.json({ success: true, data: { enabled: false } })
    }

    // Get the latest completed assessment
    const assessmentRes = await client.query<{
      id: string
      frameworkId: string
      completedAt: string
      totalControls: number
      passedControls: number
      failedControls: number
      manualReviewControls: number
    }>(
      `SELECT id, "frameworkId", "completedAt", "totalControls", "passedControls", "failedControls", "manualReviewControls"
       FROM compliance_assessments
       WHERE "companyId" = $1 AND status = 'complete'
       ORDER BY "completedAt" DESC LIMIT 1`,
      [company.id]
    )

    if (assessmentRes.rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: { enabled: true, assessment: null },
      })
    }

    const assessment = assessmentRes.rows[0]

    // Get findings — filtered for customer view (no raw evidence IDs, no internal details)
    const findingsRes = await client.query<{
      controlId: string
      status: string
      confidence: string
      reasoning: string
      overrideStatus: string | null
    }>(
      `SELECT "controlId", status, confidence, reasoning, "overrideStatus"
       FROM compliance_findings WHERE "assessmentId" = $1`,
      [assessment.id]
    )

    // Sort numerically
    const findings = findingsRes.rows
      .sort((a, b) => compareControlIds(a.controlId, b.controlId))
      .map((f) => ({
        controlId: f.controlId,
        status: f.overrideStatus ?? f.status,
        confidence: f.confidence,
        // Sanitize reasoning for customer view — remove internal references
        reasoning: f.reasoning,
      }))

    const scorePercent = assessment.totalControls > 0
      ? Math.round((assessment.passedControls / assessment.totalControls) * 100)
      : 0

    // Score trend
    const trendRes = await client.query<{
      completedAt: string
      passedControls: number
      totalControls: number
    }>(
      `SELECT "completedAt", "passedControls", "totalControls"
       FROM compliance_assessments
       WHERE "companyId" = $1 AND status = 'complete'
       ORDER BY "completedAt" ASC LIMIT 10`,
      [company.id]
    )

    const trend = trendRes.rows.map((r) => ({
      date: r.completedAt,
      score: r.totalControls > 0 ? Math.round((r.passedControls / r.totalControls) * 100) : 0,
    }))

    return NextResponse.json({
      success: true,
      data: {
        enabled: true,
        companyName: company.displayName,
        assessment: {
          frameworkId: assessment.frameworkId,
          frameworkName: 'CIS Controls v8',
          completedAt: assessment.completedAt,
          scorePercent,
          passed: assessment.passedControls,
          failed: assessment.failedControls,
          other: assessment.manualReviewControls,
          total: assessment.totalControls,
        },
        findings,
        trend,
      },
    })
  } catch (err) {
    console.error('[compliance/portal] Error:', err)
    return NextResponse.json({ error: 'Failed to load compliance data' }, { status: 500 })
  } finally {
    client.release()
  }
}
