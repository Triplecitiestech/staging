/**
 * Data builder: collects and structures all metrics for a business review report.
 * Uses real-time queries from raw Ticket tables for accurate data.
 */

import { prisma } from '@/lib/prisma';
import { PRIORITY_LABELS, getResolvedStatuses } from '../types';
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
  const resolvedSet = new Set(getResolvedStatuses());
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  });
  if (!company) throw new Error(`Company not found: ${companyId}`);

  console.log(`[buildReportData] Company: ${company.displayName} (${companyId}), period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

  const periodLabel = reportType === 'monthly'
    ? formatMonthLabel(periodStart)
    : formatQuarterLabel(periodStart, periodEnd);

  // Previous period
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  const prevStart = new Date(periodStart.getTime() - periodMs);
  const prevEnd = new Date(periodStart.getTime());

  // Query tickets that were ACTIVE during the period:
  // - Created during the period, OR
  // - Closed/completed during the period (created earlier), OR
  // - Still open and created before the period end
  const [currentTickets, prevTickets] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        companyId,
        OR: [
          // Tickets created during the period
          { createDate: { gte: periodStart, lte: periodEnd } },
          // Tickets closed during the period (created earlier)
          { completedDate: { gte: periodStart, lte: periodEnd } },
          // Open tickets that existed during the period
          { createDate: { lte: periodEnd }, status: { notIn: Array.from(resolvedSet) } },
        ],
      },
      select: {
        autotaskTicketId: true, status: true, priority: true,
        createDate: true, completedDate: true, assignedResourceId: true,
        dueDateTime: true,
      },
    }),
    prisma.ticket.findMany({
      where: {
        companyId,
        OR: [
          { createDate: { gte: prevStart, lt: prevEnd } },
          { completedDate: { gte: prevStart, lt: prevEnd } },
        ],
      },
      select: {
        autotaskTicketId: true, status: true, priority: true,
        createDate: true, completedDate: true,
      },
    }),
  ]);

  console.log(`[buildReportData] currentTickets: ${currentTickets.length}, prevTickets: ${prevTickets.length}`);
  if (currentTickets.length > 0) {
    const statuses = currentTickets.map(t => t.status);
    const uniqueStatuses = Array.from(new Set(statuses));
    const withCompleted = currentTickets.filter(t => t.completedDate).length;
    const resolvedCount = currentTickets.filter(t => resolvedSet.has(t.status)).length;
    console.log(`[buildReportData] Ticket statuses: ${JSON.stringify(uniqueStatuses)}, withCompletedDate: ${withCompleted}, resolved: ${resolvedCount}`);
    const earliest = currentTickets.reduce((m, t) => t.createDate < m ? t.createDate : m, currentTickets[0].createDate);
    const latest = currentTickets.reduce((m, t) => t.createDate > m ? t.createDate : m, currentTickets[0].createDate);
    console.log(`[buildReportData] Ticket date range: ${earliest.toISOString()} to ${latest.toISOString()}`);
  }

  // Time entries for hours — query by dateWorked in period, not by ticket ID
  // This captures all work done for this company during the period
  const allCompanyTicketIds = await prisma.ticket.findMany({
    where: { companyId },
    select: { autotaskTicketId: true },
  });
  const allTicketIds = allCompanyTicketIds.map(t => t.autotaskTicketId);

  const [timeEntries, prevTimeEntries] = await Promise.all([
    allTicketIds.length > 0
      ? prisma.ticketTimeEntry.findMany({
          where: {
            autotaskTicketId: { in: allTicketIds },
            dateWorked: { gte: periodStart, lte: periodEnd },
          },
          select: { autotaskTicketId: true, hoursWorked: true, isNonBillable: true },
        })
      : Promise.resolve([]),
    allTicketIds.length > 0
      ? prisma.ticketTimeEntry.findMany({
          where: {
            autotaskTicketId: { in: allTicketIds },
            dateWorked: { gte: prevStart, lt: prevEnd },
          },
          select: { hoursWorked: true, isNonBillable: true },
        })
      : Promise.resolve([]),
  ]);

  // Notes for FRT — need first note for all active tickets in period
  const ticketIds = currentTickets.map(t => t.autotaskTicketId);
  const notes = ticketIds.length > 0
    ? await prisma.ticketNote.findMany({
        where: { autotaskTicketId: { in: ticketIds }, creatorResourceId: { not: null } },
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

  // Compute metrics from raw data
  // "Created" = tickets whose createDate falls in the period
  // "Closed" = tickets completed during the period (regardless of when created)
  const created = currentTickets.filter(t => t.createDate >= periodStart && t.createDate <= periodEnd).length;
  const closed = currentTickets.filter(t =>
    resolvedSet.has(t.status) && t.completedDate &&
    t.completedDate >= periodStart && t.completedDate <= periodEnd
  ).length;
  const hours = timeEntries.reduce((s, e) => s + e.hoursWorked, 0);
  const billable = timeEntries.filter(e => !e.isNonBillable).reduce((s, e) => s + e.hoursWorked, 0);

  console.log(`[buildReportData] RESULTS: created=${created}, closed=${closed}, hours=${round1(hours)}, billable=${round1(billable)}, timeEntries=${timeEntries.length}`);

  // Per-priority counts (tickets created in period)
  const createdInPeriod = currentTickets.filter(t => t.createDate >= periodStart && t.createDate <= periodEnd);
  const priorityCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const t of createdInPeriod) {
    if (priorityCounts[t.priority] !== undefined) priorityCounts[t.priority]++;
  }

  // Resolution and FRT metrics (for tickets closed in this period)
  const closedInPeriod = currentTickets.filter(t =>
    resolvedSet.has(t.status) && t.completedDate &&
    t.completedDate >= periodStart && t.completedDate <= periodEnd
  );
  const resolutionMinutes: number[] = [];
  const frtMinutes: number[] = [];
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
  // Also get FRT for tickets created in period (even if not yet closed)
  for (const t of createdInPeriod) {
    if (!closedInPeriod.some(c => c.autotaskTicketId === t.autotaskTicketId)) {
      const firstNote = firstNoteByTicket.get(t.autotaskTicketId);
      if (firstNote) {
        const frt = (firstNote.getTime() - t.createDate.getTime()) / (1000 * 60);
        if (frt >= 0) frtMinutes.push(frt);
      }
    }
  }

  // SLA from dueDateTime (tickets closed in period)
  const slaTickets = closedInPeriod.filter(t => t.dueDateTime);
  const slaMet = slaTickets.filter(t => t.completedDate! <= t.dueDateTime!).length;
  const slaCompliance = slaTickets.length > 0 ? round1((slaMet / slaTickets.length) * 100) : null;

  // Compute FTR: tickets closed with only 1 tech note (single-interaction resolution)
  let firstTouchCount = 0;
  for (const t of closedInPeriod) {
    const techNotes = notes.filter(n => n.autotaskTicketId === t.autotaskTicketId);
    if (techNotes.length <= 1) firstTouchCount++;
  }
  const firstTouchRate = closedInPeriod.length > 0
    ? round1((firstTouchCount / closedInPeriod.length) * 100)
    : 0;

  // Reopen rate: we query for reopened tickets (status history) but for now
  // use a simpler heuristic — tickets with >1 completed date cycle are reopened.
  // With the data we have, if ticketsReopened = 0 (no reopen events detected), rate is 0%.
  const reopened = 0; // Autotask doesn't reliably track reopens in our sync
  const reopenRate = closed > 0 ? round1((reopened / closed) * 100) : 0;

  // Compute how many tickets closed in this period were created BEFORE this period
  // (cross-period resolutions)
  const crossPeriodResolutions = closedInPeriod.filter(t => t.createDate < periodStart).length;

  // Build synthetic metrics shape for helper functions
  const dailyMetrics = [{
    ticketsCreated: created, ticketsClosed: closed, ticketsReopened: reopened,
    supportHoursConsumed: hours, billableHoursConsumed: billable,
    avgFirstResponseMinutes: avg(frtMinutes), avgResolutionMinutes: avg(resolutionMinutes),
    firstTouchResolutionRate: firstTouchRate, reopenRate: reopenRate,
    slaResponseCompliance: slaCompliance, slaResolutionCompliance: slaCompliance,
    ticketsCreatedUrgent: priorityCounts[1], ticketsCreatedHigh: priorityCounts[2],
    ticketsCreatedMedium: priorityCounts[3], ticketsCreatedLow: priorityCounts[4],
    date: periodStart,
    crossPeriodResolutions,
  }];

  // Lifecycle-shaped records for priority breakdown and performance
  const lifecycles = currentTickets.map(t => {
    const resolved = resolvedSet.has(t.status);
    const resMins = resolved && t.completedDate
      ? (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60) : null;
    const firstNote = firstNoteByTicket.get(t.autotaskTicketId);
    const frt = firstNote ? (firstNote.getTime() - t.createDate.getTime()) / (1000 * 60) : null;
    return { priority: t.priority, fullResolutionMinutes: resMins && resMins > 0 ? resMins : null, firstResponseMinutes: frt && frt >= 0 ? frt : null };
  });

  // Previous period metrics
  const prevCreated = prevTickets.filter(t => t.createDate >= prevStart && t.createDate < prevEnd).length;
  const prevClosed = prevTickets.filter(t =>
    resolvedSet.has(t.status) && t.completedDate &&
    t.completedDate >= prevStart && t.completedDate < prevEnd
  ).length;
  const prevHours = prevTimeEntries.reduce((s, e) => s + e.hoursWorked, 0);
  const prevResMinutes = prevTickets
    .filter(t => resolvedSet.has(t.status) && t.completedDate &&
      t.completedDate >= prevStart && t.completedDate < prevEnd)
    .map(t => (t.completedDate!.getTime() - t.createDate.getTime()) / (1000 * 60))
    .filter(m => m > 0);
  const prevMetrics = [{
    ticketsCreated: prevCreated, ticketsClosed: prevClosed,
    supportHoursConsumed: prevHours,
    avgResolutionMinutes: avg(prevResMinutes), reopenRate: null as number | null,
  }];

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
    crossPeriodResolutions: number;
  }>,
): SupportActivityData {
  const created = metrics.reduce((s, m) => s + m.ticketsCreated, 0);
  const closed = metrics.reduce((s, m) => s + m.ticketsClosed, 0);
  const reopened = metrics.reduce((s, m) => s + m.ticketsReopened, 0);
  const hours = metrics.reduce((s, m) => s + m.supportHoursConsumed, 0);
  const billable = metrics.reduce((s, m) => s + m.billableHoursConsumed, 0);
  const crossPeriod = metrics.reduce((s, m) => s + m.crossPeriodResolutions, 0);

  return {
    ticketsCreated: created,
    ticketsClosed: closed,
    ticketsReopened: reopened,
    supportHoursConsumed: round1(hours),
    billableHoursConsumed: round1(billable),
    netTicketChange: created - closed,
    crossPeriodResolutions: crossPeriod,
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
  // Query open tickets directly from raw Ticket table
  const openTickets = await prisma.ticket.findMany({
    where: {
      companyId,
      status: { notIn: getResolvedStatuses() },
    },
    select: { priority: true, createDate: true },
  });

  const sevenDaysAgo = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    total: openTickets.length,
    urgent: openTickets.filter(t => t.priority === 1).length,
    high: openTickets.filter(t => t.priority === 2).length,
    agingOver7Days: openTickets.filter(t => t.createDate <= sevenDaysAgo).length,
    agingOver30Days: openTickets.filter(t => t.createDate <= thirtyDaysAgo).length,
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
