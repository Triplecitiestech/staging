import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/platform-monitor/db-latency?range=1h|1d|1w|1m
 *
 * Returns historical DB latency snapshots for graphing.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return apiError('Unauthorized', 'db-latency', 401)
  }

  const range = req.nextUrl.searchParams.get('range') || '1d'

  const rangeMs: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1m': 30 * 24 * 60 * 60 * 1000,
  }

  const ms = rangeMs[range] || rangeMs['1d']
  const since = new Date(Date.now() - ms)

  try {
    const snapshots = await prisma.$queryRawUnsafe<
      { dbLatencyMs: number; dbStatus: string; overallStatus: string; createdAt: Date }[]
    >(
      `SELECT "dbLatencyMs", "dbStatus", "overallStatus", "createdAt"
       FROM system_health_snapshots
       WHERE "createdAt" >= $1
       ORDER BY "createdAt" ASC`,
      since
    )

    return Response.json({
      range,
      since: since.toISOString(),
      count: snapshots.length,
      snapshots: snapshots.map(s => ({
        latencyMs: s.dbLatencyMs,
        status: s.dbStatus,
        overall: s.overallStatus,
        time: s.createdAt,
      })),
    })
  } catch {
    // Table may not exist yet
    return Response.json({
      range,
      since: since.toISOString(),
      count: 0,
      snapshots: [],
      warning: 'system_health_snapshots table may not exist. Run the migration endpoint.',
    })
  }
}
