import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncSingleTicket } from '@/lib/reporting/sync';
import { loadSocConfig, loadActiveRules, runTriagePipeline } from '@/lib/soc/engine';
import type { SecurityTicket } from '@/lib/soc/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * SOC real-time ingest webhook. Wire an Autotask workflow rule (Extension
 * Callout) on the Security Monitoring Alert queue to call this when a ticket is
 * created/edited. We pull that one ticket from Autotask, upsert it locally, and
 * run the SOC triage pipeline immediately — no waiting for the batch sync/cron.
 *
 * Accepts BOTH GET and POST (Extension Callout defaults to GET) and reads the
 * ticket identifier — numeric id OR ticket number (T20260527.0006) — from the
 * query string, a JSON body, or a Name-Value-Pair (form-encoded) body, under
 * any of the common key names, with a pattern-scan fallback.
 *
 * Auth (any of): Authorization: Bearer <secret>, Basic auth (secret in the
 * password field), x-soc-secret header, ?secret= query, or `secret` body field.
 * Secret = SOC_INGEST_SECRET (falls back to MIGRATION_SECRET / CRON_SECRET).
 * Idempotent: clears prior SOC records for the ticket so callout retries don't
 * create duplicate incidents.
 */
export async function GET(request: NextRequest) {
  return handle(request, {});
}

export async function POST(request: NextRequest) {
  const body = await parseBody(request);
  return handle(request, body);
}

async function handle(request: NextRequest, body: Record<string, string>): Promise<NextResponse> {
  const startTime = Date.now();
  const url = new URL(request.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { params[k] = v; });
  Object.assign(params, body);

  if (!isAuthorized(request, params)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ status: 'error', message: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  try {
    // Resolve the numeric Autotask ticket id from whatever the callout sent.
    const ticketId = await resolveTicketId(params);
    if (!ticketId) {
      return NextResponse.json({
        status: 'error',
        message: 'Could not find a ticket id or ticket number in the request.',
        receivedKeys: Object.keys(params).filter(k => k !== 'secret'),
      }, { status: 400 });
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

    // 2. Clear prior SOC records so re-ingest is idempotent.
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
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}

/** Parse a POST body as JSON or Name-Value-Pair (form-encoded). */
async function parseBody(request: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ct = request.headers.get('content-type') || '';
  try {
    const text = await request.text();
    if (!text.trim()) return out;
    if (ct.includes('application/json')) {
      const j = JSON.parse(text);
      if (j && typeof j === 'object') for (const [k, v] of Object.entries(j)) out[k] = String(v);
    } else {
      // form-urlencoded (Autotask "Name Value Pair") — fall back to JSON if it parses.
      const p = new URLSearchParams(text);
      let any = false;
      p.forEach((v, k) => { out[k] = v; any = true; });
      if (!any) {
        try { const j = JSON.parse(text); if (j && typeof j === 'object') for (const [k, v] of Object.entries(j)) out[k] = String(v); } catch { /* not json */ }
      }
    }
  } catch { /* unparseable body */ }
  return out;
}

const NUMERIC_ID_KEYS = ['ticketId', 'ticketid', 'ticketID', 'id', 'Id', 'ID', 'TicketID', 'ticket_id', 'AutotaskTicketID'];
const TICKET_NUMBER_KEYS = ['ticketNumber', 'TicketNumber', 'ticketnumber', 'ticket_number', 'Number', 'number'];
const TICKET_NUMBER_RE = /^T\d{6,}\.\d+$/i;

/** Resolve the numeric Autotask ticket id from the request params. */
async function resolveTicketId(params: Record<string, string>): Promise<string | null> {
  // 1. Explicit numeric-id key.
  for (const k of NUMERIC_ID_KEYS) {
    const v = params[k];
    if (v && /^\d{2,}$/.test(v.trim())) return v.trim();
  }
  // 2. Explicit ticket-number key → resolve to numeric id via Autotask.
  for (const k of TICKET_NUMBER_KEYS) {
    const v = params[k];
    if (v && v.trim()) {
      const id = await numberToId(v.trim());
      if (id) return id;
    }
  }
  // 3. Fallback: scan all values for an unambiguous ticket-number pattern.
  for (const [k, v] of Object.entries(params)) {
    if (k === 'secret') continue;
    if (v && TICKET_NUMBER_RE.test(v.trim())) {
      const id = await numberToId(v.trim());
      if (id) return id;
    }
  }
  return null;
}

async function numberToId(ticketNumber: string): Promise<string | null> {
  // Prefer the local table (no API call); fall back to Autotask.
  try {
    const rows = await prisma.$queryRaw<Array<{ autotaskTicketId: string }>>`
      SELECT "autotaskTicketId" FROM tickets WHERE "ticketNumber" = ${ticketNumber} LIMIT 1
    `;
    if (rows[0]?.autotaskTicketId) return rows[0].autotaskTicketId;
  } catch { /* table may not exist */ }
  try {
    const { AutotaskClient } = await import('@/lib/autotask');
    const t = await new AutotaskClient().getTicketByNumber(ticketNumber);
    if (t) return String(t.id);
  } catch { /* lookup failed */ }
  return null;
}

function isAuthorized(request: NextRequest, params: Record<string, string>): boolean {
  const secret = process.env.SOC_INGEST_SECRET || process.env.MIGRATION_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';

  if (/^Bearer\s+/i.test(header) && header.replace(/^Bearer\s+/i, '') === secret) return true;
  if (/^Basic\s+/i.test(header)) {
    try {
      const decoded = Buffer.from(header.replace(/^Basic\s+/i, ''), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
      const pass = idx >= 0 ? decoded.slice(idx + 1) : '';
      if (pass === secret || user === secret) return true;
    } catch { /* bad header */ }
  }
  if (request.headers.get('x-soc-secret') === secret) return true;
  if (params.secret === secret) return true;
  return false;
}
