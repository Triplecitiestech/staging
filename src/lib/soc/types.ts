/**
 * SOC Analyst Agent — Type Definitions
 */

// ── Ticket Analysis ──

export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'error' | 'skipped';
export type Verdict = 'false_positive' | 'expected_activity' | 'suspicious' | 'escalate' | 'informational' | 'confirmed_threat';
export type RecommendedAction = 'close' | 'merge' | 'investigate' | 'escalate';
export type AlertSource = 'saas_alerts' | 'datto_edr' | 'rocketcyber' | 'unknown';
export type AlertCategory =
  | 'technician_login'
  | 'onboarding'
  | 'software_install'
  | 'network_anomaly'
  | 'credential_alert'
  | 'malware'
  | 'phishing'
  | 'windows_update'
  | 'unknown';

export interface SocTicketAnalysis {
  id: string;
  autotaskTicketId: string;
  ticketNumber: string | null;
  companyId: string | null;
  incidentId: string | null;
  status: AnalysisStatus;
  verdict: Verdict | null;
  confidenceScore: number | null;
  aiModel: string | null;
  aiReasoning: string | null;
  aiTokensUsed: number | null;
  alertSource: AlertSource | null;
  alertCategory: AlertCategory | null;
  ipExtracted: string | null;
  deviceVerified: boolean;
  technicianVerified: string | null;
  autotaskNoteAdded: boolean;
  autotaskNoteId: string | null;
  recommendedAction: RecommendedAction | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Incident Groups ──

export type IncidentStatus = 'open' | 'resolved' | 'escalated';
export type CorrelationReason =
  | 'same_device_burst'
  | 'onboarding_cluster'
  | 'technician_session'
  | 'same_source_company'
  | 'single_alert';

export interface SocIncident {
  id: string;
  title: string;
  companyId: string | null;
  deviceHostname: string | null;
  alertSource: string | null;
  ticketCount: number;
  verdict: Verdict | null;
  confidenceScore: number | null;
  aiSummary: string | null;
  correlationReason: CorrelationReason | null;
  primaryTicketId: string | null;
  status: IncidentStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}

// ── Activity Log ──

export type SocAction =
  | 'analyzed'
  | 'correlated'
  | 'note_added'
  | 'merged'
  | 'escalated'
  | 'skipped'
  | 'error';

export interface SocActivityEntry {
  id: string;
  analysisId: string | null;
  incidentId: string | null;
  autotaskTicketId: string | null;
  action: SocAction;
  detail: string | null;
  aiReasoning: string | null;
  confidenceScore: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ── Rules ──

export type RuleType = 'suppression' | 'correlation' | 'escalation';
export type RuleAction = 'auto_close_recommend' | 'suppress' | 'escalate' | 'flag';

export interface SocRule {
  id: string;
  name: string;
  description: string | null;
  ruleType: RuleType;
  pattern: RulePattern;
  action: RuleAction;
  isActive: boolean;
  priority: number;
  createdBy: string | null;
  matchCount: number;
  lastMatchAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RulePattern {
  titlePatterns?: string[];
  sourceMatch?: string;
  sameCompany?: boolean;
  sameDevice?: boolean;
  minTicketsInWindow?: number;
  windowMinutes?: number;
  requireDeviceVerification?: boolean;
  companyMatch?: string;
  ipRange?: string;
  priorityMax?: number;
}

// ── AI Responses ──

export interface ScreeningResult {
  alertSource: AlertSource;
  category: AlertCategory;
  extractedIps: string[];
  isFalsePositive: boolean;
  confidence: number;
  reasoning: string;
  needsDeepAnalysis: boolean;
  recommendedAction: RecommendedAction;
  relatedTicketNumbers: string[];
}

export interface DeepAnalysisResult {
  verdict: Verdict;
  confidence: number;
  summary: string;
  reasoning: string;
  ticketNote: string;
  recommendedAction: RecommendedAction;
  mergeInto: string | null;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

// ── Reasoning Layer ──

export type Classification =
  | 'false_positive'
  | 'expected_activity'
  | 'informational'
  | 'suspicious'
  | 'confirmed_threat';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface EvidenceItem {
  /** Display label, e.g. "Login Location", "Device", "IP Reputation" */
  label: string;
  /** The value, e.g. "Manila, Philippines", "ACME-WKS-001 (verified)" */
  value: string;
  /** Color-coding hint: positive=benign, negative=concerning, neutral=context, info=supplemental */
  type: 'neutral' | 'positive' | 'negative' | 'info';
}

export interface SocReasoning {
  /** Plain-language summary of what happened, 2-4 sentences */
  incidentSummary: string;
  /** 5-value classification */
  classification: Classification;
  /** Risk assessment */
  riskLevel: RiskLevel;
  /** Confidence in the classification, 0.0-1.0 */
  confidence: number;
  /** 1-3 sentence explanation of why this classification was chosen */
  assessmentRationale: string;
  /** Dynamic evidence items — only fields relevant to this specific alert */
  evidence: EvidenceItem[];
  /** Clear recommendation for what to do with the ticket */
  recommendedAction: string;
  /** Whether a customer message is truly necessary */
  customerMessageRequired: boolean;
  /** Draft customer message (only when customerMessageRequired=true) */
  customerMessageDraft: string | null;
  /** Full internal investigation note for Autotask */
  internalNote: string;
}

// ── Processing Pipeline ──

export interface SecurityTicket {
  autotaskTicketId: string;
  ticketNumber: string;
  companyId: string | null;
  companyName?: string;
  title: string;
  description: string | null;
  status: number;
  statusLabel: string;
  priority: number;
  priorityLabel: string;
  queueId: number | null;
  queueLabel: string | null;
  source: number | null;
  sourceLabel: string | null;
  createDate: string;
}

export interface IncidentGroup {
  tickets: SecurityTicket[];
  reason: CorrelationReason;
  primaryTicket: SecurityTicket;
}

export interface DeviceVerification {
  verified: boolean;
  device?: {
    hostname: string;
    extIpAddress: string;
    lastUser: string;
    siteName: string;
    lastSeen: string;
  };
  technician?: string;
  reason?: string;
}

export interface TriageResult {
  ticketId: string;
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  recommendedAction: RecommendedAction;
  alertSource: AlertSource;
  alertCategory: AlertCategory;
  extractedIps: string[];
  deviceVerification: DeviceVerification | null;
  ticketNote: string;
  aiModel: string;
  tokensUsed: number;
  incidentId?: string;
  actionPlan?: IncidentActionPlan;
  socReasoning?: SocReasoning;
  /** Redesigned cross-stack assessment (primary output). */
  assessment?: SocAssessment;
  /** Full enrichment bundle correlated from the security stack. */
  enrichment?: EnrichmentBundle;
  /** True when the internal note was auto-posted to Autotask this run. */
  noteAutoPosted?: boolean;
}

// ── Proposed Actions (Dry Run Preview) ──

export interface ProposedMerge {
  shouldMerge: boolean;
  survivingTicketId: string;
  survivingTicketNumber: string;
  mergeTicketIds: string[];
  mergeTicketNumbers: string[];
  proposedTitle: string;
  mergeReasoning: string;
}

export interface ProposedAutotaskActions {
  merge: ProposedMerge | null;
  internalNote: string;
  statusChange: { from: string; to: string } | null;
  priorityChange: { from: string; to: string } | null;
  queueChange: { from: string; to: string } | null;
  escalation: {
    recommended: boolean;
    targetQueue: string | null;
    targetResource: string | null;
    urgency: 'routine' | 'urgent' | 'critical';
    reason: string;
  } | null;
}

export interface HumanGuidance {
  summary: string;
  steps: string[];
  draftCustomerMessage: string | null;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface CustomerCommunication {
  required: boolean;
  recipient: string | null;
  method: string;
  message: string | null;
  setStatusWaitingCustomer: boolean;
  followUpDays: number | null;
  followUpMessage: string | null;
  approvalAction: string | null;
  denialAction: string | null;
  escalationTrigger: string | null;
}

export interface IncidentActionPlan {
  incidentSummary: string;
  proposedActions: ProposedAutotaskActions;
  humanGuidance: HumanGuidance;
  customerCommunication?: CustomerCommunication;
  nextCycleChecks?: string[];
  supportingReasoning: string;
}

// ── Pending Actions (Human Approval Queue) ──

export type PendingActionType = 'add_note' | 'send_customer_message' | 'status_change' | 'priority_change' | 'queue_change' | 'escalation';
export type PendingActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface PendingActionPayload {
  /** For add_note: the note title */
  noteTitle?: string;
  /** For add_note: the full note body text */
  noteBody?: string;
  /** For add_note: the Autotask publish type (2 = Internal Only) */
  notePublish?: number;
  /** For status/priority/queue changes */
  from?: string;
  to?: string;
  /** For escalation */
  targetQueue?: string;
  targetResource?: string;
  urgency?: string;
  reason?: string;
}

export interface SocPendingAction {
  id: string;
  incidentId: string;
  autotaskTicketId: string;
  ticketNumber: string | null;
  companyName: string | null;
  actionType: PendingActionType;
  actionPayload: PendingActionPayload;
  previewSummary: string;
  status: PendingActionStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  executionResult: Record<string, unknown> | null;
  createdAt: Date;
}

// ── Config ──

export interface SocConfig {
  agent_enabled: boolean;
  dry_run: boolean;
  correlation_window_minutes: number;
  confidence_auto_close: number;
  confidence_flag_review: number;
  confidence_floor: number;
  max_ai_calls_per_run: number;
  screening_model: string;
  deep_analysis_model: string;
  internal_site_ids: string[];
  /** Auto-post the self-contained internal note to Autotask (Internal Only). Close/customer-reply stay approval-gated. */
  auto_post_internal_note: boolean;
}

// ── Cross-Stack Enrichment ──

/** Each security tool the analyst tried to pull data from, and how it went. */
export type DataSourceState = 'used' | 'no_data' | 'not_configured' | 'error';

export interface DataSourceStatus {
  /** e.g. "RocketCyber", "Datto RMM", "Datto EDR", "DNSFilter", "SaaS Alerts" */
  source: string;
  status: DataSourceState;
  /** Short human-readable note: what was found, or why nothing was. */
  detail: string;
}

/** Datto RMM device health snapshot for the affected endpoint. */
export interface DeviceHealth {
  hostname: string;
  online: boolean | null;
  operatingSystem: string | null;
  lastUser: string | null;
  lastSeen: string | null;
  rebootRequired: boolean | null;
  patchStatus: string | null;
  patchesApprovedPending: number | null;
  antivirusProduct: string | null;
  antivirusStatus: string | null;
  siteName: string | null;
  recentSoftware: Array<{ name: string; version: string; installDate: string | null }>;
}

/** Datto EDR detections that line up with the affected device/timeframe. */
export interface EdrCorrelation {
  detectionCount: number;
  /** Bad / Suspicious threatName — the ones that actually matter. */
  suspiciousCount: number;
  /** Good / Unknown threatName — usually background scan noise. */
  unclassifiedCount: number;
  /** True when filtered to the specific affected device. */
  deviceScoped: boolean;
  /** Per-device rollup (hostname → counts) when not device-scoped. */
  byDevice: Array<{ hostname: string; total: number; suspicious: number }>;
  detections: Array<{
    name: string;
    path: string | null;
    hash: string | null;
    threatName: string;
    threatScore: number | null;
    timestamp: string;
    hostname: string | null;
    status: string;
    /** Detection detail nested under `data` on the /Alerts response. */
    commandLine: string | null;
    parentProcessName: string | null;
    owner: string | null;
    ruleName: string | null;
    mitreId: string | null;
    severity: string | null;
  }>;
  /** Raw alert objects for the top suspicious detections (diagnostic passthrough). */
  rawDetections: unknown[];
}

/** Datto RMM identification of the source device/network behind the alert. */
export interface CompanyNetworkMatch {
  ip: string;
  deviceCount: number;
  /** Sample of hostnames behind that IP (for context). */
  hostnames: string[];
}

/** DNSFilter blocked/threat query-log lookups in the relevant window. */
export interface DnsCorrelation {
  orgName: string | null;
  totalBlocked: number;
  totalThreats: number;
  /** True when the sample could be tied to the affected device/IP. */
  deviceScoped: boolean;
  topBlockedDomains: Array<{ domain: string; count: number }>;
  samples: Array<{ time: string; fqdn: string; result: string; threat: boolean; categories: string; device: string | null; requesterIp: string | null }>;
}

/** SaaS Alerts events correlated by customer/timeframe. */
export interface SaasCorrelation {
  eventCount: number;
  events: Array<{ type: string; severity: string; description: string; time: string; user: string | null }>;
}

/** Match against the Known Benign Security Events table (informational only). */
export interface KnownBenignMatch {
  id: string;
  vendor: string;
  product: string;
  executablePath: string | null;
  detectionType: string | null;
  recommendedHandling: string | null;
  scope: 'global' | 'tenant' | 'device';
  /** How we matched: 'path' | 'hash' | 'signer' | 'vendor_product' */
  matchedOn: string;
}

export interface EnrichmentBundle {
  sourceSystem: AlertSource;
  externalIncidentId: string | null;
  externalAccountId: string | null;
  rocketCyber: import('@/lib/rocketcyber').RocketCyberDetail | null;
  deviceHealth: DeviceHealth | null;
  /** Datto RMM match of the alert's source IP to the company's known devices. */
  companyNetworkMatch: CompanyNetworkMatch | null;
  edr: EdrCorrelation | null;
  dns: DnsCorrelation | null;
  saasAlerts: SaasCorrelation | null;
  knownBenignMatches: KnownBenignMatch[];
  dataSources: DataSourceStatus[];
  dataGaps: string[];
}

// ── Known Benign Security Events ──

export type BenignScope = 'global' | 'tenant' | 'device';

export interface KnownBenignEvent {
  id: string;
  vendor: string;
  product: string;
  executablePath: string | null;
  hashValue: string | null;
  certificateSigner: string | null;
  detectionType: string | null;
  recommendedHandling: string | null;
  scope: BenignScope;
  companyId: string | null;
  deviceHostname: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── Redesigned SOC Assessment (cross-stack) ──

/**
 * The technician-facing classification buckets. These map onto the legacy
 * Classification/Verdict values for storage but drive the new UI and the
 * self-contained Autotask internal note.
 */
export type SocClassification =
  | 'confirmed_malicious'
  | 'suspicious_review'
  | 'likely_false_positive'
  | 'confirmed_false_positive'
  | 'insufficient_data';

/**
 * Structured assessment the AI produces once it has correlated the stack.
 * Persisted on soc_incidents.reasoning (extends SocReasoning at runtime).
 */
export interface SocAssessment {
  executiveSummary: string;
  finalRecommendation: string;
  classification: SocClassification;
  confidence: number;
  riskLevel: RiskLevel;
  /** Bullet-point evidence the analyst collected. */
  evidence: EvidenceItem[];
  /** Which tools contributed and what they showed. */
  correlatedSources: DataSourceStatus[];
  /** Populated when the activity matches a Known Benign entry. */
  knownBenignMatch: { matched: boolean; reason: string } | null;
  /** Plain-language customer impact. */
  customerImpact: string;
  /** Concrete steps for the technician (technical where needed). */
  recommendedTechnicianActions: string[];
  /** What we could NOT determine, and why. */
  dataGaps: string[];
  /** The full self-contained note posted to Autotask (Internal Only). */
  internalNote: string;
  /** Short copy/paste resolution note the technician uses to close the ticket. */
  closureNote: string;
  /** Whether a customer message is warranted (real concern, not FP). */
  customerMessageRequired: boolean;
  /** Copy-paste customer message — only when customerMessageRequired. */
  customerMessageDraft: string | null;
}

// ── Job Status ──

export interface SocJobMeta {
  ticketsProcessed: number;
  notesAdded: number;
  falsePositives: number;
  escalated: number;
  skipped: number;
  errors: number;
  aiCallsMade: number;
}
