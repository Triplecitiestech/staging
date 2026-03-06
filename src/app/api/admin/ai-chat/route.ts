import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import Anthropic from '@anthropic-ai/sdk'
import { createRequestLogger } from '@/lib/server-logger'
import { apiError } from '@/lib/api-response'

const AI_TIMEOUT_MS = 25_000 // 25s timeout (Vercel max is 30s)

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  projectContext?: {
    projectName?: string
    companyName?: string
    description?: string
    existingPhases?: unknown[]
  }
}

export async function POST(req: NextRequest) {
  const log = createRequestLogger('POST /api/admin/ai-chat')
  log.info('Request received')

  try {
    const session = await auth()
    if (!session) {
      log.warn('Unauthorized request')
      return apiError('Unauthorized', log.requestId, 401)
    }
    if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
      log.warn('Insufficient permissions', { role: session.user?.role })
      return apiError('Forbidden: requires ADMIN or MANAGER role', log.requestId, 403)
    }
    log.info('Authenticated', { userId: session.user?.email })

    if (!anthropic) {
      log.error('Anthropic API key not configured')
      return apiError(
        'AI service not configured. Please check ANTHROPIC_API_KEY environment variable.',
        log.requestId,
        500,
        'AI_NOT_CONFIGURED'
      )
    }

    const body: ChatRequest = await req.json()
    const { messages, projectContext } = body

    if (!messages || messages.length === 0) {
      return apiError('No messages provided', log.requestId, 400)
    }

    log.info('Processing AI chat', {
      messageCount: messages.length,
      projectName: projectContext?.projectName,
    })

    // Build system prompt with project context
    const systemPrompt = `You are an expert IT project management assistant for Triple Cities Tech, an MSP/IT services company. You help structure projects with phases and tasks.

${projectContext?.projectName ? `**Current Project**: ${projectContext.projectName}` : ''}
${projectContext?.companyName ? `**Client**: ${projectContext.companyName}` : ''}
${projectContext?.description ? `**Description**: ${projectContext.description}` : ''}

You are working within the context of this specific project. The user does NOT need to tell you what project they're working on — you already know. Respond naturally and helpfully.

When the user asks you to create phases or tasks, output the structure as a JSON code block that the system can automatically parse. Use this format:

\`\`\`json
{
  "phases": [
    {
      "name": "Phase Name",
      "description": "Phase description",
      "orderIndex": 0,
      "tasks": [
        {
          "taskText": "Task description",
          "completed": false,
          "orderIndex": 0,
          "notes": "Optional notes for internal team"
        }
      ]
    }
  ]
}
\`\`\`

Important behavioral rules:
- Be conversational and natural. Don't ask the user to provide JSON — YOU generate it.
- If the user says "add a discovery phase", generate the phases/tasks JSON immediately.
- You can answer questions about project planning, best practices, and IT workflows without generating JSON.
- Create realistic phases for IT projects (onboarding, migrations, implementations, security hardening).
- Include clear, actionable task descriptions.
- Add helpful notes for the internal team.
- Consider dependencies and logical ordering.
- Be specific to IT/MSP work (networking, security, cloud, endpoints, etc.).`

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    // Call Anthropic API with timeout
    const timerAI = log.startTimer('ai-call')
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS)

    let response: Anthropic.Message
    try {
      response = await anthropic.messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: systemPrompt,
          messages: anthropicMessages,
        },
        { signal: abortController.signal }
      )
    } catch (aiError) {
      clearTimeout(timeoutId)
      const aiMs = timerAI()

      // Check if it was a timeout
      if (aiError instanceof Error && aiError.name === 'AbortError') {
        log.error('AI call timed out', { aiTimeMs: aiMs, timeoutMs: AI_TIMEOUT_MS })
        return apiError(
          `AI service timed out after ${Math.round(AI_TIMEOUT_MS / 1000)}s. Please try a shorter message or try again.`,
          log.requestId,
          504,
          'AI_TIMEOUT'
        )
      }
      throw aiError // re-throw for the outer catch
    }
    clearTimeout(timeoutId)
    const aiMs = timerAI()

    // Extract the assistant's response
    const assistantMessage = response.content[0]
    const content = assistantMessage.type === 'text' ? assistantMessage.text : ''

    log.info('AI chat completed', {
      aiTimeMs: aiMs,
      usage: response.usage,
      responseLength: content.length,
      durationMs: log.elapsed(),
    })

    return Response.json({
      success: true,
      message: content,
      usage: response.usage,
      requestId: log.requestId,
    })

  } catch (error) {
    log.error('AI chat failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: log.elapsed(),
    })

    let errorMessage = 'Failed to process chat request'
    let statusCode = 500
    let code = 'AI_ERROR'

    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        errorMessage = 'Invalid API key configuration'
        code = 'INVALID_API_KEY'
      } else if (error.message.includes('rate limit') || error.message.includes('429')) {
        errorMessage = 'Rate limit exceeded. Please try again in a moment.'
        statusCode = 429
        code = 'RATE_LIMITED'
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.'
        code = 'NETWORK_ERROR'
      } else {
        errorMessage = `AI service error: ${error.message}`
      }
    }

    return apiError(errorMessage, log.requestId, statusCode, code)
  }
}
