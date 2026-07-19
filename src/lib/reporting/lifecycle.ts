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

    // Load SLA targets once (small table)
    const allTargets = await prisma.reportingTarget.findMany({
      where: {
        isActive: true,
        metricKey: { in: ['first_response_time', 'resolution_plan_time', 'resolution_time'] },
      },
    });
    const targetCache: TargetCache = new Map();
    for (const t of allTargets) {
      targetCache.set(buildTargetCacheKey(t.metricKey, t.scope, t.scopeValue), t.targetValue);
    }

    // Process tickets in chunks — fetch related data per chunk to bound query size
    const CHUNK_SIZE = 100;
    const startTime = Date.now();
    const MAX_MS = 50000; // 50s safety budget

    for (let i = 0; i < tickets.length; i += CHUNK_SIZE) {
      // Time guard — stop before Vercel kills us
      if (Date.now() - startTime > MAX_MS) {
        result.errors.push(`Stopped at ticket ${i}/${tickets.length} — approaching timeout. Run again to continue.`);
        break;
      }

      const chunk = tickets.slice(i, i + CHUNK_SIZE);
      const chunkIds = chunk.map(t => t.autotaskTicketId);

      // Fetch related data for this chunk only (3 parallel queries)
      const [chunkNotes, chunkTimeEntries, chunkStatusHistory] = await Promise.all([
        prisma.ticketNote.findMany({
          where: { autotaskTicketId: { in: chunkIds } },
          select: { autotaskTicketId: true, createDateTime: true, creatorResourceId: true, creatorContactId: true },
          orderBy: { createDateTime: 'asc' },
        }),
        prisma.ticketTimeEntry.findMany({
          where: { autotaskTicketId: { in: chunkIds } },
          select: { autotaskTicketId: true, createDateTime: true, hoursWorked: true, isNonBillable: true },
        }),
        prisma.ticketStatusHistory.findMany({
          where: { autotaskTicketId: { in: chunkIds } },
          select: { autotaskTicketId: true, previousStatus: true, newStatus: true, changedAt: true },
          orderBy: { changedAt: 'asc' },
        }),
      ]);

      // Index by ticket ID
      const notesByTicket = new Map<string, typeof chunkNotes>();
      for (const note of chunkNotes) {
        const arr = notesByTicket.get(note.autotaskTicketId);
        if (arr) arr.push(note);
        else notesByTicket.set(note.autotaskTicketId, [note]);
      }
      const timeEntriesByTicket = new Map<string, typeof chunkTimeEntries>();
      for (const entry of chunkTimeEntries) {
        const arr = timeEntriesByTicket.get(entry.autotaskTicketId);
        if (arr) arr.push(entry);
        else timeEntriesByTicket.set(entry.autotaskTicketId, [entry]);
      }
      const statusHistoryByTicket = new Map<string, typeof chunkStatusHistory>();
      for (const sh of chunkStatusHistory) {
        const arr = statusHistoryByTicket.get(sh.autotaskTicketId);
        if (arr) arr.push(sh);
        else statusHistoryByTicket.set(sh.autotaskTicketId, [sh]);
      }

      // Compute lifecycle for each ticket in memory
      const upserts: Array<{ ticketId: string; lifecycle: LifecycleData }> = [];
      for (const ticket of chunk) {
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

      // Batch upsert within a transaction (sub-batches of 25 to avoid transaction size limits)
      const TX_BATCH = 25;
      for (let j = 0; j < upserts.length; j += TX_BATCH) {
        const txBatch = upserts.slice(j, j + TX_BATCH);
        try {
          await prisma.$transaction(
            txBatch.map(({ ticketId, lifecycle }) =>
              prisma.ticketLifecycle.upsert({
                where: { autotaskTicketId: ticketId },
                create: { autotaskTicketId: ticketId, ...lifecycle, computedAt: new Date() },
                update: { ...lifecycle, computedAt: new Date() },
              })
            ),
          );
          result.computed += txBatch.length;
        } catch {
          // Retry without slaResolutionPlanMet in case column doesn't exist
          for (const { ticketId, lifecycle } of txBatch) {
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

// ============================================
// LIFECYCLE QUALITY READS (SLA + reopens)
// ============================================
// The single source of SLA truth for customer-facing reports: percentages are
// derived from the per-ticket business-hours-vs-targets verdicts this engine
// computes (slaResponseMet / slaResolutionPlanMet / slaResolutionMet), never
// from the old `completedDate <= dueDateTime` proxy. Reopens come from the
// engine's reopenCount, honestly gated on status-history coverage (history is
// forward-only from the first sync — where there is no coverage the answer is
// "not measured" (null), never a fabricated 0 or 100%.

/** SLA compliance percentages derived from per-ticket lifecycle verdicts. */
export interface LifecycleSlaSummary {
  /** % of measured tickets whose first response met target (null = none measured) */
  responseCompliance: number | null;
  /** % of measured tickets whose resolution plan met target (null = none measured) */
  resolutionPlanCompliance: number | null;
  /** % of measured tickets whose full resolution met target (null = none measured) */
  resolutionCompliance: number | null;
  /**
   * Pooled across all three metrics — the platform's single-number SLA figure
   * (same formula the customer health scores use).
   */
  combinedCompliance: number | null;
  /** Tickets with at least one non-null SLA verdict */
  measuredTickets: number;
}

/** Reopen figures derived from lifecycle reopenCount + status-history coverage. */
export interface LifecycleReopenSummary {
  /** Resolved tickets with status-history coverage (reopens are only detectable there) */
  measuredTickets: number;
  /** Measured tickets that were reopened at least once */
  reopenedTickets: number;
  /** reopenedTickets / measuredTickets as a %; null when nothing is measurable */
  reopenRate: number | null;
}

export interface LifecycleQualitySummary {
  /** Lifecycle rows resolved + completed inside the window */
  resolvedTickets: number;
  sla: LifecycleSlaSummary;
  reopen: LifecycleReopenSummary;
}

interface QualityRow {
  companyId: string;
  autotaskTicketId: string;
  reopenCount: number;
  slaResponseMet: boolean | null;
  slaResolutionPlanMet: boolean | null;
  slaResolutionMet: boolean | null;
}

async function fetchQualityRows(from: Date, to: Date, companyId?: string): Promise<QualityRow[]> {
  const where = {
    isResolved: true,
    completedDate: { gte: from, lte: to },
    ...(companyId ? { companyId } : {}),
  };
  try {
    return await prisma.ticketLifecycle.findMany({
      where,
      select: {
        companyId: true,
        autotaskTicketId: true,
        reopenCount: true,
        slaResponseMet: true,
        slaResolutionPlanMet: true,
        slaResolutionMet: true,
      },
    });
  } catch {
    try {
      // slaResolutionPlanMet column may not exist yet — fall back without it
      const rows = await prisma.ticketLifecycle.findMany({
        where,
        select: {
          companyId: true,
          autotaskTicketId: true,
          reopenCount: true,
          slaResponseMet: true,
          slaResolutionMet: true,
        },
      });
      return rows.map(r => ({ ...r, slaResolutionPlanMet: null }));
    } catch (err) {
      // Lifecycle data unreachable — reports degrade to "not measured" (null),
      // never to a fabricated number.
      console.error('[lifecycle] quality read failed:', err instanceof Error ? err.message : String(err));
      return [];
    }
  }
}

/** Which of the given tickets have ≥1 status-history row (reopen measurability). */
async function fetchHistoryCoverage(ticketIds: string[]): Promise<Set<string>> {
  const covered = new Set<string>();
  const CHUNK = 1000;
  try {
    for (let i = 0; i < ticketIds.length; i += CHUNK) {
      const chunk = ticketIds.slice(i, i + CHUNK);
      const rows = await prisma.ticketStatusHistory.groupBy({
        by: ['autotaskTicketId'],
        where: { autotaskTicketId: { in: chunk } },
      });
      for (const r of rows) covered.add(r.autotaskTicketId);
    }
  } catch (err) {
    console.error('[lifecycle] history coverage read failed:', err instanceof Error ? err.message : String(err));
  }
  return covered;
}

function pct1(met: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((met / total) * 1000) / 10;
}

function summarizeQuality(rows: QualityRow[], covered: Set<string>): LifecycleQualitySummary {
  let respMet = 0, respTotal = 0;
  let planMet = 0, planTotal = 0;
  let resMet = 0, resTotal = 0;
  let measuredSla = 0;
  let historyTickets = 0;
  let reopenedTickets = 0;

  for (const r of rows) {
    let measured = false;
    if (r.slaResponseMet !== null) {
      respTotal++;
      if (r.slaResponseMet) respMet++;
      measured = true;
    }
    if (r.slaResolutionPlanMet !== null) {
      planTotal++;
      if (r.slaResolutionPlanMet) planMet++;
      measured = true;
    }
    if (r.slaResolutionMet !== null) {
      resTotal++;
      if (r.slaResolutionMet) resMet++;
      measured = true;
    }
    if (measured) measuredSla++;

    if (covered.has(r.autotaskTicketId)) {
      historyTickets++;
      if (r.reopenCount > 0) reopenedTickets++;
    }
  }

  return {
    resolvedTickets: rows.length,
    sla: {
      responseCompliance: pct1(respMet, respTotal),
      resolutionPlanCompliance: pct1(planMet, planTotal),
      resolutionCompliance: pct1(resMet, resTotal),
      combinedCompliance: pct1(respMet + planMet + resMet, respTotal + planTotal + resTotal),
      measuredTickets: measuredSla,
    },
    reopen: {
      measuredTickets: historyTickets,
      reopenedTickets,
      reopenRate: pct1(reopenedTickets, historyTickets),
    },
  };
}

/**
 * SLA + reopen summary for tickets resolved in the window — optionally scoped
 * to one company. This is what dashboards and customer reports must consume.
 */
export async function getLifecycleQualitySummary(
  from: Date,
  to: Date,
  companyId?: string,
): Promise<LifecycleQualitySummary> {
  const rows = await fetchQualityRows(from, to, companyId);
  const covered = await fetchHistoryCoverage(rows.map(r => r.autotaskTicketId));
  return summarizeQuality(rows, covered);
}

/**
 * Per-company SLA + reopen summaries for tickets resolved in the window — one
 * lifecycle pull for multi-company views (e.g. the company report table).
 */
export async function getLifecycleQualityByCompany(
  from: Date,
  to: Date,
): Promise<Map<string, LifecycleQualitySummary>> {
  const rows = await fetchQualityRows(from, to);
  const covered = await fetchHistoryCoverage(rows.map(r => r.autotaskTicketId));

  const byCompany = new Map<string, QualityRow[]>();
  for (const r of rows) {
    const arr = byCompany.get(r.companyId);
    if (arr) arr.push(r);
    else byCompany.set(r.companyId, [r]);
  }

  const result = new Map<string, LifecycleQualitySummary>();
  for (const [companyId, companyRows] of Array.from(byCompany.entries())) {
    result.set(companyId, summarizeQuality(companyRows, covered));
  }
  return result;
}
