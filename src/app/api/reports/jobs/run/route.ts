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

/**
 * Manual job trigger from admin panel.
 * POST /api/reports/jobs/run
 * Body: { "job": "sync_tickets", "params": { "date": "2026-03-07" } }
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

    if (!jobName || !JOB_MAP[jobName]) {
      return NextResponse.json(
        { error: `Unknown job: ${jobName}. Available: ${Object.keys(JOB_MAP).join(', ')}` },
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
