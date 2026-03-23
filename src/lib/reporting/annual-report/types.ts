/**
 * Types for the Annual Service Report system.
 * Extends the existing reporting architecture with multi-source annual data.
 */

// ============================================
// DATA SOURCE COVERAGE
// ============================================

export interface DataSourceCoverage {
  source: string;
  available: boolean;
  coverageStart: string | null;
  coverageEnd: string | null;
  isPartial: boolean;
  note: string | null;
}

// ============================================
// REPORT CONFIGURATION
// ============================================

export type AnnualReportVariant = 'customer' | 'internal';

export interface AnnualReportParams {
  companyId: string;
  variant: AnnualReportVariant;
  periodStart: Date;
  periodEnd: Date;
  createdBy: string;
}

// ============================================
// MONTHLY TREND DATA
// ============================================

export interface MonthlyTrend {
  month: string; // YYYY-MM
  label: string; // "January 2026"
  ticketsCreated: number;
  ticketsClosed: number;
  supportHours: number;
  avgResolutionMinutes: number | null;
}

// ============================================
// TICKETING SECTION
// ============================================

export interface TicketingAnalysis {
  totalTickets: number;
  ticketsByStatus: Array<{ status: string; count: number; percentage: number }>;
  ticketsByPriority: Array<{ priority: string; priorityValue: number; count: number; percentage: number; avgResolutionMinutes: number | null }>;
  ticketsByCategory: Array<{ category: string; count: number; percentage: number }>;
  mostCommonIssues: Array<{ issue: string; count: number }>;
  monthlyTrends: MonthlyTrend[];
  responseMetrics: {
    avgFirstResponseMinutes: number | null;
    medianFirstResponseMinutes: number | null;
    avgResolutionMinutes: number | null;
    medianResolutionMinutes: number | null;
    firstTouchResolutionRate: number | null;
    reopenRate: number | null;
    slaResponseCompliance: number | null;
    slaResolutionCompliance: number | null;
  };
  workBreakdown: {
    reactive: number;
    maintenance: number;
    project: number;
    other: number;
  };
}

// ============================================
// DATTO RMM SECTION
// ============================================

export interface DattoRmmAnalysis {
  available: boolean;
  totalAlerts: number;
  alertsResolved: number;
  alertsOpen: number;
  devicesManaged: number;
  alertsByType: Array<{ type: string; count: number }>;
  alertsByPriority: Array<{ priority: string; count: number }>;
  monthlyAlertTrends: Array<{ month: string; label: string; alerts: number; resolved: number }>;
  topAlertingSites: Array<{ siteName: string; alertCount: number }>;
  note: string | null;
}

// ============================================
// SECURITY OPERATIONS SECTION
// ============================================

export interface SecurityAnalysis {
  available: boolean;
  sources: Array<{ name: string; available: boolean; note: string | null }>;
  socIncidents: {
    available: boolean;
    totalIncidents: number;
    bySeverity: Array<{ severity: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    monthlyTrends: Array<{ month: string; label: string; incidents: number }>;
  };
  note: string | null;
}

// ============================================
// DATTO EDR SECTION
// ============================================

export interface DattoEdrAnalysis {
  available: boolean;
  totalEvents: number;
  eventsBySeverity: Array<{ severity: string; count: number }>;
  eventsByType: Array<{ type: string; count: number }>;
  monthlyTrends: Array<{ month: string; label: string; events: number }>;
  topThreats: Array<{ threat: string; count: number }>;
  note: string | null;
}

// ============================================
// DNSFILTER SECTION
// ============================================

export interface DnsFilterAnalysis {
  available: boolean;
  totalQueries: number;
  blockedQueries: number;
  threatsByCategory: Array<{ category: string; count: number }>;
  topBlockedDomains: Array<{ domain: string; count: number }>;
  monthlyTrends: Array<{ month: string; label: string; blocked: number; total: number }>;
  note: string | null;
}

// ============================================
// DATTO BCDR (BACKUPS) SECTION
// ============================================

export interface DattoBcdrAnalysis {
  available: boolean;
  totalDevices: number;
  totalAgents: number;
  totalAlerts: number;
  devicesWithAlerts: number;
  deviceDetails: Array<{
    name: string;
    clientCompanyName: string;
    agentCount: number;
    alertCount: number;
    lastSeen: string;
  }>;
  alertsByType: Array<{ type: string; count: number }>;
  note: string | null;
}

// ============================================
// EMAIL SECURITY SECTION (INKY)
// ============================================

export interface EmailSecurityAnalysis {
  available: boolean;
  note: string;
}

// ============================================
// EXECUTIVE SUMMARY
// ============================================

export interface ExecutiveSummary {
  totalTickets: number;
  topIssueCategories: string[];
  totalAlerts: number;
  totalSecurityIncidents: number;
  keyTrends: string[];
  dataCoverageNotes: string[];
}

// ============================================
// FULL ANNUAL REPORT PAYLOAD
// ============================================

export interface AnnualReportData {
  company: {
    id: string;
    name: string;
    autotaskCompanyId: string | null;
  };
  period: {
    start: string;
    end: string;
    label: string;
  };
  dataSources: DataSourceCoverage[];
  executiveSummary: ExecutiveSummary;
  ticketing: TicketingAnalysis;
  dattoRmm: DattoRmmAnalysis;
  dattoEdr: DattoEdrAnalysis;
  dnsFilter: DnsFilterAnalysis;
  dattoBcdr: DattoBcdrAnalysis;
  security: SecurityAnalysis;
  emailSecurity: EmailSecurityAnalysis;
  healthSnapshot: {
    overallScore: number;
    tier: string;
    trend: string | null;
    previousScore: number | null;
  } | null;
  generatedAt: string;
  version: number;
}
