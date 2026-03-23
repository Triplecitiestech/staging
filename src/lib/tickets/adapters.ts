/**
 * Ticket Data Adapters
 *
 * Two adapters that output identical UnifiedTicketRow[] / UnifiedTicketNote[]:
 * - Staff adapter: reads from local DB (reporting pipeline cache)
 * - Customer adapter: reads from Autotask API live
 */

import { prisma } from '@/lib/prisma';
import type {
  UnifiedTicketRow,
  UnifiedTicketNote,
  TicketListResponse,
  TicketNotesResponse,
  NoteVisibilityFilters,
  NotePublishType,
} from '@/types/tickets';
import { NOTE_PUBLISH } from '@/types/tickets';
import { isResolvedStatus, PRIORITY_LABELS, getAutotaskWebUrl, isWaitingCustomerStatus } from './utils';

// ============================================
// STAFF ADAPTER (Local DB → Unified Types)
// ============================================

interface StaffTicketListParams {
  companyId?: string;
  resourceId?: number;
  dateRange: { from: Date; to: Date };
}

/**
 * Fetch tickets from local DB for staff view.
 * Full data including SLA, FRT, hours, Autotask links.
 */
export async function getStaffTicketList(params: StaffTicketListParams): Promise<TicketListResponse> {
  const { companyId, resourceId, dateRange } = params;

  const tickets = await prisma.ticket.findMany({
    where: {
      createDate: { gte: dateRange.from, lte: dateRange.to },
      ...(companyId ? { companyId } : {}),
      ...(resourceId ? { assignedResourceId: resourceId } : {}),
    },
    select: {
      autotaskTicketId: true,
      ticketNumber: true,
      title: true,
      description: true,
      status: true,
      statusLabel: true,
      priority: true,
      priorityLabel: true,
      assignedResourceId: true,
      createDate: true,
      completedDate: true,
      dueDateTime: true,
      companyId: true,
    },
    orderBy: { createDate: 'desc' },
  });

  // Resolve resource names
  const resourceIds = Array.from(
    new Set(tickets.map(t => t.assignedResourceId).filter((v): v is number => v !== null)),
  );
  const resources =
    resourceIds.length > 0
      ? await prisma.resource.findMany({
          where: { autotaskResourceId: { in: resourceIds } },
          select: { autotaskResourceId: true, firstName: true, lastName: true },
        })
      : [];
  const resourceNameMap = new Map(
    resources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`.trim()]),
  );

  // Aggregate time entries per ticket
  const ticketIds = tickets.map(t => t.autotaskTicketId);
  const timeEntries =
    ticketIds.length > 0
      ? await prisma.ticketTimeEntry.findMany({
          where: { autotaskTicketId: { in: ticketIds } },
          select: { autotaskTicketId: true, hoursWorked: true },
        })
      : [];
  const hoursByTicket = new Map<string, number>();
  for (const te of timeEntries) {
    hoursByTicket.set(te.autotaskTicketId, (hoursByTicket.get(te.autotaskTicketId) || 0) + te.hoursWorked);
  }

  // First tech note per ticket for FRT
  const notesByTicket =
    ticketIds.length > 0
      ? await prisma.ticketNote.findMany({
          where: { autotaskTicketId: { in: ticketIds }, creatorResourceId: { not: null } },
          select: { autotaskTicketId: true, createDateTime: true },
          orderBy: { createDateTime: 'asc' },
        })
      : [];
  const firstNoteMap = new Map<string, Date>();
  for (const n of notesByTicket) {
    if (!firstNoteMap.has(n.autotaskTicketId)) firstNoteMap.set(n.autotaskTicketId, n.createDateTime);
  }

  // Header name
  let headerName = 'Tickets';
  if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { displayName: true } });
    headerName = company?.displayName || 'Unknown Company';
  } else if (resourceId) {
    const name = resourceNameMap.get(resourceId);
    if (!name) {
      const res = await prisma.resource.findUnique({
        where: { autotaskResourceId: resourceId },
        select: { firstName: true, lastName: true },
      });
      headerName = res ? `${res.firstName} ${res.lastName}`.trim() : `Resource ${resourceId}`;
    } else {
      headerName = name;
    }
  }

  // SLA computation
  let slaResMet = 0;
  let slaResTotal = 0;
  const resolvedTickets = tickets.filter(t => isResolvedStatus(t.status) && t.completedDate);
  for (const t of resolvedTickets) {
    if (t.dueDateTime) {
      slaResTotal++;
      if (t.completedDate! <= t.dueDateTime) slaResMet++;
    }
  }

  const autotaskWebUrl = getAutotaskWebUrl();
  const round1 = (n: number) => Math.round(n * 10) / 10;

  const rows: UnifiedTicketRow[] = tickets.map(t => {
    const firstNote = firstNoteMap.get(t.autotaskTicketId);
    const frtMinutes = firstNote ? (firstNote.getTime() - t.createDate.getTime()) / (1000 * 60) : null;
    const resMins =
      isResolvedStatus(t.status) && t.completedDate
        ? (t.completedDate.getTime() - t.createDate.getTime()) / (1000 * 60)
        : null;

    return {
      ticketId: t.autotaskTicketId,
      ticketNumber: t.ticketNumber,
      title: t.title,
      description: t.description || null,
      status: t.status,
      statusLabel: t.statusLabel || `Status ${t.status}`,
      isResolved: isResolvedStatus(t.status),
      priority: t.priority,
      priorityLabel: t.priorityLabel || PRIORITY_LABELS[t.priority] || `P${t.priority}`,
      assignedTo: t.assignedResourceId ? resourceNameMap.get(t.assignedResourceId) || 'Unassigned' : 'Unassigned',
      createDate: t.createDate.toISOString(),
      completedDate: t.completedDate?.toISOString() || null,
      firstResponseMinutes: frtMinutes !== null && frtMinutes >= 0 ? round1(frtMinutes) : null,
      resolutionMinutes: resMins !== null && resMins > 0 ? round1(resMins) : null,
      hoursLogged: round1(hoursByTicket.get(t.autotaskTicketId) || 0),
      slaResponseMet: null,
      slaResolutionMet:
        t.dueDateTime && isResolvedStatus(t.status) && t.completedDate ? t.completedDate <= t.dueDateTime : null,
      autotaskUrl: autotaskWebUrl ? `${autotaskWebUrl}?ticketId=${t.autotaskTicketId}` : null,
    };
  });

  const resolved = tickets.filter(t => isResolvedStatus(t.status));
  const open = tickets.filter(t => !isResolvedStatus(t.status));

  return {
    tickets: rows,
    totalTickets: tickets.length,
    resolvedCount: resolved.length,
    openCount: open.length,
    companyName: headerName,
    sla: {
      responseCompliance: null,
      resolutionPlanCompliance: null,
      resolutionCompliance: slaResTotal > 0 ? round1((slaResMet / slaResTotal) * 100) : null,
      responseSampleSize: 0,
      resolutionPlanSampleSize: 0,
      resolutionSampleSize: slaResTotal,
    },
    autotaskWebUrl,
    meta: {
      period: {
        from: dateRange.from.toISOString().split('T')[0],
        to: dateRange.to.toISOString().split('T')[0],
      },
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Fetch notes + time entries from local DB for staff view.
 * Returns ALL notes (tagged with publishType) — client-side filtering via toggles.
 */
export async function getStaffTicketNotes(
  ticketId: string,
  visibility?: NoteVisibilityFilters,
): Promise<TicketNotesResponse> {
  // Build where clause based on visibility
  const vis = visibility || { showExternal: true, showInternal: true, showSystem: false };

  // Build publish filter. Notes with null publish are treated as internal.
  const publishConditions: Array<Record<string, unknown>> = [];
  if (vis.showExternal) {
    publishConditions.push({ publish: NOTE_PUBLISH.CUSTOMER_PORTAL });
  }
  if (vis.showInternal) {
    publishConditions.push({ publish: { in: [NOTE_PUBLISH.ALL_AUTOTASK_USERS, NOTE_PUBLISH.INTERNAL_ONLY] } });
    // Include notes with null publish (system-generated, default to internal)
    publishConditions.push({ publish: null });
  }
  if (vis.showSystem) {
    // System notes may have null publish and no creator
    publishConditions.push({ publish: null });
  }

  const notes = await prisma.ticketNote.findMany({
    where: {
      autotaskTicketId: ticketId,
      ...(publishConditions.length > 0 ? { OR: publishConditions } : {}),
    },
    select: {
      autotaskNoteId: true,
      title: true,
      description: true,
      noteType: true,
      publish: true,
      creatorResourceId: true,
      creatorContactId: true,
      createDateTime: true,
    },
    orderBy: { createDateTime: 'asc' },
  });

  // Get time entries
  const timeEntries = await prisma.ticketTimeEntry.findMany({
    where: { autotaskTicketId: ticketId },
    select: {
      autotaskTimeEntryId: true,
      resourceId: true,
      hoursWorked: true,
      summaryNotes: true,
      startDateTime: true,
      dateWorked: true,
      createDateTime: true,
    },
    orderBy: { dateWorked: 'asc' },
  });

  // Resolve resource names
  const resourceIds = new Set<number>();
  notes.forEach(n => {
    if (n.creatorResourceId) resourceIds.add(n.creatorResourceId);
  });
  timeEntries.forEach(te => {
    if (te.resourceId) resourceIds.add(te.resourceId);
  });

  const resources = resourceIds.size > 0
    ? await prisma.resource.findMany({
        where: { autotaskResourceId: { in: Array.from(resourceIds) } },
        select: { autotaskResourceId: true, firstName: true, lastName: true },
      })
    : [];
  const resourceMap = new Map(
    resources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`.trim()]),
  );

  const unified: UnifiedTicketNote[] = [];

  for (const n of notes) {
    const isSystem = !n.creatorResourceId && !n.creatorContactId;
    // If system notes are toggled off, skip
    if (isSystem && !vis.showSystem) continue;

    const isExternal = n.publish === NOTE_PUBLISH.CUSTOMER_PORTAL;

    unified.push({
      id: `note-${n.autotaskNoteId}`,
      type: 'note',
      timestamp: n.createDateTime.toISOString(),
      author: n.creatorResourceId
        ? resourceMap.get(n.creatorResourceId) || 'Technician'
        : n.creatorContactId
          ? 'Customer'
          : 'System',
      authorType: n.creatorResourceId ? 'technician' : n.creatorContactId ? 'customer' : 'system',
      content: n.description || n.title || '',
      title: n.title || null,
      publishType: (n.publish as NotePublishType) || null,
      hoursWorked: null,
      isInternal: !isExternal,
    });
  }

  // Add time entries (staff sees all)
  for (const te of timeEntries) {
    if (!te.summaryNotes && !te.hoursWorked) continue;
    unified.push({
      id: `time-${te.autotaskTimeEntryId}`,
      type: 'time_entry',
      timestamp: (te.startDateTime || te.dateWorked || te.createDateTime)?.toISOString() || '',
      author: te.resourceId ? resourceMap.get(te.resourceId) || 'Technician' : 'Unknown',
      authorType: 'technician',
      content: te.summaryNotes || '',
      title: null,
      publishType: null,
      hoursWorked: te.hoursWorked,
      isInternal: false,
    });
  }

  // Sort chronologically
  unified.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return { notes: unified, ticketId };
}

