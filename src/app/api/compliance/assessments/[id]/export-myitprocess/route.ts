/**
 * GET /api/compliance/assessments/[id]/export-myitprocess
 *
 * Exports failed/needs-review/partial findings from a CIS assessment as a CSV
 * formatted for MyITProcess alignment-item bulk import.
 *
 * MyITProcess (Kaseya BMS / Kaseya MyITProcess) accepts alignment items
 * which represent gaps between the customer's current state and best
 * practice. Each finding becomes an alignment row with:
 *   - Standard: the CIS control title
 *   - Status: mapped from the finding status (fail -> Misaligned, partial ->
 *     Partially Aligned, needs_review -> Pending Review, not_assessed ->
 *     Not Assessed)
 *   - Notes: the evaluator reasoning + remediation hint
 *   - Evidence: which sources were used
 *   - Recommendation Priority: derived from CIS Implementation Group / risk
 *
 * The CSV is downloaded as a file the tech can import into MyITProcess
 * via Settings > Standards > Alignment > Bulk Import. We also persist a
 * record of every export in compliance_alignment_exports so we can show
 * "Last pushed N hours ago" in the UI and audit who exported what.
 *
 * Why an export rather than a direct API push: the public MyITProcess
 * Reporting API (reporting.live.myitprocess.com) is read-only. There is
 * currently no documented write API for alignment items. Bulk import via
 * CSV is Kaseya's officially-supported intake path for alignment data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAssessmentSummary } from '@/lib/compliance/engine'
import { getPool } from '@/lib/db-pool'
import { CIS_V8_FRAMEWORK } from '@/lib/compliance/frameworks/cis-v8'

export const dynamic = 'force-dynamic'

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function statusToAlignmentLabel(status: string): string {
  switch (status) {
    case 'pass': return 'Aligned'
    case 'fail': return 'Misaligned'
    case 'partial': return 'Partially Aligned'
    case 'needs_review': return 'Pending Review'
    case 'not_assessed': return 'Not Assessed'
    case 'not_applicable': return 'Not Applicable'
    case 'collection_failed': return 'Evidence Unavailable'
    default: return status
  }
}

function priorityForControl(controlId: string, status: string): 'High' | 'Medium' | 'Low' {
  // Failed IG1 controls are High priority (essential hygiene)
  // Partial controls are Medium
  // Needs review / not assessed are Low
  if (status === 'fail') {
    const def = CIS_V8_FRAMEWORK.controls.find((c) => c.controlId === controlId)
    if (def?.tier === 'IG1') return 'High'
    return 'Medium'
  }
  if (status === 'partial') return 'Medium'
  return 'Low'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: assessmentId } = await params
  // Optional ?include=fail,partial,needs_review (defaults to all gaps)
  const includeParam = request.nextUrl.searchParams.get('include')
  const includeStatuses = includeParam
    ? new Set(includeParam.split(',').map((s) => s.trim()))
    : new Set(['fail', 'partial', 'needs_review'])

  try {
    const summary = await getAssessmentSummary(assessmentId)
    if (!summary) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    const { assessment, findings } = summary

    // Filter to gaps the customer should action
    const exportFindings = findings.filter((f) => includeStatuses.has(f.status))

    // Build CSV
    const header = [
      'Control ID',
      'Standard',
      'Category',
      'Implementation Group',
      'Alignment Status',
      'Priority',
      'Reasoning',
      'Remediation',
      'Evidence Sources',
      'Confidence',
    ]
    const rows: string[][] = [header]

    for (const f of exportFindings) {
      const controlDef = CIS_V8_FRAMEWORK.controls.find((c) => c.controlId === f.controlId)
      rows.push([
        f.controlId,
        controlDef?.title ?? f.controlId,
        controlDef?.category ?? '',
        controlDef?.tier ?? '',
        statusToAlignmentLabel(f.overrideStatus ?? f.status),
        priorityForControl(f.controlId, f.overrideStatus ?? f.status),
        f.reasoning ?? '',
        f.remediation ?? '',
        (f.evidenceIds ?? []).join('; '),
        f.confidence,
      ])
    }

    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n')

    // Persist export record (best-effort — table auto-created)
    try {
      const pool = getPool()
      const client = await pool.connect()
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS compliance_alignment_exports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "assessmentId" TEXT NOT NULL,
            "companyId" TEXT NOT NULL,
            "frameworkId" TEXT NOT NULL,
            target TEXT NOT NULL,
            "findingsExported" INTEGER NOT NULL,
            "exportedBy" TEXT NOT NULL,
            "exportedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `)
        await client.query(
          `INSERT INTO compliance_alignment_exports
           ("assessmentId", "companyId", "frameworkId", target, "findingsExported", "exportedBy")
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [assessmentId, assessment.companyId, assessment.frameworkId, 'myitprocess', exportFindings.length, session.user.email]
        )
      } finally {
        client.release()
      }
    } catch (err) {
      console.warn('[compliance/export-myitprocess] Failed to log export:', err instanceof Error ? err.message : err)
    }

    const filename = `myitprocess-alignment-${assessment.frameworkId}-${assessmentId.substring(0, 8)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Findings-Exported': String(exportFindings.length),
      },
    })
  } catch (err) {
    console.error('[compliance/export-myitprocess] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to export alignment' },
      { status: 500 }
    )
  }
}
