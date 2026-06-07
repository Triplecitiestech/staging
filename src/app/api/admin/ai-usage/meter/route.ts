import { auth } from '@/auth'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// Every Anthropic-billing feature instrumented in the codebase. The meter
// merges this catalog with live api_usage_logs results so a feature shows
// up with zeros even before its first call — that way operators can
// confirm tracking is wired without waiting for traffic. Add entries here
// when you introduce a new tracked feature; the catalog is the single
// source of truth for "what does the platform spend Anthropic dollars on."
type Subsystem = 'SOC' | 'Compliance' | 'Marketing' | 'Blog' | 'Reporting' | 'Images' | 'Discovery' | 'Other'
const FEATURE_CATALOG: Record<string, { subsystem: Subsystem; label: string }> = {
  // SOC Analyst Agent — the cross-stack redesign consolidated the old
  // triage_deep / action_plan / reasoning calls into a single assessment
  // pass. `soc_triage` (screen) and `soc_assessment` (the consolidated
  // deep analysis) are the active tracking paths. The three retired
  // features are kept in the catalog so their historical rows (still
  // present in the 30d/60d windows after the rework) display grouped
  // under SOC with human labels instead of as raw snake_case under
  // 'Other'. Drop them once they age past the 60d window.
  soc_triage: { subsystem: 'SOC', label: 'Triage screen' },
  soc_assessment: { subsystem: 'SOC', label: 'Cross-stack assessment' },
  soc_triage_deep: { subsystem: 'SOC', label: 'Deep analysis (retired)' },
  soc_action_plan: { subsystem: 'SOC', label: 'Action plan (retired)' },
  soc_reasoning: { subsystem: 'SOC', label: 'Reasoning (retired)' },
  'soc-trends-recommendations': { subsystem: 'SOC', label: 'Trend recommendations' },
  'soc-rules-ai': { subsystem: 'SOC', label: 'AI rule suggestions' },
  'soc-analyst': { subsystem: 'SOC', label: 'Analyst Q&A' },
  // Compliance
  compliance_policy_generation: { subsystem: 'Compliance', label: 'Policy generation' },
  compliance_policy_analysis: { subsystem: 'Compliance', label: 'Framework analysis' },
  compliance_ai_assist: { subsystem: 'Compliance', label: 'Reviewer assist' },
  compliance_diagnose_ping: { subsystem: 'Compliance', label: 'Diagnostic ping' },
  compliance_diagnose_stamina: { subsystem: 'Compliance', label: 'Stamina probe' },
  // Marketing
  'campaign-generation': { subsystem: 'Marketing', label: 'Campaign generation' },
  'campaign-refine': { subsystem: 'Marketing', label: 'Campaign refine' },
  // Blog
  'blog-generation': { subsystem: 'Blog', label: 'Blog generation' },
  'blog-regeneration': { subsystem: 'Blog', label: 'Blog regeneration' },
  'blog-editor': { subsystem: 'Blog', label: 'Blog AI editor' },
  // Reporting
  'reports-ai-assistant': { subsystem: 'Reporting', label: 'Reports assistant' },
  // Images (OpenAI gpt-image-1)
  documents_social_image: { subsystem: 'Images', label: 'Social card background' },
  // Discovery / AI-readiness sales tooling
  'aigpa-report': { subsystem: 'Discovery', label: 'AI readiness report' },
  // Misc
  'ai-chat': { subsystem: 'Other', label: 'Admin AI chat' },
  'ai-support-review': { subsystem: 'Other', label: 'Support review' },
}

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
  subsystem: Subsystem
  label: string
  calls: number
  totalTokens: number
  costUsd: number
  tracked: boolean
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
      WHERE provider IN ('anthropic', 'openai')
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
      WHERE provider IN ('anthropic', 'openai')
        AND "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY feature
      ORDER BY "costCents" DESC
      LIMIT 50
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
      WHERE provider IN ('anthropic', 'openai')
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
      WHERE provider IN ('anthropic', 'openai')
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

    const dbByFeature = new Map<string, FeatureBreakdown>()
    for (const r of byFeatureRows) {
      const meta = FEATURE_CATALOG[r.feature]
      dbByFeature.set(r.feature, {
        feature: r.feature,
        subsystem: meta?.subsystem ?? 'Other',
        label: meta?.label ?? r.feature,
        calls: toNum(r.calls),
        totalTokens: toNum(r.totalTokens),
        costUsd: Math.round(toNum(r.costCents)) / 100,
        tracked: !!meta,
      })
    }
    // Fill in catalog entries that have no usage yet, so the operator can
    // see every tracked feature on the monitoring page — including the
    // compliance ones that were just instrumented.
    for (const [feature, meta] of Object.entries(FEATURE_CATALOG)) {
      if (!dbByFeature.has(feature)) {
        dbByFeature.set(feature, {
          feature,
          subsystem: meta.subsystem,
          label: meta.label,
          calls: 0,
          totalTokens: 0,
          costUsd: 0,
          tracked: true,
        })
      }
    }
    const SUBSYSTEM_ORDER: Subsystem[] = ['SOC', 'Compliance', 'Marketing', 'Blog', 'Reporting', 'Images', 'Discovery', 'Other']
    const byFeature: FeatureBreakdown[] = Array.from(dbByFeature.values()).sort((a, b) => {
      const subDiff = SUBSYSTEM_ORDER.indexOf(a.subsystem) - SUBSYSTEM_ORDER.indexOf(b.subsystem)
      if (subDiff !== 0) return subDiff
      return b.costUsd - a.costUsd
    })

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
