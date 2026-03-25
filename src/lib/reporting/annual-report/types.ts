/**
 * Types for the Annual Service Report system.
 * Extends the existing reporting architecture with multi-source annual data.
 */

// ============================================
// DATA SOURCE COVERAGE
// ============================================

export interface DataSourceCoverage {
  source: string;
  internalSource?: string; // Product name for internal variant
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
  hiddenSections?: string[];
}

export interface UserProtectionAnalysis {
  available: boolean;
  services: Array<{
    name: string;
    description: string;
    active: boolean;
  }>;
  note: string | null;
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
  endpointCount: number;
  serverCount: number;
  workstationCount: number;
  devicesByOS: Array<{ os: string; count: number }>;
  devicesByType: Array<{ type: string; count: number }>;
  patchAlertsCount: number;
  alertsByType: Array<{ type: string; count: number }>;
  alertsByPriority: Array<{ priority: string; count: number }>;
  monthlyAlertTrends: Array<{ month: string; label: string; alerts: number; resolved: number }>;
  topAlertingSites: Array<{ siteName: string; alertCount: number }>;
  // Patch management metrics (from device patchManagement field)
  patchFullyPatched: number;
  patchPendingCount: number;
  patchInstalledTotal: number;
  devicesNeedingReboot: number;
  devicesOnline: number;
  note: string | null;
}

// ============================================
// SECURITY OPERATIONS SECTION
// ============================================

export interface SecurityAnalysis {
  available: boolean;
  sources: Array<{ name: string; internalName?: string; available: boolean; note: string | null }>;
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
  applianceCount: number;
  endpointBackupCount: number;
  cloudDeviceCount: number;
  deviceDetails: Array<{
    name: string;
    model: string;
    clientCompanyName: string;
    agentCount: number;
    alertCount: number;
    lastSeen: string;
    deviceType: 'appliance' | 'endpoint' | 'cloud';
  }>;
  alertsByType: Array<{ type: string; count: number }>;
  note: string | null;
}

// ============================================
// DATTO SAAS PROTECTION SECTION
// ============================================

export interface DattoSaasAnalysis {
  available: boolean;
  totalCustomers: number;
  totalSeats: number;
  totalDomains: number;
  activeSeats: number;
  pausedSeats: number;
  archivedSeats: number;
  unprotectedSeats: number;
  seatsByType: Array<{ type: string; count: number }>;
  customerDetails: Array<{
    name: string;
    domain: string;
    productType: string;
    seatCount: number;
  }>;
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
  dattoSaas: DattoSaasAnalysis;
  security: SecurityAnalysis;
  userProtection: UserProtectionAnalysis;
  emailSecurity: EmailSecurityAnalysis;
  hiddenSections?: string[];
  healthSnapshot: {
    overallScore: number;
    tier: string;
    trend: string | null;
    previousScore: number | null;
  } | null;
  generatedAt: string;
  version: number;
}

// ============================================
// REPORT PROCESSING CONFIG
// ============================================

export interface ReportProcessingConfig {
  variant: AnnualReportVariant;
  hiddenSections: string[];
}

export interface StatCardData {
  label: string;
  value: string | number;
}

export interface ProcessedSection {
  key: string;
  title: string;
  visible: boolean;
  hasData: boolean;
}

export interface ProcessedReportMetadata {
  companyName: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  variant: AnnualReportVariant;
  generatedAt: string;
  isInternal: boolean;
}

export interface ProcessedReport {
  metadata: ProcessedReportMetadata;
  sections: ProcessedSection[];
  // Pre-computed render-ready data
  dataSources: DataSourceCoverage[];
  summaryCards: StatCardData[];
  keyTrends: string[];
  topIssueCategories: string[];
  dataCoverageNotes: string[];
  // Section data (only populated for visible sections)
  ticketing: TicketingAnalysis;
  dattoRmm: DattoRmmAnalysis;
  dattoEdr: DattoEdrAnalysis;
  dnsFilter: DnsFilterAnalysis;
  dattoBcdr: DattoBcdrAnalysis;
  dattoSaas: DattoSaasAnalysis;
  security: SecurityAnalysis;
  userProtection: UserProtectionAnalysis;
  emailSecurity: EmailSecurityAnalysis;
  healthSnapshot: AnnualReportData['healthSnapshot'];
  // Display flags
  showInternalColumns: boolean;
}

