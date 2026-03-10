/**
 * SOC Ticket Ingestion — Fetches fresh tickets from Autotask and upserts into local DB
 *
 * This ensures the SOC agent always has fresh ticket data to analyze,
 * without depending on a separate sync job having been run first.
 */

import { prisma } from '@/lib/prisma';
import { AutotaskClient } from '@/lib/autotask';

interface IngestionResult {
  fetched: number;
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Fetch recent tickets from Autotask and upsert them into the local tickets table.
 * Returns count of tickets ingested. Resolves picklist labels for status, priority, queue, source.
 */
export async function ingestTicketsFromAutotask(days: number = 7): Promise<IngestionResult> {
  const result: IngestionResult = { fetched: 0, created: 0, updated: 0, errors: [] };

  const client = new AutotaskClient();

  // Fetch recent tickets from Autotask
  const atTickets = await client.getRecentTickets(days);
  result.fetched = atTickets.length;

  if (atTickets.length === 0) return result;

  // Resolve picklist labels
  const picklistCache = await resolveTicketPicklists(client);

  // Build company ID mapping (Autotask companyID → local company ID)
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

  // Upsert each ticket
  for (const atTicket of atTickets) {
    try {
      const localCompanyId = companyMap.get(atTicket.companyID);
      if (!localCompanyId) {
        // Skip tickets for companies we don't track locally
        continue;
      }

      const ticketData = {
        autotaskTicketId: String(atTicket.id),
        ticketNumber: atTicket.ticketNumber || `T${atTicket.id}`,
        companyId: localCompanyId,
        title: atTicket.title || 'Untitled',
        description: atTicket.description || null,
        status: atTicket.status,
        statusLabel: picklistCache.status[atTicket.status] || null,
        priority: atTicket.priority,
        priorityLabel: picklistCache.priority[atTicket.priority] || null,
        queueId: atTicket.queueID ?? null,
        queueLabel: atTicket.queueID ? (picklistCache.queue[atTicket.queueID] || null) : null,
        source: atTicket.source ?? null,
        sourceLabel: atTicket.source ? (picklistCache.source[atTicket.source] || null) : null,
        issueType: atTicket.issueType ?? null,
        subIssueType: atTicket.subIssueType ?? null,
        assignedResourceId: atTicket.assignedResourceID ?? null,
        creatorResourceId: atTicket.creatorResourceID ?? null,
        contactId: atTicket.contactID ?? null,
        contractId: atTicket.contractID ?? null,
        slaId: atTicket.serviceLevelAgreementID ?? null,
        dueDateTime: atTicket.dueDateTime ? new Date(atTicket.dueDateTime) : null,
        estimatedHours: atTicket.estimatedHours ?? null,
        createDate: new Date(atTicket.createDate),
        completedDate: atTicket.completedDate ? new Date(atTicket.completedDate) : null,
        lastActivityDate: atTicket.lastActivityDate ? new Date(atTicket.lastActivityDate) : null,
        autotaskLastSync: new Date(),
      };

      const existing = await prisma.ticket.findUnique({
        where: { autotaskTicketId: String(atTicket.id) },
        select: { id: true },
      });

      if (existing) {
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

  return result;
}

interface PicklistMap {
  status: Record<number, string>;
  priority: Record<number, string>;
  queue: Record<number, string>;
  source: Record<number, string>;
}

async function resolveTicketPicklists(client: AutotaskClient): Promise<PicklistMap> {
  const cache: PicklistMap = { status: {}, priority: {}, queue: {}, source: {} };

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
          case 'status': cache.status = map; break;
          case 'priority': cache.priority = map; break;
          case 'queueID': cache.queue = map; break;
          case 'source': cache.source = map; break;
        }
      }
    }
  } catch (err) {
    console.error('[SOC Ingest] Failed to resolve picklists:', err);
  }

  return cache;
}
