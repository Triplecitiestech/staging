/**
 * Shared types for the reporting and analytics system.
 */

export interface DateRange {
  from: Date;
  to: Date;
}

export interface ReportMeta {
  period: {
    from: string;
    to: string;
  };
  generatedAt: string;
  dataFreshness: string | null;
  ticketCount: number;
}

export interface ReportResponse<T> {
  data: T;
  meta: ReportMeta;
}

/** Autotask resolved ticket statuses (picklist values that mean "closed/complete") */
export const RESOLVED_STATUSES = [5, 13, 29] as const;

/** Check if a status value is a resolved status */
export function isResolvedStatus(status: number): boolean {
  return (RESOLVED_STATUSES as readonly number[]).includes(status);
}

/** Autotask "waiting customer" statuses */
export const WAITING_CUSTOMER_STATUSES = [7, 12] as const;

export function isWaitingCustomerStatus(status: number): boolean {
  return (WAITING_CUSTOMER_STATUSES as readonly number[]).includes(status);
}

/** Priority picklist mappings (Autotask defaults) */
export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

/** Map Autotask priority to our internal labels for reporting targets */
export function priorityToTargetScope(priority: number): string {
  switch (priority) {
    case 1: return 'CRITICAL';
    case 2: return 'HIGH';
    case 3: return 'MEDIUM';
    case 4: return 'LOW';
    default: return 'MEDIUM';
  }
}

/** Job names used for tracking in ReportingJobStatus */
export const JOB_NAMES = {
  SYNC_TICKETS: 'sync_tickets',
  SYNC_TIME_ENTRIES: 'sync_time_entries',
  SYNC_TICKET_NOTES: 'sync_ticket_notes',
  SYNC_RESOURCES: 'sync_resources',
  COMPUTE_LIFECYCLE: 'compute_lifecycle',
  AGGREGATE_TECHNICIAN: 'aggregate_technician',
  AGGREGATE_COMPANY: 'aggregate_company',
  COMPUTE_HEALTH: 'compute_health',
} as const;

export interface JobResult {
  jobName: string;
  status: 'success' | 'failed';
  durationMs: number;
  meta?: Record<string, unknown>;
  error?: string;
}

export interface TechnicianSummary {
  resourceId: number;
  firstName: string;
  lastName: string;
  email: string;
  ticketsClosed: number;
  ticketsAssigned: number;
  hoursLogged: number;
  billableHoursLogged: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  firstTouchResolutionRate: number | null;
  openTicketCount: number;
}

export interface CompanySummary {
  companyId: string;
  displayName: string;
  ticketsCreated: number;
  ticketsClosed: number;
  supportHoursConsumed: number;
  avgResolutionMinutes: number | null;
  reopenRate: number | null;
  firstTouchResolutionRate: number | null;
  slaCompliance: number | null;
  backlogCount: number;
  healthScore: number | null;
  healthTrend: string | null;
}

export interface DashboardSummary {
  totalTicketsCreated: number;
  totalTicketsClosed: number;
  overallSlaCompliance: number | null;
  totalBacklog: number;
  avgResolutionMinutes: number | null;
  topCompanies: Array<{ companyId: string; displayName: string; ticketCount: number }>;
  topTechnicians: Array<{ resourceId: number; name: string; hoursLogged: number }>;
  trendVsPrevious: {
    ticketsCreatedChange: number | null;
    ticketsClosedChange: number | null;
    resolutionTimeChange: number | null;
  };
}
