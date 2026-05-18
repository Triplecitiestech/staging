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
    // pg returns TIMESTAMPTZ columns as Date instances even though the
    // TS types say string — normalize via new Date() then ISO-slice
    // for a YYYY-MM-DD prefix on the filename. (Calling .slice()
    // directly on a Date throws.)
    const dateInput = summary.assessment.completedAt ?? summary.assessment.createdAt
    const date = new Date(dateInput as string | Date).toISOString().slice(0, 10)
    // HTTP headers are ByteString (0-255). Any em-dashes, smart quotes,
    // or accented characters in the company name would crash Response
    // creation with "character > 255". Build an ASCII-safe version for
    // the legacy `filename=` slot and a percent-encoded UTF-8 version
    // for `filename*=` per RFC 5987 so well-behaved browsers still get
    // the pretty filename.
    const prettyName = `${safeCompany} — ${summary.assessment.frameworkId} — ${date}.pdf`
    const asciiName = prettyName
      .replace(/[‐-―]/g, '-')   // hyphens + en/em dashes
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[^\x20-\x7e]/g, '_')      // anything still non-ASCII → underscore

    return new Response(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(prettyName)}`,
        'Content-Length': String(buf.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    // Don't return JSON — the browser is mid-download and would save
    // the JSON error envelope under the .pdf filename. Fall back to a
    // .txt with the actual error so the operator can diagnose instead
    // of double-clicking a "PDF" that's secretly JSON.
    console.error('[compliance/assessments/report] error:', err)
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? `\n\n${err.stack ?? ''}` : ''
    const body =
      `PDF report generation failed.\n\n` +
      `Error: ${message}${stack}\n\n` +
      `Send this file to the engineer so they can fix the renderer. The assessment data itself is fine — you can view it on the findings page.\n`
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="report-error.txt"`,
        'Cache-Control': 'no-store',
      },
    })
  }
}
