/**
 * API Usage Tracker
 *
 * Tracks token usage, costs, and performance for all external API calls.
 * Logs to the api_usage_logs table for monitoring and alerting.
 */

import type { PrismaClient } from '@prisma/client'

// Anthropic pricing (per 1M tokens) as of 2025
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 300, output: 1500 },      // $3/$15 per 1M
  'claude-opus-4-6': { input: 1500, output: 7500 },       // $15/$75 per 1M
  'claude-haiku-4-5-20251001': { input: 80, output: 400 }, // $0.80/$4 per 1M
}

interface TrackApiUsageParams {
  provider: string
  feature: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
  statusCode?: number
  error?: string
  metadata?: Record<string, unknown>
}

function estimateCostCents(model: string | undefined, inputTokens: number, outputTokens: number): number {
  if (!model) return 0
  const pricing = ANTHROPIC_PRICING[model]
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
    const costCents = estimateCostCents(params.model, inputTokens, outputTokens)

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
 * Wrap an Anthropic API call to automatically track usage
 */
export async function trackAnthropicCall<T extends {
  usage?: { input_tokens: number; output_tokens: number }
}>(
  feature: string,
  model: string,
  apiCall: () => Promise<T>
): Promise<T> {
  const startMs = Date.now()
  try {
    const result = await apiCall()
    const durationMs = Date.now() - startMs

    await trackApiUsage({
      provider: 'anthropic',
      feature,
      model,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
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
