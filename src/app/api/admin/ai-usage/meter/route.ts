import { auth } from '@/auth'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

interface WindowMetrics {
  window: '1h' | '24h' | '7d' | '30d' | '60d'
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  errorCount: number
  avgDurationMs: number
}

interface FeatureBreakdown {
  feature: string
  calls: number
  totalTokens: number
  costUsd: number
}

interface ModelBreakdown {
  model: string | null
  calls: number
  totalTokens: number
  costUsd: number
}

interface DailyPoint {
  date: string
  calls: number
  totalTokens: number
  costUsd: number
}

const WINDOWS: { key: WindowMetrics['window']; interval: string }[] = [
  { key: '1h', interval: '1 hour' },
  { key: '24h', interval: '24 hours' },
  { key: '7d', interval: '7 days' },
  { key: '30d', interval: '30 days' },
  { key: '60d', interval: '60 days' },
]

type Sql = { $queryRawUnsafe: (q: string) => Promise<unknown[]> }

async function safeQuery<T>(prisma: Sql, sql: string): Promise<T[]> {
  try {
    return (await prisma.$queryRawUnsafe(sql)) as T[]
  } catch {
    return []
  }
}

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function GET() {
  const reqId = generateRequestId()
  try {
    const session = await auth()
    if (!session) return apiError('Unauthorized', reqId, 401)

    const { prisma } = await import('@/lib/prisma')

    // 5 window summary rows + by-feature (30d) + by-model (30d) + 60d daily sparkline
    const windowQueries = WINDOWS.map(w => safeQuery<{
      calls: unknown
      inputTokens: unknown
      outputTokens: unknown
      totalTokens: unknown
      costCents: unknown
      errorCount: unknown
      avgDurationMs: unknown
    }>(prisma as Sql, `
      SELECT
        COUNT(*)::int as calls,
        COALESCE(SUM("inputTokens"), 0)::bigint as "inputTokens",
        COALESCE(SUM("outputTokens"), 0)::bigint as "outputTokens",
        COALESCE(SUM("totalTokens"), 0)::bigint as "totalTokens",
        COALESCE(SUM("costCents"), 0)::numeric as "costCents",
        COUNT(CASE WHEN error IS NOT NULL THEN 1 END)::int as "errorCount",
        ROUND(COALESCE(AVG("durationMs"), 0)::numeric) as "avgDurationMs"
      FROM api_usage_logs
      WHERE provider = 'anthropic'
        AND "createdAt" >= NOW() - INTERVAL '${w.interval}'
    `))

    const byFeatureQuery = safeQuery<{
      feature: string
      calls: unknown
      totalTokens: unknown
      costCents: unknown
    }>(prisma as Sql, `
      SELECT
        feature,
        COUNT(*)::int as calls,
        COALESCE(SUM("totalTokens"), 0)::bigint as "totalTokens",
        COALESCE(SUM("costCents"), 0)::numeric as "costCents"
      FROM api_usage_logs
      WHERE provider = 'anthropic'
        AND "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY feature
      ORDER BY "costCents" DESC
      LIMIT 12
    `)

    const byModelQuery = safeQuery<{
      model: string | null
      calls: unknown
      totalTokens: unknown
      costCents: unknown
    }>(prisma as Sql, `
      SELECT
        model,
        COUNT(*)::int as calls,
        COALESCE(SUM("totalTokens"), 0)::bigint as "totalTokens",
        COALESCE(SUM("costCents"), 0)::numeric as "costCents"
      FROM api_usage_logs
      WHERE provider = 'anthropic'
        AND "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY model
      ORDER BY "costCents" DESC
    `)

    const dailyQuery = safeQuery<{
      date: string
      calls: unknown
      totalTokens: unknown
      costCents: unknown
    }>(prisma as Sql, `
      SELECT
        DATE("createdAt") as date,
        COUNT(*)::int as calls,
        COALESCE(SUM("totalTokens"), 0)::bigint as "totalTokens",
        COALESCE(SUM("costCents"), 0)::numeric as "costCents"
      FROM api_usage_logs
      WHERE provider = 'anthropic'
        AND "createdAt" >= NOW() - INTERVAL '60 days'
      GROUP BY DATE("createdAt")
      ORDER BY date
    `)

    const [windowResults, byFeatureRows, byModelRows, dailyRows] = await Promise.all([
      Promise.all(windowQueries),
      byFeatureQuery,
      byModelQuery,
      dailyQuery,
    ])

    const windows: WindowMetrics[] = WINDOWS.map((w, i) => {
      const row = windowResults[i][0] ?? {} as Record<string, unknown>
      return {
        window: w.key,
        calls: toNum((row as { calls?: unknown }).calls),
        inputTokens: toNum((row as { inputTokens?: unknown }).inputTokens),
        outputTokens: toNum((row as { outputTokens?: unknown }).outputTokens),
        totalTokens: toNum((row as { totalTokens?: unknown }).totalTokens),
        costUsd: Math.round(toNum((row as { costCents?: unknown }).costCents)) / 100,
        errorCount: toNum((row as { errorCount?: unknown }).errorCount),
        avgDurationMs: toNum((row as { avgDurationMs?: unknown }).avgDurationMs),
      }
    })

    const byFeature: FeatureBreakdown[] = byFeatureRows.map(r => ({
      feature: r.feature,
      calls: toNum(r.calls),
      totalTokens: toNum(r.totalTokens),
      costUsd: Math.round(toNum(r.costCents)) / 100,
    }))

    const byModel: ModelBreakdown[] = byModelRows.map(r => ({
      model: r.model,
      calls: toNum(r.calls),
      totalTokens: toNum(r.totalTokens),
      costUsd: Math.round(toNum(r.costCents)) / 100,
    }))

    const daily: DailyPoint[] = dailyRows.map(r => ({
      date: typeof r.date === 'string' ? r.date : new Date(r.date as string).toISOString().slice(0, 10),
      calls: toNum(r.calls),
      totalTokens: toNum(r.totalTokens),
      costUsd: Math.round(toNum(r.costCents)) / 100,
    }))

    return apiOk({ windows, byFeature, byModel, daily, generatedAt: new Date().toISOString() }, reqId)
  } catch (err) {
    console.error('[ai-usage-meter] error', err)
    return apiError('Failed to load AI usage meter', reqId, 500)
  }
}
