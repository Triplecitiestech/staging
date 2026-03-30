/**
 * POST /api/compliance/ai-assist — AI assistant for compliance control notes/updates
 *
 * Accepts natural language instructions about a control finding and returns:
 *   - suggested status change (if requested)
 *   - formatted note text
 *   - reasoning for the change
 *
 * Used by the inline control editor in the compliance dashboard.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      controlId: string
      controlTitle: string
      currentStatus: string
      currentReasoning: string
      instruction: string
    }

    if (!body.instruction || !body.controlId) {
      return NextResponse.json({ error: 'instruction and controlId are required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
    }

    const prompt = `You are a compliance analyst assistant for an MSP. A staff member is reviewing a CIS Controls v8 assessment finding and wants to make changes.

Control: ${body.controlId} — ${body.controlTitle}
Current Status: ${body.currentStatus}
Current Reasoning: ${body.currentReasoning}

The reviewer says: "${body.instruction}"

Based on this instruction, respond with JSON only:
{
  "suggestedStatus": "pass" | "fail" | "partial" | "needs_review" | "not_applicable" | null,
  "note": "A clear, professional note summarizing the reviewer's input and any status change rationale",
  "reasoning": "Updated reasoning text if the status should change, or null if no change"
}

Rules:
- If the reviewer says something is complete/done/resolved/implemented, suggest "pass"
- If they say it's not applicable or doesn't apply, suggest "not_applicable"
- If they give an explanation/excuse but it's not fully resolved, suggest "partial" or "needs_review"
- If they just want to add a note without changing status, set suggestedStatus to null
- The note should be professional and suitable for a compliance audit trail
- Keep the note concise but include the key points from the reviewer's input

Respond with ONLY valid JSON.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[compliance/ai-assist] Anthropic error:', text)
      return NextResponse.json({ error: 'AI processing failed' }, { status: 502 })
    }

    const data = (await res.json()) as { content: Array<{ type: string; text: string }> }
    const text = data.content?.[0]?.text ?? ''

    let parsed: { suggestedStatus?: string | null; note?: string; reasoning?: string | null } = {}
    try {
      parsed = JSON.parse(text)
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    }

    return NextResponse.json({
      success: true,
      data: {
        suggestedStatus: parsed.suggestedStatus ?? null,
        note: parsed.note ?? body.instruction,
        reasoning: parsed.reasoning ?? null,
        actor: session.user.email,
      },
    })
  } catch (err) {
    console.error('[compliance/ai-assist] Error:', err)
    return NextResponse.json(
      { error: `AI assist failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
