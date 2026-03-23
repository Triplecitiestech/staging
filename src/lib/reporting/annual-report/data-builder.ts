/**
 * Data builder for Annual Service Reports.
 * Collects data from Autotask tickets, Datto RMM alerts, and SOC incidents.
 * Clearly labels missing/partial data sources.
 */

import { prisma } from '@/lib/prisma';
import { PRIORITY_LABELS, getResolvedStatuses } from '../types';
import { DattoRmmClient } from '@/lib/datto-rmm';
import { DattoEdrClient } from '@/lib/datto-edr';
import { DnsFilterClient } from '@/lib/dnsfilter';
import { DattoBcdrClient } from '@/lib/datto-bcdr';
import {
  AnnualReportData,
  DataSourceCoverage,
  ExecutiveSummary,
  TicketingAnalysis,
  DattoRmmAnalysis,
  DattoEdrAnalysis,
  DnsFilterAnalysis,
  DattoBcdrAnalysis,
  SecurityAnalysis,
  EmailSecurityAnalysis,
  MonthlyTrend,
} from './types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ============================================
// MAIN DATA BUILDER
// ============================================

export async function buildAnnualReportData(
  companyId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<AnnualReportData> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true, autotaskCompanyId: true },
  });
  if (!company) throw new Error(`Company not found: ${companyId}`);

  console.log(`[annualReport] Building for ${company.displayName}, ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

  // Collect all sections in parallel where possible
  const [ticketing, dattoRmm, dattoEdr, dnsFilter, dattoBcdr, security, healthSnapshot] = await Promise.all([
    buildTicketingAnalysis(companyId, periodStart, periodEnd),
    buildDattoRmmAnalysis(company.displayName, periodStart, periodEnd),
    buildDattoEdrAnalysis(periodStart, periodEnd),
    buildDnsFilterAnalysis(periodStart, periodEnd),
    buildDattoBcdrAnalysis(company.displayName),
    buildSecurityAnalysis(companyId, periodStart, periodEnd),
    buildHealthSnapshot(companyId),
  ]);

  const emailSecurity = buildEmailSecurityPlaceholder();
  const dataSources = buildDataSourceCoverage(ticketing, dattoRmm, dattoEdr, dnsFilter, dattoBcdr, security, emailSecurity, periodStart, periodEnd);
  const executiveSummary = buildExecutiveSummary(ticketing, dattoRmm, dattoEdr, dnsFilter, dattoBcdr, security, emailSecurity, dataSources);

  const periodLabel = `Annual Service Report — ${formatMonthYear(periodStart)} to ${formatMonthYear(periodEnd)}`;

  return {
    company: {
      id: company.id,
      name: company.displayName,
      autotaskCompanyId: company.autotaskCompanyId,
    },
    period: {
      start: periodStart.toISOString().split('T')[0],
      end: periodEnd.toISOString().split('T')[0],
      label: periodLabel,
    },
    dataSources,
    executiveSummary,
    ticketing,
    dattoRmm,
    dattoEdr,
    dnsFilter,
    dattoBcdr,
    security,
    emailSecurity,
    healthSnapshot,
    generatedAt: new Date().toISOString(),
    version: 1,
  };
}

// ============================================
// TICKETING ANALYSIS (from Autotask data)
// ============================================

async function buildTicketingAnalysis(
  companyId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<TicketingAnalysis> {
  const resolvedSet = new Set(getResolvedStatuses());

  interface TicketRow {
    autotaskTicketId: string;
    status: number;
    statusLabel: string | null;
    priority: number;
    createDate: Date;
    completedDate: Date | null;
    queueLabel: string | null;
    issueType: number | null;
    subIssueType: number | null;
    source: number | null;
    sourceLabel: string | null;
    assignedResourceId: number | null;
    dueDateTime: Date | null;
  }

  // Get all tickets active in the period
  const tickets: TicketRow[] = await prisma.ticket.findMany({
    where: {
      companyId,
      OR: [
        { createDate: { gte: periodStart, lte: periodEnd } },
        { completedDate: { gte: periodStart, lte: periodEnd } },
      ],
    },
    select: {
      autotaskTicketId: true,
      status: true,
      statusLabel: true,
      priority: true,
      createDate: true,
      completedDate: true,
      queueLabel: true,
      issueType: true,
      subIssueType: true,
      source: true,
      sourceLabel: true,
      assignedResourceId: true,
      dueDateTime: true,
    },
  });

  const createdInPeriod = tickets.filter((t: TicketRow) => t.createDate >= periodStart && t.createDate <= periodEnd);
  const closedInPeriod = tickets.filter((t: TicketRow) =>
    resolvedSet.has(t.status) && t.completedDate &&
    t.completedDate >= periodStart && t.completedDate <= periodEnd
  );

  // Tickets by status
  const statusCounts = new Map<string, number>();
  for (const t of createdInPeriod) {
    const label = t.statusLabel || String(t.status) || 'Unknown';
    statusCounts.set(label, (statusCounts.get(label) || 0) + 1);
  }
  const totalTickets = createdInPeriod.length;
  const ticketsByStatus = Array.from(statusCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      status,
      count,
      percentage: round1((count / (totalTickets || 1)) * 100),
    }));

  // Tickets by priority
  const priorityCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const t of createdInPeriod) {
    if (priorityCounts[t.priority] !== undefined) priorityCounts[t.priority]++;
  }

  // Resolution time per priority
  const resByPriority = new Map<number, number[]>();
  for (const t of closedInPeriod) {
    if (t.completedDate) {
      const mins = (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60);
      if (mins > 0) {
        const arr = resByPriority.get(t.priority) || [];
        arr.push(mins);
        resByPriority.set(t.priority, arr);
      }
    }
  }

  const ticketsByPriority = [1, 2, 3, 4]
    .filter(p => priorityCounts[p] > 0)
    .map(p => {
      const resArr = resByPriority.get(p) || [];
      return {
        priority: PRIORITY_LABELS[p] || `Priority ${p}`,
        priorityValue: p,
        count: priorityCounts[p],
        percentage: round1((priorityCounts[p] / (totalTickets || 1)) * 100),
        avgResolutionMinutes: resArr.length > 0
          ? Math.round(resArr.reduce((a, b) => a + b, 0) / resArr.length)
          : null,
      };
    });

  // Tickets by category (queue)
  const categoryCounts = new Map<string, number>();
  for (const t of createdInPeriod) {
    const cat = t.queueLabel || 'General';
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }
  const ticketsByCategory = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({
      category,
      count,
      percentage: round1((count / (totalTickets || 1)) * 100),
    }));

  // Most common issues (queue + source as proxy since issueType is an integer picklist)
  const issueCounts = new Map<string, number>();
  for (const t of createdInPeriod) {
    const issue = t.queueLabel || 'Unclassified';
    issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
  }
  const mostCommonIssues = Array.from(issueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issue, count]) => ({ issue, count }));

  // Monthly trends
  const monthlyTrends = buildMonthlyTicketTrends(tickets, resolvedSet, periodStart, periodEnd, companyId);

  // Response/resolution metrics
  interface NoteRow { autotaskTicketId: string; createDateTime: Date }
  const allTicketIds = createdInPeriod.map((t: TicketRow) => t.autotaskTicketId);
  const notes: NoteRow[] = allTicketIds.length > 0
    ? await prisma.ticketNote.findMany({
        where: { autotaskTicketId: { in: allTicketIds }, creatorResourceId: { not: null } },
        select: { autotaskTicketId: true, createDateTime: true },
        orderBy: { createDateTime: 'asc' },
      })
    : [];

  const firstNoteByTicket = new Map<string, Date>();
  for (const n of notes) {
    if (!firstNoteByTicket.has(n.autotaskTicketId)) {
      firstNoteByTicket.set(n.autotaskTicketId, n.createDateTime);
    }
  }

  const frtMinutes: number[] = [];
  const resolutionMinutes: number[] = [];
  for (const t of closedInPeriod) {
    if (t.completedDate) {
      const mins = (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60);
      if (mins > 0) resolutionMinutes.push(mins);
    }
    const firstNote = firstNoteByTicket.get(t.autotaskTicketId);
    if (firstNote) {
      const frt = (firstNote.getTime() - t.createDate.getTime()) / (1000 * 60);
      if (frt >= 0) frtMinutes.push(frt);
    }
  }
  // Also FRT for open tickets created in period
  for (const t of createdInPeriod) {
    if (!closedInPeriod.some((c: TicketRow) => c.autotaskTicketId === t.autotaskTicketId)) {
      const firstNote = firstNoteByTicket.get(t.autotaskTicketId);
      if (firstNote) {
        const frt = (firstNote.getTime() - t.createDate.getTime()) / (1000 * 60);
        if (frt >= 0) frtMinutes.push(frt);
      }
    }
  }

  // FTR
  let firstTouchCount = 0;
  for (const t of closedInPeriod) {
    const techNotes = notes.filter((n: NoteRow) => n.autotaskTicketId === t.autotaskTicketId);
    if (techNotes.length <= 1) firstTouchCount++;
  }

  // SLA
  const slaTickets = closedInPeriod.filter((t: TicketRow) => t.dueDateTime);
  const slaMet = slaTickets.filter((t: TicketRow) => t.completedDate! <= t.dueDateTime!).length;

  // Time entries for hours
  const allCompanyTicketIds = await prisma.ticket.findMany({
    where: { companyId },
    select: { autotaskTicketId: true },
  });
  const allIds = allCompanyTicketIds.map((t: { autotaskTicketId: string }) => t.autotaskTicketId);
  const timeEntries = allIds.length > 0
    ? await prisma.ticketTimeEntry.findMany({
        where: {
          autotaskTicketId: { in: allIds },
          dateWorked: { gte: periodStart, lte: periodEnd },
        },
        select: { hoursWorked: true },
      })
    : [];

  // Work breakdown by source
  const sourceCounts = { reactive: 0, maintenance: 0, project: 0, other: 0 };
  for (const t of createdInPeriod) {
    const src = (t.sourceLabel || '').toLowerCase();
    if (src.includes('monitor') || src.includes('alert') || src.includes('rmm')) {
      sourceCounts.maintenance++;
    } else if (src.includes('project')) {
      sourceCounts.project++;
    } else if (src.includes('phone') || src.includes('email') || src.includes('portal') || src.includes('web')) {
      sourceCounts.reactive++;
    } else {
      sourceCounts.other++;
    }
  }

  // Compute monthly trends with time entries
  const monthlyTrendsWithHours = await enrichMonthlyTrendsWithHours(
    monthlyTrends, allIds, periodStart, periodEnd
  );

  return {
    totalTickets,
    ticketsByStatus,
    ticketsByPriority,
    ticketsByCategory,
    mostCommonIssues,
    monthlyTrends: monthlyTrendsWithHours,
    responseMetrics: {
      avgFirstResponseMinutes: avg(frtMinutes),
      medianFirstResponseMinutes: median(frtMinutes.sort((a, b) => a - b)),
      avgResolutionMinutes: avg(resolutionMinutes),
      medianResolutionMinutes: median(resolutionMinutes.sort((a, b) => a - b)),
      firstTouchResolutionRate: closedInPeriod.length > 0
        ? round1((firstTouchCount / closedInPeriod.length) * 100) : null,
      reopenRate: null, // Autotask doesn't reliably track reopens
      slaResponseCompliance: slaTickets.length > 0
        ? round1((slaMet / slaTickets.length) * 100) : null,
      slaResolutionCompliance: slaTickets.length > 0
        ? round1((slaMet / slaTickets.length) * 100) : null,
    },
    workBreakdown: sourceCounts,
  };
}

function buildMonthlyTicketTrends(
  tickets: Array<{ createDate: Date; completedDate: Date | null; status: number }>,
  resolvedSet: Set<number>,
  periodStart: Date,
  periodEnd: Date,
  _companyId: string,
): MonthlyTrend[] {
  const months: MonthlyTrend[] = [];
  const cursor = new Date(periodStart);

  while (cursor < periodEnd) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    const effectiveEnd = monthEnd > periodEnd ? periodEnd : monthEnd;

    const created = tickets.filter(t =>
      t.createDate >= monthStart && t.createDate <= effectiveEnd
    ).length;
    const closed = tickets.filter(t =>
      resolvedSet.has(t.status) && t.completedDate &&
      t.completedDate >= monthStart && t.completedDate <= effectiveEnd
    ).length;

    const closedTickets = tickets.filter(t =>
      resolvedSet.has(t.status) && t.completedDate &&
      t.completedDate >= monthStart && t.completedDate <= effectiveEnd
    );
    const resMins = closedTickets
      .map(t => t.completedDate ? (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60) : null)
      .filter((m): m is number => m !== null && m > 0);

    months.push({
      month: `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`,
      label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`,
      ticketsCreated: created,
      ticketsClosed: closed,
      supportHours: 0, // enriched later
      avgResolutionMinutes: avg(resMins),
    });

    cursor.setMonth(cursor.getMonth() + 1);
    cursor.setDate(1);
  }

  return months;
}

