import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { parseFiltersFromParams } from '@/lib/reporting/filters';
import { RESOLVED_STATUSES, PRIORITY_LABELS } from '@/lib/reporting/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/priority-drilldown?priority=2&preset=last_30_days
 * Returns tickets grouped by company for a specific priority level.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const priorityParam = request.nextUrl.searchParams.get('priority');
  if (!priorityParam) {
    return NextResponse.json({ error: 'priority is required (1=Critical, 2=High, 3=Medium, 4=Low)' }, { status: 400 });
  }
  const priority = Number(priorityParam);

  try {
    const filters = parseFiltersFromParams(request.nextUrl.searchParams);
    const { from, to } = filters.dateRange;

    const tickets = await prisma.ticket.findMany({
      where: {
        priority,
        createDate: { gte: from, lte: to },
      },
      select: {
        autotaskTicketId: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        companyId: true,
        assignedResourceId: true,
        createDate: true,
        completedDate: true,
      },
      orderBy: { createDate: 'desc' },
      take: 300,
    });

    // Group by company
    const companyTickets = new Map<string, typeof tickets>();
    for (const t of tickets) {
      const list = companyTickets.get(t.companyId) || [];
      list.push(t);
      companyTickets.set(t.companyId, list);
    }

    // Get company names
    const companyIds = Array.from(companyTickets.keys());
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, displayName: true },
    });
    const companyMap = new Map(companies.map(c => [c.id, c.displayName]));

    // Get resource names
    const resourceIds = Array.from(new Set(tickets.map(t => t.assignedResourceId).filter((v): v is number => v !== null)));
    const resources = await prisma.resource.findMany({
      where: { autotaskResourceId: { in: resourceIds } },
      select: { autotaskResourceId: true, firstName: true, lastName: true },
    });
    const resourceMap = new Map(resources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`.trim()]));

    const companySummaries = Array.from(companyTickets.entries())
      .map(([cId, tix]) => {
        const resolved = tix.filter(t => (RESOLVED_STATUSES as readonly number[]).includes(t.status)).length;
        return {
          companyId: cId,
          companyName: companyMap.get(cId) || 'Unknown',
          totalTickets: tix.length,
          resolvedCount: resolved,
          openCount: tix.length - resolved,
          tickets: tix.map(t => ({
            ticketId: t.autotaskTicketId,
            ticketNumber: t.ticketNumber,
            title: t.title,
            isResolved: (RESOLVED_STATUSES as readonly number[]).includes(t.status),
            assignedTo: t.assignedResourceId ? resourceMap.get(t.assignedResourceId) || 'Unassigned' : 'Unassigned',
            createDate: t.createDate.toISOString(),
            completedDate: t.completedDate?.toISOString() || null,
          })),
        };
      })
      .sort((a, b) => b.totalTickets - a.totalTickets);

    return NextResponse.json({
      priority,
      priorityLabel: PRIORITY_LABELS[priority] || `Priority ${priority}`,
      totalTickets: tickets.length,
      companySummaries,
      meta: {
        period: { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/priority-drilldown] Failed:', message);
    if (message.includes('does not exist') || message.includes('P2021') || message.includes('P2010')) {
      return NextResponse.json({
        priority, priorityLabel: PRIORITY_LABELS[priority] || `Priority ${priority}`,
        totalTickets: 0, companySummaries: [],
        meta: { period: { from: '', to: '' }, generatedAt: new Date().toISOString() },
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
