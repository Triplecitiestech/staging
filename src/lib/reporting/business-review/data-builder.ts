/**
 * Data builder: collects and structures all metrics for a business review report.
 * Pulls from materialized reporting tables, not raw Autotask data.
 */

import { prisma } from '@/lib/prisma';
import { PRIORITY_LABELS } from '../types';
import {
  ReviewReportData,
  SupportActivityData,
  ServicePerformanceData,
  PriorityMixData,
  TopThemeData,
  HealthSnapshotData,
  ComparisonData,
  BacklogData,
  NotableEventData,
  ReportType,
} from './types';

export async function buildReportData(
  companyId: string,
  reportType: ReportType,
  periodStart: Date,
  periodEnd: Date,
): Promise<ReviewReportData> {
  // Resolve company name
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  });

  if (!company) throw new Error(`Company not found: ${companyId}`);

  // Build period label
  const periodLabel = reportType === 'monthly'
    ? formatMonthLabel(periodStart)
    : formatQuarterLabel(periodStart, periodEnd);

  // Fetch daily metrics for the period
  let dailyMetrics = await prisma.companyMetricsDaily.findMany({
    where: {
      companyId,
      date: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { date: 'asc' },
  });

  // Previous period for comparison
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  const prevStart = new Date(periodStart.getTime() - periodMs);
  const prevEnd = new Date(periodStart.getTime());

  let prevMetrics = await prisma.companyMetricsDaily.findMany({
    where: {
      companyId,
      date: { gte: prevStart, lt: prevEnd },
    },
  });

  // Fetch lifecycle records for detailed analysis
  let lifecycles = await prisma.ticketLifecycle.findMany({
    where: {
      companyId,
      createDate: { gte: periodStart, lte: periodEnd },
    },
  });

  // FALLBACK: If materialized tables are empty, compute from raw ticket data
  if (dailyMetrics.length === 0) {
    const rawMetrics = await buildFromRawTickets(companyId, periodStart, periodEnd);
    if (rawMetrics) {
      dailyMetrics = rawMetrics.dailyMetrics;
      lifecycles = rawMetrics.lifecycles;
    }
  }
  if (prevMetrics.length === 0) {
    const rawPrev = await buildFromRawTickets(companyId, prevStart, prevEnd);
    if (rawPrev) {
      prevMetrics = rawPrev.dailyMetrics;
    }
  }

  const supportActivity = buildSupportActivity(dailyMetrics);
  const servicePerformance = buildServicePerformance(dailyMetrics, lifecycles);
  const priorityBreakdown = buildPriorityBreakdown(lifecycles, dailyMetrics);
  const topThemes = await buildTopThemes(companyId, periodStart, periodEnd, prevStart, prevEnd);
  const healthSnapshot = await buildHealthSnapshot(companyId);
  const comparison = buildComparison(dailyMetrics, prevMetrics, prevStart, prevEnd, reportType);
  const backlog = await buildBacklog(companyId, periodEnd);
  const notableEvents = buildNotableEvents(dailyMetrics);

  return {
    company: { id: company.id, name: company.displayName },
    period: {
      type: reportType,
      start: periodStart.toISOString().split('T')[0],
      end: periodEnd.toISOString().split('T')[0],
      label: periodLabel,
    },
    supportActivity,
    servicePerformance,
    priorityBreakdown,
    topThemes,
    healthSnapshot,
    comparison,
    backlog,
    notableEvents,
  };
}

// ============================================
// SUPPORT ACTIVITY
// ============================================

function buildSupportActivity(
  metrics: Array<{
    ticketsCreated: number;
    ticketsClosed: number;
    ticketsReopened: number;
    supportHoursConsumed: number;
    billableHoursConsumed: number;
  }>,
): SupportActivityData {
  const created = metrics.reduce((s, m) => s + m.ticketsCreated, 0);
  const closed = metrics.reduce((s, m) => s + m.ticketsClosed, 0);
  const reopened = metrics.reduce((s, m) => s + m.ticketsReopened, 0);
  const hours = metrics.reduce((s, m) => s + m.supportHoursConsumed, 0);
  const billable = metrics.reduce((s, m) => s + m.billableHoursConsumed, 0);

  return {
    ticketsCreated: created,
    ticketsClosed: closed,
    ticketsReopened: reopened,
    supportHoursConsumed: round1(hours),
    billableHoursConsumed: round1(billable),
    netTicketChange: created - closed,
  };
}