async function enrichMonthlyTrendsWithHours(
  trends: MonthlyTrend[],
  allTicketIds: string[],
  _periodStart: Date,
  _periodEnd: Date,
): Promise<MonthlyTrend[]> {
  if (allTicketIds.length === 0) return trends;

  for (const trend of trends) {
    const [year, month] = trend.month.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const entries = await prisma.ticketTimeEntry.findMany({
      where: {
        autotaskTicketId: { in: allTicketIds },
        dateWorked: { gte: monthStart, lte: monthEnd },
      },
      select: { hoursWorked: true },
    });

    trend.supportHours = round1(entries.reduce((s: number, e: { hoursWorked: number }) => s + e.hoursWorked, 0));
  }

  return trends;
}

// ============================================
// DATTO RMM ANALYSIS
// ============================================

async function buildDattoRmmAnalysis(
  companyName: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<DattoRmmAnalysis> {
  const client = new DattoRmmClient();

  if (!client.isConfigured()) {
    return {
      available: false,
      totalAlerts: 0,
      alertsResolved: 0,
      alertsOpen: 0,
      devicesManaged: 0,
      alertsByType: [],
      alertsByPriority: [],
      monthlyAlertTrends: [],
      topAlertingSites: [],
      note: 'Datto RMM integration not configured. Set DATTO_RMM_API_KEY and DATTO_RMM_API_SECRET environment variables.',
    };
  }

  try {
    // Fetch alerts and devices
    const [allAlerts, resolvedAlerts, sites] = await Promise.all([
      client.getOpenAlerts(10),
      client.getResolvedAlerts(20),
      client.getSites(),
    ]);

    const combinedAlerts = [...allAlerts, ...resolvedAlerts];

    // Filter to period and match by site name containing company name
    // Datto RMM doesn't have a company ID mapping — match by site name
    const companyWords = companyName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const matchingSites = sites.filter(s => {
      const siteLower = s.name.toLowerCase();
      return companyWords.some(w => siteLower.includes(w));
    });
    const matchingSiteIds = new Set(matchingSites.map(s => s.id));

    // Filter alerts by matching sites and date range
    const periodAlerts = combinedAlerts.filter(a => {
      if (!matchingSiteIds.has(a.siteUid) && !companyWords.some(w => a.siteName.toLowerCase().includes(w))) {
        return false;
      }
      const alertDate = new Date(a.timestamp);
      return alertDate >= periodStart && alertDate <= periodEnd;
    });

    const resolved = periodAlerts.filter(a => a.resolved);
    const open = periodAlerts.filter(a => !a.resolved);

    // Devices managed — count from matching sites
    const devicesManaged = matchingSites.reduce((s, site) => s + site.devicesCount, 0);

    // Alerts by type
    const typeCounts = new Map<string, number>();
    for (const a of periodAlerts) {
      typeCounts.set(a.alertType, (typeCounts.get(a.alertType) || 0) + 1);
    }
    const alertsByType = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    // Alerts by priority
    const prioCounts = new Map<string, number>();
    for (const a of periodAlerts) {
      prioCounts.set(a.priority, (prioCounts.get(a.priority) || 0) + 1);
    }
    const alertsByPriority = Array.from(prioCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([priority, count]) => ({ priority, count }));

    // Monthly trends
    const monthlyAlertTrends = buildMonthlyAlertTrends(periodAlerts, periodStart, periodEnd);

    // Top alerting sites
    const siteCounts = new Map<string, number>();
    for (const a of periodAlerts) {
      const name = a.siteName || 'Unknown';
      siteCounts.set(name, (siteCounts.get(name) || 0) + 1);
    }
    const topAlertingSites = Array.from(siteCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([siteName, alertCount]) => ({ siteName, alertCount }));

    return {
      available: true,
      totalAlerts: periodAlerts.length,
      alertsResolved: resolved.length,
      alertsOpen: open.length,
      devicesManaged,
      alertsByType,
      alertsByPriority,
      monthlyAlertTrends,
      topAlertingSites,
      note: matchingSites.length === 0
        ? `No Datto RMM sites found matching "${companyName}". Site-to-company mapping may need manual configuration.`
        : null,
    };
  } catch (error) {
    console.error('[annualReport] Datto RMM fetch error:', error);
    return {
      available: false,
      totalAlerts: 0,
      alertsResolved: 0,
      alertsOpen: 0,
      devicesManaged: 0,
      alertsByType: [],
      alertsByPriority: [],
      monthlyAlertTrends: [],
      topAlertingSites: [],
      note: `Datto RMM data fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

function buildMonthlyAlertTrends(
  alerts: Array<{ timestamp: string; resolved: boolean }>,
  periodStart: Date,
  periodEnd: Date,
): Array<{ month: string; label: string; alerts: number; resolved: number }> {
  const trends: Array<{ month: string; label: string; alerts: number; resolved: number }> = [];
  const cursor = new Date(periodStart);

  while (cursor < periodEnd) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);

    const monthAlerts = alerts.filter(a => {
      const d = new Date(a.timestamp);
      return d >= monthStart && d <= monthEnd;
    });

    trends.push({
      month: `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`,
      label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`,
      alerts: monthAlerts.length,
      resolved: monthAlerts.filter(a => a.resolved).length,
    });

    cursor.setMonth(cursor.getMonth() + 1);
    cursor.setDate(1);
  }

  return trends;
}

