import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/soc/activity — Paginated SOC activity log */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 100);
  const actionFilter = request.nextUrl.searchParams.get('action');
  const offset = (page - 1) * limit;

  let entries;
  let total;

  if (actionFilter) {
    entries = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM soc_activity_log
      WHERE action = ${actionFilter}
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    [total] = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM soc_activity_log WHERE action = ${actionFilter}
    `;
  } else {
    entries = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM soc_activity_log
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    [total] = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM soc_activity_log
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
