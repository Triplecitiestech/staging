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
}

export interface SupportActivityData {
  ticketsCreated: number;
  ticketsClosed: number;
  ticketsReopened: number;
  supportHoursConsumed: number;
  billableHoursConsumed: number;
  netTicketChange: number;
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
