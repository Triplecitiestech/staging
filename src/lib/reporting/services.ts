/**
 * Internal reporting query services.
 * All queries read from materialized reporting tables, not raw Autotask data.
 */

import { prisma } from '@/lib/prisma';
import {
  DateRange,
  ReportMeta,
  TechnicianSummary,
  CompanySummary,
  DashboardSummary,
} from './types';

// ============================================
// HELPERS
// ============================================

function defaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

async function getDataFreshness(): Promise<string | null> {
  const status = await prisma.reportingJobStatus.findUnique({
    where: { jobName: 'sync_tickets' },
    select: { lastRunAt: true },
  });
  return status?.lastRunAt?.toISOString() || null;
}

function buildMeta(range: DateRange, ticketCount: number, freshness: string | null): ReportMeta {
  return {
    period: {
      from: range.from.toISOString().split('T')[0],
      to: range.to.toISOString().split('T')[0],
    },
    generatedAt: new Date().toISOString(),
    dataFreshness: freshness,
    ticketCount,
  };
}

// ============================================
// TECHNICIAN METRICS
// ============================================

export async function getTechnicianMetrics(
  range?: DateRange,
  resourceId?: number,
): Promise<{ data: TechnicianSummary[]; meta: ReportMeta }> {
  const { from, to } = range || defaultDateRange();
  const freshness = await getDataFreshness();

  const filter = {
    date: { gte: from, lte: to },
    ...(resourceId ? { resourceId } : {}),
  };

  // Aggregate daily rows
  const dailyRows = await prisma.technicianMetricsDaily.findMany({
    where: filter,
  });

  // Group by resourceId
  const grouped = new Map<number, typeof dailyRows>();
  for (const row of dailyRows) {
    const existing = grouped.get(row.resourceId) || [];
    existing.push(row);
    grouped.set(row.resourceId, existing);
  }

  // Resolve resource names
  const resourceIds = Array.from(grouped.keys());
  const resources = await prisma.resource.findMany({
    where: { autotaskResourceId: { in: resourceIds } },
  });
  const resourceMap = new Map(resources.map(r => [r.autotaskResourceId, r]));

  const summaries: TechnicianSummary[] = [];

  for (const [resId, rows] of Array.from(grouped.entries())) {
    const resource = resourceMap.get(resId);
    const ticketsClosed = rows.reduce((sum, r) => sum + r.ticketsClosed, 0);
    const ticketsAssigned = rows.length > 0 ? rows[rows.length - 1].openTicketCount : 0;
    const hoursLogged = rows.reduce((sum, r) => sum + r.hoursLogged, 0);
    const billableHoursLogged = rows.reduce((sum, r) => sum + r.billableHoursLogged, 0);

    const frtValues = rows.map(r => r.avgFirstResponseMinutes).filter((v): v is number => v !== null);
    const resValues = rows.map(r => r.avgResolutionMinutes).filter((v): v is number => v !== null);

    const totalFirstTouch = rows.reduce((sum, r) => sum + r.firstTouchResolutions, 0);
    const totalResolutions = rows.reduce((sum, r) => sum + r.totalResolutions, 0);

    summaries.push({
      resourceId: resId,
      firstName: resource?.firstName || 'Unknown',
      lastName: resource?.lastName || '',
      email: resource?.email || '',
      ticketsClosed,
      ticketsAssigned,
      hoursLogged: Math.round(hoursLogged * 10) / 10,
      billableHoursLogged: Math.round(billableHoursLogged * 10) / 10,
      avgFirstResponseMinutes: frtValues.length > 0
        ? Math.round(frtValues.reduce((a, b) => a + b, 0) / frtValues.length)
        : null,
      avgResolutionMinutes: resValues.length > 0
        ? Math.round(resValues.reduce((a, b) => a + b, 0) / resValues.length)
        : null,
      firstTouchResolutionRate: totalResolutions > 0
        ? Math.round((totalFirstTouch / totalResolutions) * 1000) / 10
        : null,
      openTicketCount: ticketsAssigned,
    });
  }

  // Sort by tickets closed descending
  summaries.sort((a, b) => b.ticketsClosed - a.ticketsClosed);

  return {
    data: summaries,
    meta: buildMeta({ from, to }, summaries.reduce((sum, s) => sum + s.ticketsClosed, 0), freshness),
  };
}

