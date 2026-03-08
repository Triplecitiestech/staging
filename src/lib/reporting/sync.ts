/**
 * Ticket sync pipeline — fetches tickets, notes, time entries, and resources
 * from Autotask and stores them locally for reporting.
 */

import { prisma } from '@/lib/prisma';
import { AutotaskClient } from '@/lib/autotask';
import { createJobTracker, getLastSuccessfulRun } from './job-status';
import { JOB_NAMES, isResolvedStatus } from './types';
import { ensureReportingTables } from './ensure-tables';

// ============================================
// TABLE EXISTENCE CHECK
// ============================================

/**
 * Ensures all reporting tables exist by auto-creating any missing ones.
 * This replaces the old "throw if missing" approach — jobs now self-heal.
 */
export async function assertTableExists(_tableName: string): Promise<void> {
  await ensureReportingTables();
}

// ============================================
// TICKET SYNC
// ============================================

interface TicketSyncResult {
  created: number;
  updated: number;
  statusChanges: number;
  errors: string[];
}

/**
 * Sync tickets from Autotask to local database.
 * Fetches tickets modified since last successful sync.
 * If no previous sync, fetches last `defaultDays` days.
 * Processes companies in batches to stay within Vercel's 60s timeout.
 */
export async function syncTickets(defaultDays: number = 90, batchSize: number = 5): Promise<TicketSyncResult> {
  const finish = createJobTracker(JOB_NAMES.SYNC_TICKETS);
  const result: TicketSyncResult = { created: 0, updated: 0, statusChanges: 0, errors: [] };

  try {
    // Verify table exists before doing any work
    await assertTableExists('tickets');
    await assertTableExists('ticket_status_history');

    const client = new AutotaskClient();
    const lastSync = await getLastSuccessfulRun(JOB_NAMES.SYNC_TICKETS);

    // Use full window for first sync too — batch processing handles timeout.
    // The 30-day limit was too small for quarterly reports, causing empty data.
    const sinceDate = lastSync || new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000);

    // Resolve picklist labels (cached for the batch)
    const picklistCache = await resolvePicklists(client);

    // Get all companies with Autotask IDs
    const companies = await prisma.company.findMany({
      where: { autotaskCompanyId: { not: null } },
      select: { id: true, autotaskCompanyId: true },
    });

    const companyMap = new Map<number, string>();
    for (const c of companies) {
      if (c.autotaskCompanyId) {
        companyMap.set(parseInt(c.autotaskCompanyId, 10), c.id);
      }
    }

    // Process companies in batches to stay within timeout
    const companyBatches: typeof companies[] = [];
    for (let i = 0; i < companies.length; i += batchSize) {
      companyBatches.push(companies.slice(i, i + batchSize));
    }

    for (const batch of companyBatches) {
      // Process batch concurrently
      await Promise.all(batch.map(company => processCompanyTickets(company, sinceDate, picklistCache, result)));
    }

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { created: result.created, updated: result.updated, statusChanges: result.statusChanges, errorCount: result.errors.length },
      error: result.errors.length > 0 ? result.errors.slice(0, 10).join('; ') : undefined,
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await finish({ status: 'failed', error });
    throw err;
  }
}

