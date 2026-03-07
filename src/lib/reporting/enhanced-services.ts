/**
 * Enhanced reporting services with trend data, breakdowns, and comparisons.
 * Wraps the base services with additional context for dashboards.
 */

import { prisma } from '@/lib/prisma';
import {
  ReportMeta,
  ComparisonData,
  BenchmarkResult,
  EnhancedTechnicianReport,
  EnhancedCompanyReport,
  EnhancedDashboardReport,
  EnhancedHealthReport,
  PRIORITY_LABELS,
} from './types';
import { ReportFilters, getComparisonRange, generateTrendBuckets, dateToBucketKey } from './filters';
import {
  getTechnicianMetrics,
  getCompanyServiceDeskMetrics,
  getCustomerHealthMetrics,
  getDashboardSummary,
} from './services';

// ============================================
// HELPERS
// ============================================

function computeComparison(current: number, previous: number): ComparisonData {
  const changePercent = previous > 0
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : null;
  const direction: 'up' | 'down' | 'flat' =
    changePercent === null ? 'flat' : changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'flat';
  return { current, previous, changePercent, direction };
}

async function getDataFreshness(): Promise<string | null> {
  const status = await prisma.reportingJobStatus.findUnique({
    where: { jobName: 'sync_tickets' },
    select: { lastRunAt: true },
  });
  return status?.lastRunAt?.toISOString() || null;
}

function buildMeta(filters: ReportFilters, ticketCount: number, freshness: string | null): ReportMeta {
  return {
    period: {
      from: filters.dateRange.from.toISOString().split('T')[0],
      to: filters.dateRange.to.toISOString().split('T')[0],
    },
    generatedAt: new Date().toISOString(),
    dataFreshness: freshness,
    ticketCount,
  };
}

// ============================================
// ENHANCED TECHNICIAN REPORT
// ============================================

export async function getEnhancedTechnicianReport(filters: ReportFilters): Promise<EnhancedTechnicianReport> {
  const { dateRange, resourceId } = filters;
  const freshness = await getDataFreshness();

  // Base data
  const { data: summary } = await getTechnicianMetrics(dateRange, resourceId);

  const totalTickets = summary.reduce((sum, s) => sum + s.ticketsClosed, 0);
  const meta = buildMeta(filters, totalTickets, freshness);

  const result: EnhancedTechnicianReport = { summary, meta };

  // Trend data
  if (filters.includeTrend) {
    const groupBy = filters.groupBy || 'day';
    const buckets = generateTrendBuckets(dateRange, groupBy);
    const dailyRows = await prisma.technicianMetricsDaily.findMany({
      where: {
        date: { gte: dateRange.from, lte: dateRange.to },
        ...(resourceId ? { resourceId } : {}),
      },
    });

    const bucketMap = new Map<string, number>();
    for (const row of dailyRows) {
      const key = dateToBucketKey(row.date, groupBy);
      bucketMap.set(key, (bucketMap.get(key) || 0) + row.ticketsClosed);
    }

    result.trend = buckets.map(b => ({
      date: b.date,
      label: b.label,
      value: bucketMap.get(b.date) || 0,
    }));
  }

  // Comparison
  if (filters.includeComparison) {
    const compRange = getComparisonRange(dateRange);
    const { data: prevSummary } = await getTechnicianMetrics(compRange, resourceId);

    const currClosed = summary.reduce((s, t) => s + t.ticketsClosed, 0);
    const prevClosed = prevSummary.reduce((s, t) => s + t.ticketsClosed, 0);
    const currHours = summary.reduce((s, t) => s + t.hoursLogged, 0);
    const prevHours = prevSummary.reduce((s, t) => s + t.hoursLogged, 0);

    const currRes = summary.filter(t => t.avgResolutionMinutes !== null);
    const prevRes = prevSummary.filter(t => t.avgResolutionMinutes !== null);
    const currAvgRes = currRes.length > 0
      ? currRes.reduce((s, t) => s + (t.avgResolutionMinutes || 0), 0) / currRes.length
      : 0;
    const prevAvgRes = prevRes.length > 0
      ? prevRes.reduce((s, t) => s + (t.avgResolutionMinutes || 0), 0) / prevRes.length
      : 0;

    result.comparison = {
      ticketsClosed: computeComparison(currClosed, prevClosed),
      hoursLogged: computeComparison(Math.round(currHours * 10) / 10, Math.round(prevHours * 10) / 10),
      avgResolution: computeComparison(Math.round(currAvgRes), Math.round(prevAvgRes)),
    };
  }

  // Benchmarks
  if (filters.includeBreakdown) {
    const targets = await prisma.reportingTarget.findMany({
      where: { isActive: true, metricKey: { in: ['technician_daily_hours'] } },
    });

    if (targets.length > 0 && summary.length > 0) {
      const avgDailyHours = summary.reduce((s, t) => s + t.hoursLogged, 0) / summary.length;
      result.benchmarks = targets.map(t => ({
        metricKey: t.metricKey,
        actual: Math.round(avgDailyHours * 10) / 10,
        target: t.targetValue,
        unit: t.unit,
        meetingTarget: avgDailyHours >= t.targetValue,
        percentOfTarget: Math.round((avgDailyHours / t.targetValue) * 1000) / 10,
      }));
    }
  }

  return result;
}

