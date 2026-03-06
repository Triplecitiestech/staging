import { NextRequest, NextResponse } from 'next/server';
import { generateCampaignContent } from '@/lib/marketing/campaign-generator';

export const maxDuration = 60;

/**
 * POST /api/marketing/campaigns/[id]/generate — Generate AI content for a campaign
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const { id } = await params;
    const body = await request.json();
    const { staffEmail } = body;

    if (!staffEmail) {
      return NextResponse.json({ error: 'staffEmail is required' }, { status: 400 });
    }

    const campaign = await prisma.communicationCampaign.findUnique({
      where: { id },
      include: {
        audience: { select: { name: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (!['DRAFT', 'CONTENT_READY'].includes(campaign.status)) {
      return NextResponse.json(
        { error: `Cannot generate content for campaign in ${campaign.status} status` },
        { status: 400 }
      );
    }

    // Update status to GENERATING
    await prisma.communicationCampaign.update({
      where: { id },
      data: { status: 'GENERATING', lastModifiedBy: staffEmail },
    });

    try {
      const draft = await generateCampaignContent(
        campaign.contentType,
        campaign.topic,
        campaign.audience.name,
      );

      // Save generated content
      const updated = await prisma.communicationCampaign.update({
        where: { id },
        data: {
          status: 'CONTENT_READY',
          generatedTitle: draft.title,
          generatedExcerpt: draft.excerpt,
          generatedContent: draft.content,
          generatedMetaTitle: draft.metaTitle,
          generatedMetaDescription: draft.metaDescription,
          generatedKeywords: draft.keywords,
          emailSubject: draft.emailSubject,
          emailPreviewText: draft.emailPreviewText,
          aiModel: 'claude-sonnet-4-6',
          aiPrompt: `Content type: ${campaign.contentType}, Topic: ${campaign.topic}`,
          lastModifiedBy: staffEmail,
        },
        include: {
          audience: { select: { id: true, name: true, recipientCount: true } },
        },
      });

      await prisma.campaignAuditLog.create({
        data: {
          campaignId: id,
          action: 'content_generated',
          staffEmail,
          details: {
            title: draft.title,
            category: draft.category,
            tags: draft.tags,
          },
        },
      });

      return NextResponse.json({ campaign: updated });
    } catch (genError) {
      // Revert to DRAFT on generation failure
      await prisma.communicationCampaign.update({
        where: { id },
        data: { status: 'DRAFT' },
      });

      console.error('Content generation failed:', genError);
      const message = genError instanceof Error ? genError.message : 'Unknown error';
      return NextResponse.json(
        { error: `Content generation failed: ${message}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to generate campaign content:', error);
    return NextResponse.json(
      { error: 'Failed to generate campaign content' },
      { status: 500 }
    );
  }
}