// ============================================
// CUSTOMER ADAPTER (Autotask API → Unified Types)
// ============================================

interface CustomerTicketListParams {
  companySlug: string;
}

/**
 * Fetch tickets from Autotask API live for customer view.
 * Strips staff-only fields. Returns only customer-visible data.
 */
export async function getCustomerTicketList(params: CustomerTicketListParams): Promise<TicketListResponse> {
  const { companySlug } = params;
  const slug = companySlug.toLowerCase().trim();

  // Look up company
  const company = await prisma.company.findUnique({
    where: { slug },
    select: { autotaskCompanyId: true, displayName: true },
  });

  if (!company?.autotaskCompanyId) {
    console.warn(`[getCustomerTicketList] Company slug="${slug}" has no autotaskCompanyId (company found: ${!!company})`);
    return {
      tickets: [],
      totalTickets: 0,
      openCount: 0,
      resolvedCount: 0,
      companyName: company?.displayName || 'Unknown',
    };
  }

  const atCompanyId = parseInt(company.autotaskCompanyId, 10);
  if (isNaN(atCompanyId)) {
    return {
      tickets: [],
      totalTickets: 0,
      openCount: 0,
      resolvedCount: 0,
      companyName: company.displayName || 'Unknown',
    };
  }

  // Fetch live from Autotask
  const { AutotaskClient } = await import('@/lib/autotask');
  const client = new AutotaskClient();
  const rawTickets = await client.getCompanyTickets(atCompanyId, 90);

  const rows: UnifiedTicketRow[] = rawTickets.map(t => ({
    ticketId: String(t.id),
    ticketNumber: t.ticketNumber || String(t.id),
    title: t.title,
    description: t.description || null,
    status: t.status,
    statusLabel: isResolvedStatus(t.status) ? 'Resolved' : isWaitingCustomerStatus(t.status) ? 'Awaiting Your Team' : 'Open',
    isResolved: isResolvedStatus(t.status),
    priority: t.priority,
    priorityLabel: PRIORITY_LABELS[t.priority] || `P${t.priority}`,
    assignedTo: '', // Not shown to customers
    createDate: t.createDate,
    completedDate: t.completedDate || null,
    // Customer never sees these
    firstResponseMinutes: null,
    resolutionMinutes: null,
    hoursLogged: 0,
    slaResponseMet: null,
    slaResolutionMet: null,
    autotaskUrl: null,
  }));

  const open = rows.filter(r => !r.isResolved);
  const resolved = rows.filter(r => r.isResolved);

  return {
    tickets: rows,
    totalTickets: rows.length,
    openCount: open.length,
    resolvedCount: resolved.length,
    companyName: company.displayName || 'Unknown',
    // No SLA for customers
  };
}

