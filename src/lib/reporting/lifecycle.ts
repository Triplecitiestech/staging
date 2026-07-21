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
import { JOB_NAMES, isResolvedStatus, isCompleteStatus, isReopenStatus, isWaitingCustomerStatus } from './types';
import { classifyTicket } from './ticket-classification';
import { isSlaReportableTicket } from './sla-config';
import { isApiOrSystemUser } from './api-user-filter';
import { assertTableExists } from './sync';

/**
 * SLA verdict from Autotask's own event datetimes: met = the actual event
 * happened at or before Autotask's due date. null when either side is missing
 * (event not reached / no due set) — "not measured", never a fabricated pass.
 */
function metByDue(actual: Date | null, due: Date | null): boolean | null {
  if (actual === null || due === null) return null;
  return actual.getTime() <= due.getTime();
}

// ============================================
// FIRST RESPONSE & FIRST TOUCH — shared definitions
// ============================================
// Every report surface must resolve "first response" and "first touch"
// through these helpers — never from raw first-note timestamps. Two field
// realities drive the rules (live-confirmed on Tri-Bros June 2026, where the
// old logic reported a fabricated 0-minute average response):
//   1. The first note on a ticket is usually the INTAKE record, not a
//      response: a tech logging the phone call they are already on, or an
//      integration (HR portal, Thread) posting the request summary at
//      creation under an API account. Autotask's own firstResponseDateTime
//      is stamped at createDate on such tickets.
//   2. Notes/time entries by API/system accounts are pipeline artifacts —
//      never human responses.

/**
 * Resource ids of real, active human staff (API/system/inactive accounts
 * excluded via the same isApiOrSystemUser filter the technician reports use).
 * Empty set on failure — metrics degrade to "not measured", never fabricate.
 */
export async function getHumanResourceIds(): Promise<Set<number>> {
  try {
    const resources = await prisma.resource.findMany({
      select: { autotaskResourceId: true, firstName: true, lastName: true, email: true, isActive: true },
    });
    return new Set(resources.filter(r => !isApiOrSystemUser(r)).map(r => r.autotaskResourceId));
  } catch (err) {
    console.error('[lifecycle] human-resource read failed:', err instanceof Error ? err.message : String(err));
    return new Set();
  }
}

export interface FirstResponseResult {
  /**
   * The ticket was opened by a human staff member (phone call / walk-up /
   * onsite): the customer was being helped at creation, so there is no queue
   * wait to measure. Counted separately — never as a 0-minute response.
   */
  answeredAtIntake: boolean;
  /** First genuine human response (note or time entry by human staff); null when answeredAtIntake or none yet. */
  firstResponseAt: Date | null;
}

/**
 * Resolve the first genuine response to a ticket. See the block comment
 * above for why intake records and API-authored notes never qualify.
 */
export function resolveFirstResponse(
  ticket: { createDate: Date; creatorResourceId: number | null },
  notes: Array<{ createDateTime: Date; creatorResourceId: number | null }>,
  timeEntries: Array<{ createDateTime: Date | null; resourceId: number | null }>,
  humanResourceIds: Set<number>,
): FirstResponseResult {
  if (ticket.creatorResourceId !== null && humanResourceIds.has(ticket.creatorResourceId)) {
    return { answeredAtIntake: true, firstResponseAt: null };
  }

  let first: Date | null = null;
  for (const n of notes) {
    if (n.creatorResourceId === null || !humanResourceIds.has(n.creatorResourceId)) continue;
    if (n.createDateTime < ticket.createDate) continue;
    if (first === null || n.createDateTime < first) first = n.createDateTime;
  }
  for (const e of timeEntries) {
    if (e.createDateTime === null || e.resourceId === null || !humanResourceIds.has(e.resourceId)) continue;
    if (e.createDateTime < ticket.createDate) continue;
    if (first === null || e.createDateTime < first) first = e.createDateTime;
  }
  return { answeredAtIntake: false, firstResponseAt: first };
}

/**
 * How many distinct human staff touched the ticket (notes + time entries).
 * First-touch resolution = resolved by a single owner with no reopens —
 * NOT "at most one note": an intake note plus a resolution note by the same
 * tech is still one touch, while the old ≤1-note rule scored every
 * phone-workflow ticket as a failure (the fabricated 0% FTR).
 */
