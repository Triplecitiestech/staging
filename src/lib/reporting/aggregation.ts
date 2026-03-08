/**
 * Daily aggregation jobs — roll up ticket lifecycle data into
 * per-technician and per-company daily metric tables.
 */

import { prisma } from '@/lib/prisma';
import { createJobTracker } from './job-status';
import { JOB_NAMES } from './types';
import { assertTableExists } from './sync';

// ============================================
// TECHNICIAN DAILY AGGREGATION
// ============================================

interface AggregationResult {
  rowsComputed: number;
  errors: string[];
}

/**
 * Compute daily technician metrics for a given date.
 * When no date is provided, backfills all days from the earliest ticket
 * to yesterday that are missing from the aggregation table.
 */
export async function aggregateTechnicianDaily(targetDate?: Date): Promise<AggregationResult> {
  const finish = createJobTracker(JOB_NAMES.AGGREGATE_TECHNICIAN);
  const result: AggregationResult = { rowsComputed: 0, errors: [] };

  try {
    await assertTableExists('resources');
    await assertTableExists('ticket_lifecycle');
    await assertTableExists('technician_metrics_daily');

    // If no target date, backfill missing days
    if (!targetDate) {
      const dates = await getMissingAggregationDates('technician_metrics_daily');
      for (const d of dates) {
        const sub = await aggregateTechnicianForDay(d);
        result.rowsComputed += sub.rowsComputed;
        result.errors.push(...sub.errors);
      }
      await finish({
        status: result.errors.length > 0 ? 'failed' : 'success',
        meta: { rowsComputed: result.rowsComputed, daysProcessed: dates.length, errorCount: result.errors.length },
        error: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
      });
      return result;
    }

    // Specific date provided — compute just that day
    const sub = await aggregateTechnicianForDay(targetDate);
    result.rowsComputed = sub.rowsComputed;
    result.errors = sub.errors;

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { rowsComputed: result.rowsComputed, date: startOfDay(targetDate).toISOString(), errorCount: result.errors.length },
      error: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await finish({ status: 'failed', error });
    throw err;
  }
}

// ============================================
// COMPANY DAILY AGGREGATION
// ============================================

/**
 * Compute daily company metrics for a given date.
 * When no date is provided, backfills all missing days.
 */
export async function aggregateCompanyDaily(targetDate?: Date): Promise<AggregationResult> {
  const finish = createJobTracker(JOB_NAMES.AGGREGATE_COMPANY);
  const result: AggregationResult = { rowsComputed: 0, errors: [] };

  try {
    await assertTableExists('ticket_lifecycle');
    await assertTableExists('company_metrics_daily');

    if (!targetDate) {
      const dates = await getMissingAggregationDates('company_metrics_daily');
      for (const d of dates) {
        const sub = await aggregateCompanyForDay(d);
        result.rowsComputed += sub.rowsComputed;
        result.errors.push(...sub.errors);
      }
      await finish({
        status: result.errors.length > 0 ? 'failed' : 'success',
        meta: { rowsComputed: result.rowsComputed, daysProcessed: dates.length, errorCount: result.errors.length },
        error: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
      });
      return result;
    }

    // Specific date provided — compute just that day
    const sub = await aggregateCompanyForDay(targetDate);
    result.rowsComputed = sub.rowsComputed;
    result.errors = sub.errors;

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { rowsComputed: result.rowsComputed, date: startOfDay(targetDate).toISOString(), errorCount: result.errors.length },
      error: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await finish({ status: 'failed', error });
    throw err;
  }
}

// ============================================
// PER-DAY HELPERS (extracted for backfill)
// ============================================

