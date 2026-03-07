/**
 * Daily aggregation jobs — roll up ticket lifecycle data into
 * per-technician and per-company daily metric tables.
 */

import { prisma } from '@/lib/prisma';
import { createJobTracker } from './job-status';
import { JOB_NAMES } from './types';

// ============================================
// TECHNICIAN DAILY AGGREGATION
// ============================================

interface AggregationResult {
  rowsComputed: number;
  errors: string[];
}

/**
 * Compute daily technician metrics for a given date.
 * Defaults to yesterday if no date provided.
 */
export async function aggregateTechnicianDaily(targetDate?: Date): Promise<AggregationResult> {
  const finish = createJobTracker(JOB_NAMES.AGGREGATE_TECHNICIAN);
  const result: AggregationResult = { rowsComputed: 0, errors: [] };

  try {
    const date = targetDate || yesterday();
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    // Get all active resources
    const resources = await prisma.resource.findMany({
      where: { isActive: true },
      select: { autotaskResourceId: true },
    });

    for (const resource of resources) {
      try {
        const resourceId = resource.autotaskResourceId;

        // Tickets assigned to this technician (currently open, assigned to them)
        const ticketsAssigned = await prisma.ticket.count({
          where: {
            assignedResourceId: resourceId,
            createDate: { lte: dayEnd },
            OR: [
              { completedDate: null },
              { completedDate: { gt: dayEnd } },
            ],
          },
        });

        // Tickets created during this day (created by this resource)
        const ticketsCreated = await prisma.ticket.count({
          where: {
            creatorResourceId: resourceId,
            createDate: { gte: dayStart, lte: dayEnd },
          },
        });

        // Tickets closed by this technician during this day
        const ticketsClosed = await prisma.ticketLifecycle.count({
          where: {
            assignedResourceId: resourceId,
            isResolved: true,
            completedDate: { gte: dayStart, lte: dayEnd },
          },
        });

        // Tickets reopened (from status history)
        const ticketsReopened = await prisma.ticketStatusHistory.count({
          where: {
            changedAt: { gte: dayStart, lte: dayEnd },
            autotaskTicketId: {
              in: (await prisma.ticket.findMany({
                where: { assignedResourceId: resourceId },
                select: { autotaskTicketId: true },
              })).map(t => t.autotaskTicketId),
            },
            // Reopened = transition from resolved to non-resolved
            previousStatus: { in: [5, 13, 29] },
            NOT: { newStatus: { in: [5, 13, 29] } },
          },
        });

        // Time entries for this day
        const timeEntries = await prisma.ticketTimeEntry.findMany({
          where: {
            resourceId,
            dateWorked: { gte: dayStart, lte: dayEnd },
          },
          select: { hoursWorked: true, isNonBillable: true },
        });

        const hoursLogged = timeEntries.reduce((sum, e) => sum + e.hoursWorked, 0);
        const billableHoursLogged = timeEntries.filter(e => !e.isNonBillable).reduce((sum, e) => sum + e.hoursWorked, 0);
        const nonBillableHoursLogged = timeEntries.filter(e => e.isNonBillable).reduce((sum, e) => sum + e.hoursWorked, 0);

        // FRT and resolution metrics for tickets closed on this day
        const closedLifecycles = await prisma.ticketLifecycle.findMany({
          where: {
            assignedResourceId: resourceId,
            isResolved: true,
            completedDate: { gte: dayStart, lte: dayEnd },
          },
          select: {
            firstResponseMinutes: true,
            fullResolutionMinutes: true,
            isFirstTouchResolution: true,
          },
        });

        const frtValues = closedLifecycles
          .map(l => l.firstResponseMinutes)
          .filter((v): v is number => v !== null);
        const resolutionValues = closedLifecycles
          .map(l => l.fullResolutionMinutes)
          .filter((v): v is number => v !== null);

        const avgFirstResponseMinutes = frtValues.length > 0
          ? frtValues.reduce((a, b) => a + b, 0) / frtValues.length
          : null;
        const avgResolutionMinutes = resolutionValues.length > 0
          ? resolutionValues.reduce((a, b) => a + b, 0) / resolutionValues.length
          : null;
        const firstTouchResolutions = closedLifecycles.filter(l => l.isFirstTouchResolution).length;

        // Open tickets at end of day
        const openTicketCount = await prisma.ticket.count({
          where: {
            assignedResourceId: resourceId,
            createDate: { lte: dayEnd },
            OR: [
              { completedDate: null },
              { completedDate: { gt: dayEnd } },
            ],
            NOT: { status: { in: [5, 13, 29] } },
          },
        });

        // Upsert the daily row
        await prisma.technicianMetricsDaily.upsert({
          where: {
            resourceId_date: { resourceId, date: dayStart },
          },
          create: {
            resourceId,
            date: dayStart,
            ticketsAssigned,
            ticketsCreated,
            ticketsClosed,
            ticketsReopened,
            hoursLogged,
            billableHoursLogged,
            nonBillableHoursLogged,
            avgFirstResponseMinutes,
            avgResolutionMinutes,
            firstTouchResolutions,
            totalResolutions: ticketsClosed,
            openTicketCount,
            computedAt: new Date(),
          },
          update: {
            ticketsAssigned,
            ticketsCreated,
            ticketsClosed,
            ticketsReopened,
            hoursLogged,
            billableHoursLogged,
            nonBillableHoursLogged,
            avgFirstResponseMinutes,
            avgResolutionMinutes,
            firstTouchResolutions,
            totalResolutions: ticketsClosed,
            openTicketCount,
            computedAt: new Date(),
          },
        });

        result.rowsComputed++;
      } catch (err) {
        result.errors.push(`Resource ${resource.autotaskResourceId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { rowsComputed: result.rowsComputed, date: dayStart.toISOString(), errorCount: result.errors.length },
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
 * Defaults to yesterday if no date provided.
 */
export async function aggregateCompanyDaily(targetDate?: Date): Promise<AggregationResult> {
  const finish = createJobTracker(JOB_NAMES.AGGREGATE_COMPANY);
  const result: AggregationResult = { rowsComputed: 0, errors: [] };

  try {
    const date = targetDate || yesterday();
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    // Get all companies with Autotask IDs (those that have tickets)
    const companies = await prisma.company.findMany({
      where: { autotaskCompanyId: { not: null } },
      select: { id: true },
    });

    for (const company of companies) {
      try {
        // Tickets created on this day
        const ticketsCreatedList = await prisma.ticket.findMany({
          where: {
            companyId: company.id,
            createDate: { gte: dayStart, lte: dayEnd },
          },
          select: { priority: true },
        });

        const ticketsCreated = ticketsCreatedList.length;
        const ticketsCreatedUrgent = ticketsCreatedList.filter(t => t.priority === 1).length;
        const ticketsCreatedHigh = ticketsCreatedList.filter(t => t.priority === 2).length;
        const ticketsCreatedMedium = ticketsCreatedList.filter(t => t.priority === 3).length;
        const ticketsCreatedLow = ticketsCreatedList.filter(t => t.priority === 4).length;

        // Tickets closed on this day
        const ticketsClosed = await prisma.ticketLifecycle.count({
          where: {
            companyId: company.id,
            isResolved: true,
            completedDate: { gte: dayStart, lte: dayEnd },
          },
        });

        // Tickets reopened
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

        // Support hours consumed (time entries on this company's tickets)
        const companyTimeEntries = await prisma.ticketTimeEntry.findMany({
          where: {
            autotaskTicketId: { in: companyTicketIds },
            dateWorked: { gte: dayStart, lte: dayEnd },
          },
          select: { hoursWorked: true, isNonBillable: true },
        });

        const supportHoursConsumed = companyTimeEntries.reduce((sum, e) => sum + e.hoursWorked, 0);
        const billableHoursConsumed = companyTimeEntries
          .filter(e => !e.isNonBillable)
          .reduce((sum, e) => sum + e.hoursWorked, 0);

        // Performance metrics from lifecycle table (for tickets closed on this day)
        const closedLifecycles = await prisma.ticketLifecycle.findMany({
          where: {
            companyId: company.id,
            isResolved: true,
            completedDate: { gte: dayStart, lte: dayEnd },
          },
          select: {
            firstResponseMinutes: true,
            fullResolutionMinutes: true,
            isFirstTouchResolution: true,
            reopenCount: true,
            slaResponseMet: true,
            slaResolutionMet: true,
          },
        });

        const frtValues = closedLifecycles
          .map(l => l.firstResponseMinutes)
          .filter((v): v is number => v !== null);
        const resolutionValues = closedLifecycles
          .map(l => l.fullResolutionMinutes)
          .filter((v): v is number => v !== null);

        const avgFirstResponseMinutes = frtValues.length > 0
          ? frtValues.reduce((a, b) => a + b, 0) / frtValues.length
          : null;
        const avgResolutionMinutes = resolutionValues.length > 0
          ? resolutionValues.reduce((a, b) => a + b, 0) / resolutionValues.length
          : null;

        const totalResolved = closedLifecycles.length;
        const firstTouchCount = closedLifecycles.filter(l => l.isFirstTouchResolution).length;
        const reopenedTickets = closedLifecycles.filter(l => l.reopenCount > 0).length;

        const firstTouchResolutionRate = totalResolved > 0
          ? (firstTouchCount / totalResolved) * 100
          : null;
        const reopenRate = totalResolved > 0
          ? (reopenedTickets / totalResolved) * 100
          : null;

        // SLA compliance
        const slaResponseResults = closedLifecycles
          .map(l => l.slaResponseMet)
          .filter((v): v is boolean => v !== null);
        const slaResolutionResults = closedLifecycles
          .map(l => l.slaResolutionMet)
          .filter((v): v is boolean => v !== null);

        const slaResponseCompliance = slaResponseResults.length > 0
          ? (slaResponseResults.filter(v => v).length / slaResponseResults.length) * 100
          : null;
        const slaResolutionCompliance = slaResolutionResults.length > 0
          ? (slaResolutionResults.filter(v => v).length / slaResolutionResults.length) * 100
          : null;

        // Backlog (open tickets at end of day)
        const openTickets = await prisma.ticket.findMany({
          where: {
            companyId: company.id,
            createDate: { lte: dayEnd },
            OR: [
              { completedDate: null },
              { completedDate: { gt: dayEnd } },
            ],
            NOT: { status: { in: [5, 13, 29] } },
          },
          select: { priority: true },
        });

        const backlogCount = openTickets.length;
        const backlogUrgent = openTickets.filter(t => t.priority === 1).length;
        const backlogHigh = openTickets.filter(t => t.priority === 2).length;

        await prisma.companyMetricsDaily.upsert({
          where: {
            companyId_date: { companyId: company.id, date: dayStart },
          },
          create: {
            companyId: company.id,
            date: dayStart,
            ticketsCreated,
            ticketsClosed,
            ticketsReopened,
            ticketsCreatedUrgent,
            ticketsCreatedHigh,
            ticketsCreatedMedium,
            ticketsCreatedLow,
            supportHoursConsumed,
            billableHoursConsumed,
            avgFirstResponseMinutes,
            avgResolutionMinutes,
            firstTouchResolutionRate,
            reopenRate,
            slaResponseCompliance,
            slaResolutionCompliance,
            backlogCount,
            backlogUrgent,
            backlogHigh,
            computedAt: new Date(),
          },
          update: {
            ticketsCreated,
            ticketsClosed,
            ticketsReopened,
            ticketsCreatedUrgent,
            ticketsCreatedHigh,
            ticketsCreatedMedium,
            ticketsCreatedLow,
            supportHoursConsumed,
            billableHoursConsumed,
            avgFirstResponseMinutes,
            avgResolutionMinutes,
            firstTouchResolutionRate,
            reopenRate,
            slaResponseCompliance,
            slaResolutionCompliance,
            backlogCount,
            backlogUrgent,
            backlogHigh,
            computedAt: new Date(),
          },
        });

        result.rowsComputed++;
      } catch (err) {
        result.errors.push(`Company ${company.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { rowsComputed: result.rowsComputed, date: dayStart.toISOString(), errorCount: result.errors.length },
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
// DATE UTILITIES
// ============================================

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
