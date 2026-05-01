/**
 * GET /api/compliance/assessments/[id]/cowork-worksheet
 *
 * Generates an "Alignment Review Worksheet" tailored for Claude Cowork. Cowork
 * is a browser-based agent that can navigate web pages and click/type/paste,
 * so we feed it a deterministic, ordered script: per CIS safeguard, the exact
 * answer to click and the exact justification text to paste into the
 * MyITProcess Alignment review.
 *
 * Why this exists: MyITProcess's public API is read-only (no write endpoints
 * for alignment answers), so the only way to populate alignment answers is
 * the UI. Cowork executes the UI clicks for the engineer based on this
 * worksheet. Manual entry that took ~4 hours becomes ~5 minutes of agent run
 * time.
 *
 * Query params:
 *   format = 'markdown' (default) | 'json'
 *
 * Response: text/markdown or application/json. Markdown is the preferred
 * format because Cowork follows long natural-language instructions well; JSON
 * is provided for users building their own automation.
 *
 * Mapping of finding status -> MyITProcess answer (defaults; documented at
 * the top of the worksheet so the engineer can override per row before
 * handing to Cowork):
 *   pass               -> Yes
 *   partial            -> Yes (justification flags partial coverage)
 *   fail               -> No
 *   needs_review       -> N/A (justification asks engineer to verify)
 *   not_assessed       -> N/A (justification: evidence unavailable)
 *   not_applicable     -> N/A
 *   collection_failed  -> N/A (justification: collection error, manual review)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAssessmentSummary } from '@/lib/compliance/engine'
import { CIS_V8_FRAMEWORK } from '@/lib/compliance/frameworks/cis-v8'
import type { Finding, FindingStatus, ControlDefinition } from '@/lib/compliance/types'

export const dynamic = 'force-dynamic'

type CoworkAnswer = 'Yes' | 'No' | 'N/A'

interface WorksheetRow {
  /** Display number used in MyITProcess sidebar, e.g. "1.1" */
  safeguardNumber: string
  /** CIS section, e.g. "Inventory and Control of Enterprise Assets" */
  category: string
  /** Question title shown in MyITProcess */
  title: string
  /** Full question text (the "Does the organization..." prompt) */
  questionText: string
  /** CIS Implementation Group: IG1 / IG2 / IG3 */
  tier: string
  /** Suggested answer for Cowork to click */
  answer: CoworkAnswer
  /** Pre-written justification text to paste into the notes field */
  justification: string
  /** Evidence connector(s) that informed this answer */
  evidenceSources: string[]
  /** Confidence level reported by the evaluator */
  confidence: string
  /** True when the engineer should manually verify before submitting */
  needsHumanReview: boolean
}

function statusToAnswer(status: FindingStatus): CoworkAnswer {
  switch (status) {
    case 'pass':
    case 'partial':
      return 'Yes'
    case 'fail':
      return 'No'
    case 'needs_review':
    case 'not_assessed':
    case 'not_applicable':
    case 'collection_failed':
    default:
      return 'N/A'
  }
}

function safeguardNumber(control: ControlDefinition): string {
  // sortKey is [section, item] e.g. [1, 1] -> "1.1"
  if (Array.isArray(control.sortKey) && control.sortKey.length >= 2) {
    return control.sortKey.slice(0, 2).join('.')
  }
  // Fallback: parse from controlId like "cis-v8-1.1"
  const match = control.controlId.match(/(\d+\.\d+)/)
  return match?.[1] ?? control.controlId
}

function cleanCategory(raw: string): string {
  // Source format is "1 - Inventory and Control of Enterprise Assets". Strip
  // the leading number/dash so the worksheet groups read like the MyITProcess
  // sidebar.
  return raw.replace(/^\d+\s*-\s*/, '').trim()
}

