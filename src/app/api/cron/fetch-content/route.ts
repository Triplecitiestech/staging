import { NextRequest, NextResponse } from 'next/server';
import { contentCurator } from '@/lib/content-curator';

// Disable static generation for this API route
export const dynamic = 'force-dynamic';

/**
 * Cron endpoint to fetch latest content from RSS feeds
 * Triggered daily at 6 AM via Vercel Cron or GitHub Actions
 *
 * POST /api/cron/fetch-content
 * Authorization: Bearer <BLOG_CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  try {
    // Dynamic import to prevent Prisma loading during build
    const { prisma } = await import('@/lib/prisma');

    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const secret = process.env.BLOG_CRON_SECRET;

    if (!secret) {
      console.warn('⚠️ BLOG_CRON_SECRET not configured');
    } else if (authHeader !== `Bearer ${secret}`) {
      console.error('❌ Invalid cron secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔍 Fetching content from RSS feeds...');

    // Fetch recent articles (last 7 days)
    const articles = await contentCurator.fetchRecentArticles(7);

    console.log(`✅ Fetched ${articles.length} articles`);

    // Update all content sources last fetched timestamp
    const sources = await prisma.contentSource.findMany({
      where: { isActive: true }
    });

    if (sources.length === 0) {
      // Initialize default sources if none exist
      console.log('📝 Initializing default content sources...');

      const { DEFAULT_SOURCES } = await import('@/lib/content-curator');

      for (const source of DEFAULT_SOURCES) {
        await prisma.contentSource.create({
          data: {
            name: source.name,
            url: source.url,
            rssFeedUrl: source.rssFeedUrl,
            isActive: true,
            lastFetched: new Date()
          }
        });
      }

      console.log(`✅ Created ${DEFAULT_SOURCES.length} content sources`);
    } else {
      // Update last fetched timestamp
      await prisma.contentSource.updateMany({
        where: { isActive: true },
        data: { lastFetched: new Date() }
      });

      console.log(`✅ Updated ${sources.length} content sources`);
    }

    // Identify trending topics
    const trendingTopics = await contentCurator.identifyTrendingTopics(3);

    console.log(`🔥 Identified ${trendingTopics.length} trending topics`);

    return NextResponse.json({
      success: true,
      articlesFound: articles.length,
      trendingTopics: trendingTopics.map(t => ({
        keyword: t.keyword,
        frequency: t.frequency,
        relevanceScore: t.relevanceScore
      })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error fetching content:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch content',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