async function aggregateCompanyForDay(date: Date): Promise<AggregationResult> {
  const result: AggregationResult = { rowsComputed: 0, errors: [] };
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const companies = await prisma.company.findMany({
    where: { autotaskCompanyId: { not: null } },
    select: { id: true },
  });

  for (const company of companies) {
    try {
      const ticketsCreatedList = await prisma.ticket.findMany({
        where: { companyId: company.id, createDate: { gte: dayStart, lte: dayEnd } },
        select: { priority: true },
      });

      const ticketsCreated = ticketsCreatedList.length;
      const ticketsCreatedUrgent = ticketsCreatedList.filter(t => t.priority === 1).length;
      const ticketsCreatedHigh = ticketsCreatedList.filter(t => t.priority === 2).length;
      const ticketsCreatedMedium = ticketsCreatedList.filter(t => t.priority === 3).length;
      const ticketsCreatedLow = ticketsCreatedList.filter(t => t.priority === 4).length;

      const ticketsClosed = await prisma.ticketLifecycle.count({
        where: { companyId: company.id, isResolved: true, completedDate: { gte: dayStart, lte: dayEnd } },
      });

      const companyTicketIds = (await prisma.ticket.findMany({
        where: { companyId: company.id },
        select: { autotaskTicketId: true },
      })).map(t => t.autotaskTicketId);

      const ticketsReopened = companyTicketIds.length > 0
        ? await prisma.ticketStatusHistory.count({
            where: {
              changedAt: { gte: dayStart, lte: dayEnd },
              autotaskTicketId: { in: companyTicketIds },
              previousStatus: { in: [5, 13, 29] },
              NOT: { newStatus: { in: [5, 13, 29] } },
            },
          })
        : 0;

      const companyTimeEntries = await prisma.ticketTimeEntry.findMany({
        where: { autotaskTicketId: { in: companyTicketIds }, dateWorked: { gte: dayStart, lte: dayEnd } },
        select: { hoursWorked: true, isNonBillable: true },
      });

      const supportHoursConsumed = companyTimeEntries.reduce((sum, e) => sum + e.hoursWorked, 0);
      const billableHoursConsumed = companyTimeEntries.filter(e => !e.isNonBillable).reduce((sum, e) => sum + e.hoursWorked, 0);

      const closedLifecycles = await prisma.ticketLifecycle.findMany({
        where: { companyId: company.id, isResolved: true, completedDate: { gte: dayStart, lte: dayEnd } },
        select: { firstResponseMinutes: true, fullResolutionMinutes: true, isFirstTouchResolution: true, reopenCount: true, slaResponseMet: true, slaResolutionMet: true },
      });

      const frtValues = closedLifecycles.map(l => l.firstResponseMinutes).filter((v): v is number => v !== null);
      const resolutionValues = closedLifecycles.map(l => l.fullResolutionMinutes).filter((v): v is number => v !== null);
      const avgFirstResponseMinutes = frtValues.length > 0 ? frtValues.reduce((a, b) => a + b, 0) / frtValues.length : null;
      const avgResolutionMinutes = resolutionValues.length > 0 ? resolutionValues.reduce((a, b) => a + b, 0) / resolutionValues.length : null;

      const totalResolved = closedLifecycles.length;
      const firstTouchCount = closedLifecycles.filter(l => l.isFirstTouchResolution).length;
      const reopenedTickets = closedLifecycles.filter(l => l.reopenCount > 0).length;
      const firstTouchResolutionRate = totalResolved > 0 ? (firstTouchCount / totalResolved) * 100 : null;
      const reopenRate = totalResolved > 0 ? (reopenedTickets / totalResolved) * 100 : null;

      const slaResponseResults = closedLifecycles.map(l => l.slaResponseMet).filter((v): v is boolean => v !== null);
      const slaResolutionResults = closedLifecycles.map(l => l.slaResolutionMet).filter((v): v is boolean => v !== null);
      const slaResponseCompliance = slaResponseResults.length > 0 ? (slaResponseResults.filter(v => v).length / slaResponseResults.length) * 100 : null;
      const slaResolutionCompliance = slaResolutionResults.length > 0 ? (slaResolutionResults.filter(v => v).length / slaResolutionResults.length) * 100 : null;

      const openTickets = await prisma.ticket.findMany({
        where: {
          companyId: company.id, createDate: { lte: dayEnd },
          OR: [{ completedDate: null }, { completedDate: { gt: dayEnd } }],
          NOT: { status: { in: [5, 13, 29] } },
        },
        select: { priority: true },
      });

      const backlogCount = openTickets.length;
      const backlogUrgent = openTickets.filter(t => t.priority === 1).length;
      const backlogHigh = openTickets.filter(t => t.priority === 2).length;

      const metricsData = {
        ticketsCreated, ticketsClosed, ticketsReopened,
        ticketsCreatedUrgent, ticketsCreatedHigh, ticketsCreatedMedium, ticketsCreatedLow,
        supportHoursConsumed, billableHoursConsumed,
        avgFirstResponseMinutes, avgResolutionMinutes,
        firstTouchResolutionRate, reopenRate,
        slaResponseCompliance, slaResolutionCompliance,
        backlogCount, backlogUrgent, backlogHigh,
        computedAt: new Date(),
      };

      await prisma.companyMetricsDaily.upsert({
        where: { companyId_date: { companyId: company.id, date: dayStart } },
        create: { companyId: company.id, date: dayStart, ...metricsData },
        update: metricsData,
      });

      result.rowsComputed++;
    } catch (err) {
      result.errors.push(`Company ${company.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

async function aggregateTechnicianForDay(date: Date): Promise<AggregationResult> {
  const result: AggregationResult = { rowsComputed: 0, errors: [] };
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const resources = await prisma.resource.findMany({
    where: { isActive: true },
    select: { autotaskResourceId: true },
  });

  for (const resource of resources) {
    try {
      const resourceId = resource.autotaskResourceId;

      const ticketsAssigned = await prisma.ticket.count({
        where: {
          assignedResourceId: resourceId,
          createDate: { lte: dayEnd },
          OR: [{ completedDate: null }, { completedDate: { gt: dayEnd } }],
        },
      });

      const ticketsCreated = await prisma.ticket.count({
        where: {
          creatorResourceId: resourceId,
          createDate: { gte: dayStart, lte: dayEnd },
        },
      });

      const ticketsClosed = await prisma.ticketLifecycle.count({
        where: {
          assignedResourceId: resourceId,
          isResolved: true,
          completedDate: { gte: dayStart, lte: dayEnd },
        },
      });

      const ticketsReopened = await prisma.ticketStatusHistory.count({
        where: {
          changedAt: { gte: dayStart, lte: dayEnd },
          autotaskTicketId: {
            in: (await prisma.ticket.findMany({
              where: { assignedResourceId: resourceId },
              select: { autotaskTicketId: true },
            })).map(t => t.autotaskTicketId),
          },
          previousStatus: { in: [5, 13, 29] },
          NOT: { newStatus: { in: [5, 13, 29] } },
        },
      });

      const timeEntries = await prisma.ticketTimeEntry.findMany({
        where: { resourceId, dateWorked: { gte: dayStart, lte: dayEnd } },
        select: { hoursWorked: true, isNonBillable: true },
      });

      const hoursLogged = timeEntries.reduce((sum, e) => sum + e.hoursWorked, 0);
      const billableHoursLogged = timeEntries.filter(e => !e.isNonBillable).reduce((sum, e) => sum + e.hoursWorked, 0);
      const nonBillableHoursLogged = timeEntries.filter(e => e.isNonBillable).reduce((sum, e) => sum + e.hoursWorked, 0);

      const closedLifecycles = await prisma.ticketLifecycle.findMany({
        where: {
          assignedResourceId: resourceId,
          isResolved: true,
          completedDate: { gte: dayStart, lte: dayEnd },
        },
        select: { firstResponseMinutes: true, fullResolutionMinutes: true, isFirstTouchResolution: true },
      });

      const frtValues = closedLifecycles.map(l => l.firstResponseMinutes).filter((v): v is number => v !== null);
      const resolutionValues = closedLifecycles.map(l => l.fullResolutionMinutes).filter((v): v is number => v !== null);
      const avgFirstResponseMinutes = frtValues.length > 0 ? frtValues.reduce((a, b) => a + b, 0) / frtValues.length : null;
      const avgResolutionMinutes = resolutionValues.length > 0 ? resolutionValues.reduce((a, b) => a + b, 0) / resolutionValues.length : null;
      const firstTouchResolutions = closedLifecycles.filter(l => l.isFirstTouchResolution).length;

      const openTicketCount = await prisma.ticket.count({
        where: {
          assignedResourceId: resourceId,
          createDate: { lte: dayEnd },
          OR: [{ completedDate: null }, { completedDate: { gt: dayEnd } }],
          NOT: { status: { in: [5, 13, 29] } },
        },
      });

      await prisma.technicianMetricsDaily.upsert({
        where: { resourceId_date: { resourceId, date: dayStart } },
        create: {
          resourceId, date: dayStart, ticketsAssigned, ticketsCreated, ticketsClosed, ticketsReopened,
          hoursLogged, billableHoursLogged, nonBillableHoursLogged,
          avgFirstResponseMinutes, avgResolutionMinutes, firstTouchResolutions,
          totalResolutions: ticketsClosed, openTicketCount, computedAt: new Date(),
        },
        update: {
          ticketsAssigned, ticketsCreated, ticketsClosed, ticketsReopened,
          hoursLogged, billableHoursLogged, nonBillableHoursLogged,
          avgFirstResponseMinutes, avgResolutionMinutes, firstTouchResolutions,
          totalResolutions: ticketsClosed, openTicketCount, computedAt: new Date(),
        },
      });

      result.rowsComputed++;
    } catch (err) {
      result.errors.push(`Resource ${resource.autotaskResourceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

// ============================================
// DATE UTILITIES
// ============================================

/**
 * Find dates that have tickets but no aggregation rows yet.
 * Returns up to 90 days of missing dates, most recent first.
 */
async function getMissingAggregationDates(table: 'technician_metrics_daily' | 'company_metrics_daily'): Promise<Date[]> {
  // Find earliest ticket
  const earliest = await prisma.ticket.findFirst({
    orderBy: { createDate: 'asc' },
    select: { createDate: true },
  });

  if (!earliest) return [yesterday()];

  const yest = yesterday();
  const start = startOfDay(earliest.createDate);
  const end = startOfDay(yest);

  // Get existing aggregation dates
  let existingDates: Set<string>;
  if (table === 'technician_metrics_daily') {
    const rows = await prisma.technicianMetricsDaily.findMany({
      distinct: ['date'],
      select: { date: true },
    });
    existingDates = new Set(rows.map(r => r.date.toISOString().split('T')[0]));
  } else {
    const rows = await prisma.companyMetricsDaily.findMany({
      distinct: ['date'],
      select: { date: true },
    });
    existingDates = new Set(rows.map(r => r.date.toISOString().split('T')[0]));
  }

  const missing: Date[] = [];
  const current = new Date(start);

  while (current <= end && missing.length < 90) {
    const key = current.toISOString().split('T')[0];
    if (!existingDates.has(key)) {
      missing.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return missing;
}

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}
