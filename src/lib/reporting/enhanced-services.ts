/**
 * Enhanced reporting services with trend data, breakdowns, and comparisons.
 * Now uses real-time queries from raw Ticket tables for accurate data.
 * Materialized tables are no longer required for core functionality.
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
} from './types';
import { ReportFilters, getComparisonRange } from './filters';
import {
  getRealtimeTechnicianMetrics,
  getRealtimeCompanyMetrics,
  getRealtimeDashboardSummary,
  getRealtimeTicketTrend,
  getRealtimePriorityBreakdown,
  getRealtimeComparisonData,
} from './realtime-queries';
import { getCustomerHealthMetrics } from './services';

// ============================================
// HELPERS
// ============================================

function computeComparison(current: number, previous: number): ComparisonData {
  const changePercent = previous > 0
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : current > 0 ? 100 : null;
  const direction: 'up' | 'down' | 'flat' =
    changePercent === null ? 'flat' : changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'flat';
  return { current, previous, changePercent, direction };
}

async function getDataFreshness(): Promise<string | null> {
  try {
    const status = await prisma.reportingJobStatus.findUnique({
      where: { jobName: 'sync_tickets' },
      select: { lastRunAt: true },
    });
    return status?.lastRunAt?.toISOString() || null;
  } catch {
    return null;
  }
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
// ENHANCED TECHNICIAN REPORT (real-time)
// ============================================

export async function getEnhancedTechnicianReport(filters: ReportFilters): Promise<EnhancedTechnicianReport> {
  const { dateRange, resourceId } = filters;
  const freshness = await getDataFreshness();

  // Real-time data from raw tables
  const summary = await getRealtimeTechnicianMetrics(dateRange, resourceId);
  const totalTickets = summary.reduce((sum, s) => sum + s.ticketsClosed, 0);
  const meta = buildMeta(filters, totalTickets, freshness);

  const result: EnhancedTechnicianReport = { summary, meta };

  // Trend data (from raw tickets)
  if (filters.includeTrend) {
    const { ticketTrend } = await getRealtimeTicketTrend(dateRange, filters.groupBy || 'day');
    result.trend = ticketTrend;
  }

  // Comparison (from raw tickets)
  if (filters.includeComparison) {
    const compRange = getComparisonRange(dateRange);
    const prevSummary = await getRealtimeTechnicianMetrics(compRange, resourceId);

    const currClosed = summary.reduce((s, t) => s + t.ticketsClosed, 0);
    const prevClosed = prevSummary.reduce((s, t) => s + t.ticketsClosed, 0);
    const currHours = summary.reduce((s, t) => s + t.hoursLogged, 0);
    const prevHours = prevSummary.reduce((s, t) => s + t.hoursLogged, 0);

    const currRes = summary.filter(t => t.avgResolutionMinutes !== null);
    const prevRes = prevSummary.filter(t => t.avgResolutionMinutes !== null);
    const currAvgRes = currRes.length > 0
      ? currRes.reduce((s, t) => s + (t.avgResolutionMinutes || 0), 0) / currRes.length : 0;
    const prevAvgRes = prevRes.length > 0
      ? prevRes.reduce((s, t) => s + (t.avgResolutionMinutes || 0), 0) / prevRes.length : 0;

    result.comparison = {
      ticketsClosed: computeComparison(currClosed, prevClosed),
      hoursLogged: computeComparison(Math.round(currHours * 10) / 10, Math.round(prevHours * 10) / 10),
      avgResolution: computeComparison(Math.round(currAvgRes), Math.round(prevAvgRes)),
    };
  }

  // Benchmarks
  if (filters.includeBreakdown) {
    try {
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
    } catch {
      // Reporting targets table may not exist yet
    }
  }

  return result;
}

// ============================================
// ENHANCED COMPANY REPORT (real-time)
// ============================================

export async function getEnhancedCompanyReport(filters: ReportFilters): Promise<EnhancedCompanyReport> {
  const { dateRange, companyId } = filters;
  const freshness = await getDataFreshness();

  // Real-time data from raw tables
  const summary = await getRealtimeCompanyMetrics(dateRange, companyId);
  const totalTickets = summary.reduce((sum, s) => sum + s.ticketsCreated, 0);
  const meta = buildMeta(filters, totalTickets, freshness);

  const result: EnhancedCompanyReport = { summary, meta };

  // Trend data (from raw tickets)
  if (filters.includeTrend) {
    const { ticketTrend } = await getRealtimeTicketTrend(dateRange, filters.groupBy || 'day');
    result.trend = ticketTrend;
  }

  // Priority breakdown (from raw tickets)
  if (filters.includeBreakdown) {
    result.priorityBreakdown = await getRealtimePriorityBreakdown(dateRange, companyId);

    // Benchmarks from configurable targets
    try {
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

        if (benchmarks.length > 0) {
          result.benchmarks = benchmarks;
        }
      }
    } catch {
      // Reporting targets table may not exist yet
    }
  }

  // Comparison (from raw tickets)
  if (filters.includeComparison) {
    const comparison = await getRealtimeComparisonData(dateRange);
    result.comparison = {
      ticketsCreated: comparison.ticketsCreated,
      ticketsClosed: comparison.ticketsClosed,
      supportHours: comparison.supportHours,
      avgResolution: comparison.avgResolution,
    };
  }

  return result;
}

// ============================================
// ENHANCED DASHBOARD REPORT (real-time)
// ============================================

export async function getEnhancedDashboardReport(filters: ReportFilters): Promise<EnhancedDashboardReport> {
  const { dateRange } = filters;
  const freshness = await getDataFreshness();

  // Real-time data from raw tables
  const summary = await getRealtimeDashboardSummary(dateRange);
  const meta = buildMeta(filters, summary.totalTicketsCreated, freshness);

  const result: EnhancedDashboardReport = { summary, meta };

  // Trend data (from raw tickets)
  if (filters.includeTrend) {
    const groupBy = filters.groupBy || 'day';
    const trends = await getRealtimeTicketTrend(dateRange, groupBy);
    result.ticketTrend = trends.ticketTrend;
    result.resolutionTrend = trends.resolutionTrend;
  }

  // Priority breakdown (from raw tickets)
  if (filters.includeBreakdown) {
    result.priorityBreakdown = await getRealtimePriorityBreakdown(dateRange);
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

  const distribution = {
    healthy: scores.filter(s => s.overallScore >= 80).length,
    needsAttention: scores.filter(s => s.overallScore >= 60 && s.overallScore < 80).length,
    atRisk: scores.filter(s => s.overallScore >= 40 && s.overallScore < 60).length,
    critical: scores.filter(s => s.overallScore < 40).length,
  };

  return { scores, distribution, meta };
}
