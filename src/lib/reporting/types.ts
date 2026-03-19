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

/**
 * Autotask ticket status classification.
 *
 * Autotask picklist values are instance-specific — different customers may have
 * different numeric IDs for "Complete", "Waiting Customer", etc.
 * These defaults match the TCT Autotask instance. During sync, the actual picklist
 * values are fetched and cached via `updateStatusClassification()`.
 *
 * The classification is resolved by matching picklist LABELS (case-insensitive)
 * against known patterns, with fallback to these hardcoded defaults.
 */

/** Default resolved status IDs — fallback when picklist fetch fails */
const DEFAULT_RESOLVED_STATUSES = [5, 13, 29];
/** Default waiting-customer status IDs — fallback when picklist fetch fails */
const DEFAULT_WAITING_CUSTOMER_STATUSES = [7, 12];

/** Patterns that indicate a "resolved/closed/complete" ticket status label */
const RESOLVED_LABEL_PATTERNS = [
  /\bcomplete\b/i,
  /\bclosed\b/i,
  /\bresolved\b/i,
  /\bdone\b/i,
  /\bcancelled\b/i,
  /\bcanceled\b/i,
];

/** Patterns that indicate a "waiting on customer" ticket status label */
const WAITING_CUSTOMER_LABEL_PATTERNS = [
  /\bwaiting\s*(on|for)?\s*customer\b/i,
  /\bcustomer\s*respond\b/i,
  /\bpending\s*customer\b/i,
  /\bclient\s*response\b/i,
  /\bwaiting\s*(on|for)?\s*client\b/i,
];

/** In-memory cache of dynamically resolved status IDs */
let cachedResolvedStatuses: number[] | null = null;
let cachedWaitingCustomerStatuses: number[] | null = null;

/**
 * Update status classification from Autotask picklist data.
 * Called during ticket sync after fetching field info.
 * Matches status labels against known patterns to classify statuses dynamically.
 */
export function updateStatusClassification(
  statusPicklist: Array<{ value: string; label: string; isActive: boolean }>
): { resolved: number[]; waitingCustomer: number[] } {
  const resolved: number[] = [];
  const waitingCustomer: number[] = [];

  for (const entry of statusPicklist) {
    if (!entry.isActive) continue;
    const id = parseInt(entry.value, 10);
    if (isNaN(id)) continue;

    if (RESOLVED_LABEL_PATTERNS.some(p => p.test(entry.label))) {
      resolved.push(id);
    }
    if (WAITING_CUSTOMER_LABEL_PATTERNS.some(p => p.test(entry.label))) {
      waitingCustomer.push(id);
    }
  }

  // Only update cache if we found at least one match (picklist was valid)
  if (resolved.length > 0) {
    cachedResolvedStatuses = resolved;
  }
  if (waitingCustomer.length > 0) {
    cachedWaitingCustomerStatuses = waitingCustomer;
  }

  return { resolved: getResolvedStatuses(), waitingCustomer: getWaitingCustomerStatuses() };
}

/** Get the current resolved status IDs (dynamic or default fallback) */
export function getResolvedStatuses(): number[] {
  return cachedResolvedStatuses ?? DEFAULT_RESOLVED_STATUSES;
}

/** Get the current waiting-customer status IDs (dynamic or default fallback) */
export function getWaitingCustomerStatuses(): number[] {
  return cachedWaitingCustomerStatuses ?? DEFAULT_WAITING_CUSTOMER_STATUSES;
}

/**
 * Exported constant for backward compatibility.
 * Consumers that need a static array for Prisma `{ in: [...] }` queries
 * should call getResolvedStatuses() instead for dynamic values.
 * @deprecated Use getResolvedStatuses() for dynamic classification
 */
export const RESOLVED_STATUSES = DEFAULT_RESOLVED_STATUSES;

/** Check if a status value is a resolved status */
export function isResolvedStatus(status: number): boolean {
  return getResolvedStatuses().includes(status);
}

/** Autotask "waiting customer" statuses */
export const WAITING_CUSTOMER_STATUSES = DEFAULT_WAITING_CUSTOMER_STATUSES;

export function isWaitingCustomerStatus(status: number): boolean {
  return getWaitingCustomerStatuses().includes(status);
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

// ============================================
// ENHANCED RESPONSE TYPES (Phase 3)
// ============================================

export interface TrendPoint {
  date: string;
  label: string;
  value: number;
}

export interface PriorityBreakdown {
  priority: string;
  count: number;
  percentage: number;
  avgResolutionMinutes: number | null;
}

export interface ComparisonData {
  current: number;
  previous: number;
  changePercent: number | null;
  direction: 'up' | 'down' | 'flat';
}

export interface BenchmarkResult {
  metricKey: string;
  actual: number;
  target: number;
  unit: string;
  meetingTarget: boolean;
  percentOfTarget: number;
}

export interface TechnicianComparisonDetail {
  resourceId: number;
  name: string;
  ticketsClosed: ComparisonData;
  hoursLogged: ComparisonData;
  avgResolution: ComparisonData;
  firstTouchResolutionRate: ComparisonData;
  avgFirstResponse: ComparisonData;
}

export interface EnhancedTechnicianReport {
  summary: TechnicianSummary[];
  trend?: TrendPoint[];
  comparison?: {
    ticketsClosed: ComparisonData;
    hoursLogged: ComparisonData;
    avgResolution: ComparisonData;
  };
  /** Per-technician comparison detail for individual tech comparison charts */
  techComparison?: TechnicianComparisonDetail[];
  benchmarks?: BenchmarkResult[];
  meta: ReportMeta;
}

export interface EnhancedCompanyReport {
  summary: CompanySummary[];
  trend?: TrendPoint[];
  priorityBreakdown?: PriorityBreakdown[];
  comparison?: {
    ticketsCreated: ComparisonData;
    ticketsClosed: ComparisonData;
    supportHours: ComparisonData;
    avgResolution: ComparisonData;
  };
  benchmarks?: BenchmarkResult[];
  meta: ReportMeta;
}

export interface EnhancedDashboardReport {
  summary: DashboardSummary;
  ticketTrend?: TrendPoint[];
  resolutionTrend?: TrendPoint[];
  priorityBreakdown?: PriorityBreakdown[];
  meta: ReportMeta;
}

export interface EnhancedHealthReport {
  scores: Array<{
    companyId: string;
    displayName: string;
    overallScore: number;
    trend: string | null;
    previousScore: number | null;
    tier: string;
    factors: Record<string, number>;
    rawValues: Record<string, number | null>;
    computedAt: string;
    periodStart: string;
    periodEnd: string;
  }>;
  distribution: {
    healthy: number;
    needsAttention: number;
    atRisk: number;
    critical: number;
  };
  meta: ReportMeta;
}
