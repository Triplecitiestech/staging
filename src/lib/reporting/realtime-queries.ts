/**
 * Real-time reporting queries.
 * Queries raw Ticket, TicketTimeEntry, TicketNote, and Resource tables directly
 * for accurate, up-to-date reporting data — no dependency on ETL pipeline.
 */

import { prisma } from '@/lib/prisma';
import {
  DateRange,
  TechnicianSummary,
  CompanySummary,
  DashboardSummary,
  RESOLVED_STATUSES,
  PRIORITY_LABELS,
  TrendPoint,
  PriorityBreakdown,
} from './types';
import { isApiOrSystemUser } from './api-user-filter';
import { dateToBucketKey, generateTrendBuckets, getComparisonRange } from './filters';

// ============================================
// HELPERS
// ============================================

const resolvedSet = new Set(RESOLVED_STATUSES as unknown as number[]);

function isResolved(status: number): boolean {
  return resolvedSet.has(status);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function avgOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return round1(((current - previous) / previous) * 100);
}

// ============================================
// TECHNICIAN METRICS (real-time from raw tables)
// ============================================

export async function getRealtimeTechnicianMetrics(
  range: DateRange,
  resourceId?: number,
): Promise<TechnicianSummary[]> {
  // Get all tickets in period
  const tickets = await prisma.ticket.findMany({
    where: {
      createDate: { lte: range.to },
      ...(resourceId ? { assignedResourceId: resourceId } : {}),
    },
    select: {
      autotaskTicketId: true,
      assignedResourceId: true,
      status: true,
      createDate: true,
      completedDate: true,
    },
  });

  // Find tickets closed in this period (resolved + completedDate in range, OR resolved via status history)
  const closedInPeriod = tickets.filter(t =>
    isResolved(t.status) && t.completedDate && t.completedDate >= range.from && t.completedDate <= range.to
  );

  // Also check tickets that are resolved but completedDate is null — use status history
  const resolvedNoDate = tickets.filter(t =>
    isResolved(t.status) && !t.completedDate
  );
  let statusHistoryClosures: Array<{ autotaskTicketId: string; assignedResourceId: number | null; changedAt: Date }> = [];
  if (resolvedNoDate.length > 0) {
    const resolvedIds = resolvedNoDate.map(t => t.autotaskTicketId);
    const histories = await prisma.ticketStatusHistory.findMany({
      where: {
        autotaskTicketId: { in: resolvedIds },
        newStatus: { in: Array.from(resolvedSet) },
        changedAt: { gte: range.from, lte: range.to },
      },
      orderBy: { changedAt: 'desc' },
      distinct: ['autotaskTicketId'],
    });
    const ticketMap = new Map(resolvedNoDate.map(t => [t.autotaskTicketId, t]));
    statusHistoryClosures = histories.map(h => ({
      autotaskTicketId: h.autotaskTicketId,
      assignedResourceId: ticketMap.get(h.autotaskTicketId)?.assignedResourceId ?? null,
      changedAt: h.changedAt,
    }));
  }

  // Open tickets per tech (not resolved)
  const openTickets = tickets.filter(t => !isResolved(t.status));

  // Get time entries in period
  const ticketIds = tickets.map(t => t.autotaskTicketId);
  const timeEntries = await prisma.ticketTimeEntry.findMany({
    where: {
      dateWorked: { gte: range.from, lte: range.to },
      ...(resourceId ? { resourceId } : {}),
    },
    select: {
      resourceId: true,
      hoursWorked: true,
      isNonBillable: true,
    },
  });

  // Get first tech note per ticket for FRT calculation
  const closedTicketIds = [
    ...closedInPeriod.map(t => t.autotaskTicketId),
    ...statusHistoryClosures.map(h => h.autotaskTicketId),
  ];
  const notes = closedTicketIds.length > 0 ? await prisma.ticketNote.findMany({
    where: {
      autotaskTicketId: { in: closedTicketIds },
      creatorResourceId: { not: null },
    },
    select: { autotaskTicketId: true, createDateTime: true },
    orderBy: { createDateTime: 'asc' },
  }) : [];
  const firstNoteByTicket = new Map<string, Date>();
  for (const n of notes) {
    if (!firstNoteByTicket.has(n.autotaskTicketId)) {
      firstNoteByTicket.set(n.autotaskTicketId, n.createDateTime);
    }
  }

  // Get ticket create dates for FRT computation
  const ticketCreateMap = new Map(tickets.map(t => [t.autotaskTicketId, t.createDate]));

  // Group by resource
  const techData = new Map<number, {
    closed: number;
    open: number;
    hours: number;
    billableHours: number;
    frtMinutes: number[];
    resolutionMinutes: number[];
    firstTouchResolutions: number;
  }>();

  const getOrCreate = (rid: number) => {
    if (!techData.has(rid)) {
      techData.set(rid, { closed: 0, open: 0, hours: 0, billableHours: 0, frtMinutes: [], resolutionMinutes: [], firstTouchResolutions: 0 });
    }
    return techData.get(rid)!;
  };

  // Tally closed tickets
  for (const t of closedInPeriod) {
    if (!t.assignedResourceId) continue;
    const d = getOrCreate(t.assignedResourceId);
    d.closed++;
    if (t.completedDate && t.createDate) {
      const resMins = (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60);
      if (resMins > 0) d.resolutionMinutes.push(resMins);
    }
    const firstNote = firstNoteByTicket.get(t.autotaskTicketId);
    if (firstNote) {
      const frtMins = (firstNote.getTime() - t.createDate.getTime()) / (1000 * 60);
      if (frtMins >= 0) d.frtMinutes.push(frtMins);
    }
  }
  for (const h of statusHistoryClosures) {
    if (!h.assignedResourceId) continue;
    const d = getOrCreate(h.assignedResourceId);
    d.closed++;
    const createDate = ticketCreateMap.get(h.autotaskTicketId);
    if (createDate) {
      const resMins = (h.changedAt.getTime() - createDate.getTime()) / (1000 * 60);
      if (resMins > 0) d.resolutionMinutes.push(resMins);
    }
  }

  // Tally open tickets
  for (const t of openTickets) {
    if (!t.assignedResourceId) continue;
    getOrCreate(t.assignedResourceId).open++;
  }

  // Tally time entries
  for (const te of timeEntries) {
    const d = getOrCreate(te.resourceId);
    d.hours += te.hoursWorked;
    if (!te.isNonBillable) d.billableHours += te.hoursWorked;
  }

  // Resolve resource names and filter API users
  const allResourceIds = Array.from(techData.keys());
  const resources = await prisma.resource.findMany({
    where: { autotaskResourceId: { in: allResourceIds } },
  });
  const resourceMap = new Map(resources.map(r => [r.autotaskResourceId, r]));

  const summaries: TechnicianSummary[] = [];
  for (const [rid, d] of Array.from(techData.entries())) {
    const resource = resourceMap.get(rid);
    if (resource && isApiOrSystemUser(resource)) continue;

    summaries.push({
      resourceId: rid,
      firstName: resource?.firstName || 'Unknown',
      lastName: resource?.lastName || '',
      email: resource?.email || '',
      ticketsClosed: d.closed,
      ticketsAssigned: d.closed + d.open,
      hoursLogged: round1(d.hours),
      billableHoursLogged: round1(d.billableHours),
      avgFirstResponseMinutes: avgOrNull(d.frtMinutes),
      avgResolutionMinutes: avgOrNull(d.resolutionMinutes),
      firstTouchResolutionRate: d.closed > 0
        ? round1((d.firstTouchResolutions / d.closed) * 100)
        : null,
      openTicketCount: d.open,
    });
  }

  summaries.sort((a, b) => b.ticketsClosed - a.ticketsClosed);
  return summaries;
}

