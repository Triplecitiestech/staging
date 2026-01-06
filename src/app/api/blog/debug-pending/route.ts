import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint - check pending blog posts
 * GET /api/blog/debug-pending
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    const pendingPosts = await prisma.blogPost.findMany({
      where: {
        status: 'PENDING_APPROVAL'
      },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        approvalToken: true,
        sentForApproval: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const allPosts = await prisma.blogPost.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        approvalToken: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    return NextResponse.json({
      success: true,
      pendingPosts: pendingPosts.map(post => ({
        ...post,
        approvalToken: post.approvalToken ? `${post.approvalToken.substring(0, 16)}...` : null,
        approvalLink: post.approvalToken
          ? `https://www.triplecitiestech.com/api/blog/approval/${post.approvalToken}/approve`
          : null
      })),
      allPosts: allPosts.map(post => ({
        ...post,
        approvalToken: post.approvalToken ? `${post.approvalToken.substring(0, 16)}...` : null
      })),
      counts: {
        pending: pendingPosts.length,
        total: allPosts.length
      }
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
