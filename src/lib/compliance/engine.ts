/**
 * Compliance Evidence Engine — Core Orchestrator
 *
 * Coordinates the full assessment lifecycle:
 *   1. Create assessment record
 *   2. Collect evidence from ALL configured connectors
 *   3. Store evidence in DB
 *   4. Evaluate each control using framework evaluators
 *   5. Store findings in DB
 *   6. Update assessment summary stats
 *   7. Compute historical comparison
 *
 * All DB operations use raw pg (not Prisma) following the reporting/SOC pattern.
 */

import { getPool } from '@/lib/db-pool'
import type { PoolClient } from 'pg'
import { ensureComplianceTables } from './ensure-tables'
import { collectGraphEvidence } from './collectors/graph'
import { collectDattoRmmEvidence, collectDattoBcdrEvidence, collectDnsFilterEvidence, collectDomotzEvidence, collectItGlueEvidence, collectSaasAlertsEvidence, collectUbiquitiEvidence } from './collectors/msp'
import { CIS_V8_FRAMEWORK, CIS_V8_EVALUATORS } from './frameworks/cis-v8'
import {
  compareControlIds,
  EVIDENCE_TO_CONNECTOR,
} from './types'
import { resolveAllControls } from './registry/resolver'
import type {
  Assessment,
  AssessmentStatus,
  AssessmentComparison,
  ConnectorState,
  ConnectorType,
  EnvironmentContext,
  EvaluationContext,
  EvidenceRecord,
  EvidenceSourceType,
  Finding,
  FindingStatus,
  FrameworkId,
  ComplianceDashboard,
  AssessmentSummary,
  CsvExportRow,
  ToolDeployment,
} from './types'

// ---------------------------------------------------------------------------
// Sorting utility
// ---------------------------------------------------------------------------

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => compareControlIds(a.controlId, b.controlId))
}

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

/**
 * Auto-detect connector status from existing company data and MSP-level env vars.
 */
