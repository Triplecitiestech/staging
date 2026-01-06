import { NextResponse } from 'next/server';
import { contentCurator } from '@/lib/content-curator';
import { blogGenerator } from '@/lib/blog-generator';
import { generateBlogApprovalEmail, generateBlogApprovalEmailText } from '@/lib/email-templates/blog-approval';
import { Resend } from 'resend';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Test endpoint for AI blog generation with approval workflow
 * GET /api/blog/test-generate
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    console.log('🤖 Starting AI blog post generation (TEST)...');

    // Check for pending approval posts
    const pendingPosts = await prisma.blogPost.count({
      where: { status: 'PENDING_APPROVAL' }
    });

    if (pendingPosts >= 3) {
      return NextResponse.json({
        success: false,
        message: `You have ${pendingPosts} posts pending approval. Please approve or reject them first.`,
        hint: 'Check your email for approval links'
      });
    }

    // Select best articles for blog generation
    const { articles, trendingTopics } = await contentCurator.selectArticlesForBlog({
      maxArticles: 5,
      daysBack: 3,
      preferTrending: true
    });

    if (articles.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No suitable articles found. Make sure RSS feeds are configured in /admin/blog/settings',
        hint: 'Add content sources like Bleeping Computer, KrebsOnSecurity, etc.'
      });
    }

    console.log(`📚 Selected ${articles.length} articles for generation`);

    // Generate blog post with AI
    const blogDraft = await blogGenerator.generateBlogPost(articles, trendingTopics);

    console.log(`✅ Generated blog post: "${blogDraft.title}"`);

    // Validate draft
    const validation = blogGenerator.validateDraft(blogDraft);
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        message: 'AI generated an invalid blog post',
        errors: validation.errors
      }, { status: 400 });
    }

    // Find or create category
    let category = await prisma.blogCategory.findUnique({
      where: { slug: blogDraft.category.toLowerCase().replace(/\s+/g, '-') }
    });

    if (!category) {
      category = await prisma.blogCategory.create({
        data: {
          name: blogDraft.category,
          slug: blogDraft.category.toLowerCase().replace(/\s+/g, '-'),
          description: `Blog posts about ${blogDraft.category}`
        }
      });
    }

    // Create blog post with PENDING_APPROVAL status
    const approvalToken = crypto.randomBytes(32).toString('hex');

    const blogPost = await prisma.blogPost.create({
      data: {
        title: blogDraft.title,
        slug: blogDraft.slug,
        excerpt: blogDraft.excerpt,
        content: blogDraft.content,
        metaTitle: blogDraft.metaTitle,
        metaDescription: blogDraft.metaDescription,
        keywords: blogDraft.keywords,
        sourceUrls: blogDraft.sourceUrls,
        aiPrompt: blogDraft.aiPrompt,
        aiModel: blogDraft.aiModel,
        status: 'PENDING_APPROVAL',
        categoryId: category.id,
        approvalToken,
        sentForApproval: new Date()
      }
    });

    console.log(`💾 Saved blog post to database: ${blogPost.id}`);

    // Send approval email
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';
    const approvalEmail = process.env.APPROVAL_EMAIL || 'kurtis@triplecitiestech.com';

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
      emailError = 'RESEND_API_KEY not configured';
      console.warn('⚠️ Resend not configured, skipping email');
    } else {
      try {
        const emailResult = await resend.emails.send({
          from: 'Triple Cities Tech Blog <blog@triplecitiestech.com>',
          to: approvalEmail,
          subject: `📝 Blog Post Ready for Review: "${blogDraft.title}"`,
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
      message: 'Blog post generated and awaiting approval!',
      blogPost: {
        id: blogPost.id,
        title: blogPost.title,
        slug: blogPost.slug,
        category: category.name,
        status: blogPost.status,
        excerpt: blogPost.excerpt.substring(0, 150) + '...'
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
      articlesUsed: articles.length,
      trendingTopic: trendingTopics[0]?.keyword || null,
      nextSteps: [
        emailSent
          ? `Check ${approvalEmail} for approval email`
          : `Email not sent (${emailError}). Use approval links above to manually approve.`,
        'Click "preview" link to see the post',
        'Click "approve" to publish or "reject" to discard',
        'Or click "edit" to make changes in the admin panel'
      ]
    });

  } catch (error) {
    console.error('❌ Error generating blog post:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate blog post',
        details: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check Vercel logs for full error details'
      },
      { status: 500 }
    );
  }
}