// ============================================
// COMPANY METRICS
// ============================================

export async function getCompanyServiceDeskMetrics(
  range?: DateRange,
  companyId?: string,
): Promise<{ data: CompanySummary[]; meta: ReportMeta }> {
  const { from, to } = range || defaultDateRange();
  const freshness = await getDataFreshness();

  const filter = {
    date: { gte: from, lte: to },
    ...(companyId ? { companyId } : {}),
  };

  const dailyRows = await prisma.companyMetricsDaily.findMany({
    where: filter,
  });

  // Group by companyId
  const grouped = new Map<string, typeof dailyRows>();
  for (const row of dailyRows) {
    const existing = grouped.get(row.companyId) || [];
    existing.push(row);
    grouped.set(row.companyId, existing);
  }

  // Resolve company names
  const companyIds = Array.from(grouped.keys());
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, displayName: true },
  });
  const companyMap = new Map(companies.map(c => [c.id, c]));

  // Get latest health scores
  const healthScores = await prisma.customerHealthScore.findMany({
    where: { companyId: { in: companyIds } },
    orderBy: { computedAt: 'desc' },
    distinct: ['companyId'],
    select: { companyId: true, overallScore: true, trend: true },
  });
  const healthMap = new Map(healthScores.map(h => [h.companyId, h]));

  const summaries: CompanySummary[] = [];

  for (const [cId, rows] of Array.from(grouped.entries())) {
    const company = companyMap.get(cId);
    const health = healthMap.get(cId);

    const ticketsCreated = rows.reduce((sum, r) => sum + r.ticketsCreated, 0);
    const ticketsClosed = rows.reduce((sum, r) => sum + r.ticketsClosed, 0);
    const supportHoursConsumed = rows.reduce((sum, r) => sum + r.supportHoursConsumed, 0);

    const resValues = rows.map(r => r.avgResolutionMinutes).filter((v): v is number => v !== null);
    const reopenValues = rows.map(r => r.reopenRate).filter((v): v is number => v !== null);
    const ftrrValues = rows.map(r => r.firstTouchResolutionRate).filter((v): v is number => v !== null);

    const slaResponseValues = rows.map(r => r.slaResponseCompliance).filter((v): v is number => v !== null);
    const slaResolutionValues = rows.map(r => r.slaResolutionCompliance).filter((v): v is number => v !== null);
    const allSla = [...slaResponseValues, ...slaResolutionValues];

    const lastRow = rows[rows.length - 1];

    summaries.push({
      companyId: cId,
      displayName: company?.displayName || 'Unknown',
      ticketsCreated,
      ticketsClosed,
      supportHoursConsumed: Math.round(supportHoursConsumed * 10) / 10,
      avgResolutionMinutes: resValues.length > 0
        ? Math.round(resValues.reduce((a, b) => a + b, 0) / resValues.length)
        : null,
      reopenRate: reopenValues.length > 0
        ? Math.round(reopenValues.reduce((a, b) => a + b, 0) / reopenValues.length * 10) / 10
        : null,
      firstTouchResolutionRate: ftrrValues.length > 0
        ? Math.round(ftrrValues.reduce((a, b) => a + b, 0) / ftrrValues.length * 10) / 10
        : null,
      slaCompliance: allSla.length > 0
        ? Math.round(allSla.reduce((a, b) => a + b, 0) / allSla.length * 10) / 10
        : null,
      backlogCount: lastRow?.backlogCount ?? 0,
      healthScore: health?.overallScore ?? null,
      healthTrend: health?.trend ?? null,
    });
  }

  summaries.sort((a, b) => b.ticketsCreated - a.ticketsCreated);

  return {
    data: summaries,
    meta: buildMeta({ from, to }, summaries.reduce((sum, s) => sum + s.ticketsCreated, 0), freshness),
  };
}

