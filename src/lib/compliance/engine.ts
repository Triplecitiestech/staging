/**
 * Compliance Evidence Engine — Core Orchestrator
 *
 * Coordinates the full assessment lifecycle:
 *   1. Create assessment record
 *   2. Collect evidence from configured connectors
 *   3. Store evidence in DB
 *   4. Evaluate each control using framework evaluators
 *   5. Store findings in DB
 *   6. Update assessment summary stats
 *
 * All DB operations use raw pg (not Prisma) following the reporting/SOC pattern.
 */

import { getPool } from '@/lib/db-pool'
import type { PoolClient } from 'pg'
import { ensureComplianceTables } from './ensure-tables'
import { collectGraphEvidence } from './collectors/graph'
import { CIS_V8_FRAMEWORK, CIS_V8_EVALUATORS } from './frameworks/cis-v8'
import type {
  Assessment,
  AssessmentStatus,
  ConnectorState,
  ConnectorType,
  EvaluationContext,
  EvidenceRecord,
  EvidenceSourceType,
  Finding,
  FrameworkId,
  ComplianceDashboard,
  AssessmentSummary,
  CsvExportRow,
} from './types'

// ---------------------------------------------------------------------------
// Connector management
// ---------------------------------------------------------------------------

export async function getConnectors(companyId: string): Promise<ConnectorState[]> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<ConnectorState>(
      `SELECT id, "companyId", "connectorType", status, "lastCollectedAt", "errorMessage", "configRef"
       FROM compliance_connectors WHERE "companyId" = $1`,
      [companyId]
    )
    return res.rows
  } finally {
    client.release()
  }
}

