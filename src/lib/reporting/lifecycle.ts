/**
 * Ticket lifecycle computation — derives per-ticket reporting metrics
 * from raw synced data (tickets, notes, time entries, status history).
 *
 * Metrics computed per ticket:
 *   M1: First Response Time (FRT)
 *   M2: First Resolution Time
 *   M3: Full Resolution Time
 *   M3a: Active Resolution Time (excluding waiting-on-customer)
 *   M5: First Touch Resolution indicator
 *   M6: Reopen count
 *   M12: SLA compliance (response + resolution)
 */

import { prisma } from '@/lib/prisma';
import { createJobTracker, getLastSuccessfulRun } from './job-status';
import { JOB_NAMES, isResolvedStatus, isWaitingCustomerStatus } from './types';
import { resolveTarget } from './targets';
import { assertTableExists } from './sync';

interface LifecycleResult {
  computed: number;
  errors: string[];
}

/**
 * Compute lifecycle metrics for tickets that have been synced since the last lifecycle run.
 * Idempotent — upserts on autotaskTicketId.
 */
export async function computeLifecycle(): Promise<LifecycleResult> {
  const finish = createJobTracker(JOB_NAMES.COMPUTE_LIFECYCLE);
  const result: LifecycleResult = { computed: 0, errors: [] };

  try {
    await assertTableExists('tickets');
    await assertTableExists('ticket_lifecycle');

    const lastRun = await getLastSuccessfulRun(JOB_NAMES.COMPUTE_LIFECYCLE);

    // Find tickets needing lifecycle computation
    const ticketFilter = lastRun
      ? { autotaskLastSync: { gt: lastRun } }
      : {};

    const tickets = await prisma.ticket.findMany({
      where: ticketFilter,
      select: {
        autotaskTicketId: true,
        companyId: true,
        assignedResourceId: true,
        priority: true,
        queueId: true,
        createDate: true,
        completedDate: true,
        status: true,
      },
    });

    for (const ticket of tickets) {
      try {
        const lifecycle = await computeTicketLifecycle(ticket);

        await prisma.ticketLifecycle.upsert({
          where: { autotaskTicketId: ticket.autotaskTicketId },
          create: {
            autotaskTicketId: ticket.autotaskTicketId,
            ...lifecycle,
            computedAt: new Date(),
          },
          update: {
            ...lifecycle,
            computedAt: new Date(),
          },
        });

        result.computed++;
      } catch (err) {
        result.errors.push(`Ticket ${ticket.autotaskTicketId}: ${err instanceof Error ? err.message : String(err)}`);
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

interface TicketInput {
  autotaskTicketId: string;
  companyId: string;
  assignedResourceId: number | null;
  priority: number;
  queueId: number | null;
  createDate: Date;
  completedDate: Date | null;
  status: number;
}

interface LifecycleData {
  companyId: string;
  assignedResourceId: number | null;
  priority: number;
  queueId: number | null;
  createDate: Date;
  completedDate: Date | null;
  isResolved: boolean;
  firstResponseMinutes: number | null;
  firstResolutionMinutes: number | null;
  fullResolutionMinutes: number | null;
  activeResolutionMinutes: number | null;
  waitingCustomerMinutes: number | null;
  techNoteCount: number;
  customerNoteCount: number;
  reopenCount: number;
  totalHoursLogged: number;
  billableHoursLogged: number;
  isFirstTouchResolution: boolean;
  slaResponseMet: boolean | null;
  slaResolutionPlanMet: boolean | null;
  slaResolutionMet: boolean | null;
}

async function computeTicketLifecycle(ticket: TicketInput): Promise<LifecycleData> {
  // Fetch related data
  const [notes, timeEntries, statusHistory] = await Promise.all([
    prisma.ticketNote.findMany({
      where: { autotaskTicketId: ticket.autotaskTicketId },
      orderBy: { createDateTime: 'asc' },
    }),
    prisma.ticketTimeEntry.findMany({
      where: { autotaskTicketId: ticket.autotaskTicketId },
    }),
    prisma.ticketStatusHistory.findMany({
      where: { autotaskTicketId: ticket.autotaskTicketId },
      orderBy: { changedAt: 'asc' },
    }),
  ]);

  const isResolved = isResolvedStatus(ticket.status);

  // M1: First Response Time
  const firstResponseMinutes = computeFirstResponseTime(ticket, notes, timeEntries);

  // M2/M3: Resolution times
  const firstResolutionMinutes = computeFirstResolutionTime(ticket, statusHistory);
  const fullResolutionMinutes = computeFullResolutionTime(ticket);

  // M3a: Active resolution time (exclude waiting-on-customer periods)
  const waitingCustomerMinutes = computeWaitingCustomerTime(ticket, statusHistory);
  const activeResolutionMinutes = fullResolutionMinutes !== null && waitingCustomerMinutes !== null
    ? Math.max(0, fullResolutionMinutes - waitingCustomerMinutes)
    : fullResolutionMinutes;

  // Note counts
  const techNoteCount = notes.filter(n => n.creatorResourceId !== null).length;
  const customerNoteCount = notes.filter(n => n.creatorContactId !== null).length;

  // M6: Reopen count
  const reopenCount = computeReopenCount(statusHistory);

  // Time entries
  const totalHoursLogged = timeEntries.reduce((sum, e) => sum + e.hoursWorked, 0);
  const billableHoursLogged = timeEntries
    .filter(e => !e.isNonBillable)
    .reduce((sum, e) => sum + e.hoursWorked, 0);

  // M5: First Touch Resolution
  const isFirstTouchResolution = isResolved && techNoteCount <= 1 && reopenCount === 0;

  // M12: SLA compliance (3 metrics per Autotask SLA agreement)
  const slaResponseMet = await evaluateSlaResponse(ticket, firstResponseMinutes);
  const slaResolutionPlanMet = await evaluateSlaResolutionPlan(ticket, firstResolutionMinutes);
  const slaResolutionMet = await evaluateSlaResolution(ticket, fullResolutionMinutes);

  return {
    companyId: ticket.companyId,
    assignedResourceId: ticket.assignedResourceId,
    priority: ticket.priority,
    queueId: ticket.queueId,
    createDate: ticket.createDate,
    completedDate: ticket.completedDate,
    isResolved,
    firstResponseMinutes,
    firstResolutionMinutes,
    fullResolutionMinutes,
    activeResolutionMinutes,
    waitingCustomerMinutes,
    techNoteCount,
    customerNoteCount,
    reopenCount,
    totalHoursLogged,
    billableHoursLogged,
    isFirstTouchResolution,
    slaResponseMet,
    slaResolutionPlanMet,
    slaResolutionMet,
  };
}

/**
 * M1: First Response Time — minutes from ticket creation to first technician response.
 * A response is either a note created by a resource or a time entry.
 */
function computeFirstResponseTime(
  ticket: TicketInput,
  notes: Array<{ createDateTime: Date; creatorResourceId: number | null }>,
  timeEntries: Array<{ createDateTime: Date | null }>,
): number | null {
  const techNotes = notes.filter(n => n.creatorResourceId !== null);
  const firstTechNote = techNotes.length > 0 ? techNotes[0].createDateTime : null;

  const firstTimeEntry = timeEntries
    .filter(e => e.createDateTime !== null)
    .sort((a, b) => a.createDateTime!.getTime() - b.createDateTime!.getTime())[0]?.createDateTime ?? null;

  let firstResponse: Date | null = null;
  if (firstTechNote && firstTimeEntry) {
    firstResponse = firstTechNote < firstTimeEntry ? firstTechNote : firstTimeEntry;
  } else {
    firstResponse = firstTechNote || firstTimeEntry;
  }

  if (!firstResponse) return null;

  return (firstResponse.getTime() - ticket.createDate.getTime()) / (1000 * 60);
}

/**
 * M2: First Resolution Time — minutes from creation to first transition to resolved status.
 */
function computeFirstResolutionTime(
  ticket: TicketInput,
  statusHistory: Array<{ newStatus: number; changedAt: Date }>,
): number | null {
  const firstResolution = statusHistory.find(h => isResolvedStatus(h.newStatus));
  if (firstResolution) {
    return (firstResolution.changedAt.getTime() - ticket.createDate.getTime()) / (1000 * 60);
  }
  // If currently resolved but no history, use completedDate
  if (isResolvedStatus(ticket.status) && ticket.completedDate) {
    return (ticket.completedDate.getTime() - ticket.createDate.getTime()) / (1000 * 60);
  }
  return null;
}

/**
 * M3: Full Resolution Time — wall-clock minutes from creation to final close.
 */
function computeFullResolutionTime(ticket: TicketInput): number | null {
  if (!isResolvedStatus(ticket.status) || !ticket.completedDate) return null;
  return (ticket.completedDate.getTime() - ticket.createDate.getTime()) / (1000 * 60);
}

/**
 * Compute total minutes in waiting-on-customer status from status history.
 */
function computeWaitingCustomerTime(
  ticket: TicketInput,
  statusHistory: Array<{ newStatus: number; changedAt: Date }>,
): number | null {
  if (statusHistory.length === 0) return null;

  let totalWaitingMinutes = 0;
  let waitingStart: Date | null = null;

  for (const entry of statusHistory) {
    if (isWaitingCustomerStatus(entry.newStatus)) {
      waitingStart = entry.changedAt;
    } else if (waitingStart) {
      totalWaitingMinutes += (entry.changedAt.getTime() - waitingStart.getTime()) / (1000 * 60);
      waitingStart = null;
    }
  }

  // If still in waiting status, count up to now or completedDate
  if (waitingStart) {
    const endDate = ticket.completedDate || new Date();
    totalWaitingMinutes += (endDate.getTime() - waitingStart.getTime()) / (1000 * 60);
  }

  return totalWaitingMinutes;
}

/**
 * M6: Count how many times a ticket was reopened (resolved → non-resolved transition).
 */
function computeReopenCount(
  statusHistory: Array<{ previousStatus: number | null; newStatus: number }>,
): number {
  let count = 0;
  for (const entry of statusHistory) {
    if (entry.previousStatus !== null && isResolvedStatus(entry.previousStatus) && !isResolvedStatus(entry.newStatus)) {
      count++;
    }
  }
  return count;
}

/**
 * M12a: Evaluate response SLA — was FRT within target for this ticket's priority?
 */
async function evaluateSlaResponse(
  ticket: TicketInput,
  firstResponseMinutes: number | null,
): Promise<boolean | null> {
  if (firstResponseMinutes === null) return null;

  const target = await resolveTarget('first_response_time', ticket.priority, ticket.companyId);
  if (target === null) return null;

  return firstResponseMinutes <= target;
}

/**
 * M12b: Evaluate resolution plan SLA — was the first resolution attempt within the
 * resolution plan target? This measures time to have a documented path to resolution.
 * Uses `firstResolutionMinutes` (time to first status change to a resolved state).
 */
async function evaluateSlaResolutionPlan(
  ticket: TicketInput,
  firstResolutionMinutes: number | null,
): Promise<boolean | null> {
  if (firstResolutionMinutes === null) return null;

  const target = await resolveTarget('resolution_plan_time', ticket.priority, ticket.companyId);
  if (target === null) return null;

  return firstResolutionMinutes <= target;
}

/**
 * M12c: Evaluate resolution SLA — was resolution time within target?
 */
async function evaluateSlaResolution(
  ticket: TicketInput,
  fullResolutionMinutes: number | null,
): Promise<boolean | null> {
  if (fullResolutionMinutes === null) return null;

  const target = await resolveTarget('resolution_time', ticket.priority, ticket.companyId);
  if (target === null) return null;

  return fullResolutionMinutes <= target;
}
