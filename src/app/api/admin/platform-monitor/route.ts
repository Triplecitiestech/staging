import { auth } from '@/auth'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import { gatherMetrics, DEFAULT_THRESHOLDS } from '@/lib/threshold-alerter'

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

    // Auto-heal threshold limits from code defaults. The ON CONFLICT in
    // the migrate route now re-syncs limits, but operators forget to
    // re-run migrate — so make the code's DEFAULT_THRESHOLDS the actual
    // source of truth by reconciling on every GET. Each UPDATE only
    // fires when something actually differs, so it's a no-op once the
    // DB matches the code (the common case).
    void ensureThresholdLimits(prisma)

    // Fetch all data in parallel
    const [
      aiUsageSummary,
      aiUsageByDay,
      aiUsageByFeature,
      dbTableSizes,
      thresholds,
      recentErrors,
      liveThresholdMetrics,
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

      // Live threshold values — recomputed on every GET so the dashboard
      // doesn't depend on the threshold-check cron (there is none) or on
      // anyone manually clicking "Run Threshold Check". Without this,
      // platform_thresholds.currentValue stays stuck at its seeded 0 and
      // every meter on the page reads 0/limit.
      gatherMetrics(prisma).catch((err) => {
        console.error('[platform-monitor] gatherMetrics failed', err)
        return [] as Array<{ metricKey: string; currentValue: number }>
      }),
    ])

    // Calculate DB total size. Postgres ::bigint casts come back as
    // JavaScript BigInt; deepNumberize() before returning JSON or
    // NextResponse.json will throw "Do not know how to serialize a
    // BigInt" — which is exactly what was making MonitoringDashboardClient
    // silently fail with "Platform monitoring data is loading or session
    // is initializing." The AI Spend Meter route avoids this by passing
    // every value through a toNum helper; do the equivalent here.
    const tables = (dbTableSizes.status === 'fulfilled' ? deepNumberize(dbTableSizes.value) : []) as { rowCount: number; sizeBytes: number; tableName: string }[]
    // Top-30 sums — used ONLY as a fallback. The dbTableSizes query is
    // capped at LIMIT 30 for the display list, so summing it undercounts
    // the real totals on a 35+ table schema (this was the 953.7 MB vs
    // 972.64 MB split the operator caught).
    const topTablesRows = tables.reduce((sum, t) => sum + Number(t.rowCount), 0)
    const topTablesBytes = tables.reduce((sum, t) => sum + Number(t.sizeBytes), 0)

    // Live threshold metrics (gatherMetrics) cover ALL tables. Prefer
    // them for the Database section totals so the page shows ONE DB size,
    // matching the "Database Storage" / "Database Total Rows" meters.
    const liveMetrics = liveThresholdMetrics.status === 'fulfilled' && Array.isArray(liveThresholdMetrics.value)
      ? (liveThresholdMetrics.value as Array<{ metricKey: string; currentValue: number }>)
      : []
    const liveByKey = new Map(liveMetrics.map((m) => [m.metricKey, Number(m.currentValue) || 0]))

    const totalRows = liveByKey.get('db_rows_total') ?? topTablesRows
    const totalSizeMB = liveByKey.get('db_storage_mb') ?? Math.round(topTablesBytes / 1024 / 1024 * 100) / 100

    return apiOk({
      aiUsage: {
        summary: aiUsageSummary.status === 'fulfilled' ? deepNumberize(aiUsageSummary.value) : [],
        byDay: aiUsageByDay.status === 'fulfilled' ? deepNumberize(aiUsageByDay.value) : [],
        byFeature: aiUsageByFeature.status === 'fulfilled' ? deepNumberize(aiUsageByFeature.value) : [],
      },
      database: {
        tables: tables.slice(0, 20),
        totalRows,
        totalSizeBytes: Math.round(totalSizeMB * 1024 * 1024),
        totalSizeMB,
      },
      thresholds: thresholds.status === 'fulfilled' ? mergeLiveValues(deepNumberize(thresholds.value), liveByKey) : [],
      errorTrend: recentErrors.status === 'fulfilled' ? deepNumberize(recentErrors.value) : [],
    }, reqId)
  } catch (error) {
    console.error('[platform-monitor] Error:', error)
    return apiError('Failed to load platform metrics', reqId, 500)
  }
}

/**
 * Reconcile platform_thresholds rows with DEFAULT_THRESHOLDS in code.
 * The conditional WHERE means each statement is a no-op once values
 * match; mismatches get corrected. Fire-and-forget — failure here
 * doesn't block the dashboard from rendering with the stored values.
 */
async function ensureThresholdLimits(
  prisma: { $executeRawUnsafe: (q: string, ...args: unknown[]) => Promise<number> },
): Promise<void> {
  for (const def of DEFAULT_THRESHOLDS) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE platform_thresholds
         SET "limitValue" = $1, unit = $2, "displayName" = $3, provider = $4, "updatedAt" = NOW()
         WHERE "metricKey" = $5
           AND ("limitValue" != $1 OR unit != $2 OR "displayName" != $3 OR provider != $4)`,
        def.limitValue, def.unit, def.displayName, def.provider, def.metricKey,
      )
    } catch (err) {
      console.error('[platform-monitor] ensureThresholdLimits', def.metricKey, err)
    }
  }
}

async function safeQuery(prisma: { $queryRawUnsafe: (q: string) => Promise<unknown[]> }, sql: string): Promise<unknown[]> {
  try {
    return await prisma.$queryRawUnsafe(sql)
  } catch (err) {
    // Don't swallow silently — log it so an operator can see which
    // sub-query failed (the parent route already gracefully degrades
    // by returning [] for any failed sub-query, so this is purely for
    // diagnosis, not for changing behavior).
    console.error('[platform-monitor] safeQuery failed', {
      sqlSnippet: sql.trim().split('\n')[0]?.slice(0, 120),
      error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    })
    return []
  }
}

/**
 * Recursively walk an object/array and convert every BigInt to a
 * regular Number. Postgres `::bigint` casts via Prisma's $queryRawUnsafe
 * return BigInt values, which throw on JSON.stringify. Every numeric
 * field on this dashboard fits comfortably in a Number, so the lossy
 * conversion is safe.
 *
 * CRITICAL: only recurse into PLAIN objects + arrays. Postgres `date`
 * columns come back as Date instances and Postgres `numeric` columns
 * come back as Prisma Decimal instances — both have prototypes and
 * empty `Object.entries`, so naive recursion strips them to `{}` and
 * the client ends up with `new Date({})` → Invalid Date and
 * `Number({})` → NaN. JSON.stringify already handles both via their
 * native toJSON() methods, so leaving them untouched is correct.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Override each threshold row's stored currentValue with the freshly-
 * gathered live value (keyed by metricKey). The stored column is only
 * updated by the threshold-check POST route, which has no cron — so
 * without this merge every meter on the page would read its initial
 * seed value (almost always 0) even when the real usage is dramatic.
 */
function mergeLiveValues(stored: unknown, liveByKey: Map<string, number>): unknown {
  if (!Array.isArray(stored)) return stored
  if (liveByKey.size === 0) return stored
  return stored.map((row) => {
    if (!row || typeof row !== 'object') return row
    const r = row as Record<string, unknown>
    const liveVal = liveByKey.get(r.metricKey as string)
    if (liveVal == null) return row
    return { ...r, currentValue: liveVal }
  })
}

function deepNumberize(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value)
  if (Array.isArray(value)) return value.map(deepNumberize)
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepNumberize(v)
    }
    return out
  }
  return value
}