// ============================================
// COMPANY METRICS (real-time from raw tables)
// ============================================

export async function getRealtimeCompanyMetrics(
  range: DateRange,
  companyId?: string,
): Promise<CompanySummary[]> {
  const tickets = await prisma.ticket.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      OR: [
        { createDate: { gte: range.from, lte: range.to } },
        { completedDate: { gte: range.from, lte: range.to } },
        // Include open tickets created before the period
        { createDate: { lte: range.to }, status: { notIn: Array.from(resolvedSet) } },
      ],
    },
    select: {
      autotaskTicketId: true,
      companyId: true,
      status: true,
      priority: true,
      createDate: true,
      completedDate: true,
      dueDateTime: true,
    },
  });

  // Time entries in period grouped by company (via ticket)
  const ticketIds = tickets.map(t => t.autotaskTicketId);
  const ticketCompanyMap = new Map(tickets.map(t => [t.autotaskTicketId, t.companyId]));

  const timeEntries = ticketIds.length > 0 ? await prisma.ticketTimeEntry.findMany({
    where: {
      autotaskTicketId: { in: ticketIds },
      dateWorked: { gte: range.from, lte: range.to },
    },
    select: { autotaskTicketId: true, hoursWorked: true },
  }) : [];

  // First notes for FRT
  const closedTicketIds = tickets
    .filter(t => isResolved(t.status) && t.completedDate && t.completedDate >= range.from)
    .map(t => t.autotaskTicketId);
  const notes = closedTicketIds.length > 0 ? await prisma.ticketNote.findMany({
    where: {
      autotaskTicketId: { in: closedTicketIds },
      creatorResourceId: { not: null },
    },
    select: { autotaskTicketId: true, createDateTime: true },
    orderBy: { createDateTime: 'asc' },
  }) : [];
  const firstNoteByTicket = new Map<string, Date>();
  for (const n of notes) {
    if (!firstNoteByTicket.has(n.autotaskTicketId)) {
      firstNoteByTicket.set(n.autotaskTicketId, n.createDateTime);
    }
  }

  // Group by company
  const companyData = new Map<string, {
    created: number;
    closed: number;
    hours: number;
    backlog: number;
    resolutionMinutes: number[];
    frtMinutes: number[];
    slaResponseMet: number;
    slaResponseTotal: number;
  }>();

  const getOrCreate = (cid: string) => {
    if (!companyData.has(cid)) {
      companyData.set(cid, {
        created: 0, closed: 0, hours: 0, backlog: 0,
        resolutionMinutes: [], frtMinutes: [],
        slaResponseMet: 0, slaResponseTotal: 0,
      });
    }
    return companyData.get(cid)!;
  };

  for (const t of tickets) {
    const d = getOrCreate(t.companyId);

    // Created in period
    if (t.createDate >= range.from && t.createDate <= range.to) {
      d.created++;
    }

    // Closed in period
    if (isResolved(t.status) && t.completedDate && t.completedDate >= range.from && t.completedDate <= range.to) {
      d.closed++;
      const resMins = (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60);
      if (resMins > 0) d.resolutionMinutes.push(resMins);

      // SLA check: if dueDateTime exists, check if completed before due
      if (t.dueDateTime) {
        d.slaResponseTotal++;
        if (t.completedDate <= t.dueDateTime) {
          d.slaResponseMet++;
        }
      }
    }

    // Open backlog
    if (!isResolved(t.status)) {
      d.backlog++;
    }

    // FRT
    const firstNote = firstNoteByTicket.get(t.autotaskTicketId);
    if (firstNote) {
      const frtMins = (firstNote.getTime() - t.createDate.getTime()) / (1000 * 60);
      if (frtMins >= 0) d.frtMinutes.push(frtMins);

      // SLA response check: first response within threshold (e.g., dueDateTime or target)
      if (t.dueDateTime) {
        // Already counted above for resolution SLA
      }
    }
  }

  // Add time entry hours
  for (const te of timeEntries) {
    const cid = ticketCompanyMap.get(te.autotaskTicketId);
    if (cid) getOrCreate(cid).hours += te.hoursWorked;
  }

  // Resolve company names
  const companyIds = Array.from(companyData.keys());
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, displayName: true },
  });
  const companyMap = new Map(companies.map(c => [c.id, c.displayName]));

  // Get health scores if available
  const healthScores = await prisma.customerHealthScore.findMany({
    where: { companyId: { in: companyIds } },
    orderBy: { computedAt: 'desc' },
    distinct: ['companyId'],
    select: { companyId: true, overallScore: true, trend: true },
  }).catch(() => [] as Array<{ companyId: string; overallScore: number; trend: string }>);
  const healthMap = new Map(healthScores.map(h => [h.companyId, h]));

  const summaries: CompanySummary[] = [];
  for (const [cid, d] of Array.from(companyData.entries())) {
    const health = healthMap.get(cid);
    const slaCompliance = d.slaResponseTotal > 0
      ? round1((d.slaResponseMet / d.slaResponseTotal) * 100)
      : null;

    summaries.push({
      companyId: cid,
      displayName: companyMap.get(cid) || 'Unknown',
      ticketsCreated: d.created,
      ticketsClosed: d.closed,
      supportHoursConsumed: round1(d.hours),
      avgResolutionMinutes: avgOrNull(d.resolutionMinutes),
      reopenRate: null, // Would need status history analysis for reopens
      firstTouchResolutionRate: null, // Would need deeper note analysis
      slaCompliance,
      backlogCount: d.backlog,
      healthScore: health?.overallScore ?? null,
      healthTrend: health?.trend ?? null,
    });
  }

  summaries.sort((a, b) => b.ticketsCreated - a.ticketsCreated);
  return summaries;
}