// ============================================
// SERVICE PERFORMANCE
// ============================================

function buildServicePerformance(
  metrics: Array<{
    avgFirstResponseMinutes: number | null;
    avgResolutionMinutes: number | null;
    firstTouchResolutionRate: number | null;
    reopenRate: number | null;
    slaResponseCompliance: number | null;
    slaResolutionCompliance: number | null;
  }>,
  lifecycles: Array<{
    firstResponseMinutes: number | null;
    fullResolutionMinutes: number | null;
  }>,
): ServicePerformanceData {
  const frtValues = metrics.map(m => m.avgFirstResponseMinutes).filter(nonNull);
  const resValues = metrics.map(m => m.avgResolutionMinutes).filter(nonNull);
  const ftrrValues = metrics.map(m => m.firstTouchResolutionRate).filter(nonNull);
  const reopenValues = metrics.map(m => m.reopenRate).filter(nonNull);
  const slaRespValues = metrics.map(m => m.slaResponseCompliance).filter(nonNull);
  const slaResValues = metrics.map(m => m.slaResolutionCompliance).filter(nonNull);

  // Compute medians from lifecycle records
  const lcFrt = lifecycles.map(l => l.firstResponseMinutes).filter(nonNull).sort((a, b) => a - b);
  const lcRes = lifecycles.map(l => l.fullResolutionMinutes).filter(nonNull).sort((a, b) => a - b);

  return {
    avgFirstResponseMinutes: avg(frtValues),
    medianFirstResponseMinutes: median(lcFrt),
    avgResolutionMinutes: avg(resValues),
    medianResolutionMinutes: median(lcRes),
    firstTouchResolutionRate: avg(ftrrValues),
    reopenRate: avg(reopenValues),
    slaResponseCompliance: avg(slaRespValues),
    slaResolutionCompliance: avg(slaResValues),
  };
}

// ============================================
// PRIORITY BREAKDOWN
// ============================================

function buildPriorityBreakdown(
  lifecycles: Array<{ priority: number; fullResolutionMinutes: number | null }>,
  dailyMetrics: Array<{
    ticketsCreatedUrgent: number;
    ticketsCreatedHigh: number;
    ticketsCreatedMedium: number;
    ticketsCreatedLow: number;
  }>,
): PriorityMixData[] {
  // Use daily metrics for counts (more reliable), lifecycles for resolution times
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const m of dailyMetrics) {
    counts[1] += m.ticketsCreatedUrgent;
    counts[2] += m.ticketsCreatedHigh;
    counts[3] += m.ticketsCreatedMedium;
    counts[4] += m.ticketsCreatedLow;
  }

  const total = Object.values(counts).reduce((s, c) => s + c, 0) || 1;

  // Resolution times per priority from lifecycles
  const resByPriority = new Map<number, number[]>();
  for (const lc of lifecycles) {
    if (lc.fullResolutionMinutes !== null) {
      const existing = resByPriority.get(lc.priority) || [];
      existing.push(lc.fullResolutionMinutes);
      resByPriority.set(lc.priority, existing);
    }
  }

  return [1, 2, 3, 4]
    .filter(p => counts[p] > 0)
    .map(p => {
      const resArr = resByPriority.get(p) || [];
      return {
        priority: PRIORITY_LABELS[p] || `Priority ${p}`,
        priorityValue: p,
        count: counts[p],
        percentage: round1((counts[p] / total) * 100),
        avgResolutionMinutes: resArr.length > 0
          ? Math.round(resArr.reduce((a, b) => a + b, 0) / resArr.length)
          : null,
      };
    });
}

// ============================================
// TOP THEMES (issue categories)
// ============================================

