import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncSingleTicket } from '@/lib/reporting/sync';
import { loadSocConfig, loadActiveRules, runTriagePipeline } from '@/lib/soc/engine';
import type { SecurityTicket } from '@/lib/soc/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/soc/ingest — real-time SOC ingest webhook.
 *
 * Wire an Autotask workflow rule (Extension Callout) on the Security Monitoring
 * Alert queue to POST here when a ticket is created. We pull that one ticket
 * from Autotask, upsert it locally, and run the SOC triage pipeline on it
 * immediately — instead of waiting for the 2-hour batch sync + hourly cron.
 *
 * Auth: SOC_INGEST_SECRET (falls back to MIGRATION_SECRET / CRON_SECRET) via
 * `Authorization: Bearer <secret>`, `?secret=`, an `x-soc-secret` header, or a
 * `secret` body field — so it works with whatever Autotask can send.
 *
 * Ticket ID is read from `?ticketId=`, or body `ticketId` / `id` / `TicketID`.
 * Idempotent: re-ingesting the same ticket clears its prior SOC records first,
 * so Autotask callout retries don't create duplicate incidents.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { /* may be empty/form */ }

  if (!isAuthorized(request, body)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawId =
    url.searchParams.get('ticketId') ||
    asStr(body.ticketId) || asStr(body.id) || asStr(body.TicketID) || asStr(body.ticket_id);
  if (!rawId) {
    return NextResponse.json({ error: 'Missing ticketId' }, { status: 400 });
  }
  const ticketId = String(rawId).trim();

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ status: 'error', message: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    // 1. Pull this one ticket from Autotask into the local tickets table.
    const sync = await syncSingleTicket(ticketId);
    if (!sync.synced) {
      return NextResponse.json({ status: 'skipped', reason: sync.reason, ticketId });
    }

    const config = await loadSocConfig();
    if (!config.agent_enabled) {
      return NextResponse.json({ status: 'skipped', reason: 'SOC agent disabled', ticketId });
    }

    // 2. Clear any prior SOC records for this ticket so re-ingest is idempotent.
    await Promise.all([
      prisma.$executeRawUnsafe(`DELETE FROM soc_pending_actions WHERE "autotaskTicketId" = $1`, ticketId),
      prisma.$executeRawUnsafe(`DELETE FROM soc_pending_actions WHERE "incidentId" IN (SELECT id FROM soc_incidents WHERE "primaryTicketId" = $1)`, ticketId),
    ]);
    await prisma.$executeRawUnsafe(`DELETE FROM soc_incidents WHERE "primaryTicketId" = $1`, ticketId);
    await prisma.$executeRawUnsafe(`DELETE FROM soc_ticket_analysis WHERE "autotaskTicketId" = $1`, ticketId);

    // 3. Build the SecurityTicket and run the pipeline on just this ticket.
    const tickets = await prisma.$queryRaw<SecurityTicket[]>`
      SELECT
        t."autotaskTicketId", t."ticketNumber", t."companyId",
        c."displayName" as "companyName",
        t.title, t.description, t.status, t."statusLabel",
        t.priority, t."priorityLabel", t."queueId", t."queueLabel",
        t.source, t."sourceLabel", t."createDate"::text as "createDate"
      FROM tickets t
      LEFT JOIN companies c ON c.id = t."companyId"
      WHERE t."autotaskTicketId" = ${ticketId}
    `;
    if (tickets.length === 0) {
      return NextResponse.json({ status: 'skipped', reason: 'Ticket not found locally after sync', ticketId });
    }

    const rules = await loadActiveRules();
    const result = await runTriagePipeline(tickets, config, rules);

    return NextResponse.json({
      status: 'ok',
      ticketId,
      dryRun: config.dry_run,
      ...result.meta,
      ticketDetails: result.ticketDetails,
      errors: result.errors.length > 0 ? result.errors : undefined,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SOC Ingest] Error:', err);
    return NextResponse.json({ status: 'error', message, ticketId }, { status: 500 });
  }
}

function asStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function isAuthorized(request: NextRequest, body: Record<string, unknown>): boolean {
  const secret = process.env.SOC_INGEST_SECRET || process.env.MIGRATION_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  const url = new URL(request.url);
  const provided =
    (header && header.replace(/^Bearer\s+/i, '')) ||
    request.headers.get('x-soc-secret') ||
    url.searchParams.get('secret') ||
    asStr(body.secret);
  return provided === secret;
}