// ============================================
// ENHANCED COMPANY REPORT
// ============================================

export async function getEnhancedCompanyReport(filters: ReportFilters): Promise<EnhancedCompanyReport> {
  const { dateRange, companyId } = filters;
  const freshness = await getDataFreshness();

  const { data: summary } = await getCompanyServiceDeskMetrics(dateRange, companyId);
  const totalTickets = summary.reduce((sum, s) => sum + s.ticketsCreated, 0);
  const meta = buildMeta(filters, totalTickets, freshness);

  const result: EnhancedCompanyReport = { summary, meta };

  // Trend data
  if (filters.includeTrend) {
    const groupBy = filters.groupBy || 'day';
    const buckets = generateTrendBuckets(dateRange, groupBy);
    const dailyRows = await prisma.companyMetricsDaily.findMany({
      where: {
        date: { gte: dateRange.from, lte: dateRange.to },
        ...(companyId ? { companyId } : {}),
      },
    });

    const bucketMap = new Map<string, number>();
    for (const row of dailyRows) {
      const key = dateToBucketKey(row.date, groupBy);
      bucketMap.set(key, (bucketMap.get(key) || 0) + row.ticketsCreated);
    }

    result.trend = buckets.map(b => ({
      date: b.date,
      label: b.label,
      value: bucketMap.get(b.date) || 0,
    }));
  }

  // Priority breakdown
  if (filters.includeBreakdown) {
    const lifecycles = await prisma.ticketLifecycle.findMany({
      where: {
        createDate: { gte: dateRange.from, lte: dateRange.to },
        ...(companyId ? { companyId } : {}),
      },
    });

    const priorityMap = new Map<number, { count: number; resMinutes: number[] }>();
    for (const lc of lifecycles) {
      const p = lc.priority || 3;
      const existing = priorityMap.get(p) || { count: 0, resMinutes: [] };
      existing.count++;
      if (lc.fullResolutionMinutes !== null) {
        existing.resMinutes.push(lc.fullResolutionMinutes);
      }
      priorityMap.set(p, existing);
    }

    const total = lifecycles.length || 1;
    result.priorityBreakdown = Array.from(priorityMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([p, data]) => ({
        priority: PRIORITY_LABELS[p] || `Priority ${p}`,
        count: data.count,
        percentage: Math.round((data.count / total) * 1000) / 10,
        avgResolutionMinutes: data.resMinutes.length > 0
          ? Math.round(data.resMinutes.reduce((a, b) => a + b, 0) / data.resMinutes.length)
          : null,
      }));

    // Benchmarks
    const targets = await prisma.reportingTarget.findMany({
      where: {
        isActive: true,
        metricKey: { in: ['first_response_time', 'resolution_time', 'reopen_rate', 'first_touch_resolution_rate'] },
      },
    });

    if (targets.length > 0 && summary.length > 0) {
      const benchmarks: BenchmarkResult[] = [];
      const avgRes = summary.filter(s => s.avgResolutionMinutes !== null);
      const avgResMinutes = avgRes.length > 0
        ? avgRes.reduce((s, c) => s + (c.avgResolutionMinutes || 0), 0) / avgRes.length
        : 0;

      const globalResTarget = targets.find(t => t.metricKey === 'resolution_time' && t.scope === 'global');
      if (globalResTarget && avgResMinutes > 0) {
        benchmarks.push({
          metricKey: 'resolution_time',
          actual: Math.round(avgResMinutes),
          target: globalResTarget.targetValue,
          unit: globalResTarget.unit,
          meetingTarget: avgResMinutes <= globalResTarget.targetValue,
          percentOfTarget: Math.round((avgResMinutes / globalResTarget.targetValue) * 1000) / 10,
        });
      }

      const reopenTarget = targets.find(t => t.metricKey === 'reopen_rate' && t.scope === 'global');
      if (reopenTarget) {
        const avgReopen = summary.filter(s => s.reopenRate !== null);
        const avgReopenRate = avgReopen.length > 0
          ? avgReopen.reduce((s, c) => s + (c.reopenRate || 0), 0) / avgReopen.length
          : 0;
        if (avgReopenRate > 0) {
          benchmarks.push({
            metricKey: 'reopen_rate',
            actual: Math.round(avgReopenRate * 10) / 10,
            target: reopenTarget.targetValue,
            unit: reopenTarget.unit,
            meetingTarget: avgReopenRate <= reopenTarget.targetValue,
            percentOfTarget: Math.round((avgReopenRate / reopenTarget.targetValue) * 1000) / 10,
          });
        }
      }

      if (benchmarks.length > 0) {
        result.benchmarks = benchmarks;
      }
    }
  }

  // Comparison
  if (filters.includeComparison) {
    const compRange = getComparisonRange(dateRange);
    const { data: prevSummary } = await getCompanyServiceDeskMetrics(compRange, companyId);

    const currCreated = summary.reduce((s, c) => s + c.ticketsCreated, 0);
    const prevCreated = prevSummary.reduce((s, c) => s + c.ticketsCreated, 0);
    const currClosed = summary.reduce((s, c) => s + c.ticketsClosed, 0);
    const prevClosed = prevSummary.reduce((s, c) => s + c.ticketsClosed, 0);
    const currHours = summary.reduce((s, c) => s + c.supportHoursConsumed, 0);
    const prevHours = prevSummary.reduce((s, c) => s + c.supportHoursConsumed, 0);

    const currRes = summary.filter(c => c.avgResolutionMinutes !== null);
    const prevRes = prevSummary.filter(c => c.avgResolutionMinutes !== null);
    const currAvg = currRes.length > 0 ? currRes.reduce((s, c) => s + (c.avgResolutionMinutes || 0), 0) / currRes.length : 0;
    const prevAvg = prevRes.length > 0 ? prevRes.reduce((s, c) => s + (c.avgResolutionMinutes || 0), 0) / prevRes.length : 0;

    result.comparison = {
      ticketsCreated: computeComparison(currCreated, prevCreated),
      ticketsClosed: computeComparison(currClosed, prevClosed),
      supportHours: computeComparison(Math.round(currHours * 10) / 10, Math.round(prevHours * 10) / 10),
      avgResolution: computeComparison(Math.round(currAvg), Math.round(prevAvg)),
    };
  }

  return result;
}

