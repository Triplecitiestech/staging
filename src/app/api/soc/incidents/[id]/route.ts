import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAutotaskWebUrl } from '@/lib/tickets/utils';

export const dynamic = 'force-dynamic';

/** GET /api/soc/incidents/[id] — Incident detail with related ticket analyses */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const incidents = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM soc_incidents WHERE id = ${id}
  `;

  if (!incidents.length) {
    return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  }

  // Get analyses with full ticket context (company, status, priority, queue, etc.)
  const analyses = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      sa.*,
      t.title as "ticketTitle",
      t.description as "ticketDescription",
      t.status as "ticketStatus",
      t."statusLabel" as "ticketStatusLabel",
      t.priority as "ticketPriority",
      t."priorityLabel" as "ticketPriorityLabel",
      t."queueId" as "ticketQueueId",
      t."queueLabel" as "ticketQueueLabel",
      t.source as "ticketSource",
      t."sourceLabel" as "ticketSourceLabel",
      t."createDate"::text as "ticketCreateDate",
      t."ticketNumber" as "ticketNumberFromTicket",
      c."displayName" as "companyName",
      c.slug as "companySlug"
    FROM soc_ticket_analysis sa
    LEFT JOIN tickets t ON t."autotaskTicketId" = sa."autotaskTicketId"
    LEFT JOIN companies c ON c.id = sa."companyId"
    WHERE sa."incidentId" = ${id}
    ORDER BY sa."createdAt" ASC
  `;

  // Fetch ticket notes for each ticket in the incident
  const ticketIds = analyses.map(a => (a as Record<string, unknown>).autotaskTicketId).filter(Boolean) as string[];
  let ticketNotes: Array<Record<string, unknown>> = [];
  if (ticketIds.length > 0) {
    try {
      ticketNotes = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM ticket_notes
        WHERE "ticketId" IN (SELECT unnest(${ticketIds}::text[]))
        ORDER BY "createDateTime" DESC
      `;
    } catch {
      // ticket_notes table may not exist — non-fatal
    }
  }

  const activityLog = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM soc_activity_log WHERE "incidentId" = ${id} ORDER BY "createdAt" ASC
  `;

  // Enrich incident with company name from analyses if not already set
  const incident = incidents[0] as Record<string, unknown>;
  if (!incident.companyName && analyses.length > 0) {
    incident.companyName = (analyses[0] as Record<string, unknown>).companyName;
  }

  return NextResponse.json({
    incident,
    analyses,
    ticketNotes,
    activityLog,
    autotaskWebUrl: getAutotaskWebUrl(),
  });
}

/** PUT /api/soc/incidents/[id] — Admin override of incident verdict */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email || !['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { verdict, status: newStatus } = body;

  if (verdict) {
    await prisma.$executeRawUnsafe(`
      UPDATE soc_incidents SET verdict = $1, "resolvedAt" = CASE WHEN $2 = 'resolved' THEN now() ELSE "resolvedAt" END WHERE id = $3
    `, verdict, newStatus || 'open', id);
  }

  if (newStatus) {
    await prisma.$executeRawUnsafe(`
      UPDATE soc_incidents SET status = $1, "resolvedAt" = CASE WHEN $1 = 'resolved' THEN now() ELSE "resolvedAt" END WHERE id = $2
    `, newStatus, id);
  }

  // Log the override
  await prisma.$executeRawUnsafe(`
    INSERT INTO soc_activity_log (id, "incidentId", action, detail, metadata)
    VALUES (gen_random_uuid()::text, $1, 'override', $2, $3::jsonb)
  `, id, `Admin override by ${session.user.email}`, JSON.stringify({ verdict, status: newStatus, overriddenBy: session.user.email }));

  return NextResponse.json({ success: true });
}
