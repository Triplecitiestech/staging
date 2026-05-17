/**
 * GET /api/compliance/assessments/[id]/report.pdf
 *
 * Streams a printable PDF report of an assessment — cover page,
 * executive summary with status breakdown, per-control findings
 * grouped by family (including reviewer overrides + dispositions),
 * and an appendix. Operator clicks "Download PDF report" on the
 * findings page header to grab it.
 *
 * Renderer lives in src/lib/compliance/assessment-report.ts; this
 * route just gathers data + sets response headers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { getAssessmentSummary, getFrameworkDefinition } from '@/lib/compliance/engine'
import { renderAssessmentReportPdf } from '@/lib/compliance/assessment-report'
import type { FrameworkId } from '@/lib/compliance/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface DispositionRow {
  controlId: string
  lifecycleStatus: string | null
  acceptedRiskRationale: string | null
  internalNotes: string | null
  decisionBy: string | null
  decidedAt: string | null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id: assessmentId } = await params

  try {
    const summary = await getAssessmentSummary(assessmentId)
    if (!summary) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    const company = await prisma.company.findUnique({
      where: { id: summary.assessment.companyId },
      select: { id: true, displayName: true },
    })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Build control metadata lookup so the report can show titles +
    // descriptions + categories alongside each finding instead of bare
    // ids.
    const framework = getFrameworkDefinition(summary.assessment.frameworkId as FrameworkId)
    const controlMeta = new Map<string, { title: string; description: string; category?: string }>()
    for (const c of framework.controls) {
      const entry = {
        title: c.title,
        description: c.description,
        category: c.category,
      }
      controlMeta.set(c.controlId, entry)
      // Also key by the prefix-stripped form so findings stored as
      // "1.1" still resolve metadata stored under "cis-v8-1.1".
      controlMeta.set(c.controlId.replace(/^[a-z]+-[a-z0-9]+-/, ''), entry)
    }

    // Dispositions — same load shape as the findings page uses.
    const dispositionByControlId = new Map<string, DispositionRow>()
    const pool = getPool()
    const client = await pool.connect()
    try {
      const res = await client.query<DispositionRow>(
        `SELECT "controlId", "lifecycleStatus", "acceptedRiskRationale",
                "internalNotes", "decisionBy",
                "decidedAt"::text AS "decidedAt"
           FROM compliance_finding_dispositions
          WHERE "companyId" = $1 AND "frameworkId" = $2`,
        [company.id, summary.assessment.frameworkId]
      )
      for (const row of res.rows) {
        dispositionByControlId.set(row.controlId, row)
      }
    } finally {
      client.release()
    }

    const buf = await renderAssessmentReportPdf({
      companyName: company.displayName,
      frameworkName: summary.frameworkName,
      summary,
      controlMeta,
      dispositionByControlId,
      generatedBy: session.user.email,
    })

    const safeCompany = company.displayName.replace(/[\/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Customer'
    const date = (summary.assessment.completedAt ?? summary.assessment.createdAt).slice(0, 10)
    const filename = `${safeCompany} — ${summary.assessment.frameworkId} — ${date}.pdf`

    return new Response(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buf.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[compliance/assessments/report] error:', err)
    return NextResponse.json(
      { error: `Failed to render report: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
