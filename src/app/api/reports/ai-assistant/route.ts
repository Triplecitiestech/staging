import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/reports/ai-assistant
 * AI-powered report assistant that answers questions about reporting data.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prompt, context, data } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI assistant not configured' }, { status: 503 })
    }

    const client = new Anthropic({ apiKey })

    // Build a concise data summary for context
    const dataContext = data ? JSON.stringify(data, null, 0).slice(0, 8000) : 'No data available'

    const systemPrompt = `You are an AI reporting assistant for Triple Cities Tech, a managed IT services company. You help staff analyze service desk reporting data and generate insights.

Context: You are viewing the "${context}" section of the reporting dashboard.

Current data (JSON):
${dataContext}

Instructions:
- Be concise and actionable. Use bullet points for clarity.
- Reference specific numbers from the data when relevant.
- If asked to generate a report, format it clearly with headers and sections.
- If the data doesn't contain what the user asks about, say so clearly.
- Do not make up data. Only reference what is provided.
- Keep responses under 500 words unless generating a full report.
- Format time values nicely (e.g., "2.5 hours" not "150 minutes").`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })

    const textContent = message.content.find(c => c.type === 'text')
    const response = textContent ? textContent.text : 'No response generated'

    return NextResponse.json({ response })
  } catch (err) {
    console.error('[AI Assistant] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI assistant failed' },
      { status: 500 },
    )
  }
}