function buildJustification(
  status: FindingStatus,
  control: ControlDefinition,
  finding: Finding
): { text: string; needsReview: boolean } {
  const reasoning = (finding.reasoning ?? '').trim()
  const remediation = (finding.remediation ?? '').trim()
  const evidence = finding.evidenceIds.length > 0
    ? ` Evidence collected from: ${finding.evidenceIds.join(', ')}.`
    : ''

  switch (status) {
    case 'pass':
      return {
        text: `${reasoning || `${control.title} is in place.`}${evidence}`.substring(0, 1000),
        needsReview: false,
      }
    case 'partial':
      return {
        text: `Partially in place. ${reasoning}${evidence}${remediation ? ` Outstanding: ${remediation}` : ''} (Engineer review recommended.)`.substring(0, 1000),
        needsReview: true,
      }
    case 'fail':
      return {
        text: `${reasoning || 'Control is not satisfied based on collected evidence.'}${evidence}${remediation ? ` Recommended remediation: ${remediation}` : ''}`.substring(0, 1000),
        needsReview: false,
      }
    case 'needs_review':
      return {
        text: `Manual engineer review needed. ${reasoning}${evidence} (Confirm Yes/No before submitting; default of N/A is a placeholder.)`.substring(0, 1000),
        needsReview: true,
      }
    case 'not_assessed':
      return {
        text: `No evidence sources are available to evaluate this control automatically. ${reasoning} (Engineer judgment required.)`.substring(0, 1000),
        needsReview: true,
      }
    case 'collection_failed':
      return {
        text: `Evidence collection failed. ${reasoning} (Engineer judgment required.)`.substring(0, 1000),
        needsReview: true,
      }
    case 'not_applicable':
      return {
        text: `Not applicable to this environment. ${reasoning}`.substring(0, 1000),
        needsReview: false,
      }
    default:
      return {
        text: reasoning.substring(0, 1000),
        needsReview: true,
      }
  }
}

function buildWorksheetRows(
  findings: Finding[],
  framework = CIS_V8_FRAMEWORK
): WorksheetRow[] {
  // Build a lookup of findings by controlId for efficient join
  const findingByControl = new Map(findings.map((f) => [f.controlId, f]))

  const rows: WorksheetRow[] = []
  for (const control of framework.controls) {
    const finding = findingByControl.get(control.controlId)
    if (!finding) continue
    const effectiveStatus = (finding.overrideStatus ?? finding.status) as FindingStatus
    const answer = statusToAnswer(effectiveStatus)
    const { text: justification, needsReview } = buildJustification(effectiveStatus, control, finding)

    rows.push({
      safeguardNumber: safeguardNumber(control),
      category: cleanCategory(control.category),
      title: control.title,
      questionText: control.description,
      tier: control.tier,
      answer,
      justification,
      evidenceSources: control.evidenceSources,
      confidence: finding.confidence,
      needsHumanReview: needsReview,
    })
  }

  // Sort by sortKey order from the framework definition (already in that
  // order, but be explicit for safety)
  rows.sort((a, b) => {
    const [aSec, aItem] = a.safeguardNumber.split('.').map((n) => parseInt(n, 10))
    const [bSec, bItem] = b.safeguardNumber.split('.').map((n) => parseInt(n, 10))
    if (aSec !== bSec) return aSec - bSec
    return aItem - bItem
  })

  return rows
}

