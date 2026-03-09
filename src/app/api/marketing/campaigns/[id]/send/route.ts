import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sendCampaignEmail, sendTestCampaignEmail } from '@/lib/marketing/email-service';

export const maxDuration = 60;

/**
 * POST /api/marketing/campaigns/[id]/send — Send campaign emails (auth required, ADMIN/MANAGER)
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
    const { staffEmail, action, testEmail } = body;

    if (!staffEmail) {
      return NextResponse.json({ error: 'staffEmail is required' }, { status: 400 });
    }

    const campaign = await prisma.communicationCampaign.findUnique({
      where: { id },
      include: {
        recipients: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';

    // Get blog post slug for the link
    let postUrl = baseUrl;
    if (campaign.blogPostId) {
      const blogPost = await prisma.blogPost.findUnique({
        where: { id: campaign.blogPostId },
        select: { slug: true },
      });
      if (blogPost) {
        postUrl = `${baseUrl}/blog/${blogPost.slug}`;
      }
    }

    // TEST SEND
    if (action === 'test') {
      if (!testEmail) {
        return NextResponse.json({ error: 'testEmail is required for test send' }, { status: 400 });
      }

      const result = await sendTestCampaignEmail(testEmail, {
        subject: campaign.emailSubject || `[TEST] ${campaign.generatedTitle}`,
        previewText: campaign.emailPreviewText || campaign.generatedExcerpt || '',
        postTitle: campaign.generatedTitle || campaign.name,
        postExcerpt: campaign.generatedExcerpt || '',
        postUrl,
        contentType: campaign.contentType,
        visibility: (campaign as Record<string, unknown>).visibility as string || 'PUBLIC',
      });

      await prisma.campaignAuditLog.create({
        data: {
          campaignId: id,
          action: 'test_email_sent',
          staffEmail,
          details: { testEmail, success: result.success, error: result.error },
        },
      });

      return NextResponse.json({ result });
    }

    // FULL SEND
    if (action === 'send') {
      if (campaign.status !== 'PUBLISHED') {
        return NextResponse.json(
          { error: `Campaign must be PUBLISHED to send emails (current: ${campaign.status})` },
          { status: 400 }
        );
      }

      if (campaign.recipients.length === 0) {
        return NextResponse.json(
          { error: 'No recipients to send to' },
          { status: 400 }
        );
      }

      // Update status to SENDING
      await prisma.communicationCampaign.update({
        where: { id },
        data: { status: 'SENDING', lastModifiedBy: staffEmail },
      });

      let successCount = 0;
      let failureCount = 0;

      // Send to each recipient
      for (const recipient of campaign.recipients) {
        if (recipient.emailStatus !== 'PENDING') continue;

        const result = await sendCampaignEmail({
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          subject: campaign.emailSubject || campaign.generatedTitle || campaign.name,
          previewText: campaign.emailPreviewText || campaign.generatedExcerpt || '',
          postTitle: campaign.generatedTitle || campaign.name,
          postExcerpt: campaign.generatedExcerpt || '',
          postUrl,
          contentType: campaign.contentType,
          visibility: (campaign as Record<string, unknown>).visibility as string || 'PUBLIC',
        });

        if (result.success) {
          successCount++;
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              emailStatus: 'SENT',
              sentAt: new Date(),
            },
          });
        } else {
          failureCount++;
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              emailStatus: 'FAILED',
              failureReason: result.error,
            },
          });
        }
      }

      // Update campaign with results
      const finalStatus = failureCount === campaign.recipients.length ? 'FAILED' : 'SENT';
      const updated = await prisma.communicationCampaign.update({
        where: { id },
        data: {
          status: finalStatus,
          emailSentAt: new Date(),
          emailSuccessCount: successCount,
          emailFailureCount: failureCount,
          lastModifiedBy: staffEmail,
        },
      });

      await prisma.campaignAuditLog.create({
        data: {
          campaignId: id,
          action: 'emails_sent',
          staffEmail,
          details: {
            totalRecipients: campaign.recipients.length,
            successCount,
            failureCount,
          },
        },
      });

      return NextResponse.json({
        campaign: updated,
        results: { total: campaign.recipients.length, success: successCount, failed: failureCount },
      });
    }

    return NextResponse.json(
      { error: 'action must be "send" or "test"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to send campaign emails:', error);
    return NextResponse.json(
      { error: 'Failed to send campaign emails' },
      { status: 500 }
    );
  }
}