// ============================================
// SECURITY ANALYSIS (SOC incidents)
// ============================================

async function buildSecurityAnalysis(
  companyId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<SecurityAnalysis> {
  const sources = [
    { name: 'SOC Analyst Agent (Autotask Tickets)', available: true, note: null },
    { name: 'RocketCyber', available: false, note: 'Integration not yet implemented. Requires RocketCyber API credentials.' },
    { name: 'Datto EDR', available: false, note: 'Integration not yet implemented. Requires Datto EDR API access.' },
    { name: 'DNSFilter', available: false, note: 'Integration not yet implemented. Requires DNSFilter API credentials.' },
  ];

  // Try to query SOC incidents for this company
  const socIncidents = {
    available: false,
    totalIncidents: 0,
    bySeverity: [] as Array<{ severity: string; count: number }>,
    byStatus: [] as Array<{ status: string; count: number }>,
    monthlyTrends: [] as Array<{ month: string; label: string; incidents: number }>,
  };

  try {
    // SOC tables may not exist — query carefully
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { autotaskCompanyId: true },
    });

    if (company?.autotaskCompanyId) {
      // Check if soc_incidents table exists
      const tableCheck = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'soc_incidents')`
      );

      if (tableCheck[0]?.exists) {
        const incidents = await prisma.$queryRawUnsafe<Array<{
          id: string;
          severity: string;
          status: string;
          created_at: Date;
        }>>(
          `SELECT id, severity, status, created_at FROM soc_incidents
           WHERE company_id = $1
           AND created_at >= $2 AND created_at <= $3`,
          company.autotaskCompanyId,
          periodStart,
          periodEnd,
        );

        if (incidents.length > 0) {
          socIncidents.available = true;
          socIncidents.totalIncidents = incidents.length;

          // By severity
          const sevCounts = new Map<string, number>();
          for (const i of incidents) {
            sevCounts.set(i.severity || 'unknown', (sevCounts.get(i.severity || 'unknown') || 0) + 1);
          }
          socIncidents.bySeverity = Array.from(sevCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([severity, count]) => ({ severity, count }));

          // By status
          const statusCounts = new Map<string, number>();
          for (const i of incidents) {
            statusCounts.set(i.status || 'unknown', (statusCounts.get(i.status || 'unknown') || 0) + 1);
          }
          socIncidents.byStatus = Array.from(statusCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => ({ status, count }));

          // Monthly trends
          socIncidents.monthlyTrends = buildMonthlySocTrends(incidents, periodStart, periodEnd);
        }
      }
    }
  } catch (error) {
    console.error('[annualReport] SOC query error:', error);
    socIncidents.available = false;
  }

  return {
    available: socIncidents.available,
    sources,
    socIncidents,
    note: !socIncidents.available
      ? 'SOC incident data is limited to AI-classified tickets from Autotask. Additional security sources (RocketCyber, Datto EDR, DNSFilter) are not yet integrated.'
      : null,
  };
}

function buildMonthlySocTrends(
  incidents: Array<{ created_at: Date }>,
  periodStart: Date,
  periodEnd: Date,
): Array<{ month: string; label: string; incidents: number }> {
  const trends: Array<{ month: string; label: string; incidents: number }> = [];
  const cursor = new Date(periodStart);

  while (cursor < periodEnd) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = incidents.filter(i => {
      const d = new Date(i.created_at);
      return d >= monthStart && d <= monthEnd;
    }).length;

    trends.push({
      month: `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`,
      label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`,
      incidents: count,
    });

    cursor.setMonth(cursor.getMonth() + 1);
    cursor.setDate(1);
  }

  return trends;
}

