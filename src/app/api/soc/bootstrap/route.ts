import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadSocConfig, loadActiveRules, runTriagePipeline } from '@/lib/soc/engine';
import type { SecurityTicket } from '@/lib/soc/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/soc/bootstrap — Analyze historical tickets to seed FP patterns.
 * Requires MIGRATION_SECRET auth. Processes in batches with cursor.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.MIGRATION_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const body = await request.json().catch(() => ({}));
    const daysBack = Math.min(body.daysBack || 90, 180);
    const batchSize = Math.min(body.batchSize || 50, 100);
    const cursor = body.cursor || null; // autotaskTicketId to resume from

    const config = await loadSocConfig();
    // Force dry-run for bootstrap — never add notes for historical tickets
    config.dry_run = true;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ status: 'error', message: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const rules = await loadActiveRules();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    let tickets: SecurityTicket[];

    if (cursor) {
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
        AND t."createDate" >= ${cutoff}
        AND t."autotaskTicketId" > ${cursor}
        ORDER BY t."autotaskTicketId" ASC
        LIMIT ${batchSize}
      `;
    } else {
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
        AND t."createDate" >= ${cutoff}
        ORDER BY t."autotaskTicketId" ASC
        LIMIT ${batchSize}
      `;
    }

    if (tickets.length === 0) {
      return NextResponse.json({
        status: 'complete',
        message: 'No more tickets to bootstrap',
        durationMs: Date.now() - startTime,
      });
    }

    const result = await runTriagePipeline(tickets, config, rules);

    const nextCursor = tickets[tickets.length - 1].autotaskTicketId;

    return NextResponse.json({
      status: 'ok',
      batch: {
        processed: tickets.length,
        cursor: nextCursor,
        hasMore: tickets.length === batchSize,
      },
      ...result.meta,
      errors: result.errors.length > 0 ? result.errors : undefined,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SOC Bootstrap] Error:', err);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
