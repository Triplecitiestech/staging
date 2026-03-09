import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import Anthropic from '@anthropic-ai/sdk'
import { createRequestLogger } from '@/lib/server-logger'
import { trackApiUsage } from '@/lib/api-usage-tracker'

export const dynamic = 'force-dynamic'

const AI_TIMEOUT_MS = 25_000

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface BlogPost {
  title: string
  excerpt: string
  content: string
  metaTitle: string | null
  metaDescription: string | null
  keywords: string[]
}

/**
 * POST /api/blog/ai-editor
 * AI assistant for editing blog posts
 */
export async function POST(request: NextRequest) {
  const log = createRequestLogger('POST /api/blog/ai-editor')

  try {
    const session = await auth()
    if (!session) {
      log.warn('Unauthorized request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    log.info('Authenticated', { userId: session.user?.email })

    if (!anthropic) {
      log.error('Anthropic API key not configured')
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const { post, messages }: { post: BlogPost; messages: Message[] } = await request.json()

    // Build system prompt
    const systemPrompt = `You are an expert blog post editor helping to improve content for Triple Cities Tech, a cybersecurity and IT services company in Central New York.

CURRENT BLOG POST:
Title: ${post.title}
Excerpt: ${post.excerpt}
Content:
${post.content}

SEO Metadata:
- Meta Title: ${post.metaTitle || 'Not set'}
- Meta Description: ${post.metaDescription || 'Not set'}
- Keywords: ${post.keywords.join(', ')}

Your role is to help the user improve this blog post by:
1. Making edits based on their requests
2. Improving clarity, engagement, and SEO
3. Maintaining professional tone appropriate for small business audience
4. Keeping content focused on cybersecurity and IT topics

When the user asks you to make changes:
1. Acknowledge what you're changing
2. Explain why the change improves the post
3. If making changes to the content, return them in a JSON format like this:
{
  "updatedPost": {
    "title": "new title if changed",
    "excerpt": "new excerpt if changed",
    "content": "new content if changed",
    "metaTitle": "new meta title if changed",
    "metaDescription": "new meta description if changed",
    "keywords": ["keyword1", "keyword2"]
  }
}

If you're just having a conversation without making changes, don't include the updatedPost object.

Be concise and helpful. Focus on practical improvements.`

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    // Call Claude API with timeout
    const timerAI = log.startTimer('ai-call')
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS)

    let response: Anthropic.Message
    try {
      response = await anthropic.messages.create(
        {
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 4096,
          system: systemPrompt,
          messages: anthropicMessages as Array<{ role: 'user' | 'assistant'; content: string }>,
        },
        { signal: abortController.signal }
      )
    } catch (aiError) {
      clearTimeout(timeoutId)
      timerAI()
      if (aiError instanceof Error && aiError.name === 'AbortError') {
        log.error('AI call timed out', { timeoutMs: AI_TIMEOUT_MS })
        return NextResponse.json(
          { error: 'AI service timed out. Please try again.', requestId: log.requestId },
          { status: 504 }
        )
      }
      throw aiError
    }
    clearTimeout(timeoutId)
    const aiMs = timerAI()

    const assistantMessage = response.content[0].type === 'text' ? response.content[0].text : ''

    // Try to extract JSON from the response if it contains updates
    let updatedPost = null
    const jsonMatch = assistantMessage.match(/\{[\s\S]*"updatedPost"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        updatedPost = parsed.updatedPost
      } catch (e) {
        // If JSON parsing fails, just return the message
      }
    }

    // Clean the message (remove JSON if it was extracted)
    let cleanMessage = assistantMessage
    if (jsonMatch) {
      cleanMessage = assistantMessage.replace(jsonMatch[0], '').trim()
    }

    // Track AI usage
    trackApiUsage({
      provider: 'anthropic',
      feature: 'blog-editor',
      model: 'claude-sonnet-4-5-20250929',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      durationMs: aiMs,
      statusCode: 200,
    })

    log.info('AI editor completed', {
      aiTimeMs: aiMs,
      hasUpdatedPost: !!updatedPost,
      durationMs: log.elapsed(),
    })

    return NextResponse.json({
      message: cleanMessage || assistantMessage,
      updatedPost,
      requestId: log.requestId,
    })
  } catch (error) {
    log.error('AI Editor error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: log.elapsed(),
    })
    return NextResponse.json(
      {
        error: 'AI assistant encountered an error',
        message: 'Sorry, I encountered an error. Please try again.',
        requestId: log.requestId,
      },
      { status: 500 }
    )
  }
}
