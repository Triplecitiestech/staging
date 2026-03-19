import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * Blog system health check endpoint.
 * Returns the current status of blog generation, approval, publishing, and social media.
 *
 * GET /api/blog/health
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { prisma } = await import('@/lib/prisma');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get post counts by status
    const [
      totalPosts,
      drafts,
      pendingApproval,
      approved,
      published,
      rejected,
      recentPublished,
      recentGenerated,
      failedSocialPosts,
      successfulSocialPosts,
      latestPost,
      latestPublished
    ] = await Promise.all([
      prisma.blogPost.count(),
      prisma.blogPost.count({ where: { status: 'DRAFT' } }),
      prisma.blogPost.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.blogPost.count({ where: { status: 'APPROVED' } }),
      prisma.blogPost.count({ where: { status: 'PUBLISHED' } }),
      prisma.blogPost.count({ where: { status: 'REJECTED' } }),
      prisma.blogPost.count({
        where: { status: 'PUBLISHED', publishedAt: { gte: thirtyDaysAgo } }
      }),
      prisma.blogPost.count({
        where: { createdAt: { gte: sevenDaysAgo } }
      }),
      prisma.socialMediaPost.count({
        where: { status: 'failed', createdAt: { gte: thirtyDaysAgo } }
      }),
      prisma.socialMediaPost.count({
        where: { status: 'posted', createdAt: { gte: thirtyDaysAgo } }
      }),
      prisma.blogPost.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { title: true, status: true, createdAt: true }
      }),
      prisma.blogPost.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        select: { title: true, publishedAt: true, slug: true }
      })
    ]);

    // Determine overall health status
    const issues: string[] = [];

    // Check generation frequency
    if (recentGenerated === 0) {
      issues.push('No blog posts generated in the last 7 days');
    }

    // Check for stuck pending posts
    if (pendingApproval > 3) {
      issues.push(`${pendingApproval} posts pending approval (max recommended: 3)`);
    }

    // Check approved but not published
    if (approved > 0) {
      issues.push(`${approved} approved post(s) waiting to be published`);
    }

    // Check social media failures
    if (failedSocialPosts > 0) {
      issues.push(`${failedSocialPosts} social media post(s) failed in last 30 days`);
    }

    // Check environment
    const envChecks = {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      CRON_SECRET: !!(process.env.CRON_SECRET || process.env.BLOG_CRON_SECRET),
      FACEBOOK_ACCESS_TOKEN: !!process.env.FACEBOOK_ACCESS_TOKEN,
      INSTAGRAM_ACCESS_TOKEN: !!process.env.INSTAGRAM_ACCESS_TOKEN,
      LINKEDIN_ACCESS_TOKEN: !!process.env.LINKEDIN_ACCESS_TOKEN
    };

    if (!envChecks.ANTHROPIC_API_KEY) issues.push('ANTHROPIC_API_KEY not configured');
    if (!envChecks.RESEND_API_KEY) issues.push('RESEND_API_KEY not configured');
    if (!envChecks.CRON_SECRET) issues.push('CRON_SECRET not configured');

    const status = issues.length === 0 ? 'healthy' : issues.length <= 2 ? 'degraded' : 'unhealthy';

    return NextResponse.json({
      status,
      timestamp: now.toISOString(),
      posts: {
        total: totalPosts,
        drafts,
        pendingApproval,
        approved,
        published,
        rejected,
        recentPublished,
        recentGenerated
      },
      socialMedia: {
        successfulPosts: successfulSocialPosts,
        failedPosts: failedSocialPosts,
        platforms: {
          facebook: envChecks.FACEBOOK_ACCESS_TOKEN ? 'configured' : 'not configured',
          instagram: envChecks.INSTAGRAM_ACCESS_TOKEN ? 'configured' : 'not configured',
          linkedin: envChecks.LINKEDIN_ACCESS_TOKEN ? 'configured' : 'not configured'
        }
      },
      latest: {
        generated: latestPost ? {
          title: latestPost.title,
          status: latestPost.status,
          createdAt: latestPost.createdAt
        } : null,
        published: latestPublished ? {
          title: latestPublished.title,
          publishedAt: latestPublished.publishedAt,
          slug: latestPublished.slug
        } : null
      },
      environment: envChecks,
      issues
    });
  } catch (error) {
    console.error('Blog health check error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
