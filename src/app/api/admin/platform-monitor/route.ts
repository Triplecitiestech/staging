import { auth } from '@/auth'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/platform-monitor
 *
 * Returns platform usage metrics, thresholds, and AI token usage data.
 * Used by the monitoring dashboard for graphs and alerting.
 */
export async function GET() {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session) {
      return apiError('Unauthorized', reqId, 401)
    }

    const { prisma } = await import('@/lib/prisma')

    // Fetch all data in parallel
    const [
      aiUsageSummary,
      aiUsageByDay,
      aiUsageByFeature,
      dbTableSizes,
      thresholds,
      recentErrors,
    ] = await Promise.allSettled([
      // AI usage summary (last 30 days)
      safeQuery(prisma, `
        SELECT
          provider,
          COUNT(*)::int as "totalCalls",
          COALESCE(SUM("inputTokens"), 0)::bigint as "totalInputTokens",
          COALESCE(SUM("outputTokens"), 0)::bigint as "totalOutputTokens",
          COALESCE(SUM("totalTokens"), 0)::bigint as "totalTokens",
          ROUND(COALESCE(SUM("costCents"), 0)::numeric, 2) as "totalCostCents",
          ROUND(COALESCE(AVG("durationMs"), 0)::numeric) as "avgDurationMs",
          COUNT(CASE WHEN error IS NOT NULL THEN 1 END)::int as "errorCount"
        FROM api_usage_logs
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY provider
      `),

      // AI usage by day (last 30 days)
      safeQuery(prisma, `
        SELECT
          DATE("createdAt") as date,
          COUNT(*)::int as calls,
          COALESCE(SUM("totalTokens"), 0)::bigint as tokens,
          ROUND(COALESCE(SUM("costCents"), 0)::numeric, 2) as "costCents"
        FROM api_usage_logs
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
          AND provider = 'anthropic'
        GROUP BY DATE("createdAt")
        ORDER BY date
      `),

      // AI usage by feature
      safeQuery(prisma, `
        SELECT
          feature,
          COUNT(*)::int as calls,
          COALESCE(SUM("totalTokens"), 0)::bigint as tokens,
          ROUND(COALESCE(SUM("costCents"), 0)::numeric, 2) as "costCents",
          ROUND(COALESCE(AVG("durationMs"), 0)::numeric) as "avgMs"
        FROM api_usage_logs
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
          AND provider = 'anthropic'
        GROUP BY feature
        ORDER BY tokens DESC
      `),

      // Database table sizes
      safeQuery(prisma, `
        SELECT
          relname as "tableName",
          n_live_tup::bigint as "rowCount",
          pg_total_relation_size(quote_ident(relname))::bigint as "sizeBytes"
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
        LIMIT 30
      `),

      // Platform thresholds
      safeQuery(prisma, `
        SELECT * FROM platform_thresholds WHERE "isActive" = true ORDER BY provider, "metricKey"
      `),

      // Recent error count by day
      safeQuery(prisma, `
        SELECT
          DATE("lastSeen") as date,
          COUNT(*)::int as count,
          SUM(count)::int as "totalOccurrences"
        FROM error_logs
        WHERE "lastSeen" >= NOW() - INTERVAL '30 days'
        GROUP BY DATE("lastSeen")
        ORDER BY date
      `),
    ])

    // Calculate DB total size
    const tables = (dbTableSizes.status === 'fulfilled' ? dbTableSizes.value : []) as { rowCount: number; sizeBytes: number; tableName: string }[]
    const totalDbRows = tables.reduce((sum, t) => sum + Number(t.rowCount), 0)
    const totalDbBytes = tables.reduce((sum, t) => sum + Number(t.sizeBytes), 0)

    return apiOk({
      aiUsage: {
        summary: aiUsageSummary.status === 'fulfilled' ? aiUsageSummary.value : [],
        byDay: aiUsageByDay.status === 'fulfilled' ? aiUsageByDay.value : [],
        byFeature: aiUsageByFeature.status === 'fulfilled' ? aiUsageByFeature.value : [],
      },
      database: {
        tables: tables.slice(0, 20),
        totalRows: totalDbRows,
        totalSizeBytes: totalDbBytes,
        totalSizeMB: Math.round(totalDbBytes / 1024 / 1024 * 100) / 100,
      },
      thresholds: thresholds.status === 'fulfilled' ? thresholds.value : [],
      errorTrend: recentErrors.status === 'fulfilled' ? recentErrors.value : [],
    }, reqId)
  } catch (error) {
    console.error('[platform-monitor] Error:', error)
    return apiError('Failed to load platform metrics', reqId, 500)
  }
}

async function safeQuery(prisma: { $queryRawUnsafe: (q: string) => Promise<unknown[]> }, sql: string): Promise<unknown[]> {
  try {
    return await prisma.$queryRawUnsafe(sql)
  } catch {
    return []
  }
}
