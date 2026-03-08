/**
 * Shared validation test suite for the reporting system.
 * Tests every realtime query function against the live database.
 * Used by both the API endpoint and the CLI script.
 */

import { prisma } from '@/lib/prisma';
import { resolvePreset } from './filters';
import type { ReportFilters } from './filters';
import {
  getRealtimeDashboardSummary,
  getRealtimeTechnicianMetrics,
  getRealtimeCompanyMetrics,
  getRealtimeTicketTrend,
  getRealtimePriorityBreakdown,
  getRealtimeComparisonData,
  getRealtimeTicketList,
} from './realtime-queries';
import {
  getEnhancedDashboardReport,
  getEnhancedTechnicianReport,
  getEnhancedCompanyReport,
  getEnhancedHealthReport,
} from './enhanced-services';

// ============================================
// TYPES
// ============================================

export interface CheckResult {
  check: string;
  passed: boolean;
  value: unknown;
  expected: string;
}

export interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  durationMs: number;
  checks: CheckResult[];
  error?: string;
}

export interface ValidationReport {
  overall: 'PASS' | 'FAIL';
  passed: number;
  failed: number;
  warned: number;
  total: number;
  totalDurationMs: number;
  dateRange: { from: string; to: string };
  results: TestResult[];
}

// ============================================
// TEST RUNNER
// ============================================

