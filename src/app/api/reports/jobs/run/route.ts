import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { syncTickets, syncTimeEntries, syncTicketNotes, syncResources } from '@/lib/reporting/sync';
import { computeLifecycle } from '@/lib/reporting/lifecycle';
import { aggregateTechnicianDaily, aggregateCompanyDaily } from '@/lib/reporting/aggregation';
import { computeCustomerHealth } from '@/lib/reporting/health-score';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_MAP: Record<string, (date?: Date) => Promise<unknown>> = {
  sync_tickets: () => syncTickets(),
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

/**
 * Manual job trigger from admin panel.
 * POST /api/reports/jobs/run
 * Body: { "job": "sync_tickets" } — single job
 * Body: { "job": "run_all" }      — run entire pipeline in order
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const jobName = body.job as string;
    const params = body.params as Record<string, string> | undefined;

    // Run entire pipeline sequentially
    if (jobName === 'run_all') {
      const results: Array<{ job: string; success: boolean; error?: string }> = [];
      let migrationNeeded = false;
      for (const name of PIPELINE_ORDER) {
        try {
          await JOB_MAP[name]();
          results.push({ job: name, success: true });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          if (errorMsg.includes('does not exist. Run the reporting migration')) {
            migrationNeeded = true;
          }
          results.push({
            job: name,
            success: false,
            error: errorMsg,
          });
        }
      }
      const failed = results.filter((r) => !r.success);
      return NextResponse.json({
        success: failed.length === 0,
        results,
        summary: `${results.length - failed.length}/${results.length} jobs succeeded`,
        ...(migrationNeeded && {
          action: 'Run POST /api/reports/migrate?secret=MIGRATION_SECRET to create the reporting tables, then retry.',
        }),
      });
    }

    // Single job
    if (!jobName || !JOB_MAP[jobName]) {
      return NextResponse.json(
        { error: `Unknown job: ${jobName}. Available: ${Object.keys(JOB_MAP).join(', ')}, run_all` },
        { status: 400 },
      );
    }

    const date = params?.date ? new Date(params.date) : undefined;
    const result = await JOB_MAP[jobName](date);

    return NextResponse.json({ success: true, job: jobName, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Job execution failed' },
      { status: 500 },
    );
  }
}
