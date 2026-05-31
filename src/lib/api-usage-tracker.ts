/**
 * API Usage Tracker
 *
 * Tracks token usage, costs, and performance for all external API calls.
 * Logs to the api_usage_logs table for monitoring and alerting.
 */

import type { PrismaClient } from '@prisma/client'

// Anthropic pricing in cents per 1M tokens.
// Sonnet family (4, 4.5, 4.6, 4.7) all bill at $3 input / $15 output per 1M.
// Opus family bills at $15 input / $75 output per 1M.
// Haiku 4.5 bills at $0.80 input / $4 output per 1M.
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 300, output: 1500 },
  'claude-sonnet-4-7': { input: 300, output: 1500 },
  'claude-sonnet-4-5-20250929': { input: 300, output: 1500 },
  'claude-sonnet-4-20250514': { input: 300, output: 1500 },
  'claude-opus-4-6': { input: 1500, output: 7500 },
  'claude-opus-4-7': { input: 1500, output: 7500 },
  'claude-haiku-4-5-20251001': { input: 80, output: 400 },
}

function resolvePricing(model: string | undefined): { input: number; output: number } | null {
  if (!model) return null
  if (ANTHROPIC_PRICING[model]) return ANTHROPIC_PRICING[model]
  // Fallback by family — protects against new dated suffixes (e.g. claude-sonnet-4-6-20260101).
  if (model.includes('opus')) return ANTHROPIC_PRICING['claude-opus-4-7']
  if (model.includes('haiku')) return ANTHROPIC_PRICING['claude-haiku-4-5-20251001']
  if (model.includes('sonnet')) return ANTHROPIC_PRICING['claude-sonnet-4-7']
  return null
}

interface TrackApiUsageParams {
  provider: string
  feature: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  /** Explicit cost in cents. Use for providers not priced by the Anthropic token table (e.g. OpenAI images). */
  costCents?: number
  durationMs?: number
  statusCode?: number
  error?: string
  metadata?: Record<string, unknown>
}

function estimateCostCents(model: string | undefined, inputTokens: number, outputTokens: number): number {
  const pricing = resolvePricing(model)
  if (!pricing) return 0
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

export async function trackApiUsage(params: TrackApiUsageParams): Promise<void> {
  try {
    const { prisma } = await import('@/lib/prisma')
    const inputTokens = params.inputTokens ?? 0
    const outputTokens = params.outputTokens ?? 0
    const totalTokens = inputTokens + outputTokens
    const costCents = params.costCents ?? estimateCostCents(params.model, inputTokens, outputTokens)

    await (prisma as PrismaClient & Record<string, unknown>).$executeRawUnsafe(
      `INSERT INTO api_usage_logs (id, provider, feature, model, "inputTokens", "outputTokens", "totalTokens", "costCents", "durationMs", "statusCode", error, metadata, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW())`,
      params.provider,
      params.feature,
      params.model ?? null,
      inputTokens,
      outputTokens,
      totalTokens,
      costCents,
      params.durationMs ?? null,
      params.statusCode ?? null,
      params.error ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null
    )
  } catch {
    // Don't let tracking failures break the main flow
    console.error('[api-usage-tracker] Failed to log usage (table may not exist yet)')
  }
}

/**
 * Wrap an Anthropic API call to automatically track usage.
 *
 * NOTE: Anthropic bills cache-write tokens at 1.25x (5-min) or 2x (1-hour)
 * the standard input rate, and cache-read tokens at 0.1x. Both arrive in
 * the response as `cache_creation_input_tokens` / `cache_read_input_tokens`
 * — separate from the unmarked `input_tokens` (which only reflects the
 * uncached portion when caching is on). Rolling all three into
 * `inputTokens` keeps the meter from undercounting whenever a caller
 * starts using prompt caching. We slightly over-credit cache reads here
 * (treating them at 1x instead of 0.1x); accepting that until enough
 * callers cache to make the offset material.
 */
export async function trackAnthropicCall<T extends {
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  } | null
}>(
  feature: string,
  model: string,
  apiCall: () => Promise<T>
): Promise<T> {
  const startMs = Date.now()
  try {
    const result = await apiCall()
    const durationMs = Date.now() - startMs
    const u = result.usage

    await trackApiUsage({
      provider: 'anthropic',
      feature,
      model,
      inputTokens:
        (u?.input_tokens ?? 0) +
        (u?.cache_creation_input_tokens ?? 0) +
        (u?.cache_read_input_tokens ?? 0),
      outputTokens: u?.output_tokens ?? 0,
      durationMs,
      statusCode: 200,
    })

    return result
  } catch (err) {
    const durationMs = Date.now() - startMs
    await trackApiUsage({
      provider: 'anthropic',
      feature,
      model,
      durationMs,
      statusCode: 500,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    throw err
  }
}
