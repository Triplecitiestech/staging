import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Safely count records in a table — returns 0 if the table doesn't exist.
 */
async function safeCount(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch {
    return 0;
  }
}

/**
 * Safely query a table — returns null if the table doesn't exist.
 */
async function safeQuery<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * GET /api/reports/status
 * Returns the status of all reporting jobs and data coverage info.
 * Resilient to missing tables — returns zeros for tables that don't exist yet.
 */
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Job statuses — may not exist yet
    const jobStatuses = await safeQuery(() =>
      prisma.reportingJobStatus.findMany({ orderBy: { jobName: 'asc' } })
    );

    // Data coverage — each query independent
    const [
      ticketCount,
      earliestTicket,
      latestTicket,
      lifecycleCount,
      timeEntryCount,
      noteCount,
      resourceCount,
      techMetricDays,
      companyMetricDays,
      healthScoreCount,
      targetCount,
    ] = await Promise.all([
      safeCount(() => prisma.ticket.count()),
      safeQuery(() => prisma.ticket.findFirst({ orderBy: { createDate: 'asc' }, select: { createDate: true } })),
      safeQuery(() => prisma.ticket.findFirst({ orderBy: { createDate: 'desc' }, select: { createDate: true } })),
      safeCount(() => prisma.ticketLifecycle.count()),
      safeCount(() => prisma.ticketTimeEntry.count()),
      safeCount(() => prisma.ticketNote.count()),
      safeCount(() => prisma.resource.count()),
      safeCount(() => prisma.technicianMetricsDaily.count()),
      safeCount(() => prisma.companyMetricsDaily.count()),
      safeCount(() => prisma.customerHealthScore.count()),
      safeCount(() => prisma.reportingTarget.count({ where: { isActive: true } })),
    ]);

    const allZero = ticketCount === 0 && lifecycleCount === 0 && resourceCount === 0;

    return NextResponse.json({
      jobs: (jobStatuses || []).map((j: { jobName: string; lastRunAt: Date | null; lastRunStatus: string | null; lastRunDurationMs: number | null; lastRunError: string | null; lastRunMeta: unknown }) => ({
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
      ...(allZero ? { _warning: 'Reporting tables are empty. The data pipeline has not been run yet, or reporting database migration is needed.' } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/status] Failed to fetch status:', message);
    return NextResponse.json(
      { error: `Failed to fetch pipeline status: ${message}` },
      { status: 500 },
    );
  }
}