// ============================================
// CUSTOMER HEALTH METRICS
// ============================================

export async function getCustomerHealthMetrics(companyId?: string) {
  const filter = companyId ? { companyId } : {};

  const scores = await prisma.customerHealthScore.findMany({
    where: filter,
    orderBy: { computedAt: 'desc' },
    distinct: ['companyId'],
  });

  // Resolve company names
  const companyIds = scores.map(s => s.companyId);
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, displayName: true },
  });
  const companyMap = new Map(companies.map(c => [c.id, c]));

  return scores.map(s => ({
    companyId: s.companyId,
    displayName: companyMap.get(s.companyId)?.displayName || 'Unknown',
    overallScore: s.overallScore,
    trend: s.trend,
    previousScore: s.previousScore,
    tier: getHealthTier(s.overallScore),
    factors: {
      ticketVolumeTrend: s.ticketVolumeTrendScore,
      reopenRate: s.reopenRateScore,
      priorityMix: s.priorityMixScore,
      supportHoursTrend: s.supportHoursTrendScore,
      avgResolutionTime: s.avgResolutionTimeScore,
      agingTickets: s.agingTicketsScore,
      slaCompliance: s.slaComplianceScore,
    },
    rawValues: {
      ticketCountCurrent: s.ticketCountCurrent,
      ticketCountPrevious: s.ticketCountPrevious,
      reopenRate: s.reopenRateValue,
      urgentHighPercent: s.urgentHighPercent,
      supportHoursCurrent: s.supportHoursCurrent,
      supportHoursPrevious: s.supportHoursPrevious,
      avgResolutionMinutes: s.avgResolutionMinutes,
      agingTicketCount: s.agingTicketCount,
      slaCompliancePercent: s.slaCompliancePercent,
    },
    computedAt: s.computedAt.toISOString(),
    periodStart: s.periodStart.toISOString(),
    periodEnd: s.periodEnd.toISOString(),
  }));
}

function getHealthTier(score: number): string {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Needs Attention';
  if (score >= 40) return 'At Risk';
  return 'Critical';
}

// ============================================
// DASHBOARD SUMMARY
// ============================================

