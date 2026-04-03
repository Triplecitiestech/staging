import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAutotaskWebUrl, isResolvedStatus, PRIORITY_LABELS } from '@/lib/tickets/utils';
import { isSecurityTicket } from '@/lib/soc/rules';
import type { SecurityTicket } from '@/lib/soc/types';
import type { UnifiedTicketRow } from '@/types/tickets';
import { apiOk, apiError, generateRequestId } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SocAnalysis {
  autotaskTicketId: string;
  verdict: string | null;
  confidenceScore: number | null;
  status: string;
  processedAt: string | null;
}

/**
 * GET /api/soc/tickets — Fetch all recent Autotask tickets for SOC dashboard.
 * Returns UnifiedTicketRow[] with SOC analysis data overlaid.
 */
export async function GET(request: NextRequest) {
  const reqId = generateRequestId();
  const session = await auth();
  if (!session?.user?.email) {
    return apiError('Unauthorized', reqId, 401);
  }

  try {
    const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const filter = request.nextUrl.searchParams.get('filter') || 'actionable';

    // Fetch tickets from local DB
    const allTickets = await prisma.ticket.findMany({
      where: {
        createDate: { gte: fromDate },
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
        queueLabel: true,
        sourceLabel: true,
        company: { select: { displayName: true } },
      },
      orderBy: { createDate: 'desc' },
    });

    // Get SOC analysis data for overlay (needed for filtering + display)
    const allTicketIds = allTickets.map(t => t.autotaskTicketId);
    let socAnalyses: SocAnalysis[] = [];
    try {
      if (allTicketIds.length > 0) {
        socAnalyses = await prisma.$queryRaw<SocAnalysis[]>`
          SELECT "autotaskTicketId", verdict, "confidenceScore", status, "processedAt"
          FROM soc_ticket_analysis
          WHERE "autotaskTicketId" = ANY(${allTicketIds})
        `;
      }
    } catch {
      // SOC tables may not exist yet
    }
    const socMap = new Map(socAnalyses.map(a => [a.autotaskTicketId, a]));

    // Filter to only SOC-actionable tickets (analyzed by SOC OR matches security filter)
    const tickets = filter === 'all' ? allTickets : allTickets.filter(t => {
      // Already analyzed by SOC agent
      if (socMap.has(t.autotaskTicketId)) return true;
      // Matches the security ticket filter (would be picked up by SOC)
      const secTicket: SecurityTicket = {
        autotaskTicketId: t.autotaskTicketId,
        ticketNumber: t.ticketNumber,
        companyId: t.companyId,
        title: t.title,
        description: t.description,
        status: t.status,
        statusLabel: t.statusLabel || '',
        priority: t.priority,
        priorityLabel: t.priorityLabel || '',
        queueId: null,
        queueLabel: t.queueLabel || null,
        source: null,
        sourceLabel: t.sourceLabel || null,
        createDate: t.createDate.toISOString(),
      };
      return isSecurityTicket(secTicket);
    });

    // Resolve resource names + time entries in parallel
    const resourceIds = Array.from(
      new Set(tickets.map(t => t.assignedResourceId).filter((v): v is number => v !== null)),
    );
    const ticketIds = tickets.map(t => t.autotaskTicketId);

    const [resources, timeEntries] = await Promise.all([
      resourceIds.length > 0
        ? prisma.resource.findMany({
            where: { autotaskResourceId: { in: resourceIds } },
            select: { autotaskResourceId: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      ticketIds.length > 0
        ? prisma.ticketTimeEntry.findMany({
            where: { autotaskTicketId: { in: ticketIds } },
            select: { autotaskTicketId: true, hoursWorked: true },
          })
        : Promise.resolve([]),
    ]);

    const resourceNameMap = new Map(
      resources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`.trim()]),
    );
    const hoursByTicket = new Map<string, number>();
    for (const te of timeEntries) {
      hoursByTicket.set(te.autotaskTicketId, (hoursByTicket.get(te.autotaskTicketId) || 0) + te.hoursWorked);
    }

    const autotaskWebUrl = getAutotaskWebUrl();
    const round1 = (n: number) => Math.round(n * 10) / 10;

    const rows: (UnifiedTicketRow & {
      companyName: string | null;
      socVerdict: string | null;
      socConfidence: number | null;
      socProcessedAt: string | null;
    })[] = tickets.map(t => {
      const soc = socMap.get(t.autotaskTicketId);
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
        firstResponseMinutes: null,
        resolutionMinutes: null,
        hoursLogged: round1(hoursByTicket.get(t.autotaskTicketId) || 0),
        slaResponseMet: null,
        slaResolutionMet:
          t.dueDateTime && isResolvedStatus(t.status) && t.completedDate ? t.completedDate <= t.dueDateTime : null,
        autotaskUrl: autotaskWebUrl ? `${autotaskWebUrl}?ticketId=${t.autotaskTicketId}` : null,
        companyName: t.company?.displayName || null,
        socVerdict: soc?.verdict || null,
        socConfidence: soc?.confidenceScore != null ? Number(soc.confidenceScore) : null,
        socProcessedAt: soc?.processedAt ? String(soc.processedAt) : null,
      };
    });

    const open = rows.filter(r => !r.isResolved);
    const resolved = rows.filter(r => r.isResolved);
    const suspicious = rows.filter(r => r.socVerdict === 'suspicious' || r.socVerdict === 'escalate');

    return apiOk({
      tickets: rows,
      totalTickets: rows.length,
      openCount: open.length,
      resolvedCount: resolved.length,
      suspiciousCount: suspicious.length,
      autotaskWebUrl,
    }, reqId);
  } catch (err) {
    console.error('[soc/tickets]', err);
    return apiError('Failed to load tickets', reqId, 500);
  }
}
