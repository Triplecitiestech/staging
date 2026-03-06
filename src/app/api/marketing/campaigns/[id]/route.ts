import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/marketing/campaigns/[id] — Get campaign details
 * PATCH /api/marketing/campaigns/[id] — Update campaign content/settings
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const { id } = await params;

    const campaign = await prisma.communicationCampaign.findUnique({
      where: { id },
      include: {
        audience: {
          include: {
            source: { select: { id: true, name: true, providerType: true } },
          },
        },
        recipients: {
          orderBy: { companyName: 'asc' },
          take: 100,
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        _count: { select: { recipients: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('Failed to fetch campaign:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { prisma } = await import('@/lib/prisma');
    const { id } = await params;
    const body = await request.json();

    const campaign = await prisma.communicationCampaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Only allow editing in certain states
    const editableStatuses = ['DRAFT', 'CONTENT_READY', 'APPROVED'];
    if (!editableStatuses.includes(campaign.status)) {
      return NextResponse.json(
        { error: `Cannot edit campaign in ${campaign.status} status` },
        { status: 400 }
      );
    }

    const {
      generatedTitle,
      generatedExcerpt,
      generatedContent,
      generatedMetaTitle,
      generatedMetaDescription,
      generatedKeywords,
      emailSubject,
      emailPreviewText,
      lastModifiedBy,
    } = body;

    interface UpdateData {
      generatedTitle?: string;
      generatedExcerpt?: string;
      generatedContent?: string;
      generatedMetaTitle?: string;
      generatedMetaDescription?: string;
      generatedKeywords?: string[];
      emailSubject?: string;
      emailPreviewText?: string;
      lastModifiedBy?: string;
    }

    const updateData: UpdateData = {};
    if (generatedTitle !== undefined) updateData.generatedTitle = generatedTitle;
    if (generatedExcerpt !== undefined) updateData.generatedExcerpt = generatedExcerpt;
    if (generatedContent !== undefined) updateData.generatedContent = generatedContent;
    if (generatedMetaTitle !== undefined) updateData.generatedMetaTitle = generatedMetaTitle;
    if (generatedMetaDescription !== undefined) updateData.generatedMetaDescription = generatedMetaDescription;
    if (generatedKeywords !== undefined) updateData.generatedKeywords = generatedKeywords;
    if (emailSubject !== undefined) updateData.emailSubject = emailSubject;
    if (emailPreviewText !== undefined) updateData.emailPreviewText = emailPreviewText;
    if (lastModifiedBy) updateData.lastModifiedBy = lastModifiedBy;

    const updated = await prisma.communicationCampaign.update({
      where: { id },
      data: updateData,
      include: {
        audience: {
          select: { id: true, name: true, recipientCount: true },
        },
      },
    });

    if (lastModifiedBy) {
      await prisma.campaignAuditLog.create({
        data: {
          campaignId: id,
          action: 'content_edited',
          staffEmail: lastModifiedBy,
          details: { fieldsUpdated: Object.keys(updateData) },
        },
      });
    }

    return NextResponse.json({ campaign: updated });
  } catch (error) {
    console.error('Failed to update campaign:', error);
    return NextResponse.json(
      { error: 'Failed to update campaign' },
      { status: 500 }
    );
  }
}