export async function getDashboardSummary(range?: DateRange): Promise<DashboardSummary> {
  const { from, to } = range || defaultDateRange();
  const periodDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  const prevFrom = new Date(from.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const prevTo = from;

  // Current period
  const companyMetrics = await prisma.companyMetricsDaily.findMany({
    where: { date: { gte: from, lte: to } },
  });

  const totalTicketsCreated = companyMetrics.reduce((sum, r) => sum + r.ticketsCreated, 0);
  const totalTicketsClosed = companyMetrics.reduce((sum, r) => sum + r.ticketsClosed, 0);

  // SLA compliance
  const slaValues = companyMetrics
    .flatMap(r => [r.slaResponseCompliance, r.slaResolutionCompliance])
    .filter((v): v is number => v !== null);
  const overallSlaCompliance = slaValues.length > 0
    ? Math.round(slaValues.reduce((a, b) => a + b, 0) / slaValues.length * 10) / 10
    : null;

  // Backlog
  const latestCompanyMetrics = await prisma.companyMetricsDaily.findMany({
    orderBy: { date: 'desc' },
    distinct: ['companyId'],
    select: { backlogCount: true },
  });
  const totalBacklog = latestCompanyMetrics.reduce((sum, r) => sum + r.backlogCount, 0);

  // Avg resolution
  const resValues = companyMetrics
    .map(r => r.avgResolutionMinutes)
    .filter((v): v is number => v !== null);
  const avgResolutionMinutes = resValues.length > 0
    ? Math.round(resValues.reduce((a, b) => a + b, 0) / resValues.length)
    : null;

  // Top companies by ticket count
  const companyTickets = new Map<string, number>();
  for (const row of companyMetrics) {
    companyTickets.set(row.companyId, (companyTickets.get(row.companyId) || 0) + row.ticketsCreated);
  }
  const topCompanyIds = Array.from(companyTickets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topCompanyRecords = await prisma.company.findMany({
    where: { id: { in: topCompanyIds.map(c => c[0]) } },
    select: { id: true, displayName: true },
  });
  const topCompanyMap = new Map(topCompanyRecords.map(c => [c.id, c.displayName]));

  const topCompanies = topCompanyIds.map(([id, count]) => ({
    companyId: id,
    displayName: topCompanyMap.get(id) || 'Unknown',
    ticketCount: count,
  }));

  // Top technicians by hours logged
  const techMetrics = await prisma.technicianMetricsDaily.findMany({
    where: { date: { gte: from, lte: to } },
  });
  const techHours = new Map<number, number>();
  for (const row of techMetrics) {
    techHours.set(row.resourceId, (techHours.get(row.resourceId) || 0) + row.hoursLogged);
  }
  const topTechIds = Array.from(techHours.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topTechRecords = await prisma.resource.findMany({
    where: { autotaskResourceId: { in: topTechIds.map(t => t[0]) } },
    select: { autotaskResourceId: true, firstName: true, lastName: true },
  });
  const topTechMap = new Map(topTechRecords.map(r => [
    r.autotaskResourceId,
    `${r.firstName} ${r.lastName}`.trim(),
  ]));

  const topTechnicians = topTechIds.map(([id, hours]) => ({
    resourceId: id,
    name: topTechMap.get(id) || 'Unknown',
    hoursLogged: Math.round(hours * 10) / 10,
  }));

  // Previous period for trends
  const prevCompanyMetrics = await prisma.companyMetricsDaily.findMany({
    where: { date: { gte: prevFrom, lte: prevTo } },
  });
  const prevTicketsCreated = prevCompanyMetrics.reduce((sum, r) => sum + r.ticketsCreated, 0);
  const prevTicketsClosed = prevCompanyMetrics.reduce((sum, r) => sum + r.ticketsClosed, 0);
  const prevResValues = prevCompanyMetrics
    .map(r => r.avgResolutionMinutes)
    .filter((v): v is number => v !== null);
  const prevAvgResolution = prevResValues.length > 0
    ? prevResValues.reduce((a, b) => a + b, 0) / prevResValues.length
    : null;

  return {
    totalTicketsCreated,
    totalTicketsClosed,
    overallSlaCompliance,
    totalBacklog,
    avgResolutionMinutes,
    topCompanies,
    topTechnicians,
    trendVsPrevious: {
      ticketsCreatedChange: prevTicketsCreated > 0
        ? Math.round(((totalTicketsCreated - prevTicketsCreated) / prevTicketsCreated) * 100)
        : null,
      ticketsClosedChange: prevTicketsClosed > 0
        ? Math.round(((totalTicketsClosed - prevTicketsClosed) / prevTicketsClosed) * 100)
        : null,
      resolutionTimeChange: prevAvgResolution && avgResolutionMinutes
        ? Math.round(((avgResolutionMinutes - prevAvgResolution) / prevAvgResolution) * 100)
        : null,
    },
  };
}

// ============================================
// BENCHMARK COMPARISON
// ============================================

export async function getBenchmarkComparisons(metricKey?: string) {
  const targets = await prisma.reportingTarget.findMany({
    where: {
      isActive: true,
      ...(metricKey ? { metricKey } : {}),
    },
    orderBy: [{ metricKey: 'asc' }, { scope: 'asc' }],
  });

  return targets.map(t => ({
    id: t.id,
    metricKey: t.metricKey,
    scope: t.scope,
    scopeValue: t.scopeValue,
    targetValue: t.targetValue,
    unit: t.unit,
    description: t.description,
    isActive: t.isActive,
  }));
}
