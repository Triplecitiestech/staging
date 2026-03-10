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
    const reprocess: boolean = body.reprocess || false;
    // Reprocess is heavier (3 AI calls per ticket: screen + deep + action plan)
    // so use a smaller default limit to stay within 60s function timeout
    const defaultLimit = reprocess ? 10 : 50;
    const limit = Math.min(body.limit || defaultLimit, 100);

    const config = await loadSocConfig();

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ status: 'error', message: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const rules = await loadActiveRules();

    // Check how many tickets exist in the local DB for diagnostics
    const totalTickets = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM tickets WHERE "createDate" > now() - interval '7 days'
    `;
    const ticketCount = Number(totalTickets[0]?.count || 0);

    let tickets: SecurityTicket[];

    if (ticketIds.length > 0) {
      // Process specific tickets (re-process even if already analyzed)
      tickets = await prisma.$queryRaw<SecurityTicket[]>`
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
        WHERE t."autotaskTicketId" = ANY(${ticketIds})
      `;
    } else if (reprocess) {
      // Re-process all recent security tickets (clear old analyses first)
      await prisma.$executeRawUnsafe(`
        DELETE FROM soc_ticket_analysis WHERE "processedAt" > now() - interval '7 days'
      `);
      // Clear pending actions for incidents being reprocessed
      await prisma.$executeRawUnsafe(`
        DELETE FROM soc_pending_actions WHERE "incidentId" IN (
          SELECT id FROM soc_incidents WHERE "createdAt" > now() - interval '7 days'
        )
      `);
      await prisma.$executeRawUnsafe(`
        DELETE FROM soc_incidents WHERE "createdAt" > now() - interval '7 days'
      `);
      tickets = await prisma.$queryRaw<SecurityTicket[]>`
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
        WHERE t."createDate" > now() - interval '7 days'
        AND t.status NOT IN (5, 13, 29)
        ORDER BY t."createDate" DESC
        LIMIT ${limit}
      `;
    } else {
      // Process unprocessed tickets from the existing tickets table
      // (populated by the Autotask ticket sync cron every 2 hours)
      tickets = await prisma.$queryRaw<SecurityTicket[]>`
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
        LIMIT ${limit}
      `;
    }

    if (tickets.length === 0) {
      // Provide diagnostic info so the admin knows why there are no tickets
      const alreadyAnalyzed = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM soc_ticket_analysis WHERE "processedAt" > now() - interval '7 days'
      `;

      return NextResponse.json({
        status: 'ok',
        message: ticketCount === 0
          ? 'No tickets in local database. The Autotask ticket sync cron needs to run first — trigger it via /api/reports/jobs/sync-tickets.'
          : `All ${ticketCount} recent tickets have already been analyzed (${Number(alreadyAnalyzed[0]?.count || 0)} analyses). No new tickets to process.`,
        ticketsFound: 0,
        diagnostics: {
          totalRecentTickets: ticketCount,
          alreadyAnalyzed: Number(alreadyAnalyzed[0]?.count || 0),
        },
      });
    }

    const result = await runTriagePipeline(tickets, config, rules);

    return NextResponse.json({
      status: 'ok',
      triggeredBy: session.user.email,
      dryRun: config.dry_run,
      ticketsFound: tickets.length,
      ...result.meta,
      ticketDetails: result.ticketDetails,
      errors: result.errors.length > 0 ? result.errors : undefined,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SOC Manual Run] Error:', err);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