// ============================================
// DATTO EDR ANALYSIS
// ============================================

async function buildDattoEdrAnalysis(
  periodStart: Date,
  periodEnd: Date,
): Promise<DattoEdrAnalysis> {
  const client = new DattoEdrClient();
  return client.buildSummary(periodStart, periodEnd);
}

// ============================================
// DNSFILTER ANALYSIS
// ============================================

async function buildDnsFilterAnalysis(
  periodStart: Date,
  periodEnd: Date,
): Promise<DnsFilterAnalysis> {
  const client = new DnsFilterClient();
  return client.buildSummary(periodStart, periodEnd);
}

// ============================================
// DATTO BCDR (BACKUPS) ANALYSIS
// ============================================

async function buildDattoBcdrAnalysis(
  companyName: string,
): Promise<DattoBcdrAnalysis> {
  const client = new DattoBcdrClient();
  return client.buildSummary(companyName);
}

// ============================================
// EMAIL SECURITY (Inky — NOT INTEGRATED)
// ============================================

function buildEmailSecurityPlaceholder(): EmailSecurityAnalysis {
  return {
    available: false,
    note: 'Inky email security integration is not yet implemented. To add this data source, the following is required:\n' +
      '1. Inky API credentials (API key or OAuth2 client)\n' +
      '2. Environment variables: INKY_API_KEY, INKY_API_URL\n' +
      '3. API client module at src/lib/inky.ts\n' +
      '4. Data sync job for historical email security events\n' +
      '5. Company-to-Inky tenant mapping\n' +
      'Note: Inky data is expected to start from January 2026 — any report including earlier months will have partial coverage.',
  };
}

