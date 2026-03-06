import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { DEFAULT_SOURCES } from '@/lib/content-curator';

// Disable static generation for this API route
export const dynamic = 'force-dynamic';

/**
 * Initialize default content sources (auth required)
 * POST or GET /api/blog/setup/sources
 */
async function setupSources() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Dynamic import to prevent Prisma loading during build
    const { prisma } = await import('@/lib/prisma');

    console.log('📰 Initializing content sources...');

    let created = 0;
    let existing = 0;

    for (const source of DEFAULT_SOURCES) {
      try {
        // Check if source already exists
        const existingSource = await prisma.contentSource.findFirst({
          where: {
            OR: [
              { name: source.name },
              { rssFeedUrl: source.rssFeedUrl }
            ]
          }
        });

        if (existingSource) {
          existing++;
          console.log(`✓ Source already exists: ${source.name}`);
        } else {
          await prisma.contentSource.create({
            data: {
              name: source.name,
              url: source.url,
              rssFeedUrl: source.rssFeedUrl,
              isActive: true
            }
          });
          created++;
          console.log(`✅ Created source: ${source.name}`);
        }
      } catch (error) {
        console.error(`⚠️ Error with source ${source.name}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      count: DEFAULT_SOURCES.length,
      created,
      existing,
      sources: DEFAULT_SOURCES.map(s => s.name)
    });

  } catch (error) {
    console.error('❌ Failed to initialize sources:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initialize sources'
      },
      { status: 500 }
    );
  }
}

// Export both GET and POST handlers
export async function GET() {
  return setupSources();
}

export async function POST() {
  return setupSources();
}
