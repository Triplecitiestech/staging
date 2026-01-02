import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import Anthropic from '@anthropic-ai/sdk'

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
  try {
    // Check authentication
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!anthropic) {
      return NextResponse.json({
        error: 'AI service not configured'
      }, { status: 500 })
    }

    const body: ChatRequest = await req.json()
    const { messages, projectContext } = body

    // Build system prompt with project context
    const systemPrompt = `You are an expert project management assistant helping to structure IT service projects. Your role is to help create detailed project phases, tasks, and timelines.

${projectContext?.projectName ? `Current Project: ${projectContext.projectName}` : ''}
${projectContext?.companyName ? `Client: ${projectContext.companyName}` : ''}
${projectContext?.description ? `Description: ${projectContext.description}` : ''}

When asked to create project structures, provide them in this JSON format:
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

Guidelines:
- Create realistic timelines for IT projects (onboarding, migrations, implementations)
- Include clear task descriptions
- Add helpful notes for the internal team
- Consider dependencies and logical ordering
- Be specific and actionable

Always format project structures as valid JSON that can be copied and used directly.`

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))

    // Call Anthropic API
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages
    })

    // Extract the assistant's response
    const assistantMessage = response.content[0]
    const content = assistantMessage.type === 'text' ? assistantMessage.text : ''

    return NextResponse.json({
      message: content,
      usage: response.usage
    })

  } catch (error) {
    console.error('AI Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    )
  }
}