// ============================================
// HEALTH SNAPSHOT
// ============================================

async function buildHealthSnapshot(companyId: string) {
  const health = await prisma.customerHealthScore.findFirst({
    where: { companyId },
    orderBy: { computedAt: 'desc' },
  });

  if (!health) return null;

  return {
    overallScore: health.overallScore,
    tier: health.overallScore >= 80 ? 'Healthy'
      : health.overallScore >= 60 ? 'Watch'
      : health.overallScore >= 40 ? 'At Risk'
      : 'Critical',
    trend: health.trend,
    previousScore: health.previousScore,
  };
}

// ============================================
// DATA SOURCE COVERAGE
// ============================================

function buildDataSourceCoverage(
  ticketing: TicketingAnalysis,
  dattoRmm: DattoRmmAnalysis,
  dattoEdr: DattoEdrAnalysis,
  dnsFilter: DnsFilterAnalysis,
  dattoBcdr: DattoBcdrAnalysis,
  security: SecurityAnalysis,
  emailSecurity: EmailSecurityAnalysis,
  periodStart: Date,
  periodEnd: Date,
): DataSourceCoverage[] {
  const start = periodStart.toISOString().split('T')[0];
  const end = periodEnd.toISOString().split('T')[0];

  return [
    {
      source: 'Autotask PSA (Ticketing)',
      available: ticketing.totalTickets > 0,
      coverageStart: ticketing.totalTickets > 0 ? start : null,
      coverageEnd: ticketing.totalTickets > 0 ? end : null,
      isPartial: false,
      note: ticketing.totalTickets === 0 ? 'No tickets found for this company in the specified period.' : null,
    },
    {
      source: 'Datto RMM (Endpoint Operations)',
      available: dattoRmm.available,
      coverageStart: dattoRmm.available ? start : null,
      coverageEnd: dattoRmm.available ? end : null,
      isPartial: !dattoRmm.available,
      note: dattoRmm.note,
    },
    {
      source: 'Datto EDR (Endpoint Detection & Response)',
      available: dattoEdr.available,
      coverageStart: dattoEdr.available ? start : null,
      coverageEnd: dattoEdr.available ? end : null,
      isPartial: !dattoEdr.available,
      note: dattoEdr.note,
    },
    {
      source: 'DNSFilter (DNS Security)',
      available: dnsFilter.available,
      coverageStart: dnsFilter.available ? start : null,
      coverageEnd: dnsFilter.available ? end : null,
      isPartial: !dnsFilter.available,
      note: dnsFilter.note,
    },
    {
      source: 'Datto BCDR (Backups)',
      available: dattoBcdr.available,
      coverageStart: dattoBcdr.available ? start : null,
      coverageEnd: dattoBcdr.available ? end : null,
      isPartial: !dattoBcdr.available,
      note: dattoBcdr.note,
    },
    {
      source: 'SOC Analyst Agent (Security)',
      available: security.socIncidents.available,
      coverageStart: security.socIncidents.available ? start : null,
      coverageEnd: security.socIncidents.available ? end : null,
      isPartial: !security.socIncidents.available,
      note: security.note,
    },
    {
      source: 'RocketCyber',
      available: false,
      coverageStart: null,
      coverageEnd: null,
      isPartial: true,
      note: 'Integration not yet implemented. No API credentials provided.',
    },
    {
      source: 'Inky (Email Security)',
      available: emailSecurity.available,
      coverageStart: null,
      coverageEnd: null,
      isPartial: true,
      note: emailSecurity.note,
    },
  ];
}

