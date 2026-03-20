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
import { JOB_NAMES, isResolvedStatus, isCompleteStatus, isReopenStatus, isWaitingCustomerStatus, priorityToTargetScope } from './types';
import { assertTableExists } from './sync';
import { computeBusinessMinutes } from './business-hours';

interface LifecycleResult {
  computed: number;
  errors: string[];
}

/** Pre-loaded SLA targets keyed by "metricKey:scope:scopeValue" */
type TargetCache = Map<string, number>;

function buildTargetCacheKey(metricKey: string, scope: string, scopeValue: string): string {
  return `${metricKey}:${scope}:${scopeValue}`;
}

/**
 * Resolve a target from the pre-loaded cache using the same resolution order as resolveTarget():
 *   1. Company + priority specific
 *   2. Priority specific
 *   3. Company specific (all priorities)
 *   4. Global default
 */
function resolveTargetFromCache(
  cache: TargetCache,
  metricKey: string,
  priority: number,
  companyId?: string,
): number | null {
  const priorityScope = priorityToTargetScope(priority);

  if (companyId) {
    const companyPriority = cache.get(buildTargetCacheKey(metricKey, 'company', `${companyId}:${priorityScope}`));
    if (companyPriority !== undefined) return companyPriority;
  }

  const priorityTarget = cache.get(buildTargetCacheKey(metricKey, 'priority', priorityScope));
  if (priorityTarget !== undefined) return priorityTarget;

  if (companyId) {
    const companyTarget = cache.get(buildTargetCacheKey(metricKey, 'company', companyId));
    if (companyTarget !== undefined) return companyTarget;
  }

  const globalTarget = cache.get(buildTargetCacheKey(metricKey, 'global', ''));
  if (globalTarget !== undefined) return globalTarget;

  return null;
}