export function countDistinctHumanParticipants(
  notes: Array<{ creatorResourceId: number | null }>,
  timeEntries: Array<{ resourceId: number | null }>,
  humanResourceIds: Set<number>,
): number {
  const participants = new Set<number>();
  for (const n of notes) {
    if (n.creatorResourceId !== null && humanResourceIds.has(n.creatorResourceId)) participants.add(n.creatorResourceId);
  }
  for (const e of timeEntries) {
    if (e.resourceId !== null && humanResourceIds.has(e.resourceId)) participants.add(e.resourceId);
  }
  return participants.size;
}

interface LifecycleResult {
  computed: number;
  errors: string[];
}

/**
 * Compute lifecycle metrics for tickets that have been synced since the last lifecycle run.
 * Idempotent — upserts on autotaskTicketId.
 *
 * Optimized: batch-fetches all related data (notes, time entries, status history)
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
        creatorResourceId: true,
        priority: true,
        queueId: true,
        queueLabel: true,
        source: true,
        sourceLabel: true,
        slaId: true,
        firstResponseDateTime: true,
        firstResponseDueDateTime: true,
        resolutionPlanDateTime: true,
        resolutionPlanDueDateTime: true,
        resolvedDateTime: true,
        resolvedDueDateTime: true,
        createDate: true,
        completedDate: true,
        status: true,
      },
    });

    if (tickets.length === 0) {
      await finish({ status: 'success', meta: { computed: 0, errorCount: 0 } });
      return result;
    }

    // Human staff ids once per run — first-response/first-touch resolution
    // only counts genuine human activity (see resolveFirstResponse).
    const humanResourceIds = await getHumanResourceIds();

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
          select: { autotaskTicketId: true, createDateTime: true, resourceId: true, hoursWorked: true, isNonBillable: true },
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
          const lifecycle = computeTicketLifecycleInMemory(ticket, notes, timeEntries, statusHistory, humanResourceIds);
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
  creatorResourceId: number | null;
  priority: number;
  queueId: number | null;
  queueLabel: string | null;
  source: number | null;
  sourceLabel: string | null;
  slaId: number | null;
  firstResponseDateTime: Date | null;
  firstResponseDueDateTime: Date | null;
  resolutionPlanDateTime: Date | null;
  resolutionPlanDueDateTime: Date | null;
  resolvedDateTime: Date | null;
  resolvedDueDateTime: Date | null;
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
  timeEntries: Array<{ createDateTime: Date | null; resourceId: number | null; hoursWorked: number; isNonBillable: boolean }>,
  statusHistory: Array<{ previousStatus: number | null; newStatus: number; changedAt: Date }>,
  humanResourceIds: Set<number>,
): LifecycleData {
  const isResolved = isResolvedStatus(ticket.status);

  // M1: First Response Time — genuine human responses only. Tickets a staff
  // member opened live (phone/onsite) have no queue wait: answeredAtIntake,
  // stored as null ("not measured"), never a fabricated 0.
  const firstResponse = resolveFirstResponse(ticket, notes, timeEntries, humanResourceIds);
  const firstResponseMinutes = firstResponse.firstResponseAt !== null
    ? (firstResponse.firstResponseAt.getTime() - ticket.createDate.getTime()) / (1000 * 60)
    : null;

  // M2/M3: Resolution times (wall-clock for general reporting)
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

  // M5: First Touch Resolution — resolved by a single human owner with no
  // reopens (see countDistinctHumanParticipants for why not "≤1 note").
  const isFirstTouchResolution = isResolved
    && reopenCount === 0
    && countDistinctHumanParticipants(notes, timeEntries, humanResourceIds) <= 1;

  // M12: SLA compliance — Autotask's OWN per-contract determination.
  // We store Autotask's SLA event due/actual datetimes at sync time and read
  // the verdict straight off them (met = actual <= due), instead of
  // recomputing against a global target table that drifts from each customer's
  // contracted SLA. Reported only for SLA-reportable tickets (Fully Managed +
  // human + non-alert-queue — see isSlaReportableTicket); else null.
  const slaApplies = isSlaReportableTicket({
    source: ticket.source,
    sourceLabel: ticket.sourceLabel,
    queueId: ticket.queueId,
    queueLabel: ticket.queueLabel,
    assignedResourceId: ticket.assignedResourceId,
    hoursLogged: totalHoursLogged,
    slaId: ticket.slaId,
  });
  const slaResponseMet = slaApplies
    ? metByDue(ticket.firstResponseDateTime, ticket.firstResponseDueDateTime)
    : null;
  const slaResolutionPlanMet = slaApplies
    ? metByDue(ticket.resolutionPlanDateTime, ticket.resolutionPlanDueDateTime)
    : null;
  const slaResolutionMet = slaApplies
    ? metByDue(ticket.resolvedDateTime, ticket.resolvedDueDateTime)
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

/**
 * M2: First Resolution Time — wall-clock minutes from creation to first
 * transition to resolved status (general reporting; SLA compliance itself now
 * comes from Autotask's own event dates, see metByDue).
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
  /** HUMAN-SUPPORT lifecycle rows resolved + completed inside the window (automated monitoring tickets excluded) */
  resolvedTickets: number;
  sla: LifecycleSlaSummary;
  reopen: LifecycleReopenSummary;
}