/** Process tickets for a single company (extracted for batching) */
async function processCompanyTickets(
  company: { id: string; autotaskCompanyId: string | null },
  sinceDate: Date,
  picklistCache: PicklistCache,
  result: TicketSyncResult,
): Promise<void> {
  const client = new AutotaskClient();
  if (!company.autotaskCompanyId) return;
  const atCompanyId = parseInt(company.autotaskCompanyId, 10);

  try {
    const daysSinceSync = Math.ceil((Date.now() - sinceDate.getTime()) / (1000 * 60 * 60 * 24));
    const tickets = await client.getCompanyTickets(atCompanyId, daysSinceSync);

    for (const atTicket of tickets) {
      try {
        const localCompanyId = company.id;
        if (!localCompanyId) return;

        const existing = await prisma.ticket.findUnique({
          where: { autotaskTicketId: String(atTicket.id) },
          select: { id: true, status: true },
        });

        const ticketData = {
          autotaskTicketId: String(atTicket.id),
          ticketNumber: atTicket.ticketNumber || `T${atTicket.id}`,
          companyId: localCompanyId,
          title: atTicket.title || 'Untitled',
          description: atTicket.description || null,
          status: atTicket.status,
          statusLabel: picklistCache.ticketStatus[atTicket.status] || null,
          priority: atTicket.priority,
          priorityLabel: picklistCache.ticketPriority[atTicket.priority] || null,
          queueId: (atTicket as Record<string, unknown>).queueID as number | null ?? null,
          queueLabel: picklistCache.ticketQueue[(atTicket as Record<string, unknown>).queueID as number] || null,
          source: (atTicket as Record<string, unknown>).source as number | null ?? null,
          sourceLabel: picklistCache.ticketSource[(atTicket as Record<string, unknown>).source as number] || null,
          issueType: (atTicket as Record<string, unknown>).issueType as number | null ?? null,
          subIssueType: (atTicket as Record<string, unknown>).subIssueType as number | null ?? null,
          assignedResourceId: (atTicket as Record<string, unknown>).assignedResourceID as number | null ?? null,
          creatorResourceId: (atTicket as Record<string, unknown>).creatorResourceID as number | null ?? null,
          contactId: (atTicket as Record<string, unknown>).contactID as number | null ?? null,
          contractId: (atTicket as Record<string, unknown>).contractID as number | null ?? null,
          slaId: (atTicket as Record<string, unknown>).serviceLevelAgreementID as number | null ?? null,
          dueDateTime: (atTicket as Record<string, unknown>).dueDateTime
            ? new Date((atTicket as Record<string, unknown>).dueDateTime as string)
            : null,
          estimatedHours: (atTicket as Record<string, unknown>).estimatedHours as number | null ?? null,
          createDate: new Date(atTicket.createDate),
          completedDate: atTicket.completedDate ? new Date(atTicket.completedDate) : null,
          lastActivityDate: (atTicket as Record<string, unknown>).lastActivityDate
            ? new Date((atTicket as Record<string, unknown>).lastActivityDate as string)
            : null,
          autotaskLastSync: new Date(),
        };

        if (existing) {
          if (existing.status !== atTicket.status) {
            await prisma.ticketStatusHistory.create({
              data: {
                autotaskTicketId: String(atTicket.id),
                previousStatus: existing.status,
                newStatus: atTicket.status,
                previousStatusLabel: picklistCache.ticketStatus[existing.status] || null,
                newStatusLabel: picklistCache.ticketStatus[atTicket.status] || `Status ${atTicket.status}`,
                changedAt: new Date(),
              },
            });
            result.statusChanges++;
          }

          await prisma.ticket.update({
            where: { autotaskTicketId: String(atTicket.id) },
            data: ticketData,
          });
          result.updated++;
        } else {
          await prisma.ticket.create({ data: ticketData });
          result.created++;
        }
      } catch (err) {
        result.errors.push(`Ticket ${atTicket.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    result.errors.push(`Company ${company.autotaskCompanyId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================
// TIME ENTRY SYNC
// ============================================

interface TimeEntrySyncResult {
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Sync time entries for locally-stored tickets.
 * Processes up to `batchLimit` tickets per invocation to stay within Vercel's 60s timeout.
 * Prioritizes tickets with 0 time entries (backfill from previous broken syncs).
 */
export async function syncTimeEntries(batchLimit: number = 50): Promise<TimeEntrySyncResult & { remaining: number }> {
  const finish = createJobTracker(JOB_NAMES.SYNC_TIME_ENTRIES);
  const result: TimeEntrySyncResult & { remaining: number } = { created: 0, updated: 0, errors: [], remaining: 0 };

  try {
    await assertTableExists('tickets');
    await assertTableExists('ticket_time_entries');

    const client = new AutotaskClient();
    const lastSync = await getLastSuccessfulRun(JOB_NAMES.SYNC_TIME_ENTRIES);

    // Find tickets with no time entries (backfill first — these were missed by broken syncs)
    const ticketsWithEntries = await prisma.ticketTimeEntry.findMany({
      select: { autotaskTicketId: true },
      distinct: ['autotaskTicketId'],
    });
    const ticketsWithEntriesSet = new Set(ticketsWithEntries.map(t => t.autotaskTicketId));

    const allTickets = await prisma.ticket.findMany({
      select: { autotaskTicketId: true },
    });
    const missingEntryTickets = allTickets.filter(t => !ticketsWithEntriesSet.has(t.autotaskTicketId));

    // Also get recently synced tickets
    const recentTickets = lastSync
      ? await prisma.ticket.findMany({
          where: { autotaskLastSync: { gte: lastSync } },
          select: { autotaskTicketId: true },
        })
      : allTickets;

    // Merge: missing first (priority), then recent, deduplicated
    const seenIds = new Set<string>();
    const allCandidates: Array<{ autotaskTicketId: string }> = [];
    for (const t of [...missingEntryTickets, ...recentTickets]) {
      if (!seenIds.has(t.autotaskTicketId)) {
        seenIds.add(t.autotaskTicketId);
        allCandidates.push(t);
      }
    }

    // Batch: only process up to batchLimit tickets per invocation
    const tickets = allCandidates.slice(0, batchLimit);
    result.remaining = Math.max(0, allCandidates.length - batchLimit);

    for (const ticket of tickets) {
      const atTicketId = parseInt(ticket.autotaskTicketId, 10);

      try {
        const timeEntries = await client.getTicketTimeEntries(atTicketId);

        for (const entry of timeEntries) {
          try {
            const entryData = {
              autotaskTimeEntryId: String(entry.id),
              autotaskTicketId: ticket.autotaskTicketId,
              resourceId: entry.resourceID,
              dateWorked: new Date(entry.dateWorked),
              startDateTime: entry.startDateTime ? new Date(entry.startDateTime) : null,
              endDateTime: entry.endDateTime ? new Date(entry.endDateTime) : null,
              hoursWorked: entry.hoursWorked,
              summaryNotes: entry.summaryNotes || null,
              isNonBillable: entry.isNonBillable || false,
              createDateTime: entry.createDateTime ? new Date(entry.createDateTime) : null,
            };

            const existing = await prisma.ticketTimeEntry.findUnique({
              where: { autotaskTimeEntryId: String(entry.id) },
            });

            if (existing) {
              await prisma.ticketTimeEntry.update({
                where: { autotaskTimeEntryId: String(entry.id) },
                data: entryData,
              });
              result.updated++;
            } else {
              await prisma.ticketTimeEntry.create({ data: entryData });
              result.created++;
            }
          } catch (err) {
            result.errors.push(`TimeEntry ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        result.errors.push(`Ticket ${atTicketId} time entries: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { created: result.created, updated: result.updated, errorCount: result.errors.length, remaining: result.remaining },
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
// TICKET NOTE SYNC
// ============================================

interface NoteSyncResult {
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Sync ticket notes for locally-stored tickets.
 * Required for first-response-time calculation.
 * Processes up to `batchLimit` tickets per invocation to stay within timeout.
 */
export async function syncTicketNotes(batchLimit: number = 50): Promise<NoteSyncResult & { remaining: number }> {
  const finish = createJobTracker(JOB_NAMES.SYNC_TICKET_NOTES);
  const result: NoteSyncResult & { remaining: number } = { created: 0, updated: 0, errors: [], remaining: 0 };

  try {
    await assertTableExists('tickets');
    await assertTableExists('ticket_notes');

    const client = new AutotaskClient();
    const lastSync = await getLastSuccessfulRun(JOB_NAMES.SYNC_TICKET_NOTES);

    // Find tickets with no notes (backfill first)
    const ticketsWithNotes = await prisma.ticketNote.findMany({
      select: { autotaskTicketId: true },
      distinct: ['autotaskTicketId'],
    });
    const ticketsWithNotesSet = new Set(ticketsWithNotes.map(t => t.autotaskTicketId));

    const allTickets = await prisma.ticket.findMany({
      select: { autotaskTicketId: true },
    });
    const missingNoteTickets = allTickets.filter(t => !ticketsWithNotesSet.has(t.autotaskTicketId));

    // Also get recently synced tickets
    const recentTickets = lastSync
      ? await prisma.ticket.findMany({
          where: { autotaskLastSync: { gte: lastSync } },
          select: { autotaskTicketId: true },
        })
      : allTickets;

    // Merge: missing first (priority), then recent, deduplicated
    const seenIds = new Set<string>();
    const allCandidates: Array<{ autotaskTicketId: string }> = [];
    for (const t of [...missingNoteTickets, ...recentTickets]) {
      if (!seenIds.has(t.autotaskTicketId)) {
        seenIds.add(t.autotaskTicketId);
        allCandidates.push(t);
      }
    }

    // Batch: only process up to batchLimit tickets per invocation
    const tickets = allCandidates.slice(0, batchLimit);
    result.remaining = Math.max(0, allCandidates.length - batchLimit);

    for (const ticket of tickets) {
      const atTicketId = parseInt(ticket.autotaskTicketId, 10);

      try {
        const notes = await client.getTicketNotes(atTicketId);

        for (const note of notes) {
          try {
            const noteData = {
              autotaskNoteId: String(note.id),
              autotaskTicketId: ticket.autotaskTicketId,
              title: note.title || null,
              description: note.description || null,
              noteType: note.noteType ?? null,
              publish: note.publish ?? null,
              creatorResourceId: note.creatorResourceID ?? null,
              creatorContactId: note.creatorContactID ?? null,
              createDateTime: new Date(note.createDateTime || note.lastActivityDate || new Date()),
            };

            const existing = await prisma.ticketNote.findUnique({
              where: { autotaskNoteId: String(note.id) },
            });

            if (existing) {
              await prisma.ticketNote.update({
                where: { autotaskNoteId: String(note.id) },
                data: noteData,
              });
              result.updated++;
            } else {
              await prisma.ticketNote.create({ data: noteData });
              result.created++;
            }
          } catch (err) {
            result.errors.push(`Note ${note.id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        result.errors.push(`Ticket ${atTicketId} notes: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { created: result.created, updated: result.updated, errorCount: result.errors.length, remaining: result.remaining },
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
// RESOURCE SYNC
// ============================================

interface ResourceSyncResult {
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Sync all active resources (technicians) from Autotask.
 */
export async function syncResources(): Promise<ResourceSyncResult> {
  const finish = createJobTracker(JOB_NAMES.SYNC_RESOURCES);
  const result: ResourceSyncResult = { created: 0, updated: 0, errors: [] };

  try {
    await assertTableExists('resources');

    const client = new AutotaskClient();
    const resources = await client.getActiveResources();

    for (const resource of resources) {
      try {
        const resourceData = {
          autotaskResourceId: resource.id,
          firstName: resource.firstName,
          lastName: resource.lastName,
          email: resource.email,
          isActive: resource.isActive,
          autotaskLastSync: new Date(),
        };

        const existing = await prisma.resource.findUnique({
          where: { autotaskResourceId: resource.id },
        });

        if (existing) {
          await prisma.resource.update({
            where: { autotaskResourceId: resource.id },
            data: resourceData,
          });
          result.updated++;
        } else {
          await prisma.resource.create({ data: resourceData });
          result.created++;
        }
      } catch (err) {
        result.errors.push(`Resource ${resource.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await finish({
      status: result.errors.length > 0 ? 'failed' : 'success',
      meta: { created: result.created, updated: result.updated, errorCount: result.errors.length },
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
// PICKLIST RESOLUTION
// ============================================

interface PicklistCache {
  ticketStatus: Record<number, string>;
  ticketPriority: Record<number, string>;
  ticketQueue: Record<number, string>;
  ticketSource: Record<number, string>;
}

/**
 * Fetch picklist values from Autotask for status, priority, queue, and source.
 * Returns a cache object for resolving numeric values to labels.
 */
async function resolvePicklists(client: AutotaskClient): Promise<PicklistCache> {
  const cache: PicklistCache = {
    ticketStatus: {},
    ticketPriority: {},
    ticketQueue: {},
    ticketSource: {},
  };

  try {
    const fieldInfo = await client.getFieldInfo('Tickets');
    if (fieldInfo && fieldInfo.fields) {
      for (const field of fieldInfo.fields) {
        if (!field.isPickList || !field.picklistValues) continue;

        const map: Record<number, string> = {};
        for (const pv of field.picklistValues) {
          if (pv.isActive) {
            map[parseInt(pv.value, 10)] = pv.label;
          }
        }

        switch (field.name) {
          case 'status':
            cache.ticketStatus = map;
            break;
          case 'priority':
            cache.ticketPriority = map;
            break;
          case 'queueID':
            cache.ticketQueue = map;
            break;
          case 'source':
            cache.ticketSource = map;
            break;
        }
      }
    }
  } catch {
    // Picklist resolution is best-effort — proceed without labels
    console.warn('[ReportingSync] Failed to resolve picklists — labels will be null');
  }

  return cache;
}

// ============================================
// EXTENDED TICKET FETCH
// ============================================

/**
 * Extended version of getCompanyTickets that also fetches queue, source, SLA fields.
 * The base AutotaskClient.getCompanyTickets returns limited fields.
 * This function uses the same query but the Autotask API returns all fields by default.
 */
export { isResolvedStatus };
