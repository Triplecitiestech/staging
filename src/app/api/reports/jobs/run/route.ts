import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { classifyError } from '@/lib/resilience';
import { syncTickets, syncTimeEntries, syncTimeEntriesBulk, syncTicketNotes, syncResources } from '@/lib/reporting/sync';
import { computeLifecycle } from '@/lib/reporting/lifecycle';
import { aggregateTechnicianDaily, aggregateCompanyDaily } from '@/lib/reporting/aggregation';
import { computeCustomerHealth } from '@/lib/reporting/health-score';
import { ensureReportingTables } from '@/lib/reporting/ensure-tables';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_MAP: Record<string, (date?: Date, days?: number) => Promise<unknown>> = {
  sync_tickets: (_date?: Date, days?: number) => syncTickets(days || 90),
  sync_time_entries: () => syncTimeEntries(),
  sync_time_entries_bulk: (_date?: Date, days?: number) => syncTimeEntriesBulk(days || 90),
  sync_ticket_notes: () => syncTicketNotes(),
  sync_resources: () => syncResources(),
  compute_lifecycle: () => computeLifecycle(),
  aggregate_technician: (date?: Date) => aggregateTechnicianDaily(date),
  aggregate_company: (date?: Date) => aggregateCompanyDaily(date),
  compute_health: () => computeCustomerHealth(),
};

// Ordered pipeline — sync first, then compute, then aggregate, then health
const PIPELINE_ORDER = [
  'sync_tickets',
  'sync_time_entries',
  'sync_time_entries_bulk',
  'sync_ticket_notes',
  'sync_resources',
  'compute_lifecycle',
  'aggregate_technician',
  'aggregate_company',
  'compute_health',
];

/** Shared pipeline runner used by both GET and POST */
async function runPipeline(jobName: string, days?: number, date?: Date) {
  try {
    // Auto-migrate: ensure all reporting tables exist before any job runs
    await ensureReportingTables();

    // Run entire pipeline sequentially (with 45s safety timeout per step)
    if (jobName === 'run_all') {
      const results: Array<{ job: string; success: boolean; durationMs?: number; error?: string; skipped?: boolean }> = [];
      const pipelineStart = Date.now();
      const MAX_TOTAL_MS = 50000; // Leave 10s buffer before Vercel's 60s timeout

      for (const name of PIPELINE_ORDER) {
        // Skip remaining jobs if we're running out of time
        if (Date.now() - pipelineStart > MAX_TOTAL_MS) {
          results.push({ job: name, success: true, skipped: true, durationMs: 0, error: 'Skipped — approaching timeout' });
          continue;
        }
        const start = Date.now();
        try {
          // Cap bulk time entry sync to 14 days in pipeline mode to avoid timeout
          const jobDays = name === 'sync_time_entries_bulk' ? Math.min(days || 14, 14) : days;
          await JOB_MAP[name](undefined, jobDays);
          results.push({ job: name, success: true, durationMs: Date.now() - start });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          results.push({ job: name, success: false, durationMs: Date.now() - start, error: errorMsg });
        }
      }
      const failed = results.filter((r) => !r.success);
      const skipped = results.filter((r) => r.skipped);
      return NextResponse.json({
        success: failed.length === 0,
        results,
        summary: `${results.length - failed.length - skipped.length}/${results.length} jobs succeeded${skipped.length > 0 ? `, ${skipped.length} skipped (run again to continue)` : ''}`,
        totalDurationMs: results.reduce((sum, r) => sum + (r.durationMs || 0), 0),
      });
    }

    // Single job
    if (!jobName || !JOB_MAP[jobName]) {
      return NextResponse.json(
        { error: `Unknown job: ${jobName}. Available: ${Object.keys(JOB_MAP).join(', ')}, run_all` },
        { status: 400 },
      );
    }

    const result = await JOB_MAP[jobName](date, days);
    return NextResponse.json({ success: true, job: jobName, result });
  } catch (err) {
    const classified = classifyError(err);
    if (classified.isTransient) {
      return NextResponse.json({ error: classified.message, transient: true }, { status: 200 });
    }
    return NextResponse.json(
      { error: classified.message },
      { status: 500 },
    );
  }
}

/**
 * GET /api/reports/jobs/run?secret=MIGRATION_SECRET&job=run_all&days=180
 * Secret-based trigger — no session needed, paste in browser URL bar.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  const isAuthorized =
    secret === process.env.MIGRATION_SECRET ||
    secret === process.env.CRON_SECRET;
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobName = request.nextUrl.searchParams.get('job') || 'run_all';
  const days = request.nextUrl.searchParams.get('days')
    ? parseInt(request.nextUrl.searchParams.get('days')!, 10)
    : undefined;

  return runPipeline(jobName, days);
}

/**
 * POST /api/reports/jobs/run
 * Session-based trigger from admin panel (Run All button).
 * Body: { "job": "sync_tickets", "params": { "days": "180" } }
 * Body: { "job": "run_all", "params": { "days": "180" } }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const jobName = body.job as string;
  const params = body.params as Record<string, string> | undefined;
  const days = params?.days ? parseInt(params.days, 10) : undefined;
  const date = params?.date ? new Date(params.date) : undefined;

  return runPipeline(jobName, days, date);
}
