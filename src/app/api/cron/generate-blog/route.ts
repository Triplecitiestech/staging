import { NextRequest, NextResponse } from 'next/server';
import { contentCurator } from '@/lib/content-curator';
import { blogGenerator } from '@/lib/blog-generator';
import { generateBlogApprovalEmail, generateBlogApprovalEmailText } from '@/lib/email-templates/blog-approval';
import { Resend } from 'resend';
import crypto from 'crypto';

// Disable static generation for this API route
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Cron endpoint to generate blog posts from curated content
 * Triggered Mon/Wed/Fri at 8 AM via Vercel Cron or GitHub Actions
 *
 * POST /api/cron/generate-blog
 * Authorization: Bearer <BLOG_CRON_SECRET>
 */
export async function GET(request: NextRequest) {
  return handleGenerateBlog(request);
}

export async function POST(request: NextRequest) {
  return handleGenerateBlog(request);
}

async function handleGenerateBlog(request: NextRequest) {
  try {
    // Dynamic import to prevent Prisma loading during build
    const { prisma } = await import('@/lib/prisma');

    // Verify cron secret (supports both Vercel's CRON_SECRET and custom BLOG_CRON_SECRET)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const blogCronSecret = process.env.BLOG_CRON_SECRET;

    if (!cronSecret && !blogCronSecret) {
      console.error('❌ No cron secret configured — CRON_SECRET or BLOG_CRON_SECRET must be set');
      return NextResponse.json({ error: 'Unauthorized: cron secret not configured' }, { status: 401 });
    } else if (authHeader) {
      const isValid =
        (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
        (blogCronSecret && authHeader === `Bearer ${blogCronSecret}`);
      if (!isValid) {
        console.error('❌ Invalid cron secret');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      console.error('❌ Missing Authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🤖 Starting AI blog post generation...');

    // Check ANTHROPIC_API_KEY
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('❌ ANTHROPIC_API_KEY not configured');
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
    }

    // Check for pending approval posts
    const pendingPosts = await prisma.blogPost.count({
      where: {
        status: 'PENDING_APPROVAL'
      }
    });

    console.log(`📊 Currently ${pendingPosts} posts pending approval`);

    if (pendingPosts >= 3) {
      console.log(`⏸️ Skipping generation: ${pendingPosts} posts already pending approval`);
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Too many pending approval posts',
        pendingCount: pendingPosts
      });
    }

    // Select best articles for blog generation
    const { articles, trendingTopics } = await contentCurator.selectArticlesForBlog({
      maxArticles: 5,
      daysBack: 3,
      preferTrending: true
    });

    if (articles.length === 0) {
      console.log('⚠️ No suitable articles found for blog generation');
      return NextResponse.json({
        success: false,
        error: 'No articles found'
      });
    }

    console.log(`📚 Selected ${articles.length} articles for generation`);
    if (trendingTopics.length > 0) {
      console.log(`🔥 Trending topic: ${trendingTopics[0].keyword}`);
    }

    // Generate blog post with AI
    const blogDraft = await blogGenerator.generateBlogPost(articles, trendingTopics);

    console.log(`✅ Generated blog post: "${blogDraft.title}"`);

    // Validate draft
    const validation = blogGenerator.validateDraft(blogDraft);
    if (!validation.valid) {
      console.error('❌ Blog post validation failed:', validation.errors);
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        validationErrors: validation.errors
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

    // Create blog post in database with PENDING_APPROVAL status
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
    const { getBaseUrl } = await import('@/config/site');
    const baseUrl = getBaseUrl();
    const approvalEmail = process.env.APPROVAL_EMAIL || 'kurtis@triplecitiestech.com';

    const emailProps = {
      blogPost: blogDraft,
      approvalToken,
      previewUrl: `${baseUrl}/api/blog/approval/${approvalToken}/preview`,
      approveUrl: `${baseUrl}/api/blog/approval/${approvalToken}/approve`,
      rejectUrl: `${baseUrl}/api/blog/approval/${approvalToken}/reject`,
      editUrl: `${baseUrl}/admin/blog/${blogPost.id}/edit`
    };

    if (!resend) {
      console.warn('⚠️ Resend not configured, skipping email');
    } else {
      const emailResult = await resend.emails.send({
        from: 'Triple Cities Tech Blog <blog@triplecitiestech.com>',
        to: approvalEmail,
        subject: `📝 Blog Post Ready for Review: "${blogDraft.title}"`,
        html: generateBlogApprovalEmail(emailProps),
        text: generateBlogApprovalEmailText(emailProps)
      });

      console.log(`✉️ Approval email sent to ${approvalEmail}:`, emailResult.data?.id);
    }

    return NextResponse.json({
      success: true,
      blogPost: {
        id: blogPost.id,
        title: blogPost.title,
        slug: blogPost.slug,
        category: category.name,
        status: blogPost.status,
        approvalToken: approvalToken.substring(0, 16) + '...'
      },
      articlesUsed: articles.length,
      trendingTopic: trendingTopics[0]?.keyword || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error generating blog post:', error);

    return NextResponse.json(
      {
        error: 'Failed to generate blog post',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
