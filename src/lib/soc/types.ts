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
  reasoning?: SocReasoning;
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
