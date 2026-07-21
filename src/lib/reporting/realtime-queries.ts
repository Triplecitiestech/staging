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
  PRIORITY_LABELS,
  TrendPoint,
  PriorityBreakdown,
  getResolvedStatuses,
} from './types';
import { isApiOrSystemUser } from './api-user-filter';
import { classifyTicket, isHumanTicket, humanTicketSqlCondition } from './ticket-classification';
import { dateToBucketKey, generateTrendBuckets, getComparisonRange } from './filters';
import {
  getLifecycleQualityByCompany,
  getLifecycleQualitySummary,
  getHumanResourceIds,
  resolveFirstResponse,
  countDistinctHumanParticipants,
} from './lifecycle';

/** Ticket fields every realtime query must select so the shared human-vs-automated classifier can run. */
const CLASSIFICATION_SELECT = {
  source: true,
  sourceLabel: true,
  queueId: true,
  queueLabel: true,
  assignedResourceId: true,
} as const;

// ============================================
// HELPERS
// ============================================

function isResolved(status: number): boolean {
  return getResolvedStatuses().includes(status);
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
  // Get all tickets in period — human support only (shared classifier);
  // automated monitoring tickets are not technician work.
  const allTickets = await prisma.ticket.findMany({
    where: {
      createDate: { lte: range.to },
      ...(resourceId ? { assignedResourceId: resourceId } : {}),
    },
    select: {
      autotaskTicketId: true,
      status: true,
      createDate: true,
      completedDate: true,
      creatorResourceId: true,
      ...CLASSIFICATION_SELECT,
    },
  });
  const tickets = allTickets.filter(isHumanTicket);
  const humanResourceIds = await getHumanResourceIds();

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
        newStatus: { in: getResolvedStatuses() },
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

  // Get tech notes per ticket for FRT and FTR calculation
  const closedTicketIds = [
    ...closedInPeriod.map(t => t.autotaskTicketId),
    ...statusHistoryClosures.map(h => h.autotaskTicketId),
  ];
  const notes = closedTicketIds.length > 0 ? await prisma.ticketNote.findMany({
    where: {
      autotaskTicketId: { in: closedTicketIds },
      creatorResourceId: { not: null },
    },
    select: { autotaskTicketId: true, createDateTime: true, creatorResourceId: true },
    orderBy: { createDateTime: 'asc' },
  }) : [];
  const notesByTicket = new Map<string, Array<{ createDateTime: Date; creatorResourceId: number | null }>>();
  for (const n of notes) {
    const arr = notesByTicket.get(n.autotaskTicketId);
    if (arr) arr.push(n);
    else notesByTicket.set(n.autotaskTicketId, [n]);
  }

  // Time entries per closed ticket for FTR (distinct participants)
  const closedTicketTimeEntries = closedTicketIds.length > 0 ? await prisma.ticketTimeEntry.findMany({
    where: {
      autotaskTicketId: { in: closedTicketIds },
    },
    select: { autotaskTicketId: true, resourceId: true },
  }) : [];
  const entriesByTicket = new Map<string, Array<{ resourceId: number | null }>>();
  for (const te of closedTicketTimeEntries) {
    const arr = entriesByTicket.get(te.autotaskTicketId);
    if (arr) arr.push(te);
    else entriesByTicket.set(te.autotaskTicketId, [te]);
  }

  // Ticket rows for FRT computation (createDate + creator for the intake rule)
  const ticketById = new Map(tickets.map(t => [t.autotaskTicketId, t]));

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

  // FTR check: resolved by a single human owner (shared definition — an
  // intake note plus a resolution note by the same tech is one touch).
  const isFTR = (ticketId: string): boolean => {
    const participants = countDistinctHumanParticipants(
      notesByTicket.get(ticketId) || [],
      entriesByTicket.get(ticketId) || [],
      humanResourceIds,
    );
    return participants <= 1;
  };
  // Measured first response (queue wait) — intake-answered tickets excluded
  // via the shared rule; API-authored pipeline notes never count.
  const frtFor = (ticketId: string): number | null => {
    const t = ticketById.get(ticketId);
    if (!t) return null;
    const fr = resolveFirstResponse(t, notesByTicket.get(ticketId) || [], [], humanResourceIds);
    if (fr.answeredAtIntake || fr.firstResponseAt === null) return null;
    const mins = (fr.firstResponseAt.getTime() - t.createDate.getTime()) / (1000 * 60);
    return mins >= 0 ? mins : null;
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
    const frtMins = frtFor(t.autotaskTicketId);
    if (frtMins !== null) d.frtMinutes.push(frtMins);
    if (isFTR(t.autotaskTicketId)) d.firstTouchResolutions++;
  }
  for (const h of statusHistoryClosures) {
    if (!h.assignedResourceId) continue;
    const d = getOrCreate(h.assignedResourceId);
    d.closed++;
    const createDate = ticketById.get(h.autotaskTicketId)?.createDate;
    if (createDate) {
      const resMins = (h.changedAt.getTime() - createDate.getTime()) / (1000 * 60);
      if (resMins > 0) d.resolutionMinutes.push(resMins);
    }
    if (isFTR(h.autotaskTicketId)) d.firstTouchResolutions++;
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
  const allTickets = await prisma.ticket.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      OR: [
        { createDate: { gte: range.from, lte: range.to } },
        { completedDate: { gte: range.from, lte: range.to } },
        // Include open tickets created before the period
        { createDate: { lte: range.to }, status: { notIn: getResolvedStatuses() } },
      ],
    },
    select: {
      autotaskTicketId: true,
      companyId: true,
      status: true,
      priority: true,
      createDate: true,
      completedDate: true,
      ...CLASSIFICATION_SELECT,
    },
  });
  // Human support only — created/closed/backlog/FRT must not count automated
  // monitoring tickets (SLA + reopens already exclude them in the lifecycle reads).
  const tickets = allTickets.filter(isHumanTicket);

  // SLA + reopens come from the ticket_lifecycle engine (business-hours vs
  // targets) — the single SLA source for customer-facing reports.
  const qualityByCompany = await getLifecycleQualityByCompany(range.from, range.to);

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

  // Group by company. (First-response is intentionally not computed here: the
  // company summary doesn't surface FRT — response-time quality for a company
  // comes from the lifecycle engine, which applies the shared intake rule.)
  const companyData = new Map<string, {
    created: number;
    closed: number;
    hours: number;
    backlog: number;
    resolutionMinutes: number[];
  }>();

  const getOrCreate = (cid: string) => {
    if (!companyData.has(cid)) {
      companyData.set(cid, {
        created: 0, closed: 0, hours: 0, backlog: 0,
        resolutionMinutes: [],
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
    }

    // Open backlog
    if (!isResolved(t.status)) {
      d.backlog++;
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
    const quality = qualityByCompany.get(cid);

    summaries.push({
      companyId: cid,
      displayName: companyMap.get(cid) || 'Unknown',
      ticketsCreated: d.created,
      ticketsClosed: d.closed,
      supportHoursConsumed: round1(d.hours),
      avgResolutionMinutes: avgOrNull(d.resolutionMinutes),
      // Real reopen rate from the lifecycle engine — null means "not measured"
      // (no status-history coverage), never a fabricated 0.
      reopenRate: quality?.reopen.reopenRate ?? null,
      firstTouchResolutionRate: null, // Would need deeper note analysis
      // Lifecycle engine SLA (business-hours vs targets) — null = not measured.
      slaCompliance: quality?.sla.combinedCompliance ?? null,
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

  // Current period tickets — human support only (shared classifier)
  const allCurrentTickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { createDate: { gte: range.from, lte: range.to } },
        { completedDate: { gte: range.from, lte: range.to } },
      ],
    },
    select: {
      autotaskTicketId: true,
      companyId: true,
      status: true,
      priority: true,
      createDate: true,
      completedDate: true,
      ...CLASSIFICATION_SELECT,
    },
  });
  const currentTickets = allCurrentTickets.filter(isHumanTicket);

  const createdInPeriod = currentTickets.filter(t => t.createDate >= range.from && t.createDate <= range.to);
  const closedInPeriod = currentTickets.filter(t =>
    isResolved(t.status) && t.completedDate && t.completedDate >= range.from && t.completedDate <= range.to
  );

  const totalTicketsCreated = createdInPeriod.length;
  const totalTicketsClosed = closedInPeriod.length;

  // SLA compliance from the ticket_lifecycle engine (business-hours vs targets)
  // — the same single source every customer-facing report uses. Null = not
  // measured (no targets seeded / no lifecycle coverage), never a proxy number.
  const quality = await getLifecycleQualitySummary(range.from, range.to);
  const overallSlaCompliance = quality.sla.combinedCompliance;

  // Backlog (open HUMAN tickets — automated alert tickets are monitoring
  // records, not work waiting on a technician). SQL predicate mirrors the
  // shared classifier for the bulk count.
  const backlogRows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*)::bigint AS cnt FROM tickets t
     WHERE NOT (t.status = ANY($1::int[])) AND ${humanTicketSqlCondition('t')}`,
    getResolvedStatuses(),
  );
  const totalBacklog = Number(backlogRows[0]?.cnt ?? 0);

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

  // Previous period for comparison — human support only
  const allPrevTickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { createDate: { gte: prevRange.from, lte: prevRange.to } },
        { completedDate: { gte: prevRange.from, lte: prevRange.to } },
      ],
    },
    select: { status: true, createDate: true, completedDate: true, ...CLASSIFICATION_SELECT },
  });
  const prevTickets = allPrevTickets.filter(isHumanTicket);
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

  const allTickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { createDate: { gte: range.from, lte: range.to } },
        { completedDate: { gte: range.from, lte: range.to } },
      ],
    },
    select: { createDate: true, completedDate: true, status: true, ...CLASSIFICATION_SELECT },
  });
  // Human support only — alert storms are not support volume
  const tickets = allTickets.filter(isHumanTicket);

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
  const allTickets = await prisma.ticket.findMany({
    where: {
      createDate: { gte: range.from, lte: range.to },
      ...(companyId ? { companyId } : {}),
    },
    select: { priority: true, status: true, createDate: true, completedDate: true, ...CLASSIFICATION_SELECT },
  });
  // Human support only — automated alerts all default to one priority and drown the mix
  const tickets = allTickets.filter(isHumanTicket);

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
  /** Shared human-vs-automated classification (automated = monitoring alert ticket) */
  classification: 'human' | 'automated';
}

export async function getRealtimeTicketList(
  range: DateRange,
  options: { companyId?: string; resourceId?: number },
): Promise<{
  tickets: TicketRow[];
  totalTickets: number;
  resolvedCount: number;
  openCount: number;
  sla: { responseCompliance: number | null; resolutionPlanCompliance: number | null; resolutionCompliance: number | null; responseSampleSize: number; resolutionPlanSampleSize: number; resolutionSampleSize: number };
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
      createDate: true,
      completedDate: true,
      companyId: true,
      creatorResourceId: true,
      ...CLASSIFICATION_SELECT,
    },
    orderBy: { createDate: 'desc' },
  });
  const humanResourceIds = await getHumanResourceIds();

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

  // Notes per ticket for the per-row first-response (shared intake rule)
  const noteRows = ticketIds.length > 0
    ? await prisma.ticketNote.findMany({
        where: { autotaskTicketId: { in: ticketIds }, creatorResourceId: { not: null } },
        select: { autotaskTicketId: true, createDateTime: true, creatorResourceId: true },
        orderBy: { createDateTime: 'asc' },
      })
    : [];
  const notesByTicketId = new Map<string, Array<{ createDateTime: Date; creatorResourceId: number | null }>>();
  for (const n of noteRows) {
    const arr = notesByTicketId.get(n.autotaskTicketId);
    if (arr) arr.push(n);
    else notesByTicketId.set(n.autotaskTicketId, [n]);
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

  // SLA computation from ticket_lifecycle table (all 3 metrics) — the single
  // SLA source; per-row values below come from the same rows so the header and
  // the rows can never disagree. The header percentages are computed over
  // HUMAN tickets only — automated monitoring tickets stay visible in the
  // list (badged via `classification`) but never enter an SLA denominator.
  const classificationByTicket = new Map(tickets.map(t => [t.autotaskTicketId, classifyTicket(t)]));
  const humanTicketIds = new Set(tickets.filter(t => classificationByTicket.get(t.autotaskTicketId) === 'human').map(t => t.autotaskTicketId));
  const slaTicketIds = tickets.map(t => t.autotaskTicketId);
  let lifecycleRows: { autotaskTicketId: string; slaResponseMet: boolean | null; slaResolutionPlanMet?: boolean | null; slaResolutionMet: boolean | null }[] = [];
  if (slaTicketIds.length > 0) {
    try {
      lifecycleRows = await prisma.ticketLifecycle.findMany({
        where: { autotaskTicketId: { in: slaTicketIds } },
        select: {
          autotaskTicketId: true,
          slaResponseMet: true,
          slaResolutionPlanMet: true,
          slaResolutionMet: true,
        },
      });
    } catch {
      // slaResolutionPlanMet column may not exist yet — fallback without it
      lifecycleRows = (await prisma.ticketLifecycle.findMany({
        where: { autotaskTicketId: { in: slaTicketIds } },
        select: {
          autotaskTicketId: true,
          slaResponseMet: true,
          slaResolutionMet: true,
        },
      })).map(r => ({ ...r, slaResolutionPlanMet: null }));
    }
  }
  const lifecycleByTicket = new Map(lifecycleRows.map(lc => [lc.autotaskTicketId, lc]));

  let slaRespMet = 0, slaRespTotal = 0;
  let slaPlanMet = 0, slaPlanTotal = 0;
  let slaResMet = 0, slaResTotal = 0;
  for (const lc of lifecycleRows) {
    if (!humanTicketIds.has(lc.autotaskTicketId)) continue;
    if (lc.slaResponseMet !== null) {
      slaRespTotal++;
      if (lc.slaResponseMet) slaRespMet++;
    }
    if (lc.slaResolutionPlanMet !== null) {
      slaPlanTotal++;
      if (lc.slaResolutionPlanMet) slaPlanMet++;
    }
    if (lc.slaResolutionMet !== null) {
      slaResTotal++;
      if (lc.slaResolutionMet) slaResMet++;
    }
  }

  const resolved = tickets.filter(t => isResolved(t.status));
  const open = tickets.filter(t => !isResolved(t.status));

  const rows: TicketRow[] = tickets.map(t => {
    // First response via the shared intake rule: null if the ticket was
    // opened live by staff (answeredAtIntake) or has no genuine response yet.
    const fr = resolveFirstResponse(t, notesByTicketId.get(t.autotaskTicketId) || [], [], humanResourceIds);
    const frtMinutes = !fr.answeredAtIntake && fr.firstResponseAt !== null
      ? (fr.firstResponseAt.getTime() - t.createDate.getTime()) / (1000 * 60)
      : null;
    const resMins = isResolved(t.status) && t.completedDate
      ? (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60)
      : null;
    const lc = lifecycleByTicket.get(t.autotaskTicketId);

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
      // Per-ticket lifecycle verdicts (business-hours vs targets) — null when
      // the ticket isn't measured (no target seeded / no lifecycle row yet).
      slaResponseMet: lc?.slaResponseMet ?? null,
      slaResolutionMet: lc?.slaResolutionMet ?? null,
      classification: classificationByTicket.get(t.autotaskTicketId) ?? 'human',
    };
  });

  return {
    tickets: rows,
    totalTickets: tickets.length,
    resolvedCount: resolved.length,
    openCount: open.length,
    sla: {
      responseCompliance: slaRespTotal > 0 ? round1((slaRespMet / slaRespTotal) * 100) : null,
      resolutionPlanCompliance: slaPlanTotal > 0 ? round1((slaPlanMet / slaPlanTotal) * 100) : null,
      resolutionCompliance: slaResTotal > 0 ? round1((slaResMet / slaResTotal) * 100) : null,
      responseSampleSize: slaRespTotal,
      resolutionPlanSampleSize: slaPlanTotal,
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

  const [allCurrentTickets, allPrevTickets] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        OR: [
          { createDate: { gte: range.from, lte: range.to } },
          { completedDate: { gte: range.from, lte: range.to } },
        ],
      },
      select: { status: true, createDate: true, completedDate: true, ...CLASSIFICATION_SELECT },
    }),
    prisma.ticket.findMany({
      where: {
        OR: [
          { createDate: { gte: prevRange.from, lte: prevRange.to } },
          { completedDate: { gte: prevRange.from, lte: prevRange.to } },
        ],
      },
      select: { status: true, createDate: true, completedDate: true, ...CLASSIFICATION_SELECT },
    }),
  ]);
  // Human support only — same classifier as every other report surface
  const currentTickets = allCurrentTickets.filter(isHumanTicket);
  const prevTickets = allPrevTickets.filter(isHumanTicket);

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
