import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

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

  const analyses = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM soc_ticket_analysis WHERE "incidentId" = ${id} ORDER BY "createdAt" ASC
  `;

  const activityLog = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM soc_activity_log WHERE "incidentId" = ${id} ORDER BY "createdAt" ASC
  `;

  return NextResponse.json({
    incident: incidents[0],
    analyses,
    activityLog,
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
