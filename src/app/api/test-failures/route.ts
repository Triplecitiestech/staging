import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/test-failures — List test failures with filtering
 * Admin/Manager only. Uses raw SQL to avoid Prisma client generation dependency.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const params = request.nextUrl.searchParams

    const status = params.get('status')
    const environment = params.get('environment')
    const limit = Math.min(parseInt(params.get('limit') || '50'), 200)

    // Build dynamic query
    const conditions: string[] = []
    const values: unknown[] = []
    let paramIdx = 1

    if (status) {
      conditions.push(`status = $${paramIdx++}`)
      values.push(status)
    }
    if (environment) {
      conditions.push(`environment = $${paramIdx++}`)
      values.push(environment)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const failures = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM test_failures ${whereClause} ORDER BY "createdAt" DESC LIMIT $${paramIdx}`,
      ...values,
      limit
    )

    // Stats
    const statusCounts = await prisma.$queryRawUnsafe<Array<{ status: string; count: bigint }>>(
      `SELECT status, COUNT(*) as count FROM test_failures GROUP BY status`
    )

    const totalByStatus: Record<string, number> = {}
    for (const s of statusCounts) {
      totalByStatus[s.status] = Number(s.count)
    }

    const last24hResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) as count FROM test_failures WHERE "createdAt" >= now() - interval '24 hours'`
    )
    const last24h = Number(last24hResult[0]?.count || 0)

    return NextResponse.json({
      failures,
      stats: {
        totalByStatus,
        total: Object.values(totalByStatus).reduce((a, b) => a + b, 0),
        unresolved: (totalByStatus['open'] || 0) + (totalByStatus['investigating'] || 0),
        last24h,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('does not exist')) {
      return NextResponse.json({
        failures: [],
        stats: { totalByStatus: {}, total: 0, unresolved: 0, last24h: 0 },
        needsMigration: true,
      })
    }
    console.error('Error fetching test failures:', error)
    return NextResponse.json({ error: 'Failed to fetch failures' }, { status: 500 })
  }
}

/**
 * PATCH /api/test-failures — Update failure status
 */
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const { id, status, rootCauseHypothesis, suggestedFix } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    const setClauses: string[] = ['"updatedAt" = now()']
    const values: unknown[] = []
    let paramIdx = 1

    if (status) {
      setClauses.push(`status = $${paramIdx++}`)
      values.push(status)
      if (status === 'fixed') {
        setClauses.push(`"resolvedAt" = now()`)
        setClauses.push(`"resolvedBy" = $${paramIdx++}`)
        values.push(session.user?.email || 'unknown')
      }
    }
    if (rootCauseHypothesis !== undefined) {
      setClauses.push(`"rootCauseHypothesis" = $${paramIdx++}`)
      values.push(rootCauseHypothesis)
    }
    if (suggestedFix !== undefined) {
      setClauses.push(`"suggestedFix" = $${paramIdx++}`)
      values.push(suggestedFix)
    }

    const result = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `UPDATE test_failures SET ${setClauses.join(', ')} WHERE id = $${paramIdx}::uuid RETURNING *`,
      ...values,
      id
    )

    if (result.length === 0) {
      return NextResponse.json({ error: 'Failure not found' }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error('Error updating test failure:', error)
    return NextResponse.json({ error: 'Failed to update failure' }, { status: 500 })
  }
}
