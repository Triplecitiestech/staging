import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

const DEFAULT_GUIDELINES = `# AI Blog Generation Guidelines for Triple Cities Tech

## Target Audience
- Small and mid-sized businesses in Central New York
- Business owners and decision-makers who may not be technical experts
- Companies looking for cybersecurity and IT management solutions

## Tone & Voice
- Professional but approachable and friendly
- Clear and educational without being condescending
- Conversational without being overly casual
- Use "you" and "your business" to speak directly to the reader

## Content Focus
- Cybersecurity best practices for small businesses
- IT management and infrastructure topics
- Cloud services (especially Microsoft 365)
- Practical, actionable advice that readers can implement
- Real-world examples and scenarios relevant to small businesses

## Topics to Emphasize
- Data security and backup strategies
- Employee security training
- Phishing and social engineering
- Password management and MFA
- Compliance (if relevant to small businesses)
- Remote work security
- Vendor management and supply chain security

## Content Structure
- Target 800-1200 words per post
- Start with a compelling hook or stat
- Use descriptive headings (H2) to break up content
- Include bullet points and numbered lists for readability
- Provide specific, actionable advice
- End with a clear call-to-action

## Formatting Guidelines
- Use short paragraphs (2-4 sentences)
- Include bullet points for lists
- Bold key concepts and important warnings
- Use examples to illustrate technical concepts
- Break up long sections with subheadings

## Language & Style
- Avoid overly technical jargon - explain concepts in simple terms
- When technical terms are necessary, provide brief explanations
- Use analogies to explain complex security concepts
- Focus on "why it matters" not just "what it is"
- Emphasize business impact and risk

## Call-to-Action
- Every post should end with a CTA mentioning Triple Cities Tech
- Focus on helping readers solve their specific problem
- Offer a free consultation or security assessment when relevant
- Make it clear how Triple Cities Tech can help

## Topics to Avoid
- Recommending specific products from competitors
- Fear-mongering or sensationalism
- Overly pessimistic tone about security threats
- Political topics or controversial subjects
- Highly technical topics that require expert knowledge

## SEO Considerations
- Include relevant keywords naturally throughout the content
- Create descriptive meta titles and descriptions
- Target local keywords when appropriate (Central New York, Binghamton, etc.)
- Use keywords in headings when it makes sense

## Examples of Good Topics
- "5 Security Mistakes Small Businesses Make"
- "How to Train Employees on Phishing Awareness"
- "Backup Strategies Every Business Needs"
- "Moving to Microsoft 365: What You Need to Know"
- "Creating a Disaster Recovery Plan on a Budget"

Remember: The goal is to educate and build trust, not to sell aggressively. Help readers understand their risks and provide practical solutions.`

/**
 * GET /api/blog/settings/guidelines
 * Get current AI generation guidelines
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prisma } = await import('@/lib/prisma')

    // Try to get guidelines from database
    const setting = await prisma.blogSettings.findUnique({
      where: { key: 'ai_guidelines' }
    })

    const guidelines = setting?.value || DEFAULT_GUIDELINES

    return NextResponse.json({ guidelines })
  } catch (error) {
    console.error('Error fetching guidelines:', error)
    return NextResponse.json(
      { error: 'Failed to fetch guidelines' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/blog/settings/guidelines
 * Update AI generation guidelines
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { guidelines } = await request.json()
    const { prisma } = await import('@/lib/prisma')

    // Upsert guidelines in database
    await prisma.blogSettings.upsert({
      where: { key: 'ai_guidelines' },
      update: {
        value: guidelines,
        updatedBy: session.user?.email || 'unknown'
      },
      create: {
        key: 'ai_guidelines',
        value: guidelines,
        updatedBy: session.user?.email || 'unknown'
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving guidelines:', error)
    return NextResponse.json(
      { error: 'Failed to save guidelines' },
      { status: 500 }
    )
  }
}
