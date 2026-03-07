import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/status
 * Returns the status of all reporting jobs and data coverage info.
 */
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const jobStatuses = await prisma.reportingJobStatus.findMany({
      orderBy: { jobName: 'asc' },
    });

    // Data coverage
    const [ticketCount, earliestTicket, latestTicket] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.findFirst({ orderBy: { createDate: 'asc' }, select: { createDate: true } }),
      prisma.ticket.findFirst({ orderBy: { createDate: 'desc' }, select: { createDate: true } }),
    ]);

    const [lifecycleCount, timeEntryCount, noteCount, resourceCount] = await Promise.all([
      prisma.ticketLifecycle.count(),
      prisma.ticketTimeEntry.count(),
      prisma.ticketNote.count(),
      prisma.resource.count(),
    ]);

    const [techMetricDays, companyMetricDays, healthScoreCount] = await Promise.all([
      prisma.technicianMetricsDaily.count(),
      prisma.companyMetricsDaily.count(),
      prisma.customerHealthScore.count(),
    ]);

    const targetCount = await prisma.reportingTarget.count({ where: { isActive: true } });

    return NextResponse.json({
      jobs: jobStatuses.map(j => ({
        jobName: j.jobName,
        lastRunAt: j.lastRunAt?.toISOString() || null,
        lastRunStatus: j.lastRunStatus,
        lastRunDurationMs: j.lastRunDurationMs,
        lastRunError: j.lastRunError,
        lastRunMeta: j.lastRunMeta,
      })),
      dataCoverage: {
        tickets: ticketCount,
        earliestTicket: earliestTicket?.createDate?.toISOString() || null,
        latestTicket: latestTicket?.createDate?.toISOString() || null,
        lifecycleRecords: lifecycleCount,
        timeEntries: timeEntryCount,
        notes: noteCount,
        resources: resourceCount,
        technicianMetricDays: techMetricDays,
        companyMetricDays: companyMetricDays,
        healthScores: healthScoreCount,
        activeTargets: targetCount,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch status' },
      { status: 500 },
    );
  }
}
