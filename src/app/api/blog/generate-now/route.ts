import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { contentCurator } from '@/lib/content-curator';
import { blogGenerator } from '@/lib/blog-generator';
import { generateBlogApprovalEmail, generateBlogApprovalEmailText } from '@/lib/email-templates/blog-approval';
import { Resend } from 'resend';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Background blog generation logic.
 * Runs after the response is sent via after().
 */
async function runBlogGeneration(blogPostId: string) {
  const { prisma } = await import('@/lib/prisma');

  try {
    console.log('🤖 Starting AI blog post generation (background)...');

    // Fetch RSS articles
    const { articles, trendingTopics } = await contentCurator.selectArticlesForBlog({
      maxArticles: 5,
      daysBack: 3,
      preferTrending: true
    });

    if (articles.length === 0) {
      console.log('⚠️ No suitable articles found');
      await prisma.blogPost.update({
        where: { id: blogPostId },
        data: {
          status: 'REJECTED',
          content: 'Generation failed: No articles found from RSS feeds.',
        }
      });
      return;
    }

    console.log(`📚 Selected ${articles.length} articles`);

    // Generate blog post with AI
    const blogDraft = await blogGenerator.generateBlogPost(articles, trendingTopics);
    console.log(`✅ Generated: "${blogDraft.title}"`);

    // Validate draft
    const validation = blogGenerator.validateDraft(blogDraft);
    if (!validation.valid) {
      console.error('❌ Validation failed:', validation.errors);
      await prisma.blogPost.update({
        where: { id: blogPostId },
        data: {
          status: 'REJECTED',
          content: `Generation failed validation: ${validation.errors.join(', ')}`,
        }
      });
      return;
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

    // Generate approval token
    const approvalToken = crypto.randomBytes(32).toString('hex');

    // Update the placeholder blog post with real content
    await prisma.blogPost.update({
      where: { id: blogPostId },
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

    console.log(`💾 Updated blog post: ${blogPostId}`);

    // Send approval email
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';
    const approvalEmail = process.env.APPROVAL_EMAIL || 'kurtis@triplecitiestech.com';

    const emailProps = {
      blogPost: blogDraft,
      approvalToken,
      previewUrl: `${baseUrl}/api/blog/approval/${approvalToken}/preview`,
      approveUrl: `${baseUrl}/api/blog/approval/${approvalToken}/approve`,
      rejectUrl: `${baseUrl}/api/blog/approval/${approvalToken}/reject`,
      editUrl: `${baseUrl}/admin/blog/${blogPostId}/edit`
    };

    if (resend) {
      const emailResult = await resend.emails.send({
        from: 'Triple Cities Tech Blog <blog@triplecitiestech.com>',
        to: approvalEmail,
        subject: `📝 Blog Post Ready for Review: "${blogDraft.title}"`,
        html: generateBlogApprovalEmail(emailProps),
        text: generateBlogApprovalEmailText(emailProps)
      });
      console.log(`✉️ Approval email sent: ${emailResult.data?.id}`);
    }

    console.log('✅ Blog generation complete');
  } catch (error) {
    console.error('❌ Background generation failed:', error);
    // Mark the post as failed so the UI can detect it
    try {
      await prisma.blogPost.update({
        where: { id: blogPostId },
        data: {
          status: 'REJECTED',
          content: `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }
      });
    } catch (updateError) {
      console.error('Failed to update blog post status:', updateError);
    }
  }
}

/**
 * POST /api/blog/generate-now
 *
 * Creates a placeholder blog post and kicks off generation in the background.
 * Returns immediately so the client never times out.
 */
export async function POST() {
  try {
    const { prisma } = await import('@/lib/prisma');

    // Check for pending approval posts
    const pendingPosts = await prisma.blogPost.count({
      where: { status: 'PENDING_APPROVAL' }
    });

    if (pendingPosts >= 3) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Too many pending approval posts (max 3)',
        pendingCount: pendingPosts
      });
    }

    // Find a default category for the placeholder
    let category = await prisma.blogCategory.findFirst();
    if (!category) {
      category = await prisma.blogCategory.create({
        data: {
          name: 'Cybersecurity News',
          slug: 'cybersecurity-news',
          description: 'Blog posts about cybersecurity news'
        }
      });
    }

    // Create placeholder blog post with DRAFT status
    const blogPost = await prisma.blogPost.create({
      data: {
        title: 'Generating...',
        slug: `generating-${Date.now()}`,
        excerpt: 'AI is generating this blog post...',
        content: 'Generation in progress...',
        metaTitle: 'Generating...',
        metaDescription: 'AI is generating this blog post...',
        keywords: [],
        sourceUrls: [],
        aiPrompt: '',
        aiModel: '',
        status: 'DRAFT',
        categoryId: category.id,
      }
    });

    // Run the actual generation AFTER the response is sent
    after(() => runBlogGeneration(blogPost.id));

    return NextResponse.json({
      success: true,
      message: 'Blog generation started! The post will appear on the blog dashboard when ready.',
      blogPostId: blogPost.id,
    });
  } catch (error) {
    console.error('❌ Error starting blog generation:', error);
    return NextResponse.json(
      {
        error: 'Failed to start blog generation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/blog/generate-now?id=xxx
 *
 * Poll for the status of a blog post being generated.
 * Also supports legacy calls without an ID (triggers generation synchronously for cron compatibility).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  // Status polling mode
  if (id) {
    try {
      const { prisma } = await import('@/lib/prisma');
      const post = await prisma.blogPost.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          content: true,
          category: { select: { name: true } },
        }
      });

      if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      }

      const isGenerating = post.status === 'DRAFT' && post.title === 'Generating...';
      const isFailed = post.status === 'REJECTED' && post.content?.startsWith('Generation failed');

      return NextResponse.json({
        id: post.id,
        status: isGenerating ? 'generating' : isFailed ? 'failed' : 'complete',
        title: post.title,
        slug: post.slug,
        category: post.category?.name,
        blogStatus: post.status,
        error: isFailed ? post.content : undefined,
      });
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to check status', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  }

  // Legacy mode: synchronous generation (for backward compat / cron)
  try {
    const { prisma } = await import('@/lib/prisma');

    const pendingPosts = await prisma.blogPost.count({ where: { status: 'PENDING_APPROVAL' } });
    if (pendingPosts >= 3) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Too many pending approval posts (max 3)' });
    }

    const { articles, trendingTopics } = await contentCurator.selectArticlesForBlog({
      maxArticles: 5, daysBack: 3, preferTrending: true
    });

    if (articles.length === 0) {
      return NextResponse.json({ success: false, error: 'No articles found from RSS feeds.' }, { status: 400 });
    }

    const blogDraft = await blogGenerator.generateBlogPost(articles, trendingTopics);
    const validation = blogGenerator.validateDraft(blogDraft);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: 'Validation failed', validationErrors: validation.errors }, { status: 400 });
    }

    let category = await prisma.blogCategory.findUnique({
      where: { slug: blogDraft.category.toLowerCase().replace(/\s+/g, '-') }
    });
    if (!category) {
      category = await prisma.blogCategory.create({
        data: { name: blogDraft.category, slug: blogDraft.category.toLowerCase().replace(/\s+/g, '-'), description: `Blog posts about ${blogDraft.category}` }
      });
    }

    const approvalToken = crypto.randomBytes(32).toString('hex');
    const blogPost = await prisma.blogPost.create({
      data: {
        title: blogDraft.title, slug: blogDraft.slug, excerpt: blogDraft.excerpt,
        content: blogDraft.content, metaTitle: blogDraft.metaTitle, metaDescription: blogDraft.metaDescription,
        keywords: blogDraft.keywords, sourceUrls: blogDraft.sourceUrls, aiPrompt: blogDraft.aiPrompt,
        aiModel: blogDraft.aiModel, status: 'PENDING_APPROVAL', categoryId: category.id,
        approvalToken, sentForApproval: new Date()
      }
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';
    const approvalEmail = process.env.APPROVAL_EMAIL || 'kurtis@triplecitiestech.com';
    if (resend) {
      await resend.emails.send({
        from: 'Triple Cities Tech Blog <blog@triplecitiestech.com>',
        to: approvalEmail,
        subject: `📝 Blog Post Ready for Review: "${blogDraft.title}"`,
        html: generateBlogApprovalEmail({
          blogPost: blogDraft, approvalToken,
          previewUrl: `${baseUrl}/api/blog/approval/${approvalToken}/preview`,
          approveUrl: `${baseUrl}/api/blog/approval/${approvalToken}/approve`,
          rejectUrl: `${baseUrl}/api/blog/approval/${approvalToken}/reject`,
          editUrl: `${baseUrl}/admin/blog/${blogPost.id}/edit`
        }),
        text: generateBlogApprovalEmailText({
          blogPost: blogDraft, approvalToken,
          previewUrl: `${baseUrl}/api/blog/approval/${approvalToken}/preview`,
          approveUrl: `${baseUrl}/api/blog/approval/${approvalToken}/approve`,
          rejectUrl: `${baseUrl}/api/blog/approval/${approvalToken}/reject`,
          editUrl: `${baseUrl}/admin/blog/${blogPost.id}/edit`
        })
      });
    }

    return NextResponse.json({
      success: true,
      message: `Blog post generated! Approval email sent to ${approvalEmail}`,
      blogPost: { id: blogPost.id, title: blogPost.title, slug: blogPost.slug, category: category.name, status: blogPost.status },
      articlesUsed: articles.length,
      trendingTopic: trendingTopics[0]?.keyword || null,
    });
  } catch (error) {
    console.error('❌ Error generating blog post:', error);
    return NextResponse.json({ error: 'Failed to generate blog post', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
