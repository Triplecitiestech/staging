/**
 * Compliance Evidence Engine — Core Types
 *
 * Type definitions for the multi-tenant compliance assessment system.
 * Supports multiple frameworks (CIS v8 first, then CMMC, NIST 800-171, HIPAA, PCI).
 * Evidence is collected from real integrations and evaluated per control.
 */

// ---------------------------------------------------------------------------
// Framework & Control definitions
// ---------------------------------------------------------------------------

export type FrameworkId = 'cis-v8' | 'cmmc-l1' | 'cmmc-l2' | 'nist-800-171' | 'hipaa' | 'pci'

export interface FrameworkDefinition {
  id: FrameworkId
  name: string
  version: string
  description: string
  controls: ControlDefinition[]
}

export interface ControlDefinition {
  /** Unique ID within the framework, e.g. "cis-v8-4.1" */
  controlId: string
  frameworkId: FrameworkId
  /** Implementation Group for CIS, Level for CMMC, etc. */
  tier: string
  category: string
  title: string
  description: string
  /** Which evidence sources can inform this control */
  evidenceSources: EvidenceSourceType[]
  /** Whether this control can be auto-evaluated from collected data */
  evaluationType: EvaluationType
}

export type EvaluationType = 'auto' | 'semi-auto' | 'manual'

// ---------------------------------------------------------------------------
// Evidence collection
// ---------------------------------------------------------------------------

export type EvidenceSourceType =
  | 'microsoft_secure_score'
  | 'microsoft_conditional_access'
  | 'microsoft_mfa'
  | 'microsoft_device_compliance'
  | 'microsoft_bitlocker'
  | 'microsoft_defender'
  | 'microsoft_intune_config'
  | 'microsoft_users'
  | 'microsoft_mail_transport'
  | 'microsoft_audit_log'
  | 'datto_rmm_devices'
  | 'datto_rmm_patches'
  | 'datto_edr_alerts'
  | 'datto_bcdr_backup'
  | 'datto_saas_backup'
  | 'dnsfilter_dns'
  | 'autotask_tickets'
  | 'manual_upload'

export type ConnectorType =
  | 'microsoft_graph'
  | 'datto_rmm'
  | 'datto_edr'
  | 'datto_bcdr'
  | 'dnsfilter'
  | 'autotask'

export type ConnectorStatus = 'not_configured' | 'configured' | 'verified' | 'error'

export interface ConnectorState {
  companyId: string
  connectorType: ConnectorType
  status: ConnectorStatus
  lastCollectedAt: string | null
  errorMessage: string | null
  configRef: string | null // reference to where creds are stored (e.g. "company.m365_*")
}

// ---------------------------------------------------------------------------
// Collected evidence records
// ---------------------------------------------------------------------------

export interface EvidenceRecord {
  id: string
  assessmentId: string
  companyId: string
  sourceType: EvidenceSourceType
  /** The raw data snapshot (JSON) */
  rawData: Record<string, unknown>
  /** Human-readable summary of what was collected */
  summary: string
  collectedAt: string
  /** TTL hint — how long this evidence is considered fresh */
  validForHours: number
}

// ---------------------------------------------------------------------------
// Assessments & Findings
// ---------------------------------------------------------------------------

export type AssessmentStatus = 'draft' | 'collecting' | 'evaluating' | 'complete' | 'error'

export interface Assessment {
  id: string
  companyId: string
  frameworkId: FrameworkId
  status: AssessmentStatus
  createdAt: string
  completedAt: string | null
  createdBy: string // staff email
  /** Summary stats */
  totalControls: number
  passedControls: number
  failedControls: number
  manualReviewControls: number
}

export type FindingStatus = 'pass' | 'fail' | 'partial' | 'not_assessed' | 'not_applicable'

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none'

export interface Finding {
  id: string
  assessmentId: string
  controlId: string
  status: FindingStatus
  confidence: ConfidenceLevel
  /** Auto-generated reasoning explaining the YES/NO */
  reasoning: string
  /** Which evidence records support this finding */
  evidenceIds: string[]
  /** What evidence is missing that would improve confidence */
  missingEvidence: string[]
  /** Remediation recommendation if status is fail/partial */
  remediation: string | null
  evaluatedAt: string
  /** Staff override fields */
  overrideStatus: FindingStatus | null
  overrideReason: string | null
  overrideBy: string | null
  overrideAt: string | null
}

// ---------------------------------------------------------------------------
// Evaluation engine types
// ---------------------------------------------------------------------------

export interface EvaluationContext {
  companyId: string
  assessmentId: string
  evidence: Map<EvidenceSourceType, EvidenceRecord>
}

export interface EvaluationResult {
  controlId: string
  status: FindingStatus
  confidence: ConfidenceLevel
  reasoning: string
  evidenceIds: string[]
  missingEvidence: string[]
  remediation: string | null
}

/** Function signature for a control evaluator */
export type ControlEvaluator = (ctx: EvaluationContext) => EvaluationResult

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

export interface AssessmentSummary {
  assessment: Assessment
  findings: Finding[]
  frameworkName: string
}

export interface ComplianceDashboard {
  companyId: string
  companyName: string
  connectors: ConnectorState[]
  assessments: Assessment[]
  latestScorePercent: number | null
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export interface CsvExportRow {
  controlId: string
  category: string
  title: string
  status: string
  confidence: string
  reasoning: string
  evidenceSources: string
  missingEvidence: string
  remediation: string
  overrideStatus: string
  overrideReason: string
}
