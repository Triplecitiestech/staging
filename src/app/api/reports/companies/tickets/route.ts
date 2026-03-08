import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { parseFiltersFromParams } from '@/lib/reporting/filters';
import { RESOLVED_STATUSES, PRIORITY_LABELS } from '@/lib/reporting/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/companies/tickets?companyId=xxx&preset=last_30_days&priority=2
 * Returns individual tickets for a company within the date range.
 * Supports filtering by priority.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const companyId = request.nextUrl.searchParams.get('companyId');
  const resourceId = request.nextUrl.searchParams.get('resourceId');
  const priorityFilter = request.nextUrl.searchParams.get('priority');

  if (!companyId && !resourceId) {
    return NextResponse.json({ error: 'companyId or resourceId is required' }, { status: 400 });
  }

  try {
    const filters = parseFiltersFromParams(request.nextUrl.searchParams);
    const { from, to } = filters.dateRange;

    // Build ticket filter
    const where: Record<string, unknown> = {
      createDate: { gte: from, lte: to },
    };
    if (companyId) where.companyId = companyId;
    if (resourceId) where.assignedResourceId = Number(resourceId);
    if (priorityFilter) where.priority = Number(priorityFilter);

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        autotaskTicketId: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        assignedResourceId: true,
        createDate: true,
        completedDate: true,
        queueId: true,
      },
      orderBy: { createDate: 'desc' },
      take: 200,
    });

    // Get lifecycle data for SLA info
    const ticketIds = tickets.map(t => t.autotaskTicketId);
    const lifecycles = await prisma.ticketLifecycle.findMany({
      where: { autotaskTicketId: { in: ticketIds } },
      select: {
        autotaskTicketId: true,
        isResolved: true,
        firstResponseMinutes: true,
        fullResolutionMinutes: true,
        slaResponseMet: true,
        slaResolutionMet: true,
        totalHoursLogged: true,
      },
    });
    const lifecycleMap = new Map(lifecycles.map(l => [l.autotaskTicketId, l]));

    // Get resource names
    const resourceIds = Array.from(new Set(tickets.map(t => t.assignedResourceId).filter((v): v is number => v !== null)));
    const resources = await prisma.resource.findMany({
      where: { autotaskResourceId: { in: resourceIds } },
      select: { autotaskResourceId: true, firstName: true, lastName: true },
    });
    const resourceMap = new Map(resources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`.trim()]));

    // Get display name for header
    let displayName = 'All Tickets';
    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { displayName: true },
      });
      displayName = company?.displayName || 'Unknown Company';
    }
    if (resourceId) {
      const resource = await prisma.resource.findFirst({
        where: { autotaskResourceId: Number(resourceId) },
        select: { firstName: true, lastName: true },
      });
      displayName = resource ? `${resource.firstName} ${resource.lastName}`.trim() : displayName;
    }

    // SLA summary
    const slaResponseResults = lifecycles.map(l => l.slaResponseMet).filter((v): v is boolean => v !== null);
    const slaResolutionResults = lifecycles.map(l => l.slaResolutionMet).filter((v): v is boolean => v !== null);
    const slaResponseCompliance = slaResponseResults.length > 0
      ? Math.round((slaResponseResults.filter(v => v).length / slaResponseResults.length) * 1000) / 10
      : null;
    const slaResolutionCompliance = slaResolutionResults.length > 0
      ? Math.round((slaResolutionResults.filter(v => v).length / slaResolutionResults.length) * 1000) / 10
      : null;

    const resolvedCount = lifecycles.filter(l => l.isResolved).length;
    const openCount = tickets.length - resolvedCount;

    return NextResponse.json({
      companyName: displayName,
      companyId: companyId || '',
      totalTickets: tickets.length,
      resolvedCount,
      openCount,
      sla: {
        responseCompliance: slaResponseCompliance,
        resolutionCompliance: slaResolutionCompliance,
        responseSampleSize: slaResponseResults.length,
        resolutionSampleSize: slaResolutionResults.length,
      },
      tickets: tickets.map(t => {
        const lc = lifecycleMap.get(t.autotaskTicketId);
        const isResolved = (RESOLVED_STATUSES as readonly number[]).includes(t.status);
        return {
          ticketId: t.autotaskTicketId,
          ticketNumber: t.ticketNumber,
          title: t.title,
          status: t.status,
          isResolved,
          priority: t.priority,
          priorityLabel: PRIORITY_LABELS[t.priority] || `Priority ${t.priority}`,
          assignedTo: t.assignedResourceId ? resourceMap.get(t.assignedResourceId) || 'Unassigned' : 'Unassigned',
          createDate: t.createDate.toISOString(),
          completedDate: t.completedDate?.toISOString() || null,
          firstResponseMinutes: lc?.firstResponseMinutes || null,
          resolutionMinutes: lc?.fullResolutionMinutes || null,
          hoursLogged: lc?.totalHoursLogged || 0,
          slaResponseMet: lc?.slaResponseMet ?? null,
          slaResolutionMet: lc?.slaResolutionMet ?? null,
        };
      }),
      meta: {
        period: {
          from: from.toISOString().split('T')[0],
          to: to.toISOString().split('T')[0],
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/companies/tickets] Failed:', message);

    if (message.includes('does not exist') || message.includes('P2021') || message.includes('P2010')) {
      return NextResponse.json({
        companyName: 'Unknown',
        companyId,
        totalTickets: 0,
        resolvedCount: 0,
        openCount: 0,
        sla: { responseCompliance: null, resolutionCompliance: null, responseSampleSize: 0, resolutionSampleSize: 0 },
        tickets: [],
        meta: { period: { from: '', to: '' }, generatedAt: new Date().toISOString() },
        _warning: 'Reporting tables not yet created.',
      });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
