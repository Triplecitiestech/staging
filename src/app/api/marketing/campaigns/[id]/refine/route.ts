import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

/**
 * POST /api/marketing/campaigns/[id]/refine — AI-assisted content refinement
 *
 * Takes the current generated content and a natural language instruction,
 * returns refined content that can be accepted or rejected.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const { id } = await params;
    const body = await request.json();
    const { instruction, staffEmail } = body;

    if (!instruction?.trim()) {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 });
    }

    const campaign = await prisma.communicationCampaign.findUnique({
      where: { id },
      include: { audience: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (!campaign.generatedContent) {
      return NextResponse.json({ error: 'No content to refine — generate content first' }, { status: 400 });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: `You are an expert content editor for Triple Cities Tech, a managed IT services company. You refine marketing communications while maintaining professional tone and brand voice. Your edits should be precise and targeted — change only what the user asks for and keep everything else intact.

Always respond with valid JSON containing these fields:
{
  "title": "refined title",
  "excerpt": "refined excerpt (1-2 sentences)",
  "content": "refined markdown content",
  "emailSubject": "refined email subject line",
  "emailPreviewText": "refined email preview text (50-100 chars)"
}`,
      messages: [
        {
          role: 'user',
          content: `Here is the current content for a ${campaign.contentType.replace(/_/g, ' ').toLowerCase()} campaign called "${campaign.name}":

**Title:** ${campaign.generatedTitle}
**Excerpt:** ${campaign.generatedExcerpt}
**Email Subject:** ${campaign.emailSubject || 'N/A'}
**Email Preview:** ${campaign.emailPreviewText || 'N/A'}

**Content (Markdown):**
${campaign.generatedContent}

---

**Refinement instruction:** ${instruction}

Please apply the requested changes and return the complete refined content as JSON. Only change what was requested — keep everything else the same.`,
        },
      ],
    });

    // Parse the response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON from the response (handle markdown code blocks)
    let refined;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      refined = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: 'AI returned invalid format. Try rephrasing your instruction.' },
        { status: 500 }
      );
    }

    // Log the refinement
    await prisma.campaignAuditLog.create({
      data: {
        campaignId: id,
        action: 'content_refined',
        staffEmail: staffEmail || 'admin@triplecitiestech.com',
        details: { instruction },
      },
    });

    return NextResponse.json({
      refined: {
        title: refined.title || campaign.generatedTitle,
        excerpt: refined.excerpt || campaign.generatedExcerpt,
        content: refined.content || campaign.generatedContent,
        emailSubject: refined.emailSubject || campaign.emailSubject,
        emailPreviewText: refined.emailPreviewText || campaign.emailPreviewText,
      },
    });
  } catch (error) {
    console.error('Refinement failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Refinement failed: ${message}` },
      { status: 500 }
    );
  }
}
