/**
 * Types for the Business Review / QBR reporting system.
 */

// ============================================
// REPORT CONFIGURATION
// ============================================

export type ReportType = 'monthly' | 'quarterly';
export type ReportVariant = 'customer' | 'internal';
export type ReviewStatus = 'draft' | 'review' | 'ready' | 'sent';

export interface ReviewGenerationParams {
  companyId: string;
  reportType: ReportType;
  variant: ReportVariant;
  periodStart: Date;
  periodEnd: Date;
  createdBy: string;
  sections?: SectionId[];
}

export type SectionId =
  | 'executive_summary'
  | 'support_activity'
  | 'service_performance'
  | 'monitoring_activity'
  | 'top_themes'
  | 'health_snapshot'
  | 'recommendations'
  | 'internal_notes';

// ============================================
// REPORT DATA (the metrics payload)
// ============================================

export interface ReviewReportData {
  company: {
    id: string;
    name: string;
  };
  period: {
    type: ReportType;
    start: string;
    end: string;
    label: string;
  };

  supportActivity: SupportActivityData;
  servicePerformance: ServicePerformanceData;
  priorityBreakdown: PriorityMixData[];
  topThemes: TopThemeData[];
  healthSnapshot: HealthSnapshotData | null;
  comparison: ComparisonData;
  backlog: BacklogData;
  notableEvents: NotableEventData[];
  /**
   * Automated monitoring events (SaaS Alerts, Datto EDR, RMM alert tickets)
   * detected and auto-handled during the period. Reported separately as
   * protection delivered — NEVER blended into the support metrics above, and
   * no SLA/response math applies. Optional: reports generated before this
   * section existed won't have it.
   */
  monitoringActivity?: MonitoringActivityData;
}

/**
 * Security & monitoring activity — automated tickets counted as monitoring
 * events, not support workload.
 */
export interface MonitoringActivityData {
  /** Monitoring events detected in the period (automated tickets created) */
  eventsDetected: number;
  /** Events that were handled automatically (auto-resolved, no human work) */
  eventsAutoHandled: number;
  /** Events escalated to a person (assigned / worked / left open for review) */
  eventsEscalated: number;
  /** Breakdown by generating platform (SaaS Alerts, Datto EDR, …) */
  byType: Array<{ type: string; label: string; count: number }>;
  /** Events detected in the previous period (for a simple trend line) */
  previousPeriodEvents: number;
}

export interface SupportActivityData {
  ticketsCreated: number;
  ticketsClosed: number;
  /**
   * Reopened-ticket count from status history. null = not measured (history is
   * forward-only from the first sync); 0 = measured, none found.
   */
  ticketsReopened: number | null;
  supportHoursConsumed: number;
  billableHoursConsumed: number;
  netTicketChange: number;
  /** Number of tickets closed this period that were originally created in a previous period */
  crossPeriodResolutions: number;
}

export interface ServicePerformanceData {
  avgFirstResponseMinutes: number | null;
  medianFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  medianResolutionMinutes: number | null;
  firstTouchResolutionRate: number | null;
  reopenRate: number | null;
  slaResponseCompliance: number | null;
  slaResolutionCompliance: number | null;
}

export interface PriorityMixData {
  priority: string;
  priorityValue: number;
  count: number;
  percentage: number;
  avgResolutionMinutes: number | null;
}

export interface TopThemeData {
  category: string;
  count: number;
  percentage: number;
  trend: 'up' | 'down' | 'flat';
}

export interface HealthSnapshotData {
  overallScore: number;
  tier: string;
  trend: string | null;
  previousScore: number | null;
  factors: Record<string, number>;
}

export interface ComparisonData {
  previousPeriod: {
    start: string;
    end: string;
    label: string;
  };
  ticketsCreatedChange: number | null;
  ticketsClosedChange: number | null;
  supportHoursChange: number | null;
  avgResolutionChange: number | null;
  reopenRateChange: number | null;
}

export interface BacklogData {
  total: number;
  urgent: number;
  high: number;
  agingOver7Days: number;
  agingOver30Days: number;
}

export interface NotableEventData {
  date: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

// ============================================
// RECOMMENDATION
// ============================================

export interface Recommendation {
  id: string;
  category: 'process' | 'infrastructure' | 'capacity' | 'quality' | 'strategic';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  evidence: string;
  internalOnly: boolean;
}

// ============================================
// NARRATIVE
// ============================================

export interface NarrativeSections {
  executiveSummary: string;
  supportActivityNarrative: string;
  performanceNarrative: string;
  /** Security monitoring activity narrative — absent on reports generated before the section existed */
  monitoringNarrative?: string;
  themesNarrative: string;
  healthNarrative: string;
  recommendationsNarrative: string;
  internalNotes?: string;
}

// ============================================
// FULL REPORT (stored in DB)
// ============================================

export interface BusinessReviewPayload {
  data: ReviewReportData;
  recommendations: Recommendation[];
  narrative: NarrativeSections;
  generatedAt: string;
  version: number;
}
