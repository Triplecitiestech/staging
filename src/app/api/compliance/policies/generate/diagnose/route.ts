/**
 * GET /api/compliance/policies/generate/diagnose
 *
 * Quick health check for the policy generation pipeline. Returns:
 *   - Whether ANTHROPIC_API_KEY is configured
 *   - Whether both primary (Sonnet) and fallback (Haiku) models can be reached
 *   - Actual API latency for a trivial prompt
 *
 * Use this when policy generation starts failing to diagnose whether the
 * problem is Anthropic (API key, model availability, latency) vs our code.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface ModelPing {
  model: string
  ok: boolean
  status?: number
  elapsedMs: number
  error?: string
}

async function pingModel(model: string, apiKey: string, timeoutMs = 10_000): Promise<ModelPing> {
  const started = Date.now()
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        system: 'Respond only with the word "OK".',
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        model,
        ok: false,
        status: res.status,
        elapsedMs: Date.now() - started,
        error: `HTTP ${res.status}: ${body.substring(0, 200)}`,
      }
    }
    return { model, ok: true, status: 200, elapsedMs: Date.now() - started }
  } catch (err) {
    return {
      model,
      ok: false,
      elapsedMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      apiKeyConfigured: false,
      message: 'ANTHROPIC_API_KEY is not configured in the Vercel environment.',
    })
  }

  const [sonnet, haiku] = await Promise.all([
    pingModel('claude-sonnet-4-20250514', apiKey),
    pingModel('claude-haiku-4-5-20251001', apiKey),
  ])

  const allOk = sonnet.ok && haiku.ok
  let summary: string
  if (allOk) {
    summary = `Anthropic API is healthy. Sonnet ${sonnet.elapsedMs}ms, Haiku ${haiku.elapsedMs}ms.`
  } else if (!sonnet.ok && !haiku.ok) {
    summary = 'Both primary and fallback models are unreachable. Check API key validity and Anthropic status.'
  } else if (!sonnet.ok) {
    summary = `Primary model (Sonnet) is unreachable: ${sonnet.error}. Fallback (Haiku) works.`
  } else {
    summary = `Fallback model (Haiku) is unreachable: ${haiku.error}. Primary (Sonnet) works.`
  }

  return NextResponse.json({
    success: allOk,
    apiKeyConfigured: true,
    apiKeyPrefix: apiKey.substring(0, 10) + '\u2026', // first 10 chars for verification
    summary,
    sonnet,
    haiku,
  })
}
