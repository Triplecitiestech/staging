import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/sync-logs
 *
 * Returns paginated, sortable, searchable Autotask sync logs.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25')))
    const sortBy = searchParams.get('sortBy') ?? 'startedAt'
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'
    const status = searchParams.get('status') // 'success', 'partial', 'failed'
    const search = searchParams.get('search') // search in syncType, errors

    const { prisma } = await import('@/lib/prisma')

    // Build where clause
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { syncType: { contains: search, mode: 'insensitive' } },
        { errors: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Validate sortBy against allowed columns
    const allowedSorts = ['startedAt', 'completedAt', 'status', 'durationMs', 'syncType']
    const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'startedAt'

    const [logs, total] = await Promise.all([
      prisma.autotaskSyncLog.findMany({
        where,
        orderBy: { [safeSortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.autotaskSyncLog.count({ where }),
    ])

    // Get aggregate stats
    const stats = await prisma.autotaskSyncLog.aggregate({
      _count: true,
      _avg: { durationMs: true },
      where: { startedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    })

    const statusCounts = await prisma.$queryRawUnsafe<{ status: string; count: number }[]>(
      `SELECT status, COUNT(*)::int as count FROM autotask_sync_logs WHERE "startedAt" >= NOW() - INTERVAL '30 days' GROUP BY status`
    ).catch(() => [])

    return NextResponse.json({
      logs: logs.map(log => ({
        ...log,
        errors: log.errors ? JSON.parse(log.errors) : [],
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: {
        total30d: stats._count,
        avgDurationMs: Math.round(stats._avg?.durationMs ?? 0),
        statusCounts: statusCounts.reduce(
          (acc, s) => ({ ...acc, [s.status]: s.count }),
          {} as Record<string, number>
        ),
      },
    })
  } catch (error) {
    console.error('[sync-logs] Error:', error)
    return NextResponse.json({ error: 'Failed to load sync logs' }, { status: 500 })
  }
}