async function buildTopThemes(
  companyId: string,
  periodStart: Date,
  periodEnd: Date,
  prevStart: Date,
  prevEnd: Date,
): Promise<TopThemeData[]> {
  // Use ticket queue as a proxy for issue category
  const tickets = await prisma.ticket.findMany({
    where: {
      companyId,
      createDate: { gte: periodStart, lte: periodEnd },
    },
    select: { queueId: true, queueLabel: true },
  });

  const prevTickets = await prisma.ticket.findMany({
    where: {
      companyId,
      createDate: { gte: prevStart, lt: prevEnd },
    },
    select: { queueId: true, queueLabel: true },
  });

  // Group by queue label
  const currentCounts = new Map<string, number>();
  for (const t of tickets) {
    const label = t.queueLabel || 'General';
    currentCounts.set(label, (currentCounts.get(label) || 0) + 1);
  }

  const prevCounts = new Map<string, number>();
  for (const t of prevTickets) {
    const label = t.queueLabel || 'General';
    prevCounts.set(label, (prevCounts.get(label) || 0) + 1);
  }

  const total = tickets.length || 1;

  return Array.from(currentCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, count]) => {
      const prev = prevCounts.get(category) || 0;
      const trend: 'up' | 'down' | 'flat' =
        count > prev * 1.2 ? 'up' : count < prev * 0.8 ? 'down' : 'flat';

      return {
        category,
        count,
        percentage: round1((count / total) * 100),
        trend,
      };
    });
}

// ============================================
// HEALTH SNAPSHOT
// ============================================

async function buildHealthSnapshot(companyId: string): Promise<HealthSnapshotData | null> {
  const health = await prisma.customerHealthScore.findFirst({
    where: { companyId },
    orderBy: { computedAt: 'desc' },
  });

  if (!health) return null;

  const tier =
    health.overallScore >= 80 ? 'Healthy' :
    health.overallScore >= 60 ? 'Watch' :
    health.overallScore >= 40 ? 'At Risk' :
    'Critical';

  return {
    overallScore: health.overallScore,
    tier,
    trend: health.trend,
    previousScore: health.previousScore,
    factors: {
      ticketVolumeTrend: health.ticketVolumeTrendScore,
      reopenRate: health.reopenRateScore,
      priorityMix: health.priorityMixScore,
      supportHoursTrend: health.supportHoursTrendScore,
      avgResolutionTime: health.avgResolutionTimeScore,
      agingTickets: health.agingTicketsScore,
      slaCompliance: health.slaComplianceScore,
    },
  };
}

// ============================================
// COMPARISON
// ============================================

function buildComparison(
  current: Array<{
    ticketsCreated: number;
    ticketsClosed: number;
    supportHoursConsumed: number;
    avgResolutionMinutes: number | null;
    reopenRate: number | null;
  }>,
  previous: Array<{
    ticketsCreated: number;
    ticketsClosed: number;
    supportHoursConsumed: number;
    avgResolutionMinutes: number | null;
    reopenRate: number | null;
  }>,
  prevStart: Date,
  prevEnd: Date,
  reportType: ReportType,
): ComparisonData {
  const prevLabel = reportType === 'monthly'
    ? formatMonthLabel(prevStart)
    : formatQuarterLabel(prevStart, prevEnd);

  const currCreated = current.reduce((s, m) => s + m.ticketsCreated, 0);
  const prevCreated = previous.reduce((s, m) => s + m.ticketsCreated, 0);
  const currClosed = current.reduce((s, m) => s + m.ticketsClosed, 0);
  const prevClosed = previous.reduce((s, m) => s + m.ticketsClosed, 0);
  const currHours = current.reduce((s, m) => s + m.supportHoursConsumed, 0);
  const prevHours = previous.reduce((s, m) => s + m.supportHoursConsumed, 0);

  const currRes = current.map(m => m.avgResolutionMinutes).filter(nonNull);
  const prevRes = previous.map(m => m.avgResolutionMinutes).filter(nonNull);
  const currAvgRes = avg(currRes);
  const prevAvgRes = avg(prevRes);

  const currReopen = current.map(m => m.reopenRate).filter(nonNull);
  const prevReopen = previous.map(m => m.reopenRate).filter(nonNull);
  const currAvgReopen = avg(currReopen);
  const prevAvgReopen = avg(prevReopen);

  return {
    previousPeriod: {
      start: prevStart.toISOString().split('T')[0],
      end: prevEnd.toISOString().split('T')[0],
      label: prevLabel,
    },
    ticketsCreatedChange: pctChange(currCreated, prevCreated),
    ticketsClosedChange: pctChange(currClosed, prevClosed),
    supportHoursChange: pctChange(currHours, prevHours),
    avgResolutionChange: currAvgRes !== null && prevAvgRes !== null
      ? pctChange(currAvgRes, prevAvgRes) : null,
    reopenRateChange: currAvgReopen !== null && prevAvgReopen !== null
      ? round1(currAvgReopen - prevAvgReopen) : null,
  };
}

