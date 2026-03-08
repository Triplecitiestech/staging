import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { syncTickets, syncTimeEntries, syncTicketNotes, syncResources } from '@/lib/reporting/sync';
import { computeLifecycle } from '@/lib/reporting/lifecycle';
import { aggregateTechnicianDaily, aggregateCompanyDaily } from '@/lib/reporting/aggregation';
import { computeCustomerHealth } from '@/lib/reporting/health-score';
import { ensureReportingTables } from '@/lib/reporting/ensure-tables';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_MAP: Record<string, (date?: Date, days?: number) => Promise<unknown>> = {
  sync_tickets: (_date?: Date, days?: number) => syncTickets(days || 90),
  sync_time_entries: () => syncTimeEntries(),
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

    // Run entire pipeline sequentially
    if (jobName === 'run_all') {
      const results: Array<{ job: string; success: boolean; durationMs?: number; error?: string }> = [];
      for (const name of PIPELINE_ORDER) {
        const start = Date.now();
        try {
          await JOB_MAP[name](undefined, days);
          results.push({ job: name, success: true, durationMs: Date.now() - start });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          results.push({ job: name, success: false, durationMs: Date.now() - start, error: errorMsg });
        }
      }
      const failed = results.filter((r) => !r.success);
      return NextResponse.json({
        success: failed.length === 0,
        results,
        summary: `${results.length - failed.length}/${results.length} jobs succeeded`,
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Job execution failed' },
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