/**
 * Compute lifecycle metrics for tickets that have been synced since the last lifecycle run.
 * Idempotent — upserts on autotaskTicketId.
 *
 * Optimized: batch-fetches all related data (notes, time entries, status history, SLA targets)
 * upfront to avoid N+1 query patterns.
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

    if (tickets.length === 0) {
      await finish({ status: 'success', meta: { computed: 0, errorCount: 0 } });
      return result;
    }

    const ticketIds = tickets.map(t => t.autotaskTicketId);

    // Batch-fetch all related data in 4 parallel queries (instead of 3N + 3N queries)
    const [allNotes, allTimeEntries, allStatusHistory, allTargets] = await Promise.all([
      prisma.ticketNote.findMany({
        where: { autotaskTicketId: { in: ticketIds } },
        select: {
          autotaskTicketId: true,
          createDateTime: true,
          creatorResourceId: true,
          creatorContactId: true,
        },
        orderBy: { createDateTime: 'asc' },
      }),
      prisma.ticketTimeEntry.findMany({
        where: { autotaskTicketId: { in: ticketIds } },
        select: {
          autotaskTicketId: true,
          createDateTime: true,
          hoursWorked: true,
          isNonBillable: true,
        },
      }),
      prisma.ticketStatusHistory.findMany({
        where: { autotaskTicketId: { in: ticketIds } },
        select: {
          autotaskTicketId: true,
          previousStatus: true,
          newStatus: true,
          changedAt: true,
        },
        orderBy: { changedAt: 'asc' },
      }),
      // Load ALL active SLA targets in one query
      prisma.reportingTarget.findMany({
        where: {
          isActive: true,
          metricKey: { in: ['first_response_time', 'resolution_plan_time', 'resolution_time'] },
        },
      }),
    ]);

    // Index related data by ticket ID for O(1) lookups
    const notesByTicket = new Map<string, typeof allNotes>();
    for (const note of allNotes) {
      const arr = notesByTicket.get(note.autotaskTicketId);
      if (arr) arr.push(note);
      else notesByTicket.set(note.autotaskTicketId, [note]);
    }

    const timeEntriesByTicket = new Map<string, typeof allTimeEntries>();
    for (const entry of allTimeEntries) {
      const arr = timeEntriesByTicket.get(entry.autotaskTicketId);
      if (arr) arr.push(entry);
      else timeEntriesByTicket.set(entry.autotaskTicketId, [entry]);
    }

    const statusHistoryByTicket = new Map<string, typeof allStatusHistory>();
    for (const sh of allStatusHistory) {
      const arr = statusHistoryByTicket.get(sh.autotaskTicketId);
      if (arr) arr.push(sh);
      else statusHistoryByTicket.set(sh.autotaskTicketId, [sh]);
    }

    // Build target cache
    const targetCache: TargetCache = new Map();
    for (const t of allTargets) {
      targetCache.set(buildTargetCacheKey(t.metricKey, t.scope, t.scopeValue), t.targetValue);
    }

    // Process all tickets in memory (no more per-ticket DB queries)
    const BATCH_SIZE = 50;
    for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
      const batch = tickets.slice(i, i + BATCH_SIZE);
      const upserts: Array<{ ticketId: string; lifecycle: LifecycleData }> = [];

      for (const ticket of batch) {
        try {
          const notes = notesByTicket.get(ticket.autotaskTicketId) || [];
          const timeEntries = timeEntriesByTicket.get(ticket.autotaskTicketId) || [];
          const statusHistory = statusHistoryByTicket.get(ticket.autotaskTicketId) || [];

          const lifecycle = computeTicketLifecycleInMemory(ticket, notes, timeEntries, statusHistory, targetCache);
          upserts.push({ ticketId: ticket.autotaskTicketId, lifecycle });
        } catch (err) {
          result.errors.push(`Ticket ${ticket.autotaskTicketId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Batch upsert within a transaction
      if (upserts.length > 0) {
        try {
          await prisma.$transaction(
            upserts.map(({ ticketId, lifecycle }) =>
              prisma.ticketLifecycle.upsert({
                where: { autotaskTicketId: ticketId },
                create: {
                  autotaskTicketId: ticketId,
                  ...lifecycle,
                  computedAt: new Date(),
                },
                update: {
                  ...lifecycle,
                  computedAt: new Date(),
                },
              })
            ),
          );
          result.computed += upserts.length;
        } catch {
          // Retry without slaResolutionPlanMet in case column doesn't exist
          try {
            await prisma.$transaction(
              upserts.map(({ ticketId, lifecycle }) => {
                const { slaResolutionPlanMet: _unused, ...lifecycleWithout } = lifecycle;
                void _unused;
                return prisma.ticketLifecycle.upsert({
                  where: { autotaskTicketId: ticketId },
                  create: {
                    autotaskTicketId: ticketId,
                    ...lifecycleWithout,
                    computedAt: new Date(),
                  },
                  update: {
                    ...lifecycleWithout,
                    computedAt: new Date(),
                  },
                });
              }),
            );
            result.computed += upserts.length;
          } catch (batchErr) {
            // Fall back to individual upserts if transaction fails
            for (const { ticketId, lifecycle } of upserts) {
              try {
                const { slaResolutionPlanMet: _unused, ...lifecycleWithout } = lifecycle;
                void _unused;
                await prisma.ticketLifecycle.upsert({
                  where: { autotaskTicketId: ticketId },
                  create: { autotaskTicketId: ticketId, ...lifecycleWithout, computedAt: new Date() },
                  update: { ...lifecycleWithout, computedAt: new Date() },
                });
                result.computed++;
              } catch (err) {
                result.errors.push(`Ticket ${ticketId}: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
            // Log batch error for diagnostics
            result.errors.push(`Batch upsert failed, fell back to individual: ${batchErr instanceof Error ? batchErr.message : String(batchErr)}`);
          }
        }
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

/**
 * Pure in-memory lifecycle computation — no DB queries.
 * All data is pre-fetched and passed in.
 */
