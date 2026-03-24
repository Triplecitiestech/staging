/**
 * Report Processor — Single source of truth for report filtering and rendering decisions.
 * Both browser and PDF rendering consume the ProcessedReport output.
 * NO filtering logic should exist in renderers.
 */

import {
  AnnualReportData,
  AnnualReportVariant,
  ReportProcessingConfig,
  ProcessedReport,
  ProcessedSection,
  StatCardData,
  SECTION_TITLES,
  SOURCE_TO_SECTION,
} from './types';

export function processReport(
  data: AnnualReportData,
  config: ReportProcessingConfig,
): ProcessedReport {
  const { variant, hiddenSections } = config;
  const isInternal = variant === 'internal';
  const hidden = new Set(hiddenSections);
  const show = (key: string) => !hidden.has(key);

  // Step 1: Apply customer variant data filtering (mutates a copy)
  const d = JSON.parse(JSON.stringify(data)) as AnnualReportData;
  if (!isInternal) {
    applyCustomerFiltering(d);
  }

  // Step 2: Determine data availability
  const hasTickets = d.ticketing.totalTickets > 0;
  const hasRmm = d.dattoRmm.available && (d.dattoRmm.totalAlerts > 0 || (d.dattoRmm.endpointCount ?? 0) > 0 || d.dattoRmm.devicesManaged > 0);
  const hasEdr = d.dattoEdr?.available && d.dattoEdr.totalEvents > 0;
  const hasDns = d.dnsFilter?.available && d.dnsFilter.totalQueries > 0;
  const hasBcdr = d.dattoBcdr?.available && d.dattoBcdr.totalDevices > 0;
  const hasSaas = d.dattoSaas?.available && d.dattoSaas.totalSeats > 0;
  const hasSoc = d.security.socIncidents.available && d.security.socIncidents.totalIncidents > 0;
  const hasHealth = !!d.healthSnapshot && d.healthSnapshot.overallScore >= 60;
  const hasUserProtection = !!d.userProtection?.available;

  // Step 3: Build section visibility
  const sectionTitle = (key: string) => {
    const titles = SECTION_TITLES[key];
    return titles ? (isInternal ? titles.internal : titles.customer) : key;
  };

  const sections: ProcessedSection[] = [
    { key: 'dataSources', title: sectionTitle('dataSources'), visible: true, hasData: true },
    { key: 'executiveSummary', title: 'Executive Summary', visible: true, hasData: true },
    { key: 'ticketing', title: sectionTitle('ticketing'), visible: show('ticketing') && (isInternal || hasTickets), hasData: hasTickets },
    { key: 'ticketingPriority', title: 'By Priority', visible: show('ticketing') && show('ticketingPriority') && hasTickets && d.ticketing.ticketsByPriority.length > 0, hasData: d.ticketing.ticketsByPriority.length > 0 },
    { key: 'ticketingTrends', title: 'Monthly Trends', visible: show('ticketing') && show('ticketingTrends') && hasTickets && d.ticketing.monthlyTrends.length > 0, hasData: d.ticketing.monthlyTrends.length > 0 },
    { key: 'ticketingCategories', title: 'By Category', visible: show('ticketing') && show('ticketingCategories') && hasTickets && d.ticketing.ticketsByCategory.length > 0, hasData: d.ticketing.ticketsByCategory.length > 0 },
    { key: 'rmm', title: sectionTitle('rmm'), visible: show('rmm') && (isInternal || hasRmm), hasData: hasRmm },
    { key: 'edr', title: sectionTitle('edr'), visible: show('edr') && (isInternal || hasEdr), hasData: hasEdr },
    { key: 'dns', title: sectionTitle('dns'), visible: show('dns') && (isInternal || hasDns), hasData: hasDns },
    { key: 'bcdr', title: sectionTitle('bcdr'), visible: show('bcdr') && (isInternal || hasBcdr), hasData: hasBcdr },
    { key: 'saas', title: sectionTitle('saas'), visible: show('saas') && (isInternal || hasSaas), hasData: hasSaas },
    { key: 'security', title: sectionTitle('security'), visible: show('security') && (isInternal || d.security.sources.some(s => s.available) || hasSoc), hasData: hasSoc || d.security.sources.some(s => s.available) },
    { key: 'emailSecurity', title: sectionTitle('emailSecurity'), visible: isInternal, hasData: false },
    { key: 'userProtection', title: sectionTitle('userProtection'), visible: show('userProtection') && hasUserProtection, hasData: hasUserProtection },
    { key: 'health', title: sectionTitle('health'), visible: show('health') && !!d.healthSnapshot && (isInternal || hasHealth), hasData: !!d.healthSnapshot },
  ];

  // Step 4: Filter data sources based on section visibility + variant
  const dataSources = (isInternal ? d.dataSources : d.dataSources.filter(ds => ds.available))
    .filter(ds => {
      const sectionKey = SOURCE_TO_SECTION[ds.source];
      return !sectionKey || show(sectionKey);
    });

  // Step 5: Filter key trends for customer variant
  const keyTrends = isInternal
    ? d.executiveSummary.keyTrends
    : d.executiveSummary.keyTrends.filter(t => {
        const lower = t.toLowerCase();
        return !lower.includes('not available') && !lower.includes('error') && !lower.includes('failed') && !lower.includes('not yet');
      });

  // Step 6: Build summary stat cards based on visible sections
  const summaryCards: StatCardData[] = [];
  if (show('ticketing') && hasTickets) summaryCards.push({ label: 'Support Tickets Resolved', value: d.ticketing.totalTickets });
  if (show('edr') && hasEdr) summaryCards.push({ label: 'Security Events Analyzed', value: d.dattoEdr.totalEvents.toLocaleString() });
  if (show('rmm') && hasRmm) summaryCards.push({ label: 'Endpoints Managed', value: d.dattoRmm.endpointCount || d.dattoRmm.devicesManaged });
  if (show('dns') && hasDns) summaryCards.push({ label: 'DNS Threats Blocked', value: d.dnsFilter!.blockedQueries.toLocaleString() });
  if (show('bcdr') && hasBcdr) summaryCards.push({ label: 'Systems Protected', value: d.dattoBcdr!.totalAgents });
  if (show('saas') && hasSaas) summaryCards.push({ label: 'Cloud Seats Backed Up', value: d.dattoSaas!.activeSeats });
  if (show('security') && hasSoc) summaryCards.push({ label: 'Security Incidents Handled', value: d.security.socIncidents.totalIncidents });

  // Step 7: Filter security sources for customer
  if (!isInternal) {
    d.security.sources = d.security.sources.filter(s => s.available);
  }

  return {
    metadata: {
      companyName: d.company.name,
      companyId: d.company.id,
      periodStart: d.period.start,
      periodEnd: d.period.end,
      periodLabel: d.period.label,
      variant,
      generatedAt: d.generatedAt,
      isInternal,
    },
    sections,
    dataSources,
    summaryCards,
    keyTrends,
    topIssueCategories: d.executiveSummary.topIssueCategories,
    dataCoverageNotes: isInternal ? d.executiveSummary.dataCoverageNotes : [],
    ticketing: d.ticketing,
    dattoRmm: d.dattoRmm,
    dattoEdr: d.dattoEdr,
    dnsFilter: d.dnsFilter,
    dattoBcdr: d.dattoBcdr,
    dattoSaas: d.dattoSaas,
    security: d.security,
    userProtection: d.userProtection,
    emailSecurity: d.emailSecurity,
    healthSnapshot: d.healthSnapshot,
    showInternalColumns: isInternal,
  };
}