// ============================================
// DASHBOARD SUMMARY (real-time)
// ============================================

export async function getRealtimeDashboardSummary(range: DateRange): Promise<DashboardSummary> {
  const periodMs = range.to.getTime() - range.from.getTime();
  const prevRange: DateRange = {
    from: new Date(range.from.getTime() - periodMs),
    to: new Date(range.from.getTime()),
  };

  // Current period tickets
  const currentTickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { createDate: { gte: range.from, lte: range.to } },
        { completedDate: { gte: range.from, lte: range.to } },
      ],
    },
    select: {
      autotaskTicketId: true,
      companyId: true,
      assignedResourceId: true,
      status: true,
      priority: true,
      createDate: true,
      completedDate: true,
      dueDateTime: true,
    },
  });

  const createdInPeriod = currentTickets.filter(t => t.createDate >= range.from && t.createDate <= range.to);
  const closedInPeriod = currentTickets.filter(t =>
    isResolved(t.status) && t.completedDate && t.completedDate >= range.from && t.completedDate <= range.to
  );

  const totalTicketsCreated = createdInPeriod.length;
  const totalTicketsClosed = closedInPeriod.length;

  // SLA compliance from dueDateTime
  const slaTickets = closedInPeriod.filter(t => t.dueDateTime);
  const slaMet = slaTickets.filter(t => t.completedDate! <= t.dueDateTime!).length;
  const overallSlaCompliance = slaTickets.length > 0 ? round1((slaMet / slaTickets.length) * 100) : null;

  // Backlog (open tickets)
  const totalBacklog = await prisma.ticket.count({
    where: { status: { notIn: Array.from(resolvedSet) } },
  });

  // Avg resolution time
  const resMinutes = closedInPeriod
    .filter(t => t.completedDate && t.createDate)
    .map(t => (t.completedDate!.getTime() - t.createDate.getTime()) / (1000 * 60))
    .filter(m => m > 0);
  const avgResolutionMinutes = avgOrNull(resMinutes);

  // Top companies by ticket count
  const companyTicketCounts = new Map<string, number>();
  for (const t of createdInPeriod) {
    companyTicketCounts.set(t.companyId, (companyTicketCounts.get(t.companyId) || 0) + 1);
  }
  const topCompanyEntries = Array.from(companyTicketCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topCompanyRecords = topCompanyEntries.length > 0
    ? await prisma.company.findMany({
        where: { id: { in: topCompanyEntries.map(c => c[0]) } },
        select: { id: true, displayName: true },
      })
    : [];
  const topCompanyMap = new Map(topCompanyRecords.map(c => [c.id, c.displayName]));
  const topCompanies = topCompanyEntries.map(([id, count]) => ({
    companyId: id,
    displayName: topCompanyMap.get(id) || 'Unknown',
    ticketCount: count,
  }));

  // Top technicians by hours
  const timeEntries = await prisma.ticketTimeEntry.findMany({
    where: { dateWorked: { gte: range.from, lte: range.to } },
    select: { resourceId: true, hoursWorked: true },
  });
  const techHoursMap = new Map<number, number>();
  for (const te of timeEntries) {
    techHoursMap.set(te.resourceId, (techHoursMap.get(te.resourceId) || 0) + te.hoursWorked);
  }
  const allResources = techHoursMap.size > 0
    ? await prisma.resource.findMany({
        where: { autotaskResourceId: { in: Array.from(techHoursMap.keys()) } },
      })
    : [];
  const realTechs = allResources.filter(r => !isApiOrSystemUser(r));
  const resourceNameMap = new Map(realTechs.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`.trim()]));
  const topTechnicians = Array.from(techHoursMap.entries())
    .filter(([id]) => resourceNameMap.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, hours]) => ({
      resourceId: id,
      name: resourceNameMap.get(id) || 'Unknown',
      hoursLogged: round1(hours),
    }));

  // Previous period for comparison
  const prevTickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { createDate: { gte: prevRange.from, lte: prevRange.to } },
        { completedDate: { gte: prevRange.from, lte: prevRange.to } },
      ],
    },
    select: { status: true, createDate: true, completedDate: true },
  });
  const prevCreated = prevTickets.filter(t => t.createDate >= prevRange.from && t.createDate <= prevRange.to).length;
  const prevClosed = prevTickets.filter(t =>
    isResolved(t.status) && t.completedDate && t.completedDate >= prevRange.from && t.completedDate <= prevRange.to
  ).length;
  const prevResMinutes = prevTickets
    .filter(t => isResolved(t.status) && t.completedDate && t.completedDate >= prevRange.from && t.createDate)
    .map(t => (t.completedDate!.getTime() - t.createDate.getTime()) / (1000 * 60))
    .filter(m => m > 0);
  const prevAvgRes = avgOrNull(prevResMinutes);

  return {
    totalTicketsCreated,
    totalTicketsClosed,
    overallSlaCompliance,
    totalBacklog,
    avgResolutionMinutes,
    topCompanies,
    topTechnicians,
    trendVsPrevious: {
      ticketsCreatedChange: pctChange(totalTicketsCreated, prevCreated),
      ticketsClosedChange: pctChange(totalTicketsClosed, prevClosed),
      resolutionTimeChange: avgResolutionMinutes !== null && prevAvgRes !== null
        ? pctChange(avgResolutionMinutes, prevAvgRes)
        : null,
    },
  };
}

// ============================================
// TREND DATA (real-time from raw tickets)
// ============================================

export async function getRealtimeTicketTrend(
  range: DateRange,
  groupBy: 'day' | 'week' | 'month' = 'day',
): Promise<{ ticketTrend: TrendPoint[]; resolutionTrend: TrendPoint[] }> {
  const buckets = generateTrendBuckets(range, groupBy);

  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { createDate: { gte: range.from, lte: range.to } },
        { completedDate: { gte: range.from, lte: range.to } },
      ],
    },
    select: { createDate: true, completedDate: true, status: true },
  });

  // Volume: tickets created per bucket
  const volumeMap = new Map<string, number>();
  const resMap = new Map<string, number[]>();

  for (const t of tickets) {
    if (t.createDate >= range.from && t.createDate <= range.to) {
      const key = dateToBucketKey(t.createDate, groupBy);
      volumeMap.set(key, (volumeMap.get(key) || 0) + 1);
    }
    if (isResolved(t.status) && t.completedDate && t.completedDate >= range.from) {
      const key = dateToBucketKey(t.completedDate, groupBy);
      const mins = (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60);
      if (mins > 0) {
        const existing = resMap.get(key) || [];
        existing.push(mins);
        resMap.set(key, existing);
      }
    }
  }

  const ticketTrend = buckets.map(b => ({
    date: b.date,
    label: b.label,
    value: volumeMap.get(b.date) || 0,
  }));

  const resolutionTrend = buckets.map(b => {
    const vals = resMap.get(b.date) || [];
    return {
      date: b.date,
      label: b.label,
      value: vals.length > 0 ? Math.round(vals.reduce((a, c) => a + c, 0) / vals.length) : 0,
    };
  });

  return { ticketTrend, resolutionTrend };
}

// ============================================
// PRIORITY BREAKDOWN (real-time)
// ============================================

export async function getRealtimePriorityBreakdown(
  range: DateRange,
  companyId?: string,
): Promise<PriorityBreakdown[]> {
  const tickets = await prisma.ticket.findMany({
    where: {
      createDate: { gte: range.from, lte: range.to },
      ...(companyId ? { companyId } : {}),
    },
    select: { priority: true, status: true, createDate: true, completedDate: true },
  });

  const total = tickets.length;
  if (total === 0) return [];

  const byPriority = new Map<number, { count: number; resMinutes: number[] }>();
  for (const t of tickets) {
    const p = t.priority;
    if (!byPriority.has(p)) byPriority.set(p, { count: 0, resMinutes: [] });
    const d = byPriority.get(p)!;
    d.count++;
    if (isResolved(t.status) && t.completedDate) {
      const mins = (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60);
      if (mins > 0) d.resMinutes.push(mins);
    }
  }

  return Array.from(byPriority.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([priority, d]) => ({
      priority: PRIORITY_LABELS[priority] || `P${priority}`,
      count: d.count,
      percentage: round1((d.count / total) * 100),
      avgResolutionMinutes: avgOrNull(d.resMinutes),
    }));
}

// ============================================
// COMPANY TICKET LIST (real-time)
// ============================================

export interface TicketRow {
  ticketId: string;
  ticketNumber: string;
  title: string;
  status: number;
  statusLabel: string;
  isResolved: boolean;
  priority: number;
  priorityLabel: string;
  assignedTo: string;
  createDate: string;
  completedDate: string | null;
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  hoursLogged: number;
  slaResponseMet: boolean | null;
  slaResolutionMet: boolean | null;
}

export async function getRealtimeTicketList(
  range: DateRange,
  options: { companyId?: string; resourceId?: number },
): Promise<{
  tickets: TicketRow[];
  totalTickets: number;
  resolvedCount: number;
  openCount: number;
  sla: { responseCompliance: number | null; resolutionCompliance: number | null; responseSampleSize: number; resolutionSampleSize: number };
  companyName: string;
}> {
  const { companyId, resourceId } = options;

  const tickets = await prisma.ticket.findMany({
    where: {
      createDate: { gte: range.from, lte: range.to },
      ...(companyId ? { companyId } : {}),
      ...(resourceId ? { assignedResourceId: resourceId } : {}),
    },
    select: {
      autotaskTicketId: true,
      ticketNumber: true,
      title: true,
      status: true,
      statusLabel: true,
      priority: true,
      priorityLabel: true,
      assignedResourceId: true,
      createDate: true,
      completedDate: true,
      dueDateTime: true,
      companyId: true,
    },
    orderBy: { createDate: 'desc' },
  });

  // Resolve resource names
  const resourceIds = Array.from(new Set(tickets.map(t => t.assignedResourceId).filter((v): v is number => v !== null)));
  const resources = resourceIds.length > 0
    ? await prisma.resource.findMany({
        where: { autotaskResourceId: { in: resourceIds } },
        select: { autotaskResourceId: true, firstName: true, lastName: true },
      })
    : [];
  const resourceNameMap = new Map(resources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`.trim()]));

  // Time entries by ticket
  const ticketIds = tickets.map(t => t.autotaskTicketId);
  const timeEntries = ticketIds.length > 0
    ? await prisma.ticketTimeEntry.findMany({
        where: { autotaskTicketId: { in: ticketIds } },
        select: { autotaskTicketId: true, hoursWorked: true },
      })
    : [];
  const hoursByTicket = new Map<string, number>();
  for (const te of timeEntries) {
    hoursByTicket.set(te.autotaskTicketId, (hoursByTicket.get(te.autotaskTicketId) || 0) + te.hoursWorked);
  }

  // First note per ticket for FRT
  const notesByTicket = ticketIds.length > 0
    ? await prisma.ticketNote.findMany({
        where: { autotaskTicketId: { in: ticketIds }, creatorResourceId: { not: null } },
        select: { autotaskTicketId: true, createDateTime: true },
        orderBy: { createDateTime: 'asc' },
      })
    : [];
  const firstNoteMap = new Map<string, Date>();
  for (const n of notesByTicket) {
    if (!firstNoteMap.has(n.autotaskTicketId)) firstNoteMap.set(n.autotaskTicketId, n.createDateTime);
  }

  // Compute header name
  let headerName = 'Tickets';
  if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { displayName: true } });
    headerName = company?.displayName || 'Unknown Company';
  } else if (resourceId) {
    const name = resourceNameMap.get(resourceId);
    if (!name) {
      const res = await prisma.resource.findUnique({ where: { autotaskResourceId: resourceId }, select: { firstName: true, lastName: true } });
      headerName = res ? `${res.firstName} ${res.lastName}`.trim() : `Resource ${resourceId}`;
    } else {
      headerName = name;
    }
  }

  // SLA computation
  let slaResMet = 0, slaResTotal = 0;
  const resolvedTickets = tickets.filter(t => isResolved(t.status) && t.completedDate);
  for (const t of resolvedTickets) {
    if (t.dueDateTime) {
      slaResTotal++;
      if (t.completedDate! <= t.dueDateTime) slaResMet++;
    }
  }

  const resolved = tickets.filter(t => isResolved(t.status));
  const open = tickets.filter(t => !isResolved(t.status));

  const rows: TicketRow[] = tickets.map(t => {
    const firstNote = firstNoteMap.get(t.autotaskTicketId);
    const frtMinutes = firstNote ? (firstNote.getTime() - t.createDate.getTime()) / (1000 * 60) : null;
    const resMins = isResolved(t.status) && t.completedDate
      ? (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60)
      : null;

    return {
      ticketId: t.autotaskTicketId,
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      statusLabel: t.statusLabel || `Status ${t.status}`,
      isResolved: isResolved(t.status),
      priority: t.priority,
      priorityLabel: t.priorityLabel || PRIORITY_LABELS[t.priority] || `P${t.priority}`,
      assignedTo: t.assignedResourceId ? (resourceNameMap.get(t.assignedResourceId) || 'Unassigned') : 'Unassigned',
      createDate: t.createDate.toISOString(),
      completedDate: t.completedDate?.toISOString() || null,
      firstResponseMinutes: frtMinutes !== null && frtMinutes >= 0 ? round1(frtMinutes) : null,
      resolutionMinutes: resMins !== null && resMins > 0 ? round1(resMins) : null,
      hoursLogged: round1(hoursByTicket.get(t.autotaskTicketId) || 0),
      slaResponseMet: null, // Would need SLA target configuration
      slaResolutionMet: t.dueDateTime && isResolved(t.status) && t.completedDate
        ? t.completedDate <= t.dueDateTime
        : null,
    };
  });

  return {
    tickets: rows,
    totalTickets: tickets.length,
    resolvedCount: resolved.length,
    openCount: open.length,
    sla: {
      responseCompliance: null, // Need SLA target data for response
      resolutionCompliance: slaResTotal > 0 ? round1((slaResMet / slaResTotal) * 100) : null,
      responseSampleSize: 0,
      resolutionSampleSize: slaResTotal,
    },
    companyName: headerName,
  };
}