export async function upsertConnector(
  companyId: string,
  connectorType: ConnectorType,
  status: string,
  errorMessage: string | null = null,
  configRef: string | null = null
): Promise<void> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO compliance_connectors ("companyId", "connectorType", status, "errorMessage", "configRef", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT ("companyId", "connectorType")
       DO UPDATE SET status = $3, "errorMessage" = $4, "configRef" = $5, "updatedAt" = NOW()`,
      [companyId, connectorType, status, errorMessage, configRef]
    )
  } finally {
    client.release()
  }
}

/** Auto-detect connector status from existing company credentials */
export async function detectConnectors(companyId: string): Promise<ConnectorState[]> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Check M365 credentials
    const m365 = await client.query<{
      m365_tenant_id: string | null
      m365_client_id: string | null
      m365_setup_status: string | null
    }>(
      `SELECT m365_tenant_id, m365_client_id, m365_setup_status FROM companies WHERE id = $1`,
      [companyId]
    )

    if (m365.rows.length > 0) {
      const row = m365.rows[0]
      if (row.m365_tenant_id && row.m365_client_id) {
        const status = row.m365_setup_status === 'verified' ? 'verified' : 'configured'
        await upsertConnector(companyId, 'microsoft_graph', status, null, 'company.m365_*')
      }
    }

    // Return all connectors for this company
    return getConnectors(companyId)
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Assessment lifecycle
// ---------------------------------------------------------------------------

export async function createAssessment(
  companyId: string,
  frameworkId: FrameworkId,
  createdBy: string
): Promise<string> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const framework = getFrameworkDefinition(frameworkId)
    const res = await client.query<{ id: string }>(
      `INSERT INTO compliance_assessments ("companyId", "frameworkId", status, "createdBy", "totalControls")
       VALUES ($1, $2, 'draft', $3, $4) RETURNING id`,
      [companyId, frameworkId, createdBy, framework.controls.length]
    )
    const assessmentId = res.rows[0].id

    // Audit log
    await logAudit(client, companyId, assessmentId, 'assessment_created', createdBy, {
      frameworkId,
      totalControls: framework.controls.length,
    })

    return assessmentId
  } finally {
    client.release()
  }
}

export async function getAssessment(assessmentId: string): Promise<Assessment | null> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<Assessment>(
      `SELECT id, "companyId", "frameworkId", status, "createdAt", "completedAt",
              "createdBy", "totalControls", "passedControls", "failedControls", "manualReviewControls"
       FROM compliance_assessments WHERE id = $1`,
      [assessmentId]
    )
    return res.rows[0] ?? null
  } finally {
    client.release()
  }
}

export async function listAssessments(companyId: string): Promise<Assessment[]> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<Assessment>(
      `SELECT id, "companyId", "frameworkId", status, "createdAt", "completedAt",
              "createdBy", "totalControls", "passedControls", "failedControls", "manualReviewControls"
       FROM compliance_assessments WHERE "companyId" = $1 ORDER BY "createdAt" DESC`,
      [companyId]
    )
    return res.rows
  } finally {
    client.release()
  }
}

async function updateAssessmentStatus(
  client: PoolClient,
  assessmentId: string,
  status: AssessmentStatus
): Promise<void> {
  const completedAt = status === 'complete' ? 'NOW()' : 'NULL'
  await client.query(
    `UPDATE compliance_assessments SET status = $1, "completedAt" = ${completedAt} WHERE id = $2`,
    [status, assessmentId]
  )
}

// ---------------------------------------------------------------------------
// Evidence persistence
// ---------------------------------------------------------------------------

async function storeEvidence(
  client: PoolClient,
  records: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>
): Promise<EvidenceRecord[]> {
  const stored: EvidenceRecord[] = []
  for (const rec of records) {
    const res = await client.query<{ id: string; collectedAt: string }>(
      `INSERT INTO compliance_evidence ("assessmentId", "companyId", "sourceType", "rawData", summary, "validForHours")
       VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING id, "collectedAt"`,
      [rec.assessmentId, rec.companyId, rec.sourceType, JSON.stringify(rec.rawData), rec.summary, rec.validForHours]
    )
    stored.push({
      ...rec,
      id: res.rows[0].id,
      collectedAt: res.rows[0].collectedAt,
    })
  }
  return stored
}

// ---------------------------------------------------------------------------
// Finding persistence
// ---------------------------------------------------------------------------

async function storeFindings(
  client: PoolClient,
  assessmentId: string,
  findings: Array<Omit<Finding, 'id'>>
): Promise<void> {
  for (const f of findings) {
    await client.query(
      `INSERT INTO compliance_findings (
        "assessmentId", "controlId", status, confidence, reasoning,
        "evidenceIds", "missingEvidence", remediation
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       ON CONFLICT ("assessmentId", "controlId")
       DO UPDATE SET status = $3, confidence = $4, reasoning = $5,
         "evidenceIds" = $6::jsonb, "missingEvidence" = $7::jsonb, remediation = $8, "evaluatedAt" = NOW()`,
      [
        assessmentId, f.controlId, f.status, f.confidence, f.reasoning,
        JSON.stringify(f.evidenceIds), JSON.stringify(f.missingEvidence), f.remediation,
      ]
    )
  }
}

export async function getFindings(assessmentId: string): Promise<Finding[]> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<Finding>(
      `SELECT id, "assessmentId", "controlId", status, confidence, reasoning,
              "evidenceIds", "missingEvidence", remediation, "evaluatedAt",
              "overrideStatus", "overrideReason", "overrideBy", "overrideAt"
       FROM compliance_findings WHERE "assessmentId" = $1
       ORDER BY "controlId"`,
      [assessmentId]
    )
    return res.rows
  } finally {
    client.release()
  }
}

export async function getEvidence(assessmentId: string): Promise<EvidenceRecord[]> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<EvidenceRecord>(
      `SELECT id, "assessmentId", "companyId", "sourceType", "rawData", summary, "collectedAt", "validForHours"
       FROM compliance_evidence WHERE "assessmentId" = $1 ORDER BY "collectedAt" DESC`,
      [assessmentId]
    )
    return res.rows
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Override a finding
// ---------------------------------------------------------------------------

export async function overrideFinding(
  findingId: string,
  overrideStatus: string,
  overrideReason: string,
  overrideBy: string
): Promise<void> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Get the finding to find assessment for audit log
    const finding = await client.query<{ assessmentId: string; controlId: string }>(
      `SELECT "assessmentId", "controlId" FROM compliance_findings WHERE id = $1`,
      [findingId]
    )
    if (finding.rows.length === 0) throw new Error('Finding not found')

    await client.query(
      `UPDATE compliance_findings
       SET "overrideStatus" = $1, "overrideReason" = $2, "overrideBy" = $3, "overrideAt" = NOW()
       WHERE id = $4`,
      [overrideStatus, overrideReason, overrideBy, findingId]
    )

    // Get companyId from assessment
    const assessment = await client.query<{ companyId: string }>(
      `SELECT "companyId" FROM compliance_assessments WHERE id = $1`,
      [finding.rows[0].assessmentId]
    )
    if (assessment.rows[0]) {
      await logAudit(client, assessment.rows[0].companyId, finding.rows[0].assessmentId, 'finding_overridden', overrideBy, {
        findingId,
        controlId: finding.rows[0].controlId,
        overrideStatus,
        overrideReason,
      })
    }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Run a full assessment
// ---------------------------------------------------------------------------

export async function runAssessment(assessmentId: string, actor: string): Promise<{
  success: boolean
  errors: string[]
  summary: { passed: number; failed: number; partial: number; notAssessed: number }
}> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()

  try {
    // Load assessment
    const assessmentRes = await client.query<Assessment>(
      `SELECT id, "companyId", "frameworkId", status FROM compliance_assessments WHERE id = $1`,
      [assessmentId]
    )
    if (assessmentRes.rows.length === 0) throw new Error('Assessment not found')
    const assessment = assessmentRes.rows[0]

    // Update status to collecting
    await updateAssessmentStatus(client, assessmentId, 'collecting')
    await logAudit(client, assessment.companyId, assessmentId, 'collection_started', actor, {})

    // Collect evidence
    const collectionErrors: string[] = []
    const allEvidence: EvidenceRecord[] = []

    // Microsoft Graph collector
    const graphResult = await collectGraphEvidence(assessment.companyId, assessmentId)
    collectionErrors.push(...graphResult.errors)

    // Store evidence
    if (graphResult.evidence.length > 0) {
      const stored = await storeEvidence(client, graphResult.evidence)
      allEvidence.push(...stored)
    }

    await logAudit(client, assessment.companyId, assessmentId, 'collection_completed', actor, {
      evidenceCount: allEvidence.length,
      errors: collectionErrors,
    })

    // Build evidence map for evaluation
    const evidenceMap = new Map<EvidenceSourceType, EvidenceRecord>()
    for (const ev of allEvidence) {
      evidenceMap.set(ev.sourceType as EvidenceSourceType, ev)
    }

    // Update status to evaluating
    await updateAssessmentStatus(client, assessmentId, 'evaluating')

    // Evaluate controls
    const framework = getFrameworkDefinition(assessment.frameworkId as FrameworkId)
    const evaluators = getEvaluators(assessment.frameworkId as FrameworkId)
    const ctx: EvaluationContext = {
      companyId: assessment.companyId,
      assessmentId,
      evidence: evidenceMap,
    }

    const findings: Array<Omit<Finding, 'id'>> = []
    for (const control of framework.controls) {
      const evaluator = evaluators[control.controlId]
      if (evaluator) {
        const evalResult = evaluator(ctx)
        findings.push({
          assessmentId,
          controlId: evalResult.controlId,
          status: evalResult.status,
          confidence: evalResult.confidence,
          reasoning: evalResult.reasoning,
          evidenceIds: evalResult.evidenceIds,
          missingEvidence: evalResult.missingEvidence,
          remediation: evalResult.remediation,
          evaluatedAt: new Date().toISOString(),
          overrideStatus: null,
          overrideReason: null,
          overrideBy: null,
          overrideAt: null,
        })
      } else {
        findings.push({
          assessmentId,
          controlId: control.controlId,
          status: 'not_assessed',
          confidence: 'none',
          reasoning: 'No evaluator available for this control.',
          evidenceIds: [],
          missingEvidence: control.evidenceSources,
          remediation: null,
          evaluatedAt: new Date().toISOString(),
          overrideStatus: null,
          overrideReason: null,
          overrideBy: null,
          overrideAt: null,
        })
      }
    }

    // Store findings
    await storeFindings(client, assessmentId, findings)

    // Compute summary stats
    const passed = findings.filter((f) => f.status === 'pass').length
    const failed = findings.filter((f) => f.status === 'fail').length
    const partial = findings.filter((f) => f.status === 'partial').length
    const notAssessed = findings.filter((f) => f.status === 'not_assessed' || f.status === 'not_applicable').length

    await client.query(
      `UPDATE compliance_assessments
       SET status = 'complete', "completedAt" = NOW(),
           "passedControls" = $1, "failedControls" = $2, "manualReviewControls" = $3
       WHERE id = $4`,
      [passed, failed, partial + notAssessed, assessmentId]
    )

    await logAudit(client, assessment.companyId, assessmentId, 'assessment_completed', actor, {
      passed, failed, partial, notAssessed,
    })

    return {
      success: true,
      errors: collectionErrors,
      summary: { passed, failed, partial, notAssessed },
    }
  } catch (err) {
    // Mark assessment as error
    try {
      await client.query(
        `UPDATE compliance_assessments SET status = 'error' WHERE id = $1`,
        [assessmentId]
      )
    } catch { /* ignore */ }

    throw err
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Dashboard / summary helpers
// ---------------------------------------------------------------------------

export async function getComplianceDashboard(companyId: string): Promise<ComplianceDashboard> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Get company name
    const companyRes = await client.query<{ displayName: string }>(
      `SELECT "displayName" FROM companies WHERE id = $1`,
      [companyId]
    )
    const companyName = companyRes.rows[0]?.displayName ?? 'Unknown'

    // Get connectors
    const connectors = await getConnectors(companyId)

    // Get assessments
    const assessments = await listAssessments(companyId)

    // Latest score
    const latest = assessments.find((a) => a.status === 'complete')
    let latestScorePercent: number | null = null
    if (latest && latest.totalControls > 0) {
      latestScorePercent = Math.round((latest.passedControls / latest.totalControls) * 100)
    }

    return { companyId, companyName, connectors, assessments, latestScorePercent }
  } finally {
    client.release()
  }
}

export async function getAssessmentSummary(assessmentId: string): Promise<AssessmentSummary | null> {
  const assessment = await getAssessment(assessmentId)
  if (!assessment) return null

  const findings = await getFindings(assessmentId)
  const framework = getFrameworkDefinition(assessment.frameworkId as FrameworkId)

  return {
    assessment,
    findings,
    frameworkName: framework.name,
  }
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

export async function exportAssessmentCsv(assessmentId: string): Promise<string> {
  const summary = await getAssessmentSummary(assessmentId)
  if (!summary) throw new Error('Assessment not found')

  const framework = getFrameworkDefinition(summary.assessment.frameworkId as FrameworkId)
  const controlMap = new Map(framework.controls.map((c) => [c.controlId, c]))

  const rows: CsvExportRow[] = summary.findings.map((f) => {
    const ctrl = controlMap.get(f.controlId)
    return {
      controlId: f.controlId,
      category: ctrl?.category ?? '',
      title: ctrl?.title ?? '',
      status: (f.overrideStatus ?? f.status).toUpperCase(),
      confidence: f.confidence,
      reasoning: f.reasoning,
      evidenceSources: ctrl?.evidenceSources?.join('; ') ?? '',
      missingEvidence: Array.isArray(f.missingEvidence) ? (f.missingEvidence as string[]).join('; ') : '',
      remediation: f.remediation ?? '',
      overrideStatus: f.overrideStatus ?? '',
      overrideReason: f.overrideReason ?? '',
    }
  })

  // Build CSV
  const headers = [
    'Control ID', 'Category', 'Title', 'Status', 'Confidence',
    'Reasoning', 'Evidence Sources', 'Missing Evidence',
    'Remediation', 'Override Status', 'Override Reason',
  ]

  const csvLines = [headers.join(',')]
  for (const row of rows) {
    csvLines.push([
      csvEscape(row.controlId),
      csvEscape(row.category),
      csvEscape(row.title),
      csvEscape(row.status),
      csvEscape(row.confidence),
      csvEscape(row.reasoning),
      csvEscape(row.evidenceSources),
      csvEscape(row.missingEvidence),
      csvEscape(row.remediation),
      csvEscape(row.overrideStatus),
      csvEscape(row.overrideReason),
    ].join(','))
  }

  return csvLines.join('\n')
}

function csvEscape(val: string): string {
  if (!val) return '""'
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

async function logAudit(client: PoolClient, companyId: string, assessmentId: string | null, action: string, actor: string, details: Record<string, unknown>): Promise<void> {
  try {
    await client.query(
      `INSERT INTO compliance_audit_log ("companyId", "assessmentId", action, actor, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [companyId, assessmentId, action, actor, JSON.stringify(details)]
    )
  } catch {
    // Audit log failures should not block operations
    console.error('[compliance] Failed to write audit log', { companyId, action })
  }
}

// ---------------------------------------------------------------------------
// Framework registry
// ---------------------------------------------------------------------------

function getFrameworkDefinition(frameworkId: FrameworkId) {
  switch (frameworkId) {
    case 'cis-v8':
      return CIS_V8_FRAMEWORK
    default:
      throw new Error(`Framework ${frameworkId} not yet implemented`)
  }
}

function getEvaluators(frameworkId: FrameworkId): Record<string, (ctx: EvaluationContext) => import('./types').EvaluationResult> {
  switch (frameworkId) {
    case 'cis-v8':
      return CIS_V8_EVALUATORS
    default:
      return {}
  }
}

export { getFrameworkDefinition }
