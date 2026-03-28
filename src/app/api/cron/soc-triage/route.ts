import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadSocConfig, loadActiveRules, runTriagePipeline } from '@/lib/soc/engine';
import type { SecurityTicket } from '@/lib/soc/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/soc-triage
 * Runs every 5 minutes. Detects and triages new security tickets.
 * Reads from the local `tickets` table (populated by the Autotask ticket sync cron).
 */
export async function GET(request: NextRequest) {
  // Auth: Vercel cron sends Authorization header
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Load config
    const config = await loadSocConfig();

    if (!config.agent_enabled) {
      return NextResponse.json({ status: 'disabled', message: 'SOC agent is disabled' });
    }

    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ status: 'error', message: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    // Load active rules
    const rules = await loadActiveRules();

    // Fetch unprocessed security tickets from local DB
    // The tickets table is populated by the Autotask ticket sync cron (/api/reports/jobs/sync-tickets)
    const tickets = await prisma.$queryRaw<SecurityTicket[]>`
      SELECT
        t."autotaskTicketId",
        t."ticketNumber",
        t."companyId",
        c."displayName" as "companyName",
        t.title,
        t.description,
        t.status,
        t."statusLabel",
        t.priority,
        t."priorityLabel",
        t."queueId",
        t."queueLabel",
        t.source,
        t."sourceLabel",
        t."createDate"::text as "createDate"
      FROM tickets t
      LEFT JOIN companies c ON c.id = t."companyId"
      WHERE NOT EXISTS (
        SELECT 1 FROM soc_ticket_analysis sa
        WHERE sa."autotaskTicketId" = t."autotaskTicketId"
      )
      AND t."createDate" > now() - interval '7 days'
      AND t.status NOT IN (5, 13, 29)
      ORDER BY t."createDate" DESC
      LIMIT 50
    `;

    if (tickets.length === 0) {
      await updateJobStatus('soc-triage', 'success', Date.now() - startTime, {
        ticketsProcessed: 0, notesAdded: 0, falsePositives: 0,
        escalated: 0, skipped: 0, errors: 0, aiCallsMade: 0,
      });
      return NextResponse.json({ status: 'ok', message: 'No new tickets to process', ticketsFound: 0 });
    }

    // Run triage pipeline
    const result = await runTriagePipeline(tickets, config, rules);

    // Update job status
    await updateJobStatus('soc-triage', result.errors.length > 0 ? 'partial' : 'success', Date.now() - startTime, result.meta as unknown as Record<string, unknown>);

    return NextResponse.json({
      status: 'ok',
      dryRun: config.dry_run,
      ticketsFound: tickets.length,
      ...result.meta,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isConnectionError = message.includes('Failed to conn') ||
      message.includes('Connection terminated') ||
      message.includes('ECONNREFUSED') ||
      message.includes('timeout');

    console.error('[SOC Cron] Fatal error:', err);

    await updateJobStatus('soc-triage', 'failed', Date.now() - startTime, null, message);

    // Return 200 for transient connection errors so Vercel doesn't flag them
    if (isConnectionError) {
      return NextResponse.json({
        status: 'transient_error',
        message: `Transient connection error (will retry next cycle): ${message}`,
      });
    }

    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}

async function updateJobStatus(
  jobName: string,
  status: string,
  durationMs: number,
  meta: Record<string, unknown> | null,
  error?: string,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO soc_job_status (id, "jobName", "lastRunAt", "lastRunStatus", "lastRunDurationMs", "lastRunError", "lastRunMeta", "firstRunAt")
      VALUES (gen_random_uuid()::text, $1, now(), $2, $3, $4, $5::jsonb, now())
      ON CONFLICT ("jobName") DO UPDATE SET
        "lastRunAt" = now(),
        "lastRunStatus" = $2,
        "lastRunDurationMs" = $3,
        "lastRunError" = $4,
        "lastRunMeta" = $5::jsonb
    `, jobName, status, durationMs, error || null, meta ? JSON.stringify(meta) : null);
  } catch {
    // Non-critical — don't fail the cron job
  }
}