/** Customer variant: hide negative metrics, unavailable data */
function applyCustomerFiltering(d: AnnualReportData): void {
  // SLA: hide if below 95%
  const respSla = d.ticketing.responseMetrics.slaResponseCompliance;
  const resSla = d.ticketing.responseMetrics.slaResolutionCompliance;
  const bestSla = Math.max(respSla ?? 0, resSla ?? 0);
  if (bestSla > 0 && bestSla < 95) {
    d.ticketing.responseMetrics.slaResponseCompliance = null;
    d.ticketing.responseMetrics.slaResolutionCompliance = null;
  }

  // Reopen rate: hide if above 5%
  if (d.ticketing.responseMetrics.reopenRate !== null && d.ticketing.responseMetrics.reopenRate > 5) {
    d.ticketing.responseMetrics.reopenRate = null;
  }

  // Data sources: only show available
  d.dataSources = d.dataSources.filter(ds => ds.available);

  // Clear coverage notes
  d.executiveSummary.dataCoverageNotes = [];

  // SaaS: hide unprotected/paused seats
  if (d.dattoSaas?.available) {
    d.dattoSaas.unprotectedSeats = 0;
    d.dattoSaas.pausedSeats = 0;
    d.dattoSaas.archivedSeats = 0;
  }

  // BCDR: clear alert types
  if (d.dattoBcdr?.available) {
    d.dattoBcdr.alertsByType = [];
  }
}

/**
 * Parse stored report data — handles both old format (raw AnnualReportData)
 * and new format ({ raw, config }).
 */
export function parseStoredReport(reportData: unknown, variant: string): { raw: AnnualReportData; config: ReportProcessingConfig } {
  const data = reportData as Record<string, unknown>;
  if (data.raw && data.config) {
    return { raw: data.raw as AnnualReportData, config: data.config as ReportProcessingConfig };
  }
  // Legacy format: treat entire object as raw data
  return {
    raw: reportData as AnnualReportData,
    config: { variant: variant as AnnualReportVariant, hiddenSections: (reportData as AnnualReportData).hiddenSections || [] },
  };
}