// ============================================
// ENHANCED DASHBOARD REPORT
// ============================================

export async function getEnhancedDashboardReport(filters: ReportFilters): Promise<EnhancedDashboardReport> {
  const { dateRange } = filters;
  const freshness = await getDataFreshness();

  const summary = await getDashboardSummary(dateRange);
  const meta = buildMeta(filters, summary.totalTicketsCreated, freshness);

  const result: EnhancedDashboardReport = { summary, meta };

  // Ticket volume trend
  if (filters.includeTrend) {
    const groupBy = filters.groupBy || 'day';
    const buckets = generateTrendBuckets(dateRange, groupBy);
    const dailyRows = await prisma.companyMetricsDaily.findMany({
      where: { date: { gte: dateRange.from, lte: dateRange.to } },
    });

    const ticketBucketMap = new Map<string, number>();
    const resBucketMap = new Map<string, { total: number; count: number }>();

    for (const row of dailyRows) {
      const key = dateToBucketKey(row.date, groupBy);
      ticketBucketMap.set(key, (ticketBucketMap.get(key) || 0) + row.ticketsCreated);
      if (row.avgResolutionMinutes !== null) {
        const existing = resBucketMap.get(key) || { total: 0, count: 0 };
        existing.total += row.avgResolutionMinutes;
        existing.count++;
        resBucketMap.set(key, existing);
      }
    }

    result.ticketTrend = buckets.map(b => ({
      date: b.date,
      label: b.label,
      value: ticketBucketMap.get(b.date) || 0,
    }));

    result.resolutionTrend = buckets.map(b => {
      const data = resBucketMap.get(b.date);
      return {
        date: b.date,
        label: b.label,
        value: data ? Math.round(data.total / data.count) : 0,
      };
    });
  }

  // Priority breakdown
  if (filters.includeBreakdown) {
    const lifecycles = await prisma.ticketLifecycle.findMany({
      where: { createDate: { gte: dateRange.from, lte: dateRange.to } },
    });

    const priorityMap = new Map<number, { count: number; resMinutes: number[] }>();
    for (const lc of lifecycles) {
      const p = lc.priority || 3;
      const existing = priorityMap.get(p) || { count: 0, resMinutes: [] };
      existing.count++;
      if (lc.fullResolutionMinutes !== null) {
        existing.resMinutes.push(lc.fullResolutionMinutes);
      }
      priorityMap.set(p, existing);
    }

    const total = lifecycles.length || 1;
    result.priorityBreakdown = Array.from(priorityMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([p, data]) => ({
        priority: PRIORITY_LABELS[p] || `Priority ${p}`,
        count: data.count,
        percentage: Math.round((data.count / total) * 1000) / 10,
        avgResolutionMinutes: data.resMinutes.length > 0
          ? Math.round(data.resMinutes.reduce((a, b) => a + b, 0) / data.resMinutes.length)
          : null,
      }));
  }

  return result;
}

// ============================================
// ENHANCED HEALTH REPORT
// ============================================

export async function getEnhancedHealthReport(filters: ReportFilters): Promise<EnhancedHealthReport> {
  const { companyId } = filters;
  const freshness = await getDataFreshness();

  const scores = await getCustomerHealthMetrics(companyId);
  const meta = buildMeta(filters, scores.length, freshness);

  // Distribution
  const distribution = {
    healthy: scores.filter(s => s.overallScore >= 80).length,
    needsAttention: scores.filter(s => s.overallScore >= 60 && s.overallScore < 80).length,
    atRisk: scores.filter(s => s.overallScore >= 40 && s.overallScore < 60).length,
    critical: scores.filter(s => s.overallScore < 40).length,
  };

  return { scores, distribution, meta };
}