// ============================================
// EXECUTIVE SUMMARY
// ============================================

function buildExecutiveSummary(
  ticketing: TicketingAnalysis,
  dattoRmm: DattoRmmAnalysis,
  dattoEdr: DattoEdrAnalysis,
  dnsFilter: DnsFilterAnalysis,
  dattoBcdr: DattoBcdrAnalysis,
  security: SecurityAnalysis,
  _emailSecurity: EmailSecurityAnalysis,
  dataSources: DataSourceCoverage[],
): ExecutiveSummary {
  const topCategories = ticketing.ticketsByCategory.slice(0, 5).map((c: { category: string }) => c.category);

  const keyTrends: string[] = [];
  if (ticketing.monthlyTrends.length >= 3) {
    const firstHalf = ticketing.monthlyTrends.slice(0, Math.floor(ticketing.monthlyTrends.length / 2));
    const secondHalf = ticketing.monthlyTrends.slice(Math.floor(ticketing.monthlyTrends.length / 2));
    const firstAvg = firstHalf.reduce((s: number, m: MonthlyTrend) => s + m.ticketsCreated, 0) / (firstHalf.length || 1);
    const secondAvg = secondHalf.reduce((s: number, m: MonthlyTrend) => s + m.ticketsCreated, 0) / (secondHalf.length || 1);
    if (secondAvg > firstAvg * 1.2) {
      keyTrends.push('Ticket volume has increased in the second half of the reporting period.');
    } else if (secondAvg < firstAvg * 0.8) {
      keyTrends.push('Ticket volume has decreased in the second half of the reporting period, indicating improved stability.');
    } else {
      keyTrends.push('Ticket volume remained relatively stable throughout the reporting period.');
    }
  }

  if (ticketing.responseMetrics.avgFirstResponseMinutes !== null) {
    const frt = ticketing.responseMetrics.avgFirstResponseMinutes;
    if (frt < 60) {
      keyTrends.push(`Average first response time of ${Math.round(frt)} minutes demonstrates rapid incident acknowledgment.`);
    } else {
      keyTrends.push(`Average first response time of ${(frt / 60).toFixed(1)} hours.`);
    }
  }

  if (dattoRmm.available && dattoRmm.totalAlerts > 0) {
    const resolveRate = dattoRmm.alertsResolved > 0
      ? round1((dattoRmm.alertsResolved / dattoRmm.totalAlerts) * 100)
      : 0;
    keyTrends.push(`${dattoRmm.totalAlerts} RMM alerts processed with ${resolveRate}% resolution rate.`);
  }

  if (dattoEdr.available && dattoEdr.totalEvents > 0) {
    keyTrends.push(`${dattoEdr.totalEvents} endpoint security events detected and analyzed by Datto EDR.`);
  }

  if (dnsFilter.available && dnsFilter.blockedQueries > 0) {
    keyTrends.push(`DNSFilter blocked ${dnsFilter.blockedQueries.toLocaleString()} malicious or policy-violating DNS queries.`);
  }

  if (dattoBcdr.available && dattoBcdr.totalDevices > 0) {
    keyTrends.push(`${dattoBcdr.totalDevices} backup devices protecting ${dattoBcdr.totalAgents} systems via Datto BCDR.`);
  }

  // Total alerts = RMM + EDR + security incidents
  const totalAlerts = dattoRmm.totalAlerts + dattoEdr.totalEvents + security.socIncidents.totalIncidents;

  const dataCoverageNotes = dataSources
    .filter((ds: DataSourceCoverage) => !ds.available || ds.isPartial)
    .map((ds: DataSourceCoverage) => `${ds.source}: ${ds.note || 'Data not available'}`);

  return {
    totalTickets: ticketing.totalTickets,
    topIssueCategories: topCategories,
    totalAlerts,
    totalSecurityIncidents: security.socIncidents.totalIncidents + dattoEdr.totalEvents,
    keyTrends,
    dataCoverageNotes,
  };
}

// ============================================
// HELPERS
// ============================================

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round1((sorted[mid - 1] + sorted[mid]) / 2)
    : round1(sorted[mid]);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function formatMonthYear(date: Date): string {
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
