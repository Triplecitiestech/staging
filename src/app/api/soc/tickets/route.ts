import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAutotaskWebUrl, isResolvedStatus, PRIORITY_LABELS } from '@/lib/tickets/utils';
import type { UnifiedTicketRow } from '@/types/tickets';

export const dynamic = 'force-dynamic';

interface SocAnalysis {
  autotaskTicketId: string;
  verdict: string | null;
  confidenceScore: number | null;
  status: string;
}

/**
 * GET /api/soc/tickets — Fetch all recent Autotask tickets for SOC dashboard.
 * Returns UnifiedTicketRow[] with SOC analysis data overlaid.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    // Fetch tickets from local DB
    const tickets = await prisma.ticket.findMany({
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
        company: { select: { displayName: true } },
      },
      orderBy: { createDate: 'desc' },
    });

    // Resolve resource names
    const resourceIds = Array.from(
      new Set(tickets.map(t => t.assignedResourceId).filter((v): v is number => v !== null)),
    );
    const resources = resourceIds.length > 0
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
    const timeEntries = ticketIds.length > 0
      ? await prisma.ticketTimeEntry.findMany({
          where: { autotaskTicketId: { in: ticketIds } },
          select: { autotaskTicketId: true, hoursWorked: true },
        })
      : [];
    const hoursByTicket = new Map<string, number>();
    for (const te of timeEntries) {
      hoursByTicket.set(te.autotaskTicketId, (hoursByTicket.get(te.autotaskTicketId) || 0) + te.hoursWorked);
    }

    // Get SOC analysis data for overlay
    let socAnalyses: SocAnalysis[] = [];
    try {
      socAnalyses = await prisma.$queryRaw<SocAnalysis[]>`
        SELECT "autotaskTicketId", verdict, "confidenceScore", status
        FROM soc_ticket_analysis
        WHERE "autotaskTicketId" = ANY(${ticketIds})
      `;
    } catch {
      // SOC tables may not exist yet
    }
    const socMap = new Map(socAnalyses.map(a => [a.autotaskTicketId, a]));

    const autotaskWebUrl = getAutotaskWebUrl();
    const round1 = (n: number) => Math.round(n * 10) / 10;

    const rows: (UnifiedTicketRow & {
      companyName: string | null;
      socVerdict: string | null;
      socConfidence: number | null;
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
      };
    });

    const open = rows.filter(r => !r.isResolved);
    const resolved = rows.filter(r => r.isResolved);
    const suspicious = rows.filter(r => r.socVerdict === 'suspicious' || r.socVerdict === 'escalate');

    return NextResponse.json({
      tickets: rows,
      totalTickets: rows.length,
      openCount: open.length,
      resolvedCount: resolved.length,
      suspiciousCount: suspicious.length,
      autotaskWebUrl,
    });
  } catch (err) {
    console.error('[soc/tickets]', err);
    return NextResponse.json({ error: 'Failed to load tickets' }, { status: 500 });
  }
}