/**
 * Fetch notes + time entries from Autotask API live for customer view.
 * Only returns external notes (publish=3), no system notes.
 */
export async function getCustomerTicketNotes(ticketId: string): Promise<TicketNotesResponse> {
  const atTicketId = parseInt(ticketId, 10);
  if (isNaN(atTicketId)) return { notes: [], ticketId };

  const { AutotaskClient } = await import('@/lib/autotask');
  const client = new AutotaskClient();

  const [notes, timeEntries] = await Promise.all([
    client.getTicketNotes(atTicketId),
    client.getTicketTimeEntries(atTicketId),
  ]);

  // Build resource cache for author names
  const resourceIds = new Set<number>();
  notes.forEach(n => {
    if (n.creatorResourceID) resourceIds.add(n.creatorResourceID);
  });
  timeEntries.forEach(te => {
    if (te.resourceID) resourceIds.add(te.resourceID);
  });

  const resourceMap = new Map<number, string>();
  for (const resId of Array.from(resourceIds)) {
    try {
      const resource = await client.getResource(resId);
      if (resource) {
        resourceMap.set(resId, `${resource.firstName} ${resource.lastName}`.trim());
      }
    } catch {
      // Individual resource lookup failed, use fallback
    }
  }

  const unified: UnifiedTicketNote[] = [];

  // Only customer-portal-published notes (publish=3)
  for (const note of notes) {
    if (note.publish !== NOTE_PUBLISH.CUSTOMER_PORTAL) continue;
    // Skip system notes (no human creator)
    if (!note.creatorResourceID && !note.creatorContactID) continue;

    const isCustomerNote = !!note.creatorContactID && !note.creatorResourceID;

    unified.push({
      id: `note-${note.id}`,
      type: 'note',
      timestamp: note.createDateTime || note.lastActivityDate || '',
      author: note.creatorResourceID
        ? resourceMap.get(note.creatorResourceID) || 'Triple Cities Tech'
        : 'Customer',
      authorType: isCustomerNote ? 'customer' : 'technician',
      content: note.description || note.title || '',
      title: note.title || null,
      publishType: NOTE_PUBLISH.CUSTOMER_PORTAL,
      hoursWorked: null,
      isInternal: false,
    });
  }

  // Customer-visible time entries: only those with summary notes
  for (const te of timeEntries) {
    if (!te.summaryNotes) continue;

    unified.push({
      id: `time-${te.id}`,
      type: 'time_entry',
      timestamp: te.startDateTime || te.dateWorked || te.createDateTime || '',
      author: resourceMap.get(te.resourceID) || 'Triple Cities Tech',
      authorType: 'technician',
      content: te.summaryNotes,
      title: null,
      publishType: null,
      hoursWorked: te.hoursWorked,
      isInternal: false,
    });
  }

  // Sort chronologically
  unified.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return { notes: unified, ticketId };
}