async function runTest(
  name: string,
  fn: () => Promise<CheckResult[]>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    const checks = await fn();
    const anyFailed = checks.some(c => !c.passed);
    return {
      name,
      status: anyFailed ? 'FAIL' : 'PASS',
      durationMs: Date.now() - start,
      checks,
    };
  } catch (err) {
    return {
      name,
      status: 'FAIL',
      durationMs: Date.now() - start,
      checks: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function check(name: string, value: unknown, expected: string, passed: boolean): CheckResult {
  return { check: name, passed, value, expected };
}

// ============================================
// MAIN ENTRY POINT
// ============================================

export async function runAllValidationTests(): Promise<ValidationReport> {
  const totalStart = Date.now();
  const dateRange = resolvePreset('last_90_days');
  const results: TestResult[] = [];

  const baseFilters: ReportFilters = {
    dateRange,
    preset: 'last_90_days',
  };

  // Test 1: Dashboard Summary
  results.push(await runTest('Dashboard Summary (getRealtimeDashboardSummary)', async () => {
    const r = await getRealtimeDashboardSummary(dateRange);
    return [
      check('totalTicketsCreated > 0', r.totalTicketsCreated, '> 0', r.totalTicketsCreated > 0),
      check('totalTicketsClosed > 0', r.totalTicketsClosed, '> 0', r.totalTicketsClosed > 0),
      check('totalBacklog >= 0', r.totalBacklog, '>= 0', r.totalBacklog >= 0),
      check('topCompanies non-empty', r.topCompanies.length, '> 0', r.topCompanies.length > 0),
      check('topTechnicians non-empty', r.topTechnicians.length, '> 0', r.topTechnicians.length > 0),
      check('avgResolutionMinutes not null', r.avgResolutionMinutes, 'not null', r.avgResolutionMinutes !== null),
    ];
  }));

  // Test 2: Technician Metrics
  results.push(await runTest('Technician Metrics (getRealtimeTechnicianMetrics)', async () => {
    const r = await getRealtimeTechnicianMetrics(dateRange);
    const anyWithClosed = r.some(t => t.ticketsClosed > 0);
    const anyWithHours = r.some(t => t.hoursLogged > 0);
    return [
      check('result.length > 0', r.length, '> 0', r.length > 0),
      check('at least one tech with ticketsClosed > 0', anyWithClosed, 'true', anyWithClosed),
      check('at least one tech with hoursLogged > 0', anyWithHours, 'true', anyWithHours),
      check('first tech has firstName', r[0]?.firstName, 'non-empty string', !!r[0]?.firstName),
    ];
  }));

  // Test 3: Company Metrics
  results.push(await runTest('Company Metrics (getRealtimeCompanyMetrics)', async () => {
    const r = await getRealtimeCompanyMetrics(dateRange);
    const anyWithCreated = r.some(c => c.ticketsCreated > 0);
    const anyWithClosed = r.some(c => c.ticketsClosed > 0);
    return [
      check('result.length > 0', r.length, '> 0', r.length > 0),
      check('at least one company with ticketsCreated > 0', anyWithCreated, 'true', anyWithCreated),
      check('at least one company with ticketsClosed > 0', anyWithClosed, 'true', anyWithClosed),
      check('first company has displayName', r[0]?.displayName, 'non-empty string', !!r[0]?.displayName),
    ];
  }));

  // Test 4: Ticket Trend
  results.push(await runTest('Ticket Trend (getRealtimeTicketTrend)', async () => {
    const r = await getRealtimeTicketTrend(dateRange, 'day');
    const anyNonZero = r.ticketTrend.some(b => b.value > 0);
    return [
      check('ticketTrend non-empty', r.ticketTrend.length, '> 0', r.ticketTrend.length > 0),
      check('at least one bucket with value > 0', anyNonZero, 'true', anyNonZero),
      check('resolutionTrend non-empty', r.resolutionTrend.length, '> 0', r.resolutionTrend.length > 0),
    ];
  }));

  // Test 5: Priority Breakdown
  results.push(await runTest('Priority Breakdown (getRealtimePriorityBreakdown)', async () => {
    const r = await getRealtimePriorityBreakdown(dateRange);
    const totalCount = r.reduce((s, p) => s + p.count, 0);
    return [
      check('result non-empty', r.length, '> 0', r.length > 0),
      check('total count > 0', totalCount, '> 0', totalCount > 0),
      check('each entry has percentage', r.every(p => p.percentage > 0), 'all true', r.every(p => p.percentage > 0)),
    ];
  }));

  // Test 6: Comparison Data
  results.push(await runTest('Comparison Data (getRealtimeComparisonData)', async () => {
    const r = await getRealtimeComparisonData(dateRange);
    return [
      check('has ticketsCreated', 'ticketsCreated' in r, 'true', 'ticketsCreated' in r),
      check('has ticketsClosed', 'ticketsClosed' in r, 'true', 'ticketsClosed' in r),
      check('has avgResolution', 'avgResolution' in r, 'true', 'avgResolution' in r),
      check('has supportHours', 'supportHours' in r, 'true', 'supportHours' in r),
      check('ticketsCreated.current > 0', r.ticketsCreated.current, '> 0', r.ticketsCreated.current > 0),
    ];
  }));

  // Test 7: Ticket List (needs a real companyId)
  results.push(await runTest('Ticket List (getRealtimeTicketList)', async () => {
    const sampleTicket = await prisma.ticket.findFirst({
      where: { createDate: { gte: dateRange.from, lte: dateRange.to } },
      select: { companyId: true },
    });
    if (!sampleTicket) {
      return [check('found a ticket with companyId', null, 'not null', false)];
    }
    const r = await getRealtimeTicketList(dateRange, { companyId: sampleTicket.companyId });
    return [
      check('totalTickets > 0', r.totalTickets, '> 0', r.totalTickets > 0),
      check('tickets array non-empty', r.tickets.length, '> 0', r.tickets.length > 0),
      check('companyName resolved', r.companyName, 'not "Tickets"', r.companyName !== 'Tickets'),
      check('first ticket has title', r.tickets[0]?.title, 'non-empty', !!r.tickets[0]?.title),
    ];
  }));

  // Test 8: Enhanced Dashboard Report
  results.push(await runTest('Enhanced Dashboard (getEnhancedDashboardReport)', async () => {
    const r = await getEnhancedDashboardReport({
      ...baseFilters,
      includeTrend: true,
      includeBreakdown: true,
    });
    return [
      check('summary.totalTicketsCreated > 0', r.summary.totalTicketsCreated, '> 0', r.summary.totalTicketsCreated > 0),
      check('meta.ticketCount > 0', r.meta.ticketCount, '> 0', r.meta.ticketCount > 0),
      check('ticketTrend present', !!r.ticketTrend, 'true', !!r.ticketTrend),
      check('ticketTrend non-empty', r.ticketTrend?.length ?? 0, '> 0', (r.ticketTrend?.length ?? 0) > 0),
      check('priorityBreakdown present', !!r.priorityBreakdown, 'true', !!r.priorityBreakdown),
    ];
  }));

  // Test 9: Enhanced Technician Report
  results.push(await runTest('Enhanced Technician (getEnhancedTechnicianReport)', async () => {
    const r = await getEnhancedTechnicianReport({
      ...baseFilters,
      includeTrend: true,
      includeComparison: true,
    });
    return [
      check('summary non-empty', r.summary.length, '> 0', r.summary.length > 0),
      check('trend present', !!r.trend, 'true', !!r.trend),
      check('comparison present', !!r.comparison, 'true', !!r.comparison),
      check('comparison.ticketsClosed exists', !!r.comparison?.ticketsClosed, 'true', !!r.comparison?.ticketsClosed),
    ];
  }));

  // Test 10: Enhanced Company Report
  results.push(await runTest('Enhanced Company (getEnhancedCompanyReport)', async () => {
    const r = await getEnhancedCompanyReport({
      ...baseFilters,
      includeTrend: true,
      includeBreakdown: true,
      includeComparison: true,
    });
    return [
      check('summary non-empty', r.summary.length, '> 0', r.summary.length > 0),
      check('priorityBreakdown present', !!r.priorityBreakdown, 'true', !!r.priorityBreakdown),
      check('comparison present', !!r.comparison, 'true', !!r.comparison),
    ];
  }));

  // Test 11: Enhanced Health Report (WARN if empty — needs compute-health job)
  const healthResult = await runTest('Enhanced Health (getEnhancedHealthReport)', async () => {
    const r = await getEnhancedHealthReport(baseFilters);
    return [
      check('scores array returned', Array.isArray(r.scores), 'true', Array.isArray(r.scores)),
      check('distribution object returned', !!r.distribution, 'true', !!r.distribution),
      check('scores non-empty (may be 0 if compute-health not run)', r.scores.length, '> 0', r.scores.length > 0),
    ];
  });
  // Downgrade to WARN if only the count check failed
  if (healthResult.status === 'FAIL') {
    const onlyCountFailed = healthResult.checks.filter(c => !c.passed).every(c => c.check.includes('non-empty'));
    if (onlyCountFailed && !healthResult.error) {
      healthResult.status = 'WARN';
    }
  }
  results.push(healthResult);

  // Test 12: Business Review Data Builder
  results.push(await runTest('Business Review Data Builder (buildReportData)', async () => {
    const { buildReportData } = await import('./business-review/data-builder');
    // Find a company with tickets in the last 90 days
    const sampleTicket = await prisma.ticket.findFirst({
      where: { createDate: { gte: dateRange.from, lte: dateRange.to } },
      select: { companyId: true },
    });
    if (!sampleTicket) {
      return [check('found a company with tickets', null, 'not null', false)];
    }
    // Use last month as the review period (most realistic scenario)
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const report = await buildReportData(sampleTicket.companyId, 'monthly', monthStart, monthEnd);
    const activity = report.supportActivity;
    const anyActivity = activity.ticketsCreated > 0 || activity.ticketsClosed > 0 || activity.supportHoursConsumed > 0;
    return [
      check('report has company name', report.company.name, 'non-empty', !!report.company.name),
      check('report has period label', report.period.label, 'non-empty', !!report.period.label),
      check('has some activity (created, closed, or hours)', anyActivity, 'true', anyActivity),
      check('ticketsCreated + ticketsClosed + hours', `${activity.ticketsCreated}/${activity.ticketsClosed}/${activity.supportHoursConsumed}h`, 'some > 0', anyActivity),
    ];
  }));

  // Test 13: Raw table counts (sanity)
  results.push(await runTest('Raw Table Counts', async () => {
    const [tickets, timeEntries, notesCount, resources] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticketTimeEntry.count(),
      prisma.ticketNote.count(),
      prisma.resource.count(),
    ]);
    return [
      check('tickets > 0', tickets, '> 0', tickets > 0),
      check('timeEntries > 0', timeEntries, '> 0', timeEntries > 0),
      check('ticketNotes > 0', notesCount, '> 0', notesCount > 0),
      check('resources > 0', resources, '> 0', resources > 0),
    ];
  }));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  return {
    overall: failed > 0 ? 'FAIL' : 'PASS',
    passed,
    failed,
    warned,
    total: results.length,
    totalDurationMs: Date.now() - totalStart,
    dateRange: {
      from: dateRange.from.toISOString().split('T')[0],
      to: dateRange.to.toISOString().split('T')[0],
    },
    results,
  };
}
