/**
 * Assessment PDF Report Generator
 *
 * Server-side PDF render of a single compliance assessment. Produced
 * by `/api/compliance/assessments/[id]/report.pdf` and downloaded by
 * the operator from the findings page. Contents:
 *
 *   1. Cover page — customer name, framework, assessment date, score
 *   2. Executive summary — counters + score trend (vs previous)
 *   3. Per-control findings — sorted by control id, grouped by family,
 *      each with engine result, reviewer override, reasoning, missing
 *      evidence, suggested remediation, disposition state
 *   4. Appendix — applied tool deployment list, customer-profile env,
 *      audit footer
 *
 * Uses pdfkit (pure Node, no Chromium dependency) — same shape as the
 * .docx renderer that handles policy downloads.
 */

import PDFDocument from 'pdfkit'
import type { AssessmentSummary, Finding, FindingStatus } from '@/lib/compliance/types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AssessmentReportInput {
  companyName: string
  frameworkName: string
  summary: AssessmentSummary
  /** controlId → { title, description, family } from the framework definition. */
  controlMeta: Map<string, { title: string; description: string; category?: string }>
  /** Optional disposition lookup, keyed by controlId. */
  dispositionByControlId: Map<string, {
    lifecycleStatus: string | null
    acceptedRiskRationale: string | null
    internalNotes: string | null
    decisionBy: string | null
    decidedAt: string | null
  }>
  /** Who generated the report — printed in the footer. */
  generatedBy: string
}

/**
 * Render an assessment report to a PDF buffer. Caller streams it back
 * to the browser with the appropriate Content-Type.
 */