function renderMarkdown(args: {
  companyName: string
  frameworkName: string
  assessmentDate: string
  rows: WorksheetRow[]
  scorePercent: number | null
}): string {
  const { companyName, frameworkName, assessmentDate, rows, scorePercent } = args
  const reviewNeeded = rows.filter((r) => r.needsHumanReview).length
  const yesCount = rows.filter((r) => r.answer === 'Yes').length
  const noCount = rows.filter((r) => r.answer === 'No').length
  const naCount = rows.filter((r) => r.answer === 'N/A').length

  // Group rows by category so the worksheet matches the MyITProcess sidebar
  const byCategory = new Map<string, WorksheetRow[]>()
  for (const r of rows) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, [])
    byCategory.get(r.category)!.push(r)
  }

  const header = `# MyITProcess Alignment Worksheet for Claude Cowork

> Customer: **${companyName}**
> Standard: **${frameworkName}**
> Generated from compliance assessment on ${assessmentDate}${scorePercent !== null ? ` (score: ${scorePercent}%)` : ''}
> Total safeguards: ${rows.length} · Suggested answers: ${yesCount} Yes / ${noCount} No / ${naCount} N/A
> ${reviewNeeded} answer${reviewNeeded === 1 ? '' : 's'} flagged for engineer verification before submitting.

## Task for Claude Cowork

You are completing a compliance Alignment review in MyITProcess (a Kaseya MSP tool) on behalf of an engineer. The data below was generated from automated evidence collection (Microsoft 365, Datto RMM, Datto EDR, Domotz, etc.) and pre-mapped to the MyITProcess answer format.

### Before you start

1. Open MyITProcess in a browser tab. The user must already be logged in.
2. From the top nav, click **Alignment**.
3. Find the customer **${companyName}** and open the active alignment review for the **${frameworkName}** standard. The review may be titled something like "${companyName}, ${companyName}, ${frameworkName} Alignment - ..." — confirm with the user if multiple match.
4. The left sidebar lists categories with safeguard numbers (e.g. "1.1", "1.2"). Match those numbers to the safeguards below.

### How to answer each safeguard

For every row in the worksheet:

1. Click the safeguard in the left sidebar matching the **Safeguard #**.
2. Click the **Answer** radio button (Yes / No / N/A) shown below.
3. Click into the large notes/justification text area on the right side.
4. **Replace any existing text** with the **Justification** text shown below. Do not append.
5. Move to the next safeguard.

### When done

1. Verify the progress meter at the top of the left sidebar shows 100%.
2. **Do NOT click Submit Review.** Stop and report to the user. The engineer must verify the ${reviewNeeded} flagged answer${reviewNeeded === 1 ? '' : 's'} (marked with ⚠️ below) before submitting.

### Answer-mapping reference

This is how compliance findings were mapped to MyITProcess answers. If any row looks wrong to the engineer, they can edit the answer in MyITProcess after Cowork is done.

| Compliance status | MyITProcess answer | Notes |
|---|---|---|
| pass | Yes | Evidence supports the control |
| partial | Yes | Partial coverage — caveat in notes ⚠️ |
| fail | No | Evidence shows the control is not satisfied |
| needs_review | N/A | Engineer judgment needed ⚠️ |
| not_assessed | N/A | No evidence sources available ⚠️ |
| not_applicable | N/A | Control does not apply |
| collection_failed | N/A | Evidence collection error ⚠️ |

---

## Safeguards

`

  const sections: string[] = []
  for (const [category, catRows] of Array.from(byCategory.entries())) {
    sections.push(`### Category: ${category}\n`)
    for (const r of catRows) {
      const flag = r.needsHumanReview ? ' ⚠️' : ''
      sections.push(`#### ${r.safeguardNumber} — ${r.title}${flag}\n`)
      sections.push(`- **Tier**: ${r.tier}`)
      sections.push(`- **Question**: ${r.questionText}`)
      sections.push(`- **Answer**: **${r.answer}**`)
      sections.push(`- **Confidence**: ${r.confidence}${r.evidenceSources.length > 0 ? ` (sources: ${r.evidenceSources.join(', ')})` : ''}`)
      sections.push(`- **Justification** (paste this verbatim into the MyITProcess notes field):`)
      sections.push('  ```')
      // Indent each line by 2 spaces so it's inside the code fence under the bullet
      sections.push(`  ${r.justification.replace(/\n/g, '\n  ')}`)
      sections.push('  ```')
      sections.push('')
    }
  }

  return header + sections.join('\n') + '\n'
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
  const format = request.nextUrl.searchParams.get('format') ?? 'markdown'

  try {
    const summary = await getAssessmentSummary(assessmentId)
    if (!summary) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    const { assessment, findings, frameworkName } = summary
    const rows = buildWorksheetRows(findings)

    // Resolve company name for the worksheet header
    let companyName = 'this customer'
    try {
      const { getPool } = await import('@/lib/db-pool')
      const pool = getPool()
      const c = await pool.connect()
      try {
        const r = await c.query<{ displayName: string }>(
          `SELECT "displayName" FROM companies WHERE id = $1`,
          [assessment.companyId]
        )
        if (r.rows[0]) companyName = r.rows[0].displayName
      } finally {
        c.release()
      }
    } catch { /* fall back to placeholder */ }

    const scorePercent = assessment.totalControls > 0
      ? Math.round((assessment.passedControls / assessment.totalControls) * 100)
      : null

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        data: {
          companyName,
          frameworkName,
          assessmentId,
          assessmentDate: assessment.completedAt ?? assessment.createdAt,
          scorePercent,
          totalSafeguards: rows.length,
          rows,
        },
      })
    }

    const md = renderMarkdown({
      companyName,
      frameworkName,
      assessmentDate: new Date(assessment.completedAt ?? assessment.createdAt).toISOString().slice(0, 10),
      rows,
      scorePercent,
    })

    const filename = `myitp-cowork-worksheet-${companyName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${assessmentId.substring(0, 8)}.md`

    return new NextResponse(md, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[compliance/cowork-worksheet] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate worksheet' },
      { status: 500 }
    )
  }
}
