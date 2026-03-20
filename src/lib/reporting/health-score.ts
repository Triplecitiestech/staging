/**
 * Customer health score computation.
 *
 * 7-factor weighted model:
 *   1. Ticket Volume Trend (20%)
 *   2. Reopen Rate (15%)
 *   3. Priority Mix (15%)
 *   4. Support Hours Trend (15%)
 *   5. Average Resolution Time (15%)
 *   6. Aging Tickets (10%)
 *   7. SLA Compliance (10%)
 *
 * Each factor produces a 0-100 score. Weighted average = overall score.
 * Trend is computed by comparing to previous period's score.
 */

import { prisma } from '@/lib/prisma';
import { createJobTracker } from './job-status';
import { JOB_NAMES, getResolvedStatuses } from './types';
import { resolveTarget } from './targets';
import { assertTableExists } from './sync';

interface HealthResult {
  computed: number;
  errors: string[];
}

// Default weights (sum = 1.0)
const WEIGHTS = {
  ticketVolumeTrend: 0.20,
  reopenRate: 0.15,
  priorityMix: 0.15,
  supportHoursTrend: 0.15,
  avgResolutionTime: 0.15,
  agingTickets: 0.10,
  slaCompliance: 0.10,
};

/**
 * Compute health scores for all companies with Autotask integration.
 * Uses a rolling 30-day current period vs. prior 30-day comparison period.
 */
