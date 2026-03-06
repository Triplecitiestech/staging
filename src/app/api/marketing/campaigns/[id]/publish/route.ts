import { NextRequest, NextResponse } from 'next/server';
import slugify from 'slugify';

/**
 * POST /api/marketing/campaigns/[id]/publish — Publish campaign as a blog post
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
        audience: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `Campaign must be APPROVED to publish (current: ${campaign.status})` },
        { status: 400 }
      );
    }

    if (!campaign.generatedTitle || !campaign.generatedContent) {
      return NextResponse.json(
        { error: 'Campaign has no generated content' },
        { status: 400 }
      );
    }

    // Update status to PUBLISHING
    await prisma.communicationCampaign.update({
      where: { id },
      data: { status: 'PUBLISHING', lastModifiedBy: staffEmail },
    });

    try {
      // Generate unique slug
      let slug = slugify(campaign.generatedTitle, { lower: true, strict: true }).substring(0, 100);
      const existingSlug = await prisma.blogPost.findUnique({ where: { slug } });
      if (existingSlug) {
        slug = `${slug}-${Date.now().toString(36)}`;
      }

      // Find or create category
      const categorySlug = slugify(getCategoryName(campaign.contentType), { lower: true, strict: true });
      let category = await prisma.blogCategory.findUnique({ where: { slug: categorySlug } });
      if (!category) {
        category = await prisma.blogCategory.create({
          data: {
            name: getCategoryName(campaign.contentType),
            slug: categorySlug,
            description: `Posts related to ${getCategoryName(campaign.contentType).toLowerCase()}`,
          },
        });
      }

      // Find staff user for author
      const staffUser = await prisma.staffUser.findUnique({
        where: { email: staffEmail },
      });

      // Create the blog post
      const blogPost = await prisma.blogPost.create({
        data: {
          slug,
          title: campaign.generatedTitle,
          excerpt: campaign.generatedExcerpt || '',
          content: campaign.generatedContent,
          metaTitle: campaign.generatedMetaTitle,
          metaDescription: campaign.generatedMetaDescription,
          keywords: campaign.generatedKeywords,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          authorId: staffUser?.id || null,
          categoryId: category.id,
          campaignId: campaign.id,
          aiModel: campaign.aiModel,
          aiPrompt: campaign.aiPrompt,
          sourceUrls: [],
        },
      });

      // Snapshot recipients for this campaign
      const { getAudienceProvider } = await import('@/lib/marketing/audience-providers');
      const provider = getAudienceProvider(campaign.audience.providerType);
      const recipients = await provider.resolveRecipients(
        campaign.audience.filterCriteria as Record<string, unknown>
      );

      if (recipients.length > 0) {
        await prisma.campaignRecipient.createMany({
          data: recipients.map((r) => ({
            campaignId: campaign.id,
            name: r.name,
            email: r.email,
            companyName: r.companyName || null,
            companyId: r.companyId || null,
            sourceContactId: r.sourceContactId || null,
            sourceType: campaign.audience.providerType,
            emailStatus: 'PENDING',
          })),
        });
      }

      // Update campaign
      const updated = await prisma.communicationCampaign.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          blogPostId: blogPost.id,
          publishedAt: new Date(),
          emailTotalCount: recipients.length,
          lastModifiedBy: staffEmail,
        },
      });

      await prisma.campaignAuditLog.create({
        data: {
          campaignId: id,
          action: 'published',
          staffEmail,
          details: {
            blogPostId: blogPost.id,
            blogPostSlug: slug,
            recipientCount: recipients.length,
          },
        },
      });

      return NextResponse.json({
        campaign: updated,
        blogPost: { id: blogPost.id, slug: blogPost.slug },
        recipientCount: recipients.length,
      });
    } catch (pubError) {
      // Revert status on failure
      await prisma.communicationCampaign.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      console.error('Publishing failed:', pubError);
      const message = pubError instanceof Error ? pubError.message : 'Unknown error';
      return NextResponse.json(
        { error: `Publishing failed: ${message}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to publish campaign:', error);
    return NextResponse.json(
      { error: 'Failed to publish campaign' },
      { status: 500 }
    );
  }
}

function getCategoryName(contentType: string): string {
  const map: Record<string, string> = {
    CYBERSECURITY_ALERT: 'Cybersecurity News',
    SERVICE_UPDATE: 'Service Updates',
    MAINTENANCE_NOTICE: 'Service Updates',
    VENDOR_NOTICE: 'IT Tips',
    BEST_PRACTICE: 'IT Tips',
    COMPANY_ANNOUNCEMENT: 'Company News',
    GENERAL_COMMUNICATION: 'Company News',
  };
  return map[contentType] || 'Company News';
}