interface QualityRow {
  companyId: string;
  autotaskTicketId: string;
  reopenCount: number;
  totalHoursLogged: number;
  slaResponseMet: boolean | null;
  slaResolutionPlanMet: boolean | null;
  slaResolutionMet: boolean | null;
}

/**
 * Fetch resolved lifecycle rows in the window, restricted to HUMAN SUPPORT
 * tickets. Automated monitoring tickets (SaaS Alerts / Datto EDR / RMM
 * auto-tickets) are excluded here — at the single chokepoint every SLA and
 * reopen consumer reads through — so their auto-stamped instant timestamps
 * can never fabricate compliance numbers, and rows computed before the
 * classifier existed are filtered too.
 */
async function fetchQualityRows(from: Date, to: Date, companyId?: string): Promise<QualityRow[]> {
  const where = {
    isResolved: true,
    completedDate: { gte: from, lte: to },
    ...(companyId ? { companyId } : {}),
  };
  let rows: QualityRow[];
  try {
    rows = await prisma.ticketLifecycle.findMany({
      where,
      select: {
        companyId: true,
        autotaskTicketId: true,
        reopenCount: true,
        totalHoursLogged: true,
        slaResponseMet: true,
        slaResolutionPlanMet: true,
        slaResolutionMet: true,
      },
    });
  } catch {
    try {
      // slaResolutionPlanMet column may not exist yet — fall back without it
      const fallbackRows = await prisma.ticketLifecycle.findMany({
        where,
        select: {
          companyId: true,
          autotaskTicketId: true,
          reopenCount: true,
          totalHoursLogged: true,
          slaResponseMet: true,
          slaResolutionMet: true,
        },
      });
      rows = fallbackRows.map(r => ({ ...r, slaResolutionPlanMet: null }));
    } catch (err) {
      // Lifecycle data unreachable — reports degrade to "not measured" (null),
      // never to a fabricated number.
      console.error('[lifecycle] quality read failed:', err instanceof Error ? err.message : String(err));
      return [];
    }
  }
  return filterHumanQualityRows(rows);
}

/** Drop automated-monitoring tickets from quality rows via the shared classifier. */
async function filterHumanQualityRows(rows: QualityRow[]): Promise<QualityRow[]> {
  if (rows.length === 0) return rows;
  const classification = new Map<string, ReturnType<typeof classifyTicket>>();
  const hoursById = new Map(rows.map(r => [r.autotaskTicketId, r.totalHoursLogged]));
  const CHUNK = 1000;
  try {
    const ids = rows.map(r => r.autotaskTicketId);
    for (let i = 0; i < ids.length; i += CHUNK) {
      const tickets = await prisma.ticket.findMany({
        where: { autotaskTicketId: { in: ids.slice(i, i + CHUNK) } },
        select: {
          autotaskTicketId: true,
          source: true,
          sourceLabel: true,
          queueId: true,
          queueLabel: true,
          assignedResourceId: true,
        },
      });
      for (const t of tickets) {
        classification.set(t.autotaskTicketId, classifyTicket({
          ...t,
          hoursLogged: hoursById.get(t.autotaskTicketId) ?? null,
        }));
      }
    }
  } catch (err) {
    // Classification unreachable — keep all rows rather than dropping data.
    console.error('[lifecycle] classification read failed:', err instanceof Error ? err.message : String(err));
    return rows;
  }
  // A lifecycle row with no ticket row can't be classified — keep it (human default).
  return rows.filter(r => (classification.get(r.autotaskTicketId) ?? 'human') === 'human');
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
 * SLA + reopen summary for HUMAN SUPPORT tickets resolved in the window —
 * optionally scoped to one company. Automated monitoring tickets are excluded
 * via the shared classifier (see ticket-classification.ts). This is what
 * dashboards and customer reports must consume.
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
