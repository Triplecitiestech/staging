import { NextResponse } from 'next/server';
import { contentCurator } from '@/lib/content-curator';
import { blogGenerator } from '@/lib/blog-generator';
import { generateBlogApprovalEmail, generateBlogApprovalEmailText } from '@/lib/email-templates/blog-approval';
import { Resend } from 'resend';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * POST /api/blog/process-generation
 *
 * Runs the actual heavy blog generation work (RSS + AI + email).
 * Called as a fire-and-forget from the client after creating a placeholder post.
 * Runs in its own Vercel function invocation with maxDuration = 60.
 */
export async function POST(request: Request) {
  let blogPostId: string | undefined;

  try {
    const body = await request.json();
    blogPostId = body.blogPostId;

    if (!blogPostId) {
      return NextResponse.json({ error: 'blogPostId is required' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');

    console.log(`🤖 Processing blog generation for post ${blogPostId}...`);

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
          title: 'Generation Failed',
          status: 'REJECTED',
          content: 'No articles found from RSS feeds. Check that feeds are configured and have recent content.',
        }
      });
      return NextResponse.json({ success: false, error: 'No articles found' });
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
          title: 'Generation Failed',
          status: 'REJECTED',
          content: `Validation failed: ${validation.errors.join(', ')}`,
        }
      });
      return NextResponse.json({ success: false, error: 'Validation failed', errors: validation.errors });
    }

    // Find or create category
    const categorySlug = blogDraft.category.toLowerCase().replace(/\s+/g, '-');
    let category = await prisma.blogCategory.findUnique({
      where: { slug: categorySlug }
    });

    if (!category) {
      category = await prisma.blogCategory.create({
        data: {
          name: blogDraft.category,
          slug: categorySlug,
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
      try {
        const emailResult = await resend.emails.send({
          from: 'Triple Cities Tech Blog <blog@triplecitiestech.com>',
          to: approvalEmail,
          subject: `📝 Blog Post Ready for Review: "${blogDraft.title}"`,
          html: generateBlogApprovalEmail(emailProps),
          text: generateBlogApprovalEmailText(emailProps)
        });
        console.log(`✉️ Approval email sent: ${emailResult.data?.id}`);
      } catch (emailError) {
        console.error('⚠️ Failed to send approval email:', emailError);
        // Don't fail the whole generation just because email failed
      }
    }

    console.log('✅ Blog generation complete');
    return NextResponse.json({ success: true, blogPostId });
  } catch (error) {
    console.error('❌ Blog generation failed:', error);

    // Mark the post as failed
    if (blogPostId) {
      try {
        const { prisma } = await import('@/lib/prisma');
        await prisma.blogPost.update({
          where: { id: blogPostId },
          data: {
            title: 'Generation Failed',
            status: 'REJECTED',
            content: `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }
        });
      } catch (updateError) {
        console.error('Failed to update blog post status:', updateError);
      }
    }

    return NextResponse.json(
      { error: 'Generation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