// Section definitions shared between generator UI and processor
export const REPORT_SECTION_DEFS = [
  { key: 'ticketing', label: 'Ticketing Analysis', desc: 'Ticket volume, categories, monthly trends' },
  { key: 'ticketingPriority', label: 'Priority Breakdown', desc: 'Tickets by priority level' },
  { key: 'ticketingTrends', label: 'Monthly Trends Table', desc: 'Month-by-month created/closed counts' },
  { key: 'ticketingCategories', label: 'Ticket Categories', desc: 'Top ticket categories by volume' },
  { key: 'edr', label: 'Endpoint Detection & Response (EDR)', desc: 'Security events, threat detection' },
  { key: 'rmm', label: 'Endpoint Management (RMM)', desc: 'RMM alerts, devices managed' },
  { key: 'dns', label: 'DNS Security Filtering', desc: 'Blocked queries, threat categories' },
  { key: 'bcdr', label: 'Backup & Disaster Recovery', desc: 'BCDR appliances and protected systems' },
  { key: 'saas', label: 'SaaS Backups (M365/Google)', desc: 'Cloud seat backup coverage' },
  { key: 'security', label: 'Security Operations', desc: 'SOC monitoring capabilities' },
  { key: 'userProtection', label: 'User Protection Services', desc: 'Login monitoring, MFA, impossible travel, security posture' },
  { key: 'health', label: 'Customer Health Snapshot', desc: 'Overall health score and trend' },
] as const;

// Maps data source names to section keys
export const SOURCE_TO_SECTION: Record<string, string> = {
  'Managed IT Support': 'ticketing',
  'Endpoint Management': 'rmm',
  'Endpoint Detection & Response (EDR)': 'edr',
  'DNS Security Filtering': 'dns',
  'Backup & Disaster Recovery (BCDR)': 'bcdr',
  'SaaS Backups (M365/Google)': 'saas',
  'Security Operations Center (SOC)': 'security',
  'User Protection Services': 'userProtection',
  'Email Security': 'emailSecurity',
};

// Section titles by variant
export const SECTION_TITLES: Record<string, { customer: string; internal: string }> = {
  dataSources: { customer: 'Services Covered', internal: 'Data Source Coverage' },
  ticketing: { customer: 'Ticketing Analysis', internal: 'Ticketing Analysis' },
  rmm: { customer: 'Endpoint Management', internal: 'Endpoint Operations (Datto RMM)' },
  edr: { customer: 'Endpoint Detection & Response (EDR)', internal: 'Endpoint Detection & Response (Datto EDR)' },
  dns: { customer: 'DNS Security Filtering', internal: 'DNS Security (DNSFilter)' },
  bcdr: { customer: 'Backup & Disaster Recovery (BCDR)', internal: 'Backup & Disaster Recovery (Datto BCDR)' },
  saas: { customer: 'SaaS Backups', internal: 'Cloud Backup (Datto SaaS Protection)' },
  security: { customer: 'Security Operations', internal: 'Security Operations' },
  userProtection: { customer: 'User Protection Services', internal: 'User Protection Services' },
  health: { customer: 'Customer Health Snapshot', internal: 'Customer Health Snapshot' },
  emailSecurity: { customer: 'Email Security', internal: 'Email Security (Inky)' },
};

// Stored report format (raw data + config for reprocessing)
export interface StoredReportData {
  raw: AnnualReportData;
  config: ReportProcessingConfig;
}
