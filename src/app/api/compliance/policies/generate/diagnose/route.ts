/**
 * GET /api/compliance/policies/generate/diagnose
 *
 * Two-tier health check for the policy generation pipeline.
 *
 *   Tier 1 ("reachability") — trivial 16-token pings to both models.
 *     Confirms the API key works and Anthropic is reachable. Sub-second.
 *
 *   Tier 2 ("stamina") — a streaming 1500-token completion against Haiku
 *     with a prompt sized to roughly match a real policy generation. This
 *     is the test that actually catches "Anthropic responds but takes too
 *     long for our 60s function window" — the exact failure mode that
 *     looked like a green diagnostic before.
 *
 * Returns:
 *   - apiKeyConfigured: bool
 *   - haiku / sonnet: tier 1 reachability results
 *   - stamina: tier 2 streaming throughput result (ms to first chunk,
 *     total ms, total tokens)
 *
 * If stamina takes > 40s, real policy generation is likely to time out
 * — the summary will warn the tech.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'
// 50s budget — tier 1 pings finish in <1s, tier 2 streaming completion
// gets up to ~45s. Below Vercel's 60s function cap with headroom.
export const maxDuration = 50

interface ModelPing {
  model: string
  ok: boolean
  status?: number
  elapsedMs: number
  error?: string
}

interface StaminaResult {
  ok: boolean
  model: string
  elapsedMs: number
  timeToFirstChunkMs: number | null
  approxTokens: number
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

  // Keep the same model IDs as the live generator. If you change one,
  // update both files together — otherwise the diagnostic can pass while
  // the real generation fails.
  const [haiku, sonnet] = await Promise.all([
    pingModel('claude-haiku-4-5-20251001', apiKey),
    pingModel('claude-sonnet-4-6', apiKey),
  ])

  // Tier 2: stamina test. Skip if Haiku reachability already failed --
  // there's nothing to test if the model can't even respond to ping.
  let stamina: StaminaResult | null = null
  if (haiku.ok) {
    stamina = await staminaTest('claude-haiku-4-5-20251001', apiKey)
  }

  const reachable = sonnet.ok && haiku.ok
  const staminaOk = stamina?.ok === true && stamina.elapsedMs < 40_000
  const allOk = reachable && (stamina === null || staminaOk)

  let summary: string
  if (allOk && stamina) {
    summary = `Anthropic API is healthy. Ping: Haiku ${haiku.elapsedMs}ms / Sonnet ${sonnet.elapsedMs}ms. Stamina (1500-tok stream): ${stamina.elapsedMs}ms total, ${stamina.timeToFirstChunkMs}ms to first chunk.`
  } else if (allOk) {
    summary = `Anthropic API is healthy. Haiku ${haiku.elapsedMs}ms, Sonnet ${sonnet.elapsedMs}ms. Stamina test skipped.`
  } else if (reachable && stamina && !stamina.ok) {
    summary = `Reachability OK but stamina test failed: ${stamina.error ?? 'unknown error'}. Real policy generation is likely to fail.`
  } else if (reachable && stamina && !staminaOk) {
    summary = `Anthropic is responding but slowly: streaming 1500 tokens took ${stamina.elapsedMs}ms. Policy generation may time out under the 60s function budget.`
  } else if (!sonnet.ok && !haiku.ok) {
    summary = 'Both primary (Haiku) and fallback (Sonnet) models are unreachable. Check API key validity and Anthropic status.'
  } else if (!haiku.ok) {
    summary = `Primary model (Haiku) is unreachable: ${haiku.error}. Fallback (Sonnet) works — generation will be slower but functional.`
  } else {
    summary = `Fallback model (Sonnet) is unreachable: ${sonnet.error}. Primary (Haiku) works — generation should still succeed.`
  }

  return NextResponse.json({
    success: allOk,
    apiKeyConfigured: true,
    apiKeyPrefix: apiKey.substring(0, 10) + '\u2026', // first 10 chars for verification
    summary,
    sonnet,
    haiku,
    stamina,
  })
}

// Stamina test: a 1500-token streaming completion that exercises the same
// streaming code path as real generation. Confirms not just that Anthropic
// is reachable, but that it can sustain throughput long enough for our
// real policy prompts to finish within the 60s Vercel function cap.
async function staminaTest(model: string, apiKey: string): Promise<StaminaResult> {
  const started = Date.now()
  let firstChunkAt: number | null = null
  let approxTokens = 0

  const controller = new AbortController()
  const wallTimer = setTimeout(() => controller.abort(), 45_000)

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        stream: true,
        system: 'You are a compliance writer. Be detailed and thorough.',
        messages: [{
          role: 'user',
          content: 'Draft a brief sample policy (around 1500 tokens) on password requirements. Cover length, complexity, rotation, MFA, lockout, and reset procedures. Be complete.',
        }],
      }),
      signal: controller.signal,
    })

    if (!r.ok) {
      clearTimeout(wallTimer)
      const body = await r.text().catch(() => '')
      return {
        ok: false, model, elapsedMs: Date.now() - started, timeToFirstChunkMs: null, approxTokens: 0,
        error: `HTTP ${r.status}: ${body.substring(0, 200)}`,
      }
    }
    if (!r.body) {
      clearTimeout(wallTimer)
      return { ok: false, model, elapsedMs: Date.now() - started, timeToFirstChunkMs: null, approxTokens: 0, error: 'No response body' }
    }

    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (firstChunkAt === null) firstChunkAt = Date.now() - started
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const event = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } }
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
            // Rough token estimate: ~4 chars per token.
            approxTokens += Math.ceil(event.delta.text.length / 4)
          }
        } catch { /* ignore parse errors on chunk boundaries */ }
      }
    }
    clearTimeout(wallTimer)
    return { ok: true, model, elapsedMs: Date.now() - started, timeToFirstChunkMs: firstChunkAt, approxTokens }
  } catch (err) {
    clearTimeout(wallTimer)
    return {
      ok: false, model, elapsedMs: Date.now() - started, timeToFirstChunkMs: firstChunkAt, approxTokens,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