export async function detectConnectors(companyId: string): Promise<ConnectorState[]> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const company = await client.query<{
      m365_tenant_id: string | null
      m365_client_id: string | null
      m365_setup_status: string | null
      "autotaskCompanyId": string | null
    }>(
      `SELECT m365_tenant_id, m365_client_id, m365_setup_status, "autotaskCompanyId"
       FROM companies WHERE id = $1`,
      [companyId]
    )

    if (company.rows.length === 0) return getConnectors(companyId)
    const row = company.rows[0]

    if (row.m365_tenant_id && row.m365_client_id) {
      const status = row.m365_setup_status === 'verified' ? 'verified' : 'configured'
      await upsertConnector(companyId, 'microsoft_graph', status, null, 'company.m365_*')
    }

    if (row.autotaskCompanyId) {
      await upsertConnector(companyId, 'autotask', 'verified', null, 'company.autotaskCompanyId')
    } else if (process.env.AUTOTASK_API_USERNAME) {
      await upsertConnector(companyId, 'autotask', 'available', 'Company not synced from Autotask', 'env.AUTOTASK_API_*')
    }

    // MSP-level integrations — if env vars are configured, they're connected
    // (customer data matched by name at collection time)
    if (process.env.DATTO_RMM_API_KEY && process.env.DATTO_RMM_API_SECRET) {
      await upsertConnector(companyId, 'datto_rmm', 'verified', null, 'env.DATTO_RMM_*')
    }
    if (process.env.DATTO_EDR_API_TOKEN) {
      await upsertConnector(companyId, 'datto_edr', 'verified', null, 'env.DATTO_EDR_*')
    }
    if (process.env.DATTO_BCDR_PUBLIC_KEY && process.env.DATTO_BCDR_PRIVATE_KEY) {
      await upsertConnector(companyId, 'datto_bcdr', 'verified', null, 'env.DATTO_BCDR_*')
    }
    if (process.env.DNSFILTER_API_TOKEN) {
      await upsertConnector(companyId, 'dnsfilter', 'verified', null, 'env.DNSFILTER_*')
    }
    if (process.env.DOMOTZ_API_KEY && process.env.DOMOTZ_API_URL) {
      await upsertConnector(companyId, 'domotz', 'verified', null, 'env.DOMOTZ_*')
    }
    if (process.env.IT_GLUE_API_KEY) {
      await upsertConnector(companyId, 'it_glue', 'verified', null, 'env.IT_GLUE_*')
    }
    if (process.env.SAAS_ALERTS_API_KEY) {
      await upsertConnector(companyId, 'saas_alerts', 'verified', null, 'env.SAAS_ALERTS_*')
    }
    if (process.env.UBIQUITI_API_KEY) {
      await upsertConnector(companyId, 'ubiquiti', 'verified', null, 'env.UBIQUITI_*')
    }

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
    await logAudit(client, companyId, assessmentId, 'assessment_created', createdBy, {
      frameworkId, totalControls: framework.controls.length,
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

async function updateAssessmentStatus(client: PoolClient, assessmentId: string, status: AssessmentStatus): Promise<void> {
  const completedAt = status === 'complete' ? 'NOW()' : 'NULL'
  await client.query(
    `UPDATE compliance_assessments SET status = $1, "completedAt" = ${completedAt} WHERE id = $2`,
    [status, assessmentId]
  )
}

// ---------------------------------------------------------------------------
// Evidence persistence
// ---------------------------------------------------------------------------

async function storeEvidence(client: PoolClient, records: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>): Promise<EvidenceRecord[]> {
  const stored: EvidenceRecord[] = []
  for (const rec of records) {
    const res = await client.query<{ id: string; collectedAt: string }>(
      `INSERT INTO compliance_evidence ("assessmentId", "companyId", "sourceType", "rawData", summary, "validForHours")
       VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING id, "collectedAt"`,
      [rec.assessmentId, rec.companyId, rec.sourceType, JSON.stringify(rec.rawData), rec.summary, rec.validForHours]
    )
    stored.push({ ...rec, id: res.rows[0].id, collectedAt: res.rows[0].collectedAt })
  }
  return stored
}

// ---------------------------------------------------------------------------
// Finding persistence
// ---------------------------------------------------------------------------

async function storeFindings(client: PoolClient, assessmentId: string, findings: Array<Omit<Finding, 'id'>>): Promise<void> {
  for (const f of findings) {
    await client.query(
      `INSERT INTO compliance_findings (
        "assessmentId", "controlId", status, confidence, reasoning,
        "evidenceIds", "missingEvidence", remediation
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       ON CONFLICT ("assessmentId", "controlId")
       DO UPDATE SET status = $3, confidence = $4, reasoning = $5,
         "evidenceIds" = $6::jsonb, "missingEvidence" = $7::jsonb, remediation = $8, "evaluatedAt" = NOW()`,
      [assessmentId, f.controlId, f.status, f.confidence, f.reasoning,
        JSON.stringify(f.evidenceIds), JSON.stringify(f.missingEvidence), f.remediation]
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
       FROM compliance_findings WHERE "assessmentId" = $1`,
      [assessmentId]
    )
    return sortFindings(res.rows)
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
  findingId: string, overrideStatus: string, overrideReason: string, overrideBy: string
): Promise<void> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const finding = await client.query<{ assessmentId: string; controlId: string }>(
      `SELECT "assessmentId", "controlId" FROM compliance_findings WHERE id = $1`, [findingId]
    )
    if (finding.rows.length === 0) throw new Error('Finding not found')

    await client.query(
      `UPDATE compliance_findings SET "overrideStatus" = $1, "overrideReason" = $2, "overrideBy" = $3, "overrideAt" = NOW() WHERE id = $4`,
      [overrideStatus, overrideReason, overrideBy, findingId]
    )

    const assessment = await client.query<{ companyId: string }>(
      `SELECT "companyId" FROM compliance_assessments WHERE id = $1`, [finding.rows[0].assessmentId]
    )
    if (assessment.rows[0]) {
      await logAudit(client, assessment.rows[0].companyId, finding.rows[0].assessmentId, 'finding_overridden', overrideBy, {
        findingId, controlId: finding.rows[0].controlId, overrideStatus, overrideReason,
      })
    }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Delete an assessment and all related data
// ---------------------------------------------------------------------------

export async function deleteAssessment(assessmentId: string, actor: string): Promise<void> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Get companyId for audit log before deleting
    const assessment = await client.query<{ companyId: string; frameworkId: string }>(
      `SELECT "companyId", "frameworkId" FROM compliance_assessments WHERE id = $1`, [assessmentId]
    )
    if (assessment.rows.length === 0) throw new Error('Assessment not found')

    const { companyId, frameworkId } = assessment.rows[0]

    // CASCADE deletes evidence and findings via FK constraints
    await client.query(`DELETE FROM compliance_assessments WHERE id = $1`, [assessmentId])

    await logAudit(client, companyId, null, 'assessment_deleted', actor, {
      assessmentId, frameworkId,
    })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Environment context + tool deployment loaders
// ---------------------------------------------------------------------------

/**
 * Load MSP setup wizard answers and derive environment context.
 * Maps setup question labels to structured flags for evaluators.
 */
async function loadEnvironmentContext(): Promise<EnvironmentContext | undefined> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ answers: Array<{ questionId: string; toolId: string | null; notes: string }> }>(
      `SELECT answers FROM compliance_msp_setup WHERE id = 'msp_setup'`
    )
    if (res.rows.length === 0) return undefined
    const answers = res.rows[0].answers ?? []
    if (answers.length === 0) return undefined

    const rawAnswers: Record<string, string> = {}
    let remoteAccess: string | null = null
    let onPremServers: string | null = null
    let customApps: string | null = null
    let byodPolicy: string | null = null

    for (const a of answers) {
      // Store label from notes field (setup wizard stores label in notes when toolId is null)
      rawAnswers[a.questionId] = a.notes || a.toolId || ''

      // Map specific answers to structured flags
      if (a.questionId === 'remote_access') {
        const label = (a.notes || '').toLowerCase()
        if (label.includes('cloud-only') || label.includes('no vpn')) remoteAccess = 'cloud_only'
        else if (label.includes('vpn required')) remoteAccess = 'vpn_required'
        else if (label.includes('hybrid')) remoteAccess = 'hybrid'
      }
      if (a.questionId === 'on_prem_servers') {
        const label = (a.notes || '').toLowerCase()
        if (label.includes('no on-prem') || label.includes('fully cloud')) onPremServers = 'no_servers'
        else if (label.includes('bcdr')) onPremServers = 'yes_bcdr'
        else onPremServers = 'yes_mixed'
      }
      if (a.questionId === 'custom_apps') {
        const label = (a.notes || '').toLowerCase()
        customApps = label.includes('no') || label.includes('standard') ? 'no' : 'yes'
      }
      if (a.questionId === 'byod_policy') {
        const label = (a.notes || '').toLowerCase()
        if (label.includes('company-owned')) byodPolicy = 'company_owned'
        else if (label.includes('no management') || label.includes('no mdm')) byodPolicy = 'byod_unmanaged'
        else byodPolicy = 'byod_managed'
      }
    }

    return { remoteAccess, onPremServers, customApps, byodPolicy, rawAnswers }
  } catch (err) {
    console.error('[compliance] Failed to load environment context:', err)
    return undefined
  } finally {
    client.release()
  }
}

/**
 * Load tool deployment toggles for a company from the compliance_company_tools table.
 */
async function loadDeployedTools(
  companyId: string, client: PoolClient
): Promise<Map<string, ToolDeployment>> {
  const map = new Map<string, ToolDeployment>()
  try {
    const res = await client.query<{ toolId: string; deployed: boolean; notes: string | null }>(
      `SELECT "toolId", deployed, notes FROM compliance_company_tools WHERE "companyId" = $1`,
      [companyId]
    )
    for (const row of res.rows) {
      map.set(row.toolId, { toolId: row.toolId, deployed: row.deployed, notes: row.notes })
    }
  } catch {
    // Table may not exist yet — that's fine, return empty
  }
  return map
}

// ---------------------------------------------------------------------------
// Run a full assessment — collects from ALL available connectors
// ---------------------------------------------------------------------------

export async function runAssessment(assessmentId: string, actor: string): Promise<{
  success: boolean
  errors: string[]
  summary: { passed: number; failed: number; partial: number; needsReview: number; notAssessed: number; collectionFailed: number }
}> {
  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()

  try {
    const assessmentRes = await client.query<Assessment>(
      `SELECT id, "companyId", "frameworkId", status FROM compliance_assessments WHERE id = $1`, [assessmentId]
    )
    if (assessmentRes.rows.length === 0) throw new Error('Assessment not found')
    const assessment = assessmentRes.rows[0]

    await updateAssessmentStatus(client, assessmentId, 'collecting')
    await logAudit(client, assessment.companyId, assessmentId, 'collection_started', actor, {})

    // Determine which connectors are available
    const connectors = await getConnectors(assessment.companyId)
    const availableConnectors = new Set<ConnectorType>()
    const failedConnectors = new Set<ConnectorType>()

    for (const c of connectors) {
      if (c.status === 'available' || c.status === 'verified' || c.status === 'configured') {
        availableConnectors.add(c.connectorType as ConnectorType)
      }
    }

    const collectionErrors: string[] = []
    const allEvidence: EvidenceRecord[] = []

    // --- Collect from Microsoft Graph ---
    if (availableConnectors.has('microsoft_graph')) {
      try {
        const graphResult = await collectGraphEvidence(assessment.companyId, assessmentId)
        collectionErrors.push(...graphResult.errors)
        if (graphResult.evidence.length > 0) {
          const stored = await storeEvidence(client, graphResult.evidence)
          allEvidence.push(...stored)
        }
        if (graphResult.errors.length > 0 && graphResult.evidence.length === 0) {
          failedConnectors.add('microsoft_graph')
        }
      } catch (err) {
        failedConnectors.add('microsoft_graph')
        collectionErrors.push(`Microsoft Graph: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // --- Collect from Datto RMM ---
    if (availableConnectors.has('datto_rmm')) {
      try {
        const rmmResult = await collectDattoRmmEvidence(assessment.companyId, assessmentId)
        collectionErrors.push(...rmmResult.errors)
        if (rmmResult.evidence.length > 0) {
          const stored = await storeEvidence(client, rmmResult.evidence)
          allEvidence.push(...stored)
        }
        if (rmmResult.errors.length > 0 && rmmResult.evidence.length === 0) {
          failedConnectors.add('datto_rmm')
        }
      } catch (err) {
        failedConnectors.add('datto_rmm')
        collectionErrors.push(`Datto RMM: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // --- Collect from Datto BCDR + SaaS Protect ---
    if (availableConnectors.has('datto_bcdr')) {
      try {
        const bcdrResult = await collectDattoBcdrEvidence(assessment.companyId, assessmentId)
        collectionErrors.push(...bcdrResult.errors)
        if (bcdrResult.evidence.length > 0) {
          const stored = await storeEvidence(client, bcdrResult.evidence)
          allEvidence.push(...stored)
        }
        if (bcdrResult.errors.length > 0 && bcdrResult.evidence.length === 0) {
          failedConnectors.add('datto_bcdr')
        }
      } catch (err) {
        failedConnectors.add('datto_bcdr')
        collectionErrors.push(`Datto BCDR: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // --- Collect from DNSFilter ---
    if (availableConnectors.has('dnsfilter')) {
      try {
        const dnsResult = await collectDnsFilterEvidence(assessment.companyId, assessmentId)
        collectionErrors.push(...dnsResult.errors)
        if (dnsResult.evidence.length > 0) {
          const stored = await storeEvidence(client, dnsResult.evidence)
          allEvidence.push(...stored)
        }
        if (dnsResult.errors.length > 0 && dnsResult.evidence.length === 0) {
          failedConnectors.add('dnsfilter')
        }
      } catch (err) {
        failedConnectors.add('dnsfilter')
        collectionErrors.push(`DNSFilter: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // --- Collect from Domotz ---
    if (availableConnectors.has('domotz')) {
      try {
        const domotzResult = await collectDomotzEvidence(assessment.companyId, assessmentId)
        collectionErrors.push(...domotzResult.errors)
        if (domotzResult.evidence.length > 0) {
          const stored = await storeEvidence(client, domotzResult.evidence)
          allEvidence.push(...stored)
        }
        if (domotzResult.errors.length > 0 && domotzResult.evidence.length === 0) {
          failedConnectors.add('domotz')
        }
      } catch (err) {
        failedConnectors.add('domotz')
        collectionErrors.push(`Domotz: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // --- Collect from SaaS Alerts ---
    if (availableConnectors.has('saas_alerts')) {
      try {
        const saResult = await collectSaasAlertsEvidence(assessment.companyId, assessmentId)
        collectionErrors.push(...saResult.errors)
        if (saResult.evidence.length > 0) {
          const stored = await storeEvidence(client, saResult.evidence)
          allEvidence.push(...stored)
        }
        if (saResult.errors.length > 0 && saResult.evidence.length === 0) {
          failedConnectors.add('saas_alerts')
        }
      } catch (err) {
        failedConnectors.add('saas_alerts')
        collectionErrors.push(`SaaS Alerts: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // --- Collect from IT Glue ---
    if (availableConnectors.has('it_glue')) {
      try {
        const itgResult = await collectItGlueEvidence(assessment.companyId, assessmentId)
        collectionErrors.push(...itgResult.errors)
        if (itgResult.evidence.length > 0) {
          const stored = await storeEvidence(client, itgResult.evidence)
          allEvidence.push(...stored)
        }
        if (itgResult.errors.length > 0 && itgResult.evidence.length === 0) {
          failedConnectors.add('it_glue')
        }
      } catch (err) {
        failedConnectors.add('it_glue')
        collectionErrors.push(`IT Glue: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // --- Collect from Ubiquiti UniFi ---
    if (availableConnectors.has('ubiquiti')) {
      try {
        const ubResult = await collectUbiquitiEvidence(assessment.companyId, assessmentId)
        collectionErrors.push(...ubResult.errors)
        if (ubResult.evidence.length > 0) {
          const stored = await storeEvidence(client, ubResult.evidence)
          allEvidence.push(...stored)
        }
        if (ubResult.errors.length > 0 && ubResult.evidence.length === 0) {
          failedConnectors.add('ubiquiti')
        }
      } catch (err) {
        failedConnectors.add('ubiquiti')
        collectionErrors.push(`Ubiquiti: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Update connector lastCollectedAt for ALL connectors that were attempted without failure
    // (not just ones that produced evidence — a successful empty result still counts as "collected")
    for (const connectorType of Array.from(availableConnectors)) {
      if (!failedConnectors.has(connectorType)) {
        try {
          await client.query(
            `UPDATE compliance_connectors SET "lastCollectedAt" = NOW() WHERE "companyId" = $1 AND "connectorType" = $2`,
            [assessment.companyId, connectorType]
          )
        } catch { /* non-fatal */ }
      }
    }

    await logAudit(client, assessment.companyId, assessmentId, 'collection_completed', actor, {
      evidenceCount: allEvidence.length,
      availableConnectors: Array.from(availableConnectors),
      failedConnectors: Array.from(failedConnectors),
      errors: collectionErrors,
    })

    // Build evidence map for evaluation
    const evidenceMap = new Map<EvidenceSourceType, EvidenceRecord>()
    for (const ev of allEvidence) {
      evidenceMap.set(ev.sourceType as EvidenceSourceType, ev)
    }

    await updateAssessmentStatus(client, assessmentId, 'evaluating')

    // Evaluate controls
    const framework = getFrameworkDefinition(assessment.frameworkId as FrameworkId)
    const evaluators = getEvaluators(assessment.frameworkId as FrameworkId)

    // Resolve tool mappings from the registry for all controls
    const controlIds = framework.controls.map((c) => c.controlId)
    const toolResolutions = resolveAllControls(controlIds, availableConnectors)

    // Load environment context from setup wizard answers
    const environment = await loadEnvironmentContext()

    // Load tool deployment toggles
    const deployedTools = await loadDeployedTools(assessment.companyId, client)

    const ctx: EvaluationContext = {
      companyId: assessment.companyId,
      assessmentId,
      evidence: evidenceMap,
      availableConnectors,
      failedConnectors,
      toolResolutions,
      environment,
      deployedTools,
    }

    const findings: Array<Omit<Finding, 'id'>> = []
    for (const control of framework.controls) {
      const evaluator = evaluators[control.controlId]
      if (evaluator) {
        const evalResult = evaluator(ctx)
        findings.push({
          assessmentId, controlId: evalResult.controlId, status: evalResult.status,
          confidence: evalResult.confidence, reasoning: evalResult.reasoning,
          evidenceIds: evalResult.evidenceIds, missingEvidence: evalResult.missingEvidence,
          remediation: evalResult.remediation, evaluatedAt: new Date().toISOString(),
          overrideStatus: null, overrideReason: null, overrideBy: null, overrideAt: null,
        })
      } else {
        findings.push({
          assessmentId, controlId: control.controlId, status: 'not_assessed', confidence: 'none',
          reasoning: 'No evaluator available for this control.',
          evidenceIds: [], missingEvidence: control.evidenceSources,
          remediation: null, evaluatedAt: new Date().toISOString(),
          overrideStatus: null, overrideReason: null, overrideBy: null, overrideAt: null,
        })
      }
    }

    await storeFindings(client, assessmentId, findings)

    const passed = findings.filter((f) => f.status === 'pass').length
    const failed = findings.filter((f) => f.status === 'fail').length
    const partial = findings.filter((f) => f.status === 'partial').length
    const needsReview = findings.filter((f) => f.status === 'needs_review').length
    const notApplicable = findings.filter((f) => f.status === 'not_applicable').length
    const notAssessed = findings.filter((f) => f.status === 'not_assessed').length
    const collectionFailed = findings.filter((f) => f.status === 'collection_failed').length

    await client.query(
      `UPDATE compliance_assessments
       SET status = 'complete', "completedAt" = NOW(),
           "passedControls" = $1, "failedControls" = $2, "manualReviewControls" = $3
       WHERE id = $4`,
      [passed, failed, partial + needsReview + notAssessed + notApplicable + collectionFailed, assessmentId]
    )

    await logAudit(client, assessment.companyId, assessmentId, 'assessment_completed', actor, {
      passed, failed, partial, needsReview, notApplicable, notAssessed, collectionFailed,
    })

    return {
      success: true, errors: collectionErrors,
      summary: { passed, failed, partial, needsReview, notAssessed, collectionFailed },
    }
  } catch (err) {
    try { await client.query(`UPDATE compliance_assessments SET status = 'error' WHERE id = $1`, [assessmentId]) } catch { /* ignore */ }
    throw err
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Historical comparison
// ---------------------------------------------------------------------------

export async function compareAssessments(currentId: string, previousId: string): Promise<AssessmentComparison | null> {
  const [currentFindings, previousFindings, currentAssessment, previousAssessment] = await Promise.all([
    getFindings(currentId),
    getFindings(previousId),
    getAssessment(currentId),
    getAssessment(previousId),
  ])

  if (!currentAssessment || !previousAssessment) return null

  const prevMap = new Map(previousFindings.map((f) => [f.controlId, f]))

  const newlyPassed: string[] = []
  const newlyFailed: string[] = []
  const improved: string[] = []
  const regressed: string[] = []
  const unchanged: string[] = []

  const statusRank: Record<string, number> = { pass: 4, partial: 3, needs_review: 2, not_assessed: 1, collection_failed: 1, not_applicable: 0, fail: -1 }

  for (const curr of currentFindings) {
    const prev = prevMap.get(curr.controlId)
    const currStatus = (curr.overrideStatus ?? curr.status) as FindingStatus
    const prevStatus = prev ? ((prev.overrideStatus ?? prev.status) as FindingStatus) : null

    if (!prevStatus) { unchanged.push(curr.controlId); continue }

    const currRank = statusRank[currStatus] ?? 0
    const prevRank = statusRank[prevStatus] ?? 0

    if (currStatus === prevStatus) { unchanged.push(curr.controlId) }
    else if (currStatus === 'pass' && prevStatus !== 'pass') { newlyPassed.push(curr.controlId) }
    else if (currStatus === 'fail' && prevStatus !== 'fail') { newlyFailed.push(curr.controlId) }
    else if (currRank > prevRank) { improved.push(curr.controlId) }
    else if (currRank < prevRank) { regressed.push(curr.controlId) }
    else { unchanged.push(curr.controlId) }
  }

  const currentScore = currentAssessment.totalControls > 0
    ? Math.round((currentAssessment.passedControls / currentAssessment.totalControls) * 100) : 0
  const previousScore = previousAssessment.totalControls > 0
    ? Math.round((previousAssessment.passedControls / previousAssessment.totalControls) * 100) : 0

  return {
    currentId, previousId,
    currentDate: currentAssessment.completedAt ?? currentAssessment.createdAt,
    previousDate: previousAssessment.completedAt ?? previousAssessment.createdAt,
    currentScore, previousScore, scoreDelta: currentScore - previousScore,
    newlyPassed, newlyFailed, improved, regressed, unchanged,
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
    const companyRes = await client.query<{ displayName: string }>(
      `SELECT "displayName" FROM companies WHERE id = $1`, [companyId]
    )
    const companyName = companyRes.rows[0]?.displayName ?? 'Unknown'
    const connectors = await getConnectors(companyId)
    const assessments = await listAssessments(companyId)

    const latest = assessments.find((a) => a.status === 'complete')
    let latestScorePercent: number | null = null
    if (latest && latest.totalControls > 0) {
      latestScorePercent = Math.round((latest.passedControls / latest.totalControls) * 100)
    }

    // Build score trend from completed assessments (oldest first for chart)
    const scoreTrend = assessments
      .filter((a) => a.status === 'complete')
      .reverse()
      .map((a) => ({
        date: a.completedAt ?? a.createdAt,
        score: a.totalControls > 0 ? Math.round((a.passedControls / a.totalControls) * 100) : 0,
        passed: a.passedControls,
        failed: a.failedControls,
        total: a.totalControls,
      }))

    return { companyId, companyName, connectors, assessments, latestScorePercent, scoreTrend }
  } finally {
    client.release()
  }
}

export async function getAssessmentSummary(assessmentId: string): Promise<AssessmentSummary | null> {
  const assessment = await getAssessment(assessmentId)
  if (!assessment) return null

  const findings = await getFindings(assessmentId)
  const framework = getFrameworkDefinition(assessment.frameworkId as FrameworkId)

  // Find previous completed assessment for comparison
  let comparison: AssessmentComparison | null = null
  const allAssessments = await listAssessments(assessment.companyId)
  const completedBefore = allAssessments.filter(
    (a) => a.status === 'complete' && a.id !== assessmentId && a.createdAt < assessment.createdAt
  )
  if (completedBefore.length > 0) {
    comparison = await compareAssessments(assessmentId, completedBefore[0].id)
  }

  return { assessment, findings, frameworkName: framework.name, comparison }
}

// ---------------------------------------------------------------------------
// CSV Export — sorted numerically, includes historical comparison
// ---------------------------------------------------------------------------

export async function exportAssessmentCsv(assessmentId: string): Promise<string> {
  const summary = await getAssessmentSummary(assessmentId)
  if (!summary) throw new Error('Assessment not found')

  const framework = getFrameworkDefinition(summary.assessment.frameworkId as FrameworkId)
  const controlMap = new Map(framework.controls.map((c) => [c.controlId, c]))

  // Build previous status map for comparison column
  const prevStatusMap = new Map<string, string>()
  if (summary.comparison) {
    const prevFindings = await getFindings(summary.comparison.previousId)
    for (const f of prevFindings) {
      prevStatusMap.set(f.controlId, (f.overrideStatus ?? f.status).toUpperCase())
    }
  }

  const rows: CsvExportRow[] = summary.findings.map((f) => {
    const ctrl = controlMap.get(f.controlId)
    const currentStatus = (f.overrideStatus ?? f.status).toUpperCase()
    const previousStatus = prevStatusMap.get(f.controlId) ?? ''
    let changeDirection = ''
    if (previousStatus && previousStatus !== currentStatus) {
      if (currentStatus === 'PASS' && previousStatus !== 'PASS') changeDirection = 'IMPROVED'
      else if (currentStatus === 'FAIL' && previousStatus !== 'FAIL') changeDirection = 'REGRESSED'
      else changeDirection = 'CHANGED'
    }
    return {
      controlId: f.controlId,
      category: ctrl?.category ?? '',
      title: ctrl?.title ?? '',
      status: currentStatus,
      confidence: f.confidence,
      reasoning: f.reasoning,
      evidenceSources: ctrl?.evidenceSources?.join('; ') ?? '',
      missingEvidence: Array.isArray(f.missingEvidence) ? (f.missingEvidence as string[]).join('; ') : '',
      remediation: f.remediation ?? '',
      overrideStatus: f.overrideStatus ?? '',
      overrideReason: f.overrideReason ?? '',
      previousStatus,
      changeDirection,
    }
  })

  const headers = [
    'Control ID', 'Category', 'Title', 'Status', 'Confidence',
    'Reasoning', 'Evidence Sources', 'Missing Evidence',
    'Remediation', 'Override Status', 'Override Reason',
    'Previous Status', 'Change',
  ]

  const csvLines = [headers.join(',')]
  for (const row of rows) {
    csvLines.push([
      csvEscape(row.controlId), csvEscape(row.category), csvEscape(row.title),
      csvEscape(row.status), csvEscape(row.confidence), csvEscape(row.reasoning),
      csvEscape(row.evidenceSources), csvEscape(row.missingEvidence),
      csvEscape(row.remediation), csvEscape(row.overrideStatus), csvEscape(row.overrideReason),
      csvEscape(row.previousStatus), csvEscape(row.changeDirection),
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
    console.error('[compliance] Failed to write audit log', { companyId, action })
  }
}

// ---------------------------------------------------------------------------
// Framework registry
// ---------------------------------------------------------------------------

/** IG tier hierarchy: IG1 = only IG1, IG2 = IG1+IG2, IG3 = IG1+IG2+IG3 */
const IG_TIERS: Record<string, string[]> = {
  'IG1': ['IG1'],
  'IG2': ['IG1', 'IG2'],
  'IG3': ['IG1', 'IG2', 'IG3'],
}

function getFrameworkDefinition(frameworkId: FrameworkId) {
  // Handle IG-level variants: cis-v8-ig1, cis-v8-ig2, cis-v8-ig3
  const igMatch = frameworkId.match(/^cis-v8-ig(\d)$/)
  if (igMatch) {
    const igLevel = `IG${igMatch[1]}`
    const allowedTiers = IG_TIERS[igLevel] ?? ['IG1']
    const filtered = CIS_V8_FRAMEWORK.controls.filter((c) => allowedTiers.includes(c.tier))
    return {
      ...CIS_V8_FRAMEWORK,
      id: frameworkId,
      name: `CIS Controls v8 — ${igLevel}`,
      controls: filtered,
    }
  }

  switch (frameworkId) {
    case 'cis-v8': return CIS_V8_FRAMEWORK
    default: throw new Error(`Framework ${frameworkId} not yet implemented`)
  }
}

function getEvaluators(frameworkId: FrameworkId): Record<string, (ctx: EvaluationContext) => import('./types').EvaluationResult> {
  if (frameworkId.startsWith('cis-v8')) return CIS_V8_EVALUATORS
  return {}
}

export { getFrameworkDefinition }