export async function renderAssessmentReportPdf(input: AssessmentReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: {
        Title: `${input.companyName} — ${input.frameworkName} Assessment`,
        Author: 'Triple Cities Tech',
        Subject: 'Compliance assessment report',
        Creator: 'TCT Compliance Workflow',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    try {
      renderCover(doc, input)
      doc.addPage()
      renderExecutiveSummary(doc, input)
      doc.addPage()
      renderFindings(doc, input)
      doc.addPage()
      renderAppendix(doc, input)
      renderFooter(doc, input)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderCover(doc: PDFKit.PDFDocument, input: AssessmentReportInput): void {
  const completedAt = input.summary.assessment.completedAt
    ? new Date(input.summary.assessment.completedAt)
    : new Date(input.summary.assessment.createdAt)
  const score = computeScore(input.summary.findings)

  doc.moveDown(4)
  doc.fontSize(10).fillColor('#475569').text('COMPLIANCE ASSESSMENT REPORT', { align: 'left' })
  doc.moveDown(1)
  doc.fontSize(28).fillColor('#0f172a').text(input.companyName, { align: 'left' })
  doc.moveDown(0.3)
  doc.fontSize(16).fillColor('#475569').text(input.frameworkName, { align: 'left' })

  doc.moveDown(3)
  // Score callout box
  const x = doc.x
  const y = doc.y
  doc.roundedRect(x, y, 250, 90, 6).fillAndStroke('#f0f9ff', '#bae6fd')
  doc.fillColor('#0c4a6e').fontSize(10).text('OVERALL SCORE', x + 16, y + 14)
  doc.fontSize(36).fillColor('#0c4a6e').text(`${score.percentage}%`, x + 16, y + 28)
  doc.fontSize(10).fillColor('#075985').text(
    `${score.passed} / ${score.totalScored} controls satisfied`,
    x + 16, y + 70
  )

  doc.y = y + 110
  doc.moveDown(1.5)
  doc.fontSize(10).fillColor('#475569')
  doc.text(`Assessment date:  ${completedAt.toLocaleDateString()} ${completedAt.toLocaleTimeString()}`)
  doc.text(`Created by:       ${input.summary.assessment.createdBy}`)
  doc.text(`Total controls:   ${input.summary.findings.length}`)
  doc.text(`Report generated: ${new Date().toLocaleString()} by ${input.generatedBy}`)
}

function renderExecutiveSummary(doc: PDFKit.PDFDocument, input: AssessmentReportInput): void {
  sectionHeader(doc, 'Executive Summary')

  const counts = countByStatus(input.summary.findings)
  const score = computeScore(input.summary.findings)

  doc.fontSize(11).fillColor('#0f172a').text(
    `This assessment evaluated ${input.summary.findings.length} controls in the ${input.frameworkName} framework. ` +
    `${score.passed} are fully satisfied (${score.percentage}% of in-scope controls), ` +
    `${counts.fail + counts.partial} have gaps requiring attention, ` +
    `${counts.needs_review + counts.collection_failed + counts.not_assessed} need reviewer action to determine status, ` +
    `and ${counts.not_applicable} were excluded from scope by environment or policy.`,
    { align: 'left' }
  )

  doc.moveDown(1.5)

  // Status breakdown table
  const labels: Array<[FindingStatus | 'overridden', string, string]> = [
    ['pass', 'Pass', '#15803d'],
    ['partial', 'Partial', '#7e22ce'],
    ['fail', 'Fail', '#b91c1c'],
    ['needs_review', 'Needs review', '#0891b2'],
    ['not_applicable', 'Not applicable', '#475569'],
    ['not_assessed', 'Not assessed', '#475569'],
    ['collection_failed', 'Collection failed', '#9f1239'],
    ['overridden', 'Includes manual overrides', '#7e22ce'],
  ]
  const overrideCount = input.summary.findings.filter((f) => f.overrideStatus !== null).length
  for (const [status, label, color] of labels) {
    const count = status === 'overridden' ? overrideCount : counts[status as FindingStatus]
    if (count === 0) continue
    const x = doc.x
    const y = doc.y
    doc.roundedRect(x, y, 12, 12, 2).fillAndStroke(color, color)
    doc.fontSize(10).fillColor('#0f172a').text(`  ${label}`, x + 16, y, { continued: true })
    doc.fillColor('#475569').text(`  —  ${count}`)
    doc.moveDown(0.4)
  }

  // Comparison vs previous assessment, if present
  if (input.summary.comparison) {
    const cmp = input.summary.comparison
    doc.moveDown(1)
    doc.fontSize(11).fillColor('#0f172a').text('Change since previous assessment', { underline: false })
    doc.moveDown(0.3)
    doc.fontSize(10).fillColor('#475569')
    if (cmp.newlyPassed.length > 0) doc.text(`  +${cmp.newlyPassed.length} newly passing`)
    if (cmp.newlyFailed.length > 0) doc.text(`  -${cmp.newlyFailed.length} newly failing`)
    if (cmp.unchanged.length > 0) doc.text(`  ${cmp.unchanged.length} unchanged`)
  }
}

function renderFindings(doc: PDFKit.PDFDocument, input: AssessmentReportInput): void {
  sectionHeader(doc, 'Findings')

  // Group findings by control family (first segment after the framework prefix).
  const groups = groupFindingsByFamily(input.summary.findings, input.controlMeta)

  for (const [family, findings] of groups) {
    if (doc.y > 680) doc.addPage()
    doc.moveDown(0.5)
    doc.fontSize(13).fillColor('#0f172a').text(family, { align: 'left' })
    doc.moveDown(0.3)
    doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(doc.x, doc.y).lineTo(doc.x + 480, doc.y).stroke()
    doc.moveDown(0.5)

    for (const f of findings) {
      renderFindingBlock(doc, f, input)
    }
  }
}

function renderFindingBlock(
  doc: PDFKit.PDFDocument,
  f: Finding,
  input: AssessmentReportInput
): void {
  // Force a page break if we're too close to the bottom to fit a meaningful chunk.
  if (doc.y > 680) doc.addPage()

  const meta = input.controlMeta.get(f.controlId) ?? input.controlMeta.get(stripPrefix(f.controlId))
  const title = meta?.title ?? f.controlId
  const effectiveStatus = (f.overrideStatus ?? f.status) as FindingStatus
  const statusLabel = STATUS_LABEL[effectiveStatus] ?? effectiveStatus
  const statusColor = STATUS_COLOR[effectiveStatus] ?? '#475569'

  // Status pill + control id + title
  const startY = doc.y
  doc.roundedRect(doc.x, startY, 70, 16, 3).fillAndStroke(statusColor, statusColor)
  doc.fillColor('#ffffff').fontSize(9).text(statusLabel, doc.x + 4, startY + 4, { width: 62, align: 'center' })

  doc.fillColor('#0f172a').fontSize(11).text(
    `  ${stripPrefix(f.controlId)}  ${title}`,
    doc.x + 76,
    startY + 2,
    { width: 410 }
  )
  doc.y = Math.max(doc.y, startY + 22)
  doc.x = 60  // reset to left margin

  // If overridden, note who/when below the title.
  if (f.overrideStatus !== null) {
    doc.fontSize(8).fillColor('#7e22ce').text(
      `Analyst Attestation (engine said ${f.status}). By ${f.overrideBy ?? 'unknown'} on ${
        f.overrideAt ? new Date(f.overrideAt).toLocaleString() : ''
      }.`,
      { align: 'left' }
    )
    if (f.overrideReason) {
      doc.fontSize(9).fillColor('#475569').text(`  "${f.overrideReason}"`, { width: 480 })
    }
    doc.moveDown(0.3)
  }

  // Control description
  if (meta?.description) {
    doc.fontSize(8).fillColor('#64748b').text('CONTROL REQUIREMENT', { width: 480 })
    doc.fontSize(9).fillColor('#0f172a').text(meta.description, { width: 480 })
    doc.moveDown(0.3)
  }

  // Engine reasoning
  doc.fontSize(8).fillColor('#64748b').text('ASSESSMENT RESULT', { width: 480 })
  doc.fontSize(9).fillColor('#0f172a').text(f.reasoning || '(no reasoning recorded)', { width: 480 })
  doc.moveDown(0.3)

  // Missing evidence
  if (f.missingEvidence.length > 0) {
    doc.fontSize(8).fillColor('#64748b').text('MISSING EVIDENCE', { width: 480 })
    doc.fontSize(9).fillColor('#0f172a').text(`  ${f.missingEvidence.join(', ')}`, { width: 480 })
    doc.moveDown(0.3)
  }

  // Suggested remediation
  if (f.remediation) {
    doc.fontSize(8).fillColor('#64748b').text('SUGGESTED REMEDIATION', { width: 480 })
    doc.fontSize(9).fillColor('#0369a1').text(f.remediation, { width: 480 })
    doc.moveDown(0.3)
  }

  // Disposition (workflow state) if set
  const disp = input.dispositionByControlId.get(f.controlId)
    ?? input.dispositionByControlId.get(stripPrefix(f.controlId))
  if (disp?.lifecycleStatus && disp.lifecycleStatus !== 'open') {
    doc.fontSize(8).fillColor('#64748b').text('DISPOSITION', { width: 480 })
    doc.fontSize(9).fillColor('#7e22ce').text(
      `  ${disp.lifecycleStatus.replace(/_/g, ' ')}${disp.decisionBy ? ` (by ${disp.decisionBy})` : ''}`,
      { width: 480 }
    )
    if (disp.acceptedRiskRationale) {
      doc.fontSize(8).fillColor('#475569').text(`  Rationale: ${disp.acceptedRiskRationale}`, { width: 480 })
    }
    doc.moveDown(0.3)
  }

  doc.moveDown(0.8)
  // Subtle separator between findings.
  doc.strokeColor('#e2e8f0').lineWidth(0.3).moveTo(doc.x, doc.y).lineTo(doc.x + 480, doc.y).stroke()
  doc.moveDown(0.5)
}

function renderAppendix(doc: PDFKit.PDFDocument, input: AssessmentReportInput): void {
  sectionHeader(doc, 'Appendix')
  doc.fontSize(10).fillColor('#475569').text(
    'This report was generated automatically from the customer\'s ' +
    'collected evidence + reviewer overrides + dispositions on record at the ' +
    'time of export. Re-running the assessment will refresh the underlying data; ' +
    'reviewer overrides persist across reassessments and disposition state is ' +
    'tracked separately on a per-control basis.'
  )
  doc.moveDown(0.5)
  doc.fontSize(10).fillColor('#0f172a').text(`Assessment id: ${input.summary.assessment.id}`)
  doc.text(`Framework id:  ${input.summary.assessment.frameworkId}`)
  doc.text(`Company id:    ${input.summary.assessment.companyId}`)
}

function renderFooter(doc: PDFKit.PDFDocument, input: AssessmentReportInput): void {
  const range = doc.bufferedPageRange()
  const totalPages = range.count
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(range.start + i)
    const bottom = doc.page.height - 40
    doc.fontSize(8).fillColor('#94a3b8').text(
      `${input.companyName} · ${input.frameworkName} · Page ${i + 1} of ${totalPages} · Generated by Triple Cities Tech`,
      60, bottom, { width: doc.page.width - 120, align: 'center' }
    )
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL: Partial<Record<FindingStatus, string>> = {
  pass: 'PASS',
  partial: 'PARTIAL',
  fail: 'FAIL',
  needs_review: 'REVIEW',
  not_applicable: 'N/A',
  not_assessed: 'NOT ASSESSED',
  collection_failed: 'COLLECT FAIL',
}

const STATUS_COLOR: Partial<Record<FindingStatus, string>> = {
  pass: '#15803d',
  partial: '#7e22ce',
  fail: '#b91c1c',
  needs_review: '#0891b2',
  not_applicable: '#475569',
  not_assessed: '#64748b',
  collection_failed: '#9f1239',
}

function sectionHeader(doc: PDFKit.PDFDocument, label: string): void {
  doc.fontSize(20).fillColor('#0f172a').text(label, { align: 'left' })
  doc.moveDown(0.3)
  doc.strokeColor('#0ea5e9').lineWidth(2).moveTo(doc.x, doc.y).lineTo(doc.x + 80, doc.y).stroke()
  doc.moveDown(1)
}

function computeScore(findings: Finding[]): { passed: number; totalScored: number; percentage: number } {
  let passed = 0
  let totalScored = 0
  for (const f of findings) {
    const effective = (f.overrideStatus ?? f.status) as FindingStatus
    if (effective === 'not_applicable' || effective === 'not_assessed') continue
    totalScored++
    if (effective === 'pass') passed++
  }
  const percentage = totalScored > 0 ? Math.round((passed / totalScored) * 100) : 0
  return { passed, totalScored, percentage }
}

function countByStatus(findings: Finding[]): Record<FindingStatus, number> {
  const counts: Record<FindingStatus, number> = {
    pass: 0, fail: 0, partial: 0, needs_review: 0,
    not_assessed: 0, not_applicable: 0, collection_failed: 0,
  }
  for (const f of findings) {
    const effective = (f.overrideStatus ?? f.status) as FindingStatus
    counts[effective] = (counts[effective] ?? 0) + 1
  }
  return counts
}

function stripPrefix(controlId: string): string {
  return controlId.replace(/^[a-z]+-[a-z0-9]+-/, '')
}

function groupFindingsByFamily(
  findings: Finding[],
  controlMeta: Map<string, { title: string; description: string; category?: string }>
): Array<[string, Finding[]]> {
  const groups = new Map<string, Finding[]>()
  for (const f of findings) {
    const meta = controlMeta.get(f.controlId) ?? controlMeta.get(stripPrefix(f.controlId))
    const family = meta?.category ?? deriveFamily(f.controlId)
    if (!groups.has(family)) groups.set(family, [])
    groups.get(family)!.push(f)
  }
  // Sort each family by control id numerically, then return families in
  // alphabetical order.
  groups.forEach((arr) => {
    arr.sort((a, b) => stripPrefix(a.controlId).localeCompare(stripPrefix(b.controlId), undefined, { numeric: true }))
  })
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
}

function deriveFamily(controlId: string): string {
  // Best-effort family name from the control id stem. "cis-v8-4.1" → "4.x"
  const short = stripPrefix(controlId)
  const head = short.split(/[.-]/)[0]
  return head ? `${head}.x` : 'Other'
}