// ============================================
// BACKLOG
// ============================================

async function buildBacklog(companyId: string, periodEnd: Date): Promise<BacklogData> {
  const latestMetrics = await prisma.companyMetricsDaily.findFirst({
    where: { companyId, date: { lte: periodEnd } },
    orderBy: { date: 'desc' },
    select: { backlogCount: true, backlogUrgent: true, backlogHigh: true },
  });

  // Aging tickets from lifecycle
  const sevenDaysAgo = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [aging7, aging30] = await Promise.all([
    prisma.ticketLifecycle.count({
      where: {
        companyId,
        isResolved: false,
        createDate: { lte: sevenDaysAgo },
      },
    }),
    prisma.ticketLifecycle.count({
      where: {
        companyId,
        isResolved: false,
        createDate: { lte: thirtyDaysAgo },
      },
    }),
  ]);

  return {
    total: latestMetrics?.backlogCount ?? 0,
    urgent: latestMetrics?.backlogUrgent ?? 0,
    high: latestMetrics?.backlogHigh ?? 0,
    agingOver7Days: aging7,
    agingOver30Days: aging30,
  };
}

// ============================================
// NOTABLE EVENTS
// ============================================

function buildNotableEvents(
  metrics: Array<{
    date: Date;
    ticketsCreated: number;
    ticketsClosed: number;
    ticketsReopened: number;
  }>,
): NotableEventData[] {
  const events: NotableEventData[] = [];

  if (metrics.length === 0) return events;

  // Calculate baseline for spike detection
  const avgCreated = metrics.reduce((s, m) => s + m.ticketsCreated, 0) / metrics.length;

  for (const m of metrics) {
    // Ticket spike days
    if (m.ticketsCreated > avgCreated * 3 && m.ticketsCreated >= 5) {
      events.push({
        date: m.date.toISOString().split('T')[0],
        description: `Ticket spike: ${m.ticketsCreated} tickets created (${Math.round((m.ticketsCreated / avgCreated) * 100)}% of daily average)`,
        severity: m.ticketsCreated > avgCreated * 5 ? 'critical' : 'warning',
      });
    }

    // High reopen days
    if (m.ticketsReopened >= 3) {
      events.push({
        date: m.date.toISOString().split('T')[0],
        description: `${m.ticketsReopened} tickets reopened`,
        severity: m.ticketsReopened >= 5 ? 'warning' : 'info',
      });
    }
  }

  return events.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  }).slice(0, 10);
}

// ============================================
// RAW TICKET FALLBACK (when materialized tables are empty)
// ============================================

/**
 * Build synthetic daily metrics and lifecycle records from raw Ticket table.
 * Used as fallback when companyMetricsDaily hasn't been populated yet.
 */
