import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

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
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages as Array<{ role: 'user' | 'assistant'; content: string }>
    })

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

    return NextResponse.json({
      message: cleanMessage || assistantMessage,
      updatedPost
    })
  } catch (error) {
    console.error('AI Editor error:', error)
    return NextResponse.json(
      {
        error: 'AI assistant encountered an error',
        message: 'Sorry, I encountered an error. Please try again.'
      },
      { status: 500 }
    )
  }
}