// ============================================
// COMPARISON HELPERS (real-time)
// ============================================

export async function getRealtimeComparisonData(range: DateRange) {
  const prevRange = getComparisonRange(range);

  const [currentTickets, prevTickets] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        OR: [
          { createDate: { gte: range.from, lte: range.to } },
          { completedDate: { gte: range.from, lte: range.to } },
        ],
      },
      select: { status: true, createDate: true, completedDate: true },
    }),
    prisma.ticket.findMany({
      where: {
        OR: [
          { createDate: { gte: prevRange.from, lte: prevRange.to } },
          { completedDate: { gte: prevRange.from, lte: prevRange.to } },
        ],
      },
      select: { status: true, createDate: true, completedDate: true },
    }),
  ]);

  const curCreated = currentTickets.filter(t => t.createDate >= range.from && t.createDate <= range.to).length;
  const curClosed = currentTickets.filter(t => isResolved(t.status) && t.completedDate && t.completedDate >= range.from).length;
  const prevCreated = prevTickets.filter(t => t.createDate >= prevRange.from && t.createDate <= prevRange.to).length;
  const prevClosed = prevTickets.filter(t => isResolved(t.status) && t.completedDate && t.completedDate >= prevRange.from).length;

  const curResMinutes = currentTickets
    .filter(t => isResolved(t.status) && t.completedDate && t.completedDate >= range.from)
    .map(t => (t.completedDate!.getTime() - t.createDate.getTime()) / (1000 * 60))
    .filter(m => m > 0);
  const prevResMinutes = prevTickets
    .filter(t => isResolved(t.status) && t.completedDate && t.completedDate >= prevRange.from)
    .map(t => (t.completedDate!.getTime() - t.createDate.getTime()) / (1000 * 60))
    .filter(m => m > 0);

  const [curTimeEntries, prevTimeEntries] = await Promise.all([
    prisma.ticketTimeEntry.aggregate({
      where: { dateWorked: { gte: range.from, lte: range.to } },
      _sum: { hoursWorked: true },
    }),
    prisma.ticketTimeEntry.aggregate({
      where: { dateWorked: { gte: prevRange.from, lte: prevRange.to } },
      _sum: { hoursWorked: true },
    }),
  ]);

  return {
    ticketsCreated: { current: curCreated, previous: prevCreated, changePercent: pctChange(curCreated, prevCreated), direction: directionOf(pctChange(curCreated, prevCreated)) },
    ticketsClosed: { current: curClosed, previous: prevClosed, changePercent: pctChange(curClosed, prevClosed), direction: directionOf(pctChange(curClosed, prevClosed)) },
    avgResolution: {
      current: avgOrNull(curResMinutes) || 0,
      previous: avgOrNull(prevResMinutes) || 0,
      changePercent: pctChange(avgOrNull(curResMinutes) || 0, avgOrNull(prevResMinutes) || 0),
      direction: directionOf(pctChange(avgOrNull(curResMinutes) || 0, avgOrNull(prevResMinutes) || 0)),
    },
    supportHours: {
      current: round1(curTimeEntries._sum.hoursWorked || 0),
      previous: round1(prevTimeEntries._sum.hoursWorked || 0),
      changePercent: pctChange(curTimeEntries._sum.hoursWorked || 0, prevTimeEntries._sum.hoursWorked || 0),
      direction: directionOf(pctChange(curTimeEntries._sum.hoursWorked || 0, prevTimeEntries._sum.hoursWorked || 0)),
    },
  };
}

function directionOf(pct: number | null): 'up' | 'down' | 'flat' {
  if (pct === null) return 'flat';
  return pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
}