function computeTicketLifecycleInMemory(
  ticket: TicketInput,
  notes: Array<{ createDateTime: Date; creatorResourceId: number | null; creatorContactId: number | null }>,
  timeEntries: Array<{ createDateTime: Date | null; hoursWorked: number; isNonBillable: boolean }>,
  statusHistory: Array<{ previousStatus: number | null; newStatus: number; changedAt: Date }>,
  targetCache: TargetCache,
): LifecycleData {
  const isResolved = isResolvedStatus(ticket.status);

  // M1: First Response Time (wall-clock minutes for general reporting)
  const firstResponseMinutes = computeFirstResponseTime(ticket, notes, timeEntries);

  // M1-biz: First Response Time in business hours (for SLA evaluation)
  const firstResponseBusinessMinutes = computeFirstResponseTime(ticket, notes, timeEntries, true);

  // M2/M3: Resolution times (wall-clock for general reporting)
  const firstResolutionMinutes = computeFirstResolutionTime(ticket, statusHistory);
  const fullResolutionMinutes = computeFullResolutionTime(ticket);

  // M2-biz/M3-biz: Resolution times in business hours (for SLA evaluation)
  const firstResolutionBusinessMinutes = computeFirstResolutionTime(ticket, statusHistory, true);
  const fullResolutionBusinessMinutes = computeFullResolutionTime(ticket, true);

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

  // M12: SLA compliance — resolved from cache, no DB queries
  const slaResponseMet = firstResponseBusinessMinutes !== null
    ? evaluateSlaFromCache(targetCache, 'first_response_time', ticket.priority, ticket.companyId, firstResponseBusinessMinutes)
    : null;
  const slaResolutionPlanMet = firstResolutionBusinessMinutes !== null
    ? evaluateSlaFromCache(targetCache, 'resolution_plan_time', ticket.priority, ticket.companyId, firstResolutionBusinessMinutes)
    : null;
  const slaResolutionMet = fullResolutionBusinessMinutes !== null
    ? evaluateSlaFromCache(targetCache, 'resolution_time', ticket.priority, ticket.companyId, fullResolutionBusinessMinutes)
    : null;

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

/** Evaluate SLA from pre-loaded cache */
function evaluateSlaFromCache(
  cache: TargetCache,
  metricKey: string,
  priority: number,
  companyId: string,
  elapsedMinutes: number,
): boolean | null {
  const target = resolveTargetFromCache(cache, metricKey, priority, companyId);
  if (target === null) return null;
  return elapsedMinutes <= target;
}

/**
 * M1: First Response Time — minutes from ticket creation to first technician response.
 * A response is either a note created by a resource or a time entry.
 * @param useBusinessHours If true, returns business-hour minutes (for SLA comparison)
 */
function computeFirstResponseTime(
  ticket: TicketInput,
  notes: Array<{ createDateTime: Date; creatorResourceId: number | null }>,
  timeEntries: Array<{ createDateTime: Date | null }>,
  useBusinessHours: boolean = false,
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

  if (useBusinessHours) {
    return computeBusinessMinutes(ticket.createDate, firstResponse);
  }
  return (firstResponse.getTime() - ticket.createDate.getTime()) / (1000 * 60);
}

/**
 * M2: First Resolution Time — minutes from creation to first transition to resolved status.
 * @param useBusinessHours If true, returns business-hour minutes (for SLA comparison)
 */
function computeFirstResolutionTime(
  ticket: TicketInput,
  statusHistory: Array<{ newStatus: number; changedAt: Date }>,
  useBusinessHours: boolean = false,
): number | null {
  const firstResolution = statusHistory.find(h => isResolvedStatus(h.newStatus));
  if (firstResolution) {
    if (useBusinessHours) {
      return computeBusinessMinutes(ticket.createDate, firstResolution.changedAt);
    }
    return (firstResolution.changedAt.getTime() - ticket.createDate.getTime()) / (1000 * 60);
  }
  // If currently resolved but no history, use completedDate
  if (isResolvedStatus(ticket.status) && ticket.completedDate) {
    if (useBusinessHours) {
      return computeBusinessMinutes(ticket.createDate, ticket.completedDate);
    }
    return (ticket.completedDate.getTime() - ticket.createDate.getTime()) / (1000 * 60);
  }
  return null;
}

/**
 * M3: Full Resolution Time — minutes from creation to final close.
 * @param useBusinessHours If true, returns business-hour minutes (for SLA comparison)
 */
function computeFullResolutionTime(ticket: TicketInput, useBusinessHours: boolean = false): number | null {
  if (!isResolvedStatus(ticket.status) || !ticket.completedDate) return null;
  if (useBusinessHours) {
    return computeBusinessMinutes(ticket.createDate, ticket.completedDate);
  }
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
 * M6: Count how many times a ticket was reopened. Two criteria:
 * 1. Transition from "Complete" status to a non-resolved status (Complete → anything else)
 * 2. Ticket ever had a "Reopen" status (if the Autotask instance has one)
 */
function computeReopenCount(
  statusHistory: Array<{ previousStatus: number | null; newStatus: number }>,
): number {
  let count = 0;
  for (const entry of statusHistory) {
    // Criterion 1: Complete → non-resolved transition
    if (entry.previousStatus !== null && isCompleteStatus(entry.previousStatus) && !isResolvedStatus(entry.newStatus)) {
      count++;
    }
    // Criterion 2: Ticket transitioned TO a "Reopen" status at any point
    if (isReopenStatus(entry.newStatus)) {
      count++;
    }
  }
  return count;
}