export async function computeCustomerHealth(): Promise<HealthResult> {
  const finish = createJobTracker(JOB_NAMES.COMPUTE_HEALTH);
  const result: HealthResult = { computed: 0, errors: [] };

  try {
    await assertTableExists('ticket_lifecycle');
    await assertTableExists('customer_health_scores');

    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prevPeriodEnd = periodStart;
    const prevPeriodStart = new Date(periodStart.getTime() - 30 * 24 * 60 * 60 * 1000);

    const companies = await prisma.company.findMany({
      where: { autotaskCompanyId: { not: null } },
      select: { id: true },
    });

    for (const company of companies) {
      try {
        const score = await computeCompanyHealth(
          company.id,
          periodStart,
          periodEnd,
          prevPeriodStart,
          prevPeriodEnd,
        );

        if (score) {
          await prisma.customerHealthScore.create({ data: score });
          result.computed++;
        }
      } catch (err) {
        result.errors.push(`Company ${company.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { computed: result.computed, errorCount: result.errors.length },
      error: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await finish({ status: 'failed', error });
    throw err;
  }
}

async function computeCompanyHealth(
  companyId: string,
  periodStart: Date,
  periodEnd: Date,
  prevPeriodStart: Date,
  prevPeriodEnd: Date,
) {
  // Current period tickets
  const currentTickets = await prisma.ticket.findMany({
    where: {
      companyId,
      createDate: { gte: periodStart, lte: periodEnd },
    },
    select: { autotaskTicketId: true, priority: true, createDate: true },
  });

  // Previous period tickets
  const prevTickets = await prisma.ticket.count({
    where: {
      companyId,
      createDate: { gte: prevPeriodStart, lte: prevPeriodEnd },
    },
  });

  const ticketCountCurrent = currentTickets.length;
  const ticketCountPrevious = prevTickets;

  // Skip companies with no ticket data at all
  if (ticketCountCurrent === 0 && ticketCountPrevious === 0) return null;

  // 1. Ticket Volume Trend Score
  const ticketVolumeTrendScore = computeTrendScore(ticketCountCurrent, ticketCountPrevious);

  // 2. Reopen Rate Score
  // Reopen detection relies on TicketStatusHistory records, which are only
  // captured during ticket sync (point-in-time deltas). If resolved tickets
  // have no status history at all, we can't reliably determine reopens —
  // use a neutral score rather than claiming zero reopens.
  const currentLifecycles = await prisma.ticketLifecycle.findMany({
    where: {
      companyId,
      isResolved: true,
      completedDate: { gte: periodStart, lte: periodEnd },
    },
    select: { autotaskTicketId: true, reopenCount: true },
  });
  const totalResolved = currentLifecycles.length;
  const reopened = currentLifecycles.filter(l => l.reopenCount > 0).length;

  // Check how many resolved tickets actually have status history records
  // (without status history, we can't detect reopens at all)
  let ticketsWithHistory = 0;
  if (totalResolved > 0) {
    const resolvedIds = currentLifecycles.map(l => l.autotaskTicketId);
    const historyCount = await prisma.ticketStatusHistory.groupBy({
      by: ['autotaskTicketId'],
      where: { autotaskTicketId: { in: resolvedIds } },
    });
    ticketsWithHistory = historyCount.length;
  }

  let reopenRateValue: number;
  let reopenRateScore: number;
  if (totalResolved === 0 || ticketsWithHistory === 0) {
    // No data to compute reopen rate — use neutral score
    reopenRateValue = 0;
    reopenRateScore = 50; // Neutral when we have no status history data
  } else {
    reopenRateValue = (reopened / totalResolved) * 100;
    reopenRateScore = scoreReopenRate(reopenRateValue);
  }

  // 3. Priority Mix Score
  const urgentHighCount = currentTickets.filter(t => t.priority <= 2).length;
  const urgentHighPercent = ticketCountCurrent > 0 ? (urgentHighCount / ticketCountCurrent) * 100 : 0;
  const priorityMixScore = scorePriorityMix(urgentHighPercent);

  // 4. Support Hours Trend Score
  const currentHours = await sumSupportHours(companyId, periodStart, periodEnd);
  const prevHours = await sumSupportHours(companyId, prevPeriodStart, prevPeriodEnd);
  const supportHoursTrendScore = computeTrendScore(currentHours, prevHours);

  // 5. Average Resolution Time Score
  const resolutionMinutes = currentLifecycles.length > 0
    ? await getAvgResolution(companyId, periodStart, periodEnd)
    : null;
  const avgResolutionTimeScore = await scoreResolutionTime(resolutionMinutes);

  // 6. Aging Tickets Score
  const agingTicketCount = await countAgingTickets(companyId);
  const agingTicketsScore = scoreAgingTickets(agingTicketCount, ticketCountCurrent);

  // 7. SLA Compliance Score
  const slaCompliancePercent = await getSlaCompliance(companyId, periodStart, periodEnd);
  const slaComplianceScore = slaCompliancePercent !== null ? slaCompliancePercent : 50; // Neutral if no SLA data

  // Weighted overall score
  const overallScore =
    ticketVolumeTrendScore * WEIGHTS.ticketVolumeTrend +
    reopenRateScore * WEIGHTS.reopenRate +
    priorityMixScore * WEIGHTS.priorityMix +
    supportHoursTrendScore * WEIGHTS.supportHoursTrend +
    avgResolutionTimeScore * WEIGHTS.avgResolutionTime +
    agingTicketsScore * WEIGHTS.agingTickets +
    slaComplianceScore * WEIGHTS.slaCompliance;

  // Get previous score for trend
  const previousHealthScore = await prisma.customerHealthScore.findFirst({
    where: { companyId },
    orderBy: { computedAt: 'desc' },
    select: { overallScore: true },
  });
  const previousScore = previousHealthScore?.overallScore ?? null;
  const trend = previousScore === null
    ? 'stable'
    : overallScore > previousScore + 5
      ? 'improving'
      : overallScore < previousScore - 5
        ? 'declining'
        : 'stable';

  return {
    companyId,
    periodStart,
    periodEnd,
    overallScore: Math.round(overallScore * 10) / 10,
    trend,
    previousScore,
    ticketVolumeTrendScore: Math.round(ticketVolumeTrendScore * 10) / 10,
    reopenRateScore: Math.round(reopenRateScore * 10) / 10,
    priorityMixScore: Math.round(priorityMixScore * 10) / 10,
    supportHoursTrendScore: Math.round(supportHoursTrendScore * 10) / 10,
    avgResolutionTimeScore: Math.round(avgResolutionTimeScore * 10) / 10,
    agingTicketsScore: Math.round(agingTicketsScore * 10) / 10,
    slaComplianceScore: Math.round(slaComplianceScore * 10) / 10,
    ticketCountCurrent,
    ticketCountPrevious,
    reopenRateValue: Math.round(reopenRateValue * 10) / 10,
    urgentHighPercent: Math.round(urgentHighPercent * 10) / 10,
    supportHoursCurrent: Math.round(currentHours * 10) / 10,
    supportHoursPrevious: Math.round(prevHours * 10) / 10,
    avgResolutionMinutes: resolutionMinutes !== null ? Math.round(resolutionMinutes) : null,
    agingTicketCount,
    slaCompliancePercent: slaCompliancePercent !== null
      ? Math.round(slaCompliancePercent * 10) / 10
      : null,
  };
}

// ============================================
// SCORING FUNCTIONS
// ============================================

/**
 * Score a trend (lower current value = healthier).
 * 100 if decreased >20%, 50 if stable (±10%), 0 if increased >50%.
 */
function computeTrendScore(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 100 : 50;

  const changePercent = ((current - previous) / previous) * 100;

  if (changePercent <= -20) return 100;
  if (changePercent >= 50) return 0;

  // Linear interpolation between -20% (100) and +50% (0)
  return Math.max(0, Math.min(100, 100 - ((changePercent + 20) / 70) * 100));
}

/**
 * Score reopen rate: 0% = 100, 5% = 70, >20% = 0.
 */
function scoreReopenRate(rate: number): number {
  if (rate <= 0) return 100;
  if (rate >= 20) return 0;
  if (rate <= 5) return 100 - (rate / 5) * 30;
  return 70 - ((rate - 5) / 15) * 70;
}

/**
 * Score priority mix: <10% urgent/high = 100, >60% = 0.
 */
function scorePriorityMix(urgentHighPercent: number): number {
  if (urgentHighPercent <= 10) return 100;
  if (urgentHighPercent >= 60) return 0;
  return 100 - ((urgentHighPercent - 10) / 50) * 100;
}

/**
 * Score resolution time vs. target.
 */
async function scoreResolutionTime(avgMinutes: number | null): Promise<number> {
  if (avgMinutes === null) return 50; // Neutral if no data

  // Use medium priority target as baseline
  const target = await resolveTarget('resolution_time', 3);
  if (target === null) return 50;

  if (avgMinutes <= target) return 100;
  if (avgMinutes >= target * 3) return 0;

  return 100 - ((avgMinutes - target) / (target * 2)) * 100;
}

/**
 * Score aging tickets: 0 aging = 100, decreases proportionally.
 */
function scoreAgingTickets(agingCount: number, totalTickets: number): number {
  if (agingCount === 0) return 100;
  if (totalTickets === 0) return 100;

  const ratio = agingCount / Math.max(totalTickets, 1);
  if (ratio >= 0.5) return 0;
  return Math.max(0, 100 - ratio * 200);
}

// ============================================
// HELPER QUERIES
// ============================================

async function sumSupportHours(companyId: string, start: Date, end: Date): Promise<number> {
  const ticketIds = (await prisma.ticket.findMany({
    where: { companyId },
    select: { autotaskTicketId: true },
  })).map(t => t.autotaskTicketId);

  if (ticketIds.length === 0) return 0;

  const entries = await prisma.ticketTimeEntry.findMany({
    where: {
      autotaskTicketId: { in: ticketIds },
      dateWorked: { gte: start, lte: end },
    },
    select: { hoursWorked: true },
  });

  return entries.reduce((sum, e) => sum + e.hoursWorked, 0);
}

async function getAvgResolution(companyId: string, start: Date, end: Date): Promise<number | null> {
  const lifecycles = await prisma.ticketLifecycle.findMany({
    where: {
      companyId,
      isResolved: true,
      completedDate: { gte: start, lte: end },
      fullResolutionMinutes: { not: null },
    },
    select: { fullResolutionMinutes: true },
  });

  if (lifecycles.length === 0) return null;
  const values = lifecycles.map(l => l.fullResolutionMinutes!);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function countAgingTickets(companyId: string): Promise<number> {
  // "Aging" = open ticket older than 2x the resolution target for its priority
  const openTickets = await prisma.ticket.findMany({
    where: {
      companyId,
      NOT: { status: { in: getResolvedStatuses() } },
      completedDate: null,
    },
    select: { createDate: true, priority: true },
  });

  let aging = 0;
  const now = Date.now();

  for (const ticket of openTickets) {
    const target = await resolveTarget('resolution_time', ticket.priority, companyId);
    const ageMinutes = (now - ticket.createDate.getTime()) / (1000 * 60);
    const threshold = target ? target * 2 : 14400; // Default: 10 days if no target

    if (ageMinutes > threshold) aging++;
  }

  return aging;
}

async function getSlaCompliance(companyId: string, start: Date, end: Date): Promise<number | null> {
  let lifecycles: { slaResponseMet: boolean | null; slaResolutionPlanMet?: boolean | null; slaResolutionMet: boolean | null }[];
  try {
    lifecycles = await prisma.ticketLifecycle.findMany({
      where: {
        companyId,
        isResolved: true,
        completedDate: { gte: start, lte: end },
      },
      select: {
        slaResponseMet: true,
        slaResolutionPlanMet: true,
        slaResolutionMet: true,
      },
    });
  } catch {
    // slaResolutionPlanMet column may not exist yet — fallback without it
    lifecycles = (await prisma.ticketLifecycle.findMany({
      where: {
        companyId,
        isResolved: true,
        completedDate: { gte: start, lte: end },
      },
      select: {
        slaResponseMet: true,
        slaResolutionMet: true,
      },
    })).map(r => ({ ...r, slaResolutionPlanMet: null }));
  }

  const responseResults = lifecycles
    .map(l => l.slaResponseMet)
    .filter((v): v is boolean => v !== null);
  const planResults = lifecycles
    .map(l => l.slaResolutionPlanMet ?? null)
    .filter((v): v is boolean => v !== null);
  const resolutionResults = lifecycles
    .map(l => l.slaResolutionMet)
    .filter((v): v is boolean => v !== null);

  // Include all three Autotask SLA metrics in compliance calculation
  const allResults = [...responseResults, ...planResults, ...resolutionResults];
  if (allResults.length === 0) return null;

  return (allResults.filter(v => v).length / allResults.length) * 100;
}