async function buildFromRawTickets(
  companyId: string,
  periodStart: Date,
  periodEnd: Date,
) {
  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        companyId,
        createDate: { gte: periodStart, lte: periodEnd },
      },
      select: {
        autotaskTicketId: true,
        status: true,
        priority: true,
        createDate: true,
        completedDate: true,
        assignedResourceId: true,
      },
    });

    if (tickets.length === 0) return null;

    const { RESOLVED_STATUSES } = await import('../types');
    const isResolved = (status: number) => (RESOLVED_STATUSES as readonly number[]).includes(status);

    // Get time entries for these tickets
    const ticketIds = tickets.map(t => t.autotaskTicketId);
    const timeEntries = await prisma.ticketTimeEntry.findMany({
      where: { autotaskTicketId: { in: ticketIds } },
      select: { hoursWorked: true, isNonBillable: true },
    }).catch(() => [] as Array<{ hoursWorked: number; isNonBillable: boolean }>);

    // Get notes for FRT calculation
    const notes = await prisma.ticketNote.findMany({
      where: { autotaskTicketId: { in: ticketIds }, creatorResourceId: { not: null } },
      select: { autotaskTicketId: true, createDateTime: true },
      orderBy: { createDateTime: 'asc' },
    }).catch(() => [] as Array<{ autotaskTicketId: string; createDateTime: Date }>);

    const firstNoteByTicket = new Map<string, Date>();
    for (const n of notes) {
      if (!firstNoteByTicket.has(n.autotaskTicketId)) {
        firstNoteByTicket.set(n.autotaskTicketId, n.createDateTime);
      }
    }

    const created = tickets.length;
    const closed = tickets.filter(t => isResolved(t.status)).length;
    const hoursTotal = timeEntries.reduce((s, e) => s + e.hoursWorked, 0);
    const hoursBillable = timeEntries.filter(e => !e.isNonBillable).reduce((s, e) => s + e.hoursWorked, 0);

    // Build synthetic lifecycle records
    const lifecycles = tickets.map(t => {
      const resolved = isResolved(t.status);
      const firstNote = firstNoteByTicket.get(t.autotaskTicketId);
      const frtMinutes = firstNote
        ? (firstNote.getTime() - t.createDate.getTime()) / (1000 * 60)
        : null;
      const resMinutes = resolved && t.completedDate
        ? (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60)
        : null;
      return {
        autotaskTicketId: t.autotaskTicketId,
        companyId,
        assignedResourceId: t.assignedResourceId,
        priority: t.priority,
        queueId: null as number | null,
        createDate: t.createDate,
        completedDate: t.completedDate,
        isResolved: resolved,
        firstResponseMinutes: frtMinutes,
        firstResolutionMinutes: resMinutes,
        fullResolutionMinutes: resMinutes,
        activeResolutionMinutes: resMinutes,
        waitingCustomerMinutes: null as number | null,
        techNoteCount: 0,
        customerNoteCount: 0,
        reopenCount: 0,
        totalHoursLogged: 0,
        billableHoursLogged: 0,
        isFirstTouchResolution: false,
        slaResponseMet: null as boolean | null,
        slaResolutionMet: null as boolean | null,
        computedAt: new Date(),
        id: '',
      };
    });

    // Build synthetic daily metric row (one row for the whole period as aggregate)
    const frtValues = lifecycles.map(l => l.firstResponseMinutes).filter(nonNull);
    const resValues = lifecycles.map(l => l.fullResolutionMinutes).filter(nonNull);

    const syntheticMetrics = [{
      id: 'synthetic',
      companyId,
      date: periodStart,
      ticketsCreated: created,
      ticketsClosed: closed,
      ticketsReopened: 0,
      ticketsCreatedUrgent: tickets.filter(t => t.priority === 1).length,
      ticketsCreatedHigh: tickets.filter(t => t.priority === 2).length,
      ticketsCreatedMedium: tickets.filter(t => t.priority === 3).length,
      ticketsCreatedLow: tickets.filter(t => t.priority === 4).length,
      supportHoursConsumed: round1(hoursTotal),
      billableHoursConsumed: round1(hoursBillable),
      avgFirstResponseMinutes: frtValues.length > 0
        ? round1(frtValues.reduce((a, b) => a + b, 0) / frtValues.length)
        : null,
      avgResolutionMinutes: resValues.length > 0
        ? round1(resValues.reduce((a, b) => a + b, 0) / resValues.length)
        : null,
      firstTouchResolutionRate: null as number | null,
      reopenRate: null as number | null,
      slaResponseCompliance: null as number | null,
      slaResolutionCompliance: null as number | null,
      backlogCount: tickets.filter(t => !isResolved(t.status)).length,
      backlogUrgent: tickets.filter(t => !isResolved(t.status) && t.priority === 1).length,
      backlogHigh: tickets.filter(t => !isResolved(t.status) && t.priority === 2).length,
      computedAt: new Date(),
    }];

    return { dailyMetrics: syntheticMetrics, lifecycles };
  } catch {
    return null;
  }
}

// ============================================
// HELPERS
// ============================================

function nonNull<T>(v: T | null): v is T {
  return v !== null;
}

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

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return round1(((current - previous) / previous) * 100);
}

function formatMonthLabel(date: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function formatQuarterLabel(start: Date, end: Date): string {
  const q = Math.floor(start.getUTCMonth() / 3) + 1;
  return `Q${q} ${start.getUTCFullYear()}${end.getUTCFullYear() !== start.getUTCFullYear() ? `–${end.getUTCFullYear()}` : ''}`;
}
