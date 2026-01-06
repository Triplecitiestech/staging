import { NextResponse } from 'next/server';
import { generateBlogApprovalEmail, generateBlogApprovalEmailText } from '@/lib/email-templates/blog-approval';
import { Resend } from 'resend';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Test endpoint for approval workflow (no AI, just mock post)
 * GET /api/blog/test-approval
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    console.log('📝 Creating test blog post for approval workflow...');

    // Find or create category
    let category = await prisma.blogCategory.findUnique({
      where: { slug: 'it-tips' }
    });

    if (!category) {
      category = await prisma.blogCategory.create({
        data: {
          name: 'IT Tips',
          slug: 'it-tips',
          description: 'Practical IT tips for small businesses'
        }
      });
    }

    // Create mock blog post
    const approvalToken = crypto.randomBytes(32).toString('hex');
    const slug = `test-post-${Date.now()}`;

    const blogPost = await prisma.blogPost.create({
      data: {
        title: 'Test Blog Post - Approval Workflow Demo',
        slug,
        excerpt: 'This is a test post to demonstrate the approval workflow. Click the links in your email to approve or reject.',
        content: `# Test Blog Post

This is a **test blog post** created to demonstrate the approval workflow.

## What happens next?

1. You receive an approval email
2. You can preview the post
3. You can approve it (publishes to /blog)
4. Or reject it (deletes the draft)
5. Or edit it in the admin panel

## Features of the approval system

- Email notifications when AI generates posts
- Preview before publishing
- One-click approve/reject
- Full editing capabilities
- Automatic scheduling

This post was created at ${new Date().toLocaleString()}.`,
        metaTitle: 'Test Blog Post - Triple Cities Tech',
        metaDescription: 'A test post to demonstrate the blog approval workflow.',
        keywords: ['test', 'blog', 'approval', 'workflow'],
        sourceUrls: [],
        aiPrompt: 'Manual test post',
        aiModel: 'test',
        status: 'PENDING_APPROVAL',
        categoryId: category.id,
        approvalToken,
        sentForApproval: new Date()
      }
    });

    console.log(`💾 Created test blog post: ${blogPost.id}`);

    // Prepare email
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';
    const approvalEmail = process.env.APPROVAL_EMAIL || 'kurtis@triplecitiestech.com';

    const blogDraft = {
      title: blogPost.title,
      slug: blogPost.slug,
      excerpt: blogPost.excerpt,
      content: blogPost.content,
      metaTitle: blogPost.metaTitle || '',
      metaDescription: blogPost.metaDescription || '',
      keywords: blogPost.keywords,
      category: category.name,
      tags: [],
      readingTime: '2 min read',
      sourceUrls: [],
      aiPrompt: 'Test',
      aiModel: 'test',
      featuredImagePrompt: '',
      socialMedia: {
        facebook: { title: '', description: '', hashtags: [] },
        instagram: { caption: '', hashtags: [] },
        linkedin: { title: '', content: '', hashtags: [] }
      }
    };

    const emailProps = {
      blogPost: blogDraft,
      approvalToken,
      previewUrl: `${baseUrl}/api/blog/approval/${approvalToken}/preview`,
      approveUrl: `${baseUrl}/api/blog/approval/${approvalToken}/approve`,
      rejectUrl: `${baseUrl}/api/blog/approval/${approvalToken}/reject`,
      editUrl: `${baseUrl}/admin/blog/${blogPost.id}/edit`
    };

    let emailSent = false;
    let emailError = null;

    if (!resend) {
      emailError = 'RESEND_API_KEY not configured in environment variables';
      console.warn('⚠️ Resend not configured, skipping email');
    } else {
      try {
        const emailResult = await resend.emails.send({
          from: 'Triple Cities Tech Blog <blog@triplecitiestech.com>',
          to: approvalEmail,
          subject: `📝 [TEST] Blog Post Ready for Review: "${blogPost.title}"`,
          html: generateBlogApprovalEmail(emailProps),
          text: generateBlogApprovalEmailText(emailProps)
        });

        emailSent = true;
        console.log(`✉️ Approval email sent to ${approvalEmail}:`, emailResult.data?.id);
      } catch (error) {
        emailError = error instanceof Error ? error.message : 'Unknown error';
        console.error('Email send failed:', error);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Test blog post created and awaiting approval!',
      blogPost: {
        id: blogPost.id,
        title: blogPost.title,
        slug: blogPost.slug,
        category: category.name,
        status: blogPost.status
      },
      email: {
        sent: emailSent,
        to: approvalEmail,
        error: emailError
      },
      approvalLinks: {
        preview: emailProps.previewUrl,
        approve: emailProps.approveUrl,
        reject: emailProps.rejectUrl,
        edit: emailProps.editUrl
      },
      nextSteps: [
        emailSent
          ? `✅ Check ${approvalEmail} for approval email`
          : `⚠️ Email not sent (${emailError})`,
        '1. Click "Preview" to see the post',
        '2. Click "Approve" to publish it',
        '3. Click "Reject" to delete it',
        '4. Or click "Edit" to modify in admin panel',
        '',
        '📍 You can also view it at /admin/blog'
      ]
    });

  } catch (error) {
    console.error('❌ Error creating test post:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create test post',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
