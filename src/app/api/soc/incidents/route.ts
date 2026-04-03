import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAutotaskWebUrl } from '@/lib/tickets/utils';
import { apiOk, apiError, generateRequestId } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/** GET /api/soc/incidents — List SOC incidents */
export async function GET(request: NextRequest) {
  const reqId = generateRequestId();
  const session = await auth();
  if (!session?.user?.email) {
    return apiError('Unauthorized', reqId, 401);
  }

  const statusFilter = request.nextUrl.searchParams.get('status');
  const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '25', 10), 100);
  const offset = (page - 1) * limit;

  let incidents;
  let total;

  if (statusFilter) {
    incidents = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM soc_incidents WHERE status = ${statusFilter}
      ORDER BY "createdAt" DESC LIMIT ${limit} OFFSET ${offset}
    `;
    [total] = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM soc_incidents WHERE status = ${statusFilter}
    `;
  } else {
    incidents = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM soc_incidents ORDER BY "createdAt" DESC LIMIT ${limit} OFFSET ${offset}
    `;
    [total] = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM soc_incidents
    `;
  }

  return apiOk({
    incidents,
    pagination: { page, limit, total: Number(total.count), pages: Math.ceil(Number(total.count) / limit) },
    autotaskWebUrl: getAutotaskWebUrl(),
  }, reqId);
}
