import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadSocConfig, loadActiveRules, runTriagePipeline } from '@/lib/soc/engine';
import type { SecurityTicket } from '@/lib/soc/types';
import {
  generateCorrelationId,
  classifyError,
  withDbRetry,
  withCircuitBreaker,
  structuredLog,
  type LogContext,
} from '@/lib/resilience';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/soc-triage
 * Runs every 15 minutes. Detects and triages new security tickets.
 * Reads from the local `tickets` table (populated by the Autotask ticket sync cron).
 */
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const ctx: LogContext = { correlationId, operation: 'soc-triage' };

  // Auth: Vercel cron sends Authorization header
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Load config with DB retry (cold start protection)
    const config = await withDbRetry(() => loadSocConfig(), 'soc:loadConfig');

    if (!config.agent_enabled) {
      return NextResponse.json({ status: 'disabled', message: 'SOC agent is disabled', correlationId });
    }

    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ status: 'error', message: 'ANTHROPIC_API_KEY not configured', correlationId }, { status: 500 });
    }

    // Load active rules with DB retry
    const rules = await withDbRetry(() => loadActiveRules(), 'soc:loadRules');

    // Fetch unprocessed security tickets with DB retry
    const tickets = await withDbRetry(() => prisma.$queryRaw<SecurityTicket[]>`
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
    `, 'soc:fetchTickets');

    if (tickets.length === 0) {
      await updateJobStatus('soc-triage', 'success', Date.now() - startTime, {
        ticketsProcessed: 0, notesAdded: 0, falsePositives: 0,
        escalated: 0, skipped: 0, errors: 0, aiCallsMade: 0,
      });
      return NextResponse.json({ status: 'ok', message: 'No new tickets to process', ticketsFound: 0, correlationId });
    }

    structuredLog.info({ ...ctx, ticketCount: tickets.length }, `Processing ${tickets.length} tickets`);

    // Run triage pipeline with circuit breaker on Anthropic API
    const result = await withCircuitBreaker(
      () => runTriagePipeline(tickets, config, rules),
      { name: 'anthropic-api', failureThreshold: 3, resetTimeoutMs: 120_000 },
    );

    // Update job status
    await updateJobStatus('soc-triage', result.errors.length > 0 ? 'partial' : 'success', Date.now() - startTime, result.meta as unknown as Record<string, unknown>);

    const durationMs = Date.now() - startTime;
    structuredLog.info({ ...ctx, durationMs, ...result.meta }, `SOC triage completed`);

    return NextResponse.json({
      status: 'ok',
      dryRun: config.dry_run,
      ticketsFound: tickets.length,
      ...result.meta,
      errors: result.errors.length > 0 ? result.errors : undefined,
      correlationId,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const classified = classifyError(err);

    structuredLog.error(
      { ...ctx, durationMs, errorCategory: classified.category },
      `SOC triage failed: ${classified.message}`,
      err,
    );

    await updateJobStatus('soc-triage', 'failed', durationMs, null, classified.message);

    // ALWAYS return 200 for transient errors so Vercel doesn't flag them
    if (classified.isTransient) {
      return NextResponse.json({
        status: 'transient_error',
        errorCategory: classified.category,
        message: `Transient ${classified.category} error (will retry next cycle): ${classified.message}`,
        correlationId,
      });
    }

    return NextResponse.json({ status: 'error', message: classified.message, correlationId }, { status: 500 });
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
