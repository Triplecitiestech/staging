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

export type FrameworkId = 'cis-v8' | 'cis-v8-ig1' | 'cis-v8-ig2' | 'cis-v8-ig3' | 'cmmc-l1' | 'cmmc-l2' | 'nist-800-171' | 'hipaa' | 'pci'

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
  /** Numeric sort key for natural ordering, e.g. [4, 1] for 4.1 */
  sortKey: number[]
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

export type ConnectorStatus = 'not_configured' | 'available' | 'configured' | 'verified' | 'error'

export interface ConnectorState {
  companyId: string
  connectorType: ConnectorType
  status: ConnectorStatus
  lastCollectedAt: string | null
  errorMessage: string | null
  configRef: string | null
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
  createdBy: string
  totalControls: number
  passedControls: number
  failedControls: number
  manualReviewControls: number
}

/**
 * Finding statuses — each has distinct meaning:
 *   pass            — control is satisfied based on evidence
 *   fail            — control is NOT satisfied based on evidence
 *   partial         — some evidence supports but incomplete
 *   needs_review    — evidence exists but human judgment needed
 *   not_assessed    — no evidence sources are available for this control
 *   not_applicable  — control does not apply to this environment
 *   collection_failed — evidence source exists but collection errored
 */
export type FindingStatus =
  | 'pass'
  | 'fail'
  | 'partial'
  | 'needs_review'
  | 'not_assessed'
  | 'not_applicable'
  | 'collection_failed'

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none'

export interface Finding {
  id: string
  assessmentId: string
  controlId: string
  status: FindingStatus
  confidence: ConfidenceLevel
  reasoning: string
  evidenceIds: string[]
  missingEvidence: string[]
  remediation: string | null
  evaluatedAt: string
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
  /** Which connectors were available during this assessment run */
  availableConnectors: Set<ConnectorType>
  /** Which connectors had errors during collection */
  failedConnectors: Set<ConnectorType>
  /** Resolved tool mappings per control from the registry */
  toolResolutions?: Map<string, import('./registry/resolver').ControlToolResolution>
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

export type ControlEvaluator = (ctx: EvaluationContext) => EvaluationResult

// ---------------------------------------------------------------------------
// Historical comparison
// ---------------------------------------------------------------------------

export interface AssessmentComparison {
  currentId: string
  previousId: string
  currentDate: string
  previousDate: string
  scoreDelta: number
  currentScore: number
  previousScore: number
  newlyPassed: string[]
  newlyFailed: string[]
  improved: string[]
  regressed: string[]
  unchanged: string[]
}

// ---------------------------------------------------------------------------
// Policy management
// ---------------------------------------------------------------------------

export type PolicySource = 'upload' | 'paste' | 'generated'
export type PolicyAnalysisStatus = 'pending' | 'analyzing' | 'complete' | 'error'

export interface CompliancePolicy {
  id: string
  companyId: string
  title: string
  source: PolicySource
  content: string
  category: string
  tags: string[]
  frameworkIds: string[]
  controlIds: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface PolicyAnalysis {
  id: string
  policyId: string
  companyId: string
  status: PolicyAnalysisStatus
  satisfiedControls: string[]
  partialControls: string[]
  missingControls: string[]
  gaps: string[]
  recommendations: string[]
  analysisText: string
  analyzedAt: string | null
}

// ---------------------------------------------------------------------------
// Customer attestations
// ---------------------------------------------------------------------------

export interface CustomerAttestation {
  id: string
  companyId: string
  controlId: string
  frameworkId: string
  response: string
  respondedBy: string
  respondedAt: string
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

export interface AssessmentSummary {
  assessment: Assessment
  findings: Finding[]
  frameworkName: string
  comparison?: AssessmentComparison | null
}

export interface ComplianceDashboard {
  companyId: string
  companyName: string
  connectors: ConnectorState[]
  assessments: Assessment[]
  latestScorePercent: number | null
  scoreTrend: Array<{ date: string; score: number; passed: number; failed: number; total: number }>
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
  previousStatus: string
  changeDirection: string
}

// ---------------------------------------------------------------------------
// Sorting utility
// ---------------------------------------------------------------------------

/**
 * Parse a control ID like "cis-v8-4.1" into numeric sort key [4, 1].
 * Handles multi-level like "cis-v8-10.1" → [10, 1].
 */
export function parseControlSortKey(controlId: string): number[] {
  const numPart = controlId.replace(/^[a-z]+-[a-z0-9]+-/, '')
  return numPart.split('.').map((s) => parseInt(s, 10) || 0)
}

/**
 * Compare two control IDs numerically.
 */
export function compareControlIds(a: string, b: string): number {
  const ka = parseControlSortKey(a)
  const kb = parseControlSortKey(b)
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const diff = (ka[i] ?? 0) - (kb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Maps evidence source types to their parent connector type.
 */
export const EVIDENCE_TO_CONNECTOR: Record<EvidenceSourceType, ConnectorType | null> = {
  microsoft_secure_score: 'microsoft_graph',
  microsoft_conditional_access: 'microsoft_graph',
  microsoft_mfa: 'microsoft_graph',
  microsoft_device_compliance: 'microsoft_graph',
  microsoft_bitlocker: 'microsoft_graph',
  microsoft_defender: 'microsoft_graph',
  microsoft_intune_config: 'microsoft_graph',
  microsoft_users: 'microsoft_graph',
  microsoft_mail_transport: 'microsoft_graph',
  microsoft_audit_log: 'microsoft_graph',
  datto_rmm_devices: 'datto_rmm',
  datto_rmm_patches: 'datto_rmm',
  datto_edr_alerts: 'datto_edr',
  datto_bcdr_backup: 'datto_bcdr',
  datto_saas_backup: 'datto_bcdr',
  dnsfilter_dns: 'dnsfilter',
  autotask_tickets: 'autotask',
  manual_upload: null,
}
