import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/validation
 * Internal validation endpoint — inspect raw reporting data for correctness.
 * This is a developer/admin-only tool, not a production reporting endpoint.
 *
 * Query params:
 *   ?view=tickets    — sample of synced tickets
 *   ?view=lifecycle  — sample of lifecycle records
 *   ?view=technician — sample of technician daily rows
 *   ?view=company    — sample of company daily rows
 *   ?view=health     — all health scores
 *   ?view=history    — sample of status history entries
 *   ?view=summary    — counts across all tables
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const view = request.nextUrl.searchParams.get('view') || 'summary';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20', 10), 100);

  try {
    switch (view) {
      case 'tickets': {
        const tickets = await prisma.ticket.findMany({
          take: limit,
          orderBy: { createDate: 'desc' },
          include: { company: { select: { displayName: true } } },
        });
        return NextResponse.json({ view, count: tickets.length, data: tickets });
      }

      case 'lifecycle': {
        let lifecycles;
        try {
          lifecycles = await prisma.ticketLifecycle.findMany({
            take: limit,
            orderBy: { computedAt: 'desc' },
          });
        } catch {
          // slaResolutionPlanMet column may not exist yet — use explicit select without it
          lifecycles = await prisma.ticketLifecycle.findMany({
            take: limit,
            orderBy: { computedAt: 'desc' },
            select: {
              id: true, autotaskTicketId: true, companyId: true, assignedResourceId: true,
              priority: true, queueId: true, createDate: true, completedDate: true,
              isResolved: true, firstResponseMinutes: true, firstResolutionMinutes: true,
              fullResolutionMinutes: true, activeResolutionMinutes: true, waitingCustomerMinutes: true,
              techNoteCount: true, customerNoteCount: true, reopenCount: true,
              totalHoursLogged: true, billableHoursLogged: true, isFirstTouchResolution: true,
              slaResponseMet: true, slaResolutionMet: true, computedAt: true,
            },
          });
        }
        return NextResponse.json({ view, count: lifecycles.length, data: lifecycles });
      }

      case 'technician': {
        const techMetrics = await prisma.technicianMetricsDaily.findMany({
          take: limit,
          orderBy: { date: 'desc' },
        });
        return NextResponse.json({ view, count: techMetrics.length, data: techMetrics });
      }

      case 'company': {
        const companyMetrics = await prisma.companyMetricsDaily.findMany({
          take: limit,
          orderBy: { date: 'desc' },
        });
        return NextResponse.json({ view, count: companyMetrics.length, data: companyMetrics });
      }

      case 'health': {
        const health = await prisma.customerHealthScore.findMany({
          take: limit,
          orderBy: { computedAt: 'desc' },
        });
        return NextResponse.json({ view, count: health.length, data: health });
      }

      case 'history': {
        const history = await prisma.ticketStatusHistory.findMany({
          take: limit,
          orderBy: { changedAt: 'desc' },
        });
        return NextResponse.json({ view, count: history.length, data: history });
      }

      case 'summary':
      default: {
        const [tickets, lifecycle, timeEntries, notes, resources, techDaily, companyDaily, health, targets, history, jobs] = await Promise.all([
          prisma.ticket.count(),
          prisma.ticketLifecycle.count(),
          prisma.ticketTimeEntry.count(),
          prisma.ticketNote.count(),
          prisma.resource.count(),
          prisma.technicianMetricsDaily.count(),
          prisma.companyMetricsDaily.count(),
          prisma.customerHealthScore.count(),
          prisma.reportingTarget.count({ where: { isActive: true } }),
          prisma.ticketStatusHistory.count(),
          prisma.reportingJobStatus.findMany(),
        ]);

        return NextResponse.json({
          view: 'summary',
          counts: {
            tickets,
            ticketLifecycle: lifecycle,
            ticketTimeEntries: timeEntries,
            ticketNotes: notes,
            resources,
            technicianMetricsDays: techDaily,
            companyMetricsDays: companyDaily,
            customerHealthScores: health,
            activeTargets: targets,
            statusHistoryEntries: history,
          },
          jobs: jobs.map(j => ({
            jobName: j.jobName,
            lastRunAt: j.lastRunAt?.toISOString(),
            lastRunStatus: j.lastRunStatus,
            lastRunDurationMs: j.lastRunDurationMs,
          })),
        });
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Validation query failed' },
      { status: 500 },
    );
  }
}
