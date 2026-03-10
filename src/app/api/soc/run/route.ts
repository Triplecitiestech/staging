import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { loadSocConfig, loadActiveRules, runTriagePipeline } from '@/lib/soc/engine';
import type { SecurityTicket } from '@/lib/soc/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/soc/run — Manual trigger for SOC triage pipeline */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const startTime = Date.now();

  try {
    const body = await request.json().catch(() => ({}));
    const ticketIds: string[] = body.ticketIds || [];
    const limit = Math.min(body.limit || 50, 100);

    const config = await loadSocConfig();

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ status: 'error', message: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const rules = await loadActiveRules();

    let tickets: SecurityTicket[];

    if (ticketIds.length > 0) {
      // Process specific tickets (re-process even if already analyzed)
      tickets = await prisma.$queryRaw<SecurityTicket[]>`
        SELECT
          t."autotaskTicketId",
          t."ticketNumber",
          t."companyId",
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
        WHERE t."autotaskTicketId" = ANY(${ticketIds})
      `;
    } else {
      // Process unprocessed tickets (same as cron)
      tickets = await prisma.$queryRaw<SecurityTicket[]>`
        SELECT
          t."autotaskTicketId",
          t."ticketNumber",
          t."companyId",
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
        WHERE NOT EXISTS (
          SELECT 1 FROM soc_ticket_analysis sa
          WHERE sa."autotaskTicketId" = t."autotaskTicketId"
        )
        AND t."createDate" > now() - interval '7 days'
        AND t.status NOT IN (5, 13, 29)
        ORDER BY t."createDate" DESC
        LIMIT ${limit}
      `;
    }

    if (tickets.length === 0) {
      return NextResponse.json({ status: 'ok', message: 'No tickets to process', ticketsFound: 0 });
    }

    const result = await runTriagePipeline(tickets, config, rules);

    return NextResponse.json({
      status: 'ok',
      triggeredBy: session.user.email,
      dryRun: config.dry_run,
      ticketsFound: tickets.length,
      ...result.meta,
      errors: result.errors.length > 0 ? result.errors : undefined,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SOC Manual Run] Error:', err);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
