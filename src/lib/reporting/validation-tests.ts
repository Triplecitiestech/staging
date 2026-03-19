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

  // Test 12: Business Review Deep Diagnostic
  // Traces every step of business review generation to find exactly where data goes missing
  results.push(await runTest('Business Review Deep Diagnostic', async () => {
    const { buildReportData } = await import('./business-review/data-builder');
    const { getResolvedStatuses } = await import('./types');
    const resolvedSet = new Set(getResolvedStatuses());

    // Feb 2026 period (matching what the UI sends)
    const monthStart = new Date(Date.UTC(2026, 1, 1)); // Feb 1
    const monthEnd = new Date(Date.UTC(2026, 2, 0));   // Feb 28

    const checks: CheckResult[] = [];

    // Step 1: List ALL companies that have tickets, with ticket counts
    const companiesWithTickets = await prisma.ticket.groupBy({
      by: ['companyId'],
      _count: { autotaskTicketId: true },
      orderBy: { _count: { autotaskTicketId: 'desc' } },
    });
    const companyIds = companiesWithTickets.map(c => c.companyId);
    const companyNames = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, displayName: true },
    });
    const nameMap = new Map(companyNames.map(c => [c.id, c.displayName]));

    const companySummary = companiesWithTickets
      .slice(0, 10)
      .map(c => `${nameMap.get(c.companyId) || 'Unknown'}(${c._count.autotaskTicketId})`)
      .join(', ');
    checks.push(check('companies with tickets (top 10)', companySummary, 'info', companiesWithTickets.length > 0));

    // Step 2: For each of the top 3 companies, run buildReportData and show results
    for (const entry of companiesWithTickets.slice(0, 3)) {
      const cName = nameMap.get(entry.companyId) || 'Unknown';
      try {
        // First, raw ticket counts for this company in Feb
        const rawTickets = await prisma.ticket.findMany({
          where: { companyId: entry.companyId },
          select: { status: true, createDate: true, completedDate: true },
        });
        const rawCreatedFeb = rawTickets.filter(t => t.createDate >= monthStart && t.createDate <= monthEnd).length;
        const rawClosedFeb = rawTickets.filter(t =>
          resolvedSet.has(t.status) && t.completedDate &&
          t.completedDate >= monthStart && t.completedDate <= monthEnd
        ).length;

        // Also try the EXACT Prisma query that buildReportData uses
        const prismaQueryResult = await prisma.ticket.findMany({
          where: {
            companyId: entry.companyId,
            OR: [
              { createDate: { gte: monthStart, lte: monthEnd } },
              { completedDate: { gte: monthStart, lte: monthEnd } },
              { createDate: { lte: monthEnd }, status: { notIn: Array.from(resolvedSet) } },
            ],
          },
          select: { autotaskTicketId: true, status: true, createDate: true, completedDate: true },
        });

        // Run buildReportData
        const report = await buildReportData(entry.companyId, 'monthly', monthStart, monthEnd);
        const a = report.supportActivity;

        checks.push(check(
          `${cName} raw: total=${rawTickets.length} createdFeb=${rawCreatedFeb} closedFeb=${rawClosedFeb} prismaOR=${prismaQueryResult.length}`,
          `report: created=${a.ticketsCreated} closed=${a.ticketsClosed} hours=${a.supportHoursConsumed}`,
          'non-zero if tickets exist',
          rawCreatedFeb === 0 || a.ticketsCreated > 0, // PASS if no Feb tickets OR report shows them
        ));
      } catch (err) {
        checks.push(check(`${cName} error`, err instanceof Error ? err.message : String(err), 'no error', false));
      }
    }

    // Step 3: Specifically search for Tri-Bros (various search patterns)
    const searchPatterns = ['Tri-Bros', 'Tri Bros', 'TriBros', 'Tri'];
    let triBros: { id: string; displayName: string } | null = null;
    for (const pattern of searchPatterns) {
      triBros = await prisma.company.findFirst({
        where: { displayName: { contains: pattern, mode: 'insensitive' } },
        select: { id: true, displayName: true },
      });
      if (triBros) break;
    }

    if (triBros) {
      const tbTickets = await prisma.ticket.findMany({
        where: { companyId: triBros.id },
        select: { autotaskTicketId: true, status: true, createDate: true, completedDate: true },
      });
      const uniqueStatuses = Array.from(new Set(tbTickets.map(t => t.status))).sort();
      const statusBreakdown = uniqueStatuses.map(s => `${s}:${tbTickets.filter(t => t.status === s).length}`).join(' ');

      checks.push(check(`Tri-Bros found: "${triBros.displayName}"`, triBros.id, 'UUID', true));
      checks.push(check(`Tri-Bros total tickets`, tbTickets.length, '> 0', tbTickets.length > 0));
      checks.push(check(`Tri-Bros status breakdown`, statusBreakdown, 'info', true));

      if (tbTickets.length > 0) {
        const earliest = tbTickets.reduce((m, t) => t.createDate < m ? t.createDate : m, tbTickets[0].createDate);
        const latest = tbTickets.reduce((m, t) => t.createDate > m ? t.createDate : m, tbTickets[0].createDate);
        checks.push(check(`Tri-Bros date range`, `${earliest.toISOString()} to ${latest.toISOString()}`, 'info', true));

        const tbCreated = tbTickets.filter(t => t.createDate >= monthStart && t.createDate <= monthEnd).length;
        const tbClosed = tbTickets.filter(t =>
          resolvedSet.has(t.status) && t.completedDate &&
          t.completedDate >= monthStart && t.completedDate <= monthEnd
        ).length;
        const tbOpen = tbTickets.filter(t => t.createDate <= monthEnd && !resolvedSet.has(t.status)).length;
        checks.push(check(`Tri-Bros Feb: created=${tbCreated} closed=${tbClosed} open=${tbOpen}`, tbCreated + tbClosed + tbOpen, 'info', true));

        // Show first 5 ticket dates for debugging
        const sampleTickets = tbTickets
          .sort((a, b) => b.createDate.getTime() - a.createDate.getTime())
          .slice(0, 5)
          .map(t => `${t.autotaskTicketId}:status=${t.status},created=${t.createDate.toISOString().split('T')[0]},completed=${t.completedDate?.toISOString().split('T')[0] || 'null'}`);
        checks.push(check('Tri-Bros sample tickets (newest 5)', sampleTickets.join(' | '), 'info', true));

        // Run buildReportData for Tri-Bros
        try {
          const tbReport = await buildReportData(triBros.id, 'monthly', monthStart, monthEnd);
          const tbA = tbReport.supportActivity;
          checks.push(check(
            `Tri-Bros REPORT`,
            `created=${tbA.ticketsCreated} closed=${tbA.ticketsClosed} hours=${tbA.supportHoursConsumed} reopened=${tbA.ticketsReopened}`,
            'non-zero',
            tbA.ticketsCreated > 0 || tbA.ticketsClosed > 0 || tbA.supportHoursConsumed > 0,
          ));
        } catch (err) {
          checks.push(check('Tri-Bros buildReportData', err instanceof Error ? err.message : String(err), 'no error', false));
        }
      }
    } else {
      // List all company names so user can identify the right one
      const allCompanies = await prisma.company.findMany({
        select: { displayName: true },
        orderBy: { displayName: 'asc' },
      });
      checks.push(check(
        'Tri-Bros NOT FOUND - all companies',
        allCompanies.map(c => c.displayName).join(', '),
        'should contain Tri-Bros',
        false,
      ));
    }

    return checks;
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
