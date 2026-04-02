import { cronHandler } from '@/lib/cron-wrapper';
import { generateBlogApprovalEmail, generateBlogApprovalEmailText } from '@/lib/email-templates/blog-approval';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Send approval emails for posts scheduled to publish in 24 hours
 * Triggered daily via Vercel Cron
 */
export const GET = cronHandler(
  { name: 'send-approval-emails', timeoutMs: 25000 },
  async () => {
    const { prisma } = await import('@/lib/prisma');

    // Find posts scheduled to publish in 24 hours that haven't been sent for approval yet
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tomorrowStart = new Date(tomorrow);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const postsNeedingApproval = await prisma.blogPost.findMany({
      where: {
        status: 'DRAFT',
        scheduledFor: {
          gte: tomorrowStart,
          lte: tomorrowEnd,
        },
        sentForApproval: null,
      },
      include: {
        category: true,
      },
    });

    if (postsNeedingApproval.length === 0) {
      return {
        success: true,
        message: 'No posts need approval emails',
        data: { count: 0 },
      };
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';
    const approvalEmail = process.env.APPROVAL_EMAIL || 'kurtis@triplecitiestech.com';
    const emailsSent: string[] = [];
    const emailsFailed: string[] = [];

    for (const post of postsNeedingApproval) {
      try {
        const blogDraft = {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          metaTitle: post.metaTitle || '',
          metaDescription: post.metaDescription || '',
          keywords: post.keywords,
          category: post.category?.name || 'Uncategorized',
          tags: [],
          readingTime: '5 min read',
          sourceUrls: post.sourceUrls,
          aiPrompt: post.aiPrompt || '',
          aiModel: post.aiModel || '',
          featuredImagePrompt: '',
          socialMedia: {
            facebook: { title: '', description: '', hashtags: [] },
            instagram: { caption: '', hashtags: [] },
            linkedin: { title: '', content: '', hashtags: [] },
          },
        };

        const emailProps = {
          blogPost: blogDraft,
          approvalToken: post.approvalToken!,
          previewUrl: `${baseUrl}/api/blog/approval/${post.approvalToken}/preview`,
          approveUrl: `${baseUrl}/api/blog/approval/${post.approvalToken}/approve`,
          rejectUrl: `${baseUrl}/api/blog/approval/${post.approvalToken}/reject`,
          editUrl: `${baseUrl}/admin/blog/${post.id}/edit`,
        };

        if (!resend) {
          throw new Error('RESEND_API_KEY not configured');
        }

        await resend.emails.send({
          from: 'Triple Cities Tech Blog <blog@triplecitiestech.com>',
          to: approvalEmail,
          subject: `Blog Post Ready for Review: "${post.title}" (Publishes Tomorrow)`,
          html: generateBlogApprovalEmail(emailProps),
          text: generateBlogApprovalEmailText(emailProps),
        });

        // Mark as sent for approval
        await prisma.blogPost.update({
          where: { id: post.id },
          data: {
            status: 'PENDING_APPROVAL',
            sentForApproval: new Date(),
          },
        });

        emailsSent.push(post.title);
      } catch (error) {
        emailsFailed.push(`${post.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: emailsFailed.length === 0,
      message: `Sent ${emailsSent.length} emails, ${emailsFailed.length} failed`,
      data: { emailsSent: emailsSent.length, emailsFailed: emailsFailed.length },
      warnings: emailsFailed.length > 0 ? emailsFailed : undefined,
    };
  },
);

export const POST = GET;
