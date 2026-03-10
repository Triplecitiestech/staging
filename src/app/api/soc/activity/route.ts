import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/soc/activity — Paginated SOC activity log (deduplicated) */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 100);
  const actionFilter = request.nextUrl.searchParams.get('action');
  const offset = (page - 1) * limit;

  // Use DISTINCT ON to deduplicate entries with the same action + ticket + incident
  // within a 5-minute window. This keeps the most recent entry from each group.
  let entries;
  let total;

  if (actionFilter) {
    entries = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT DISTINCT ON (action, "autotaskTicketId", "incidentId",
        date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min')
        *
      FROM soc_activity_log
      WHERE action = ${actionFilter}
      ORDER BY action, "autotaskTicketId", "incidentId",
        date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min',
        "createdAt" DESC
    `;
    // Count deduplicated entries
    [total] = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM (
        SELECT DISTINCT ON (action, "autotaskTicketId", "incidentId",
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min')
          id
        FROM soc_activity_log
        WHERE action = ${actionFilter}
        ORDER BY action, "autotaskTicketId", "incidentId",
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min',
          "createdAt" DESC
      ) deduped
    `;
    // Re-query with proper sorting + pagination on the deduped set
    entries = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM (
        SELECT DISTINCT ON (action, "autotaskTicketId", "incidentId",
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min')
          *
        FROM soc_activity_log
        WHERE action = ${actionFilter}
        ORDER BY action, "autotaskTicketId", "incidentId",
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min',
          "createdAt" DESC
      ) deduped
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    [total] = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM (
        SELECT DISTINCT ON (action, "autotaskTicketId", "incidentId",
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min')
          id
        FROM soc_activity_log
        ORDER BY action, "autotaskTicketId", "incidentId",
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min',
          "createdAt" DESC
      ) deduped
    `;
    entries = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM (
        SELECT DISTINCT ON (action, "autotaskTicketId", "incidentId",
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min')
          *
        FROM soc_activity_log
        ORDER BY action, "autotaskTicketId", "incidentId",
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min',
          "createdAt" DESC
      ) deduped
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return NextResponse.json({
    entries,
    pagination: {
      page,
      limit,
      total: Number(total.count),
      pages: Math.ceil(Number(total.count) / limit),
    },
  });
}

/** DELETE /api/soc/activity — Purge duplicate activity entries, keeping only the latest per group */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const confirm = request.nextUrl.searchParams.get('confirm');
  if (confirm !== 'true') {
    // Preview mode: count how many duplicates would be removed
    const [result] = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM soc_activity_log
      WHERE id NOT IN (
        SELECT DISTINCT ON (action, "autotaskTicketId", "incidentId",
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min')
          id
        FROM soc_activity_log
        ORDER BY action, "autotaskTicketId", "incidentId",
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min',
          "createdAt" DESC
      )
    `;
    return NextResponse.json({
      preview: true,
      duplicatesFound: Number(result.count),
      message: `Found ${Number(result.count)} duplicate entries. Add ?confirm=true to delete them.`,
    });
  }

  // Actually delete duplicates
  const deleted = await prisma.$executeRawUnsafe(`
    DELETE FROM soc_activity_log
    WHERE id NOT IN (
      SELECT DISTINCT ON (action, "autotaskTicketId", "incidentId",
        date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min')
        id
      FROM soc_activity_log
      ORDER BY action, "autotaskTicketId", "incidentId",
        date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 5) * interval '5 min',
        "createdAt" DESC
    )
  `);

  return NextResponse.json({
    success: true,
    duplicatesRemoved: deleted,
  });
}
