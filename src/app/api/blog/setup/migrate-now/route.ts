import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET version of migrate - visit in browser to create tables
 * GET /api/blog/setup/migrate-now
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    console.log('🚀 Creating blog tables...');

    // Create BlogStatus enum
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "BlogStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create all tables
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "blog_categories" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "name" TEXT NOT NULL UNIQUE,
        "slug" TEXT NOT NULL UNIQUE,
        "description" TEXT
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "blog_tags" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "name" TEXT NOT NULL UNIQUE,
        "slug" TEXT NOT NULL UNIQUE
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "blog_posts" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "slug" TEXT NOT NULL UNIQUE,
        "title" TEXT NOT NULL,
        "excerpt" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "featuredImage" TEXT,
        "sourceUrls" TEXT[] NOT NULL DEFAULT '{}',
        "aiPrompt" TEXT,
        "aiModel" TEXT,
        "status" "BlogStatus" NOT NULL DEFAULT 'DRAFT',
        "scheduledFor" TIMESTAMP(3),
        "publishedAt" TIMESTAMP(3),
        "metaTitle" TEXT,
        "metaDescription" TEXT,
        "keywords" TEXT[] NOT NULL DEFAULT '{}',
        "facebookPostId" TEXT,
        "instagramPostId" TEXT,
        "linkedinPostId" TEXT,
        "twitterPostId" TEXT,
        "sentForApproval" TIMESTAMP(3),
        "approvedAt" TIMESTAMP(3),
        "approvedBy" TEXT,
        "approvalToken" TEXT UNIQUE,
        "rejectionReason" TEXT,
        "revisionCount" INTEGER NOT NULL DEFAULT 0,
        "views" INTEGER NOT NULL DEFAULT 0,
        "shares" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "authorId" TEXT,
        "categoryId" TEXT,
        CONSTRAINT "blog_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "blog_posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "blog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_BlogPostToBlogTag" (
        "A" TEXT NOT NULL,
        "B" TEXT NOT NULL,
        CONSTRAINT "_BlogPostToBlogTag_AB_pkey" PRIMARY KEY ("A", "B"),
        CONSTRAINT "_BlogPostToBlogTag_A_fkey" FOREIGN KEY ("A") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "_BlogPostToBlogTag_B_fkey" FOREIGN KEY ("B") REFERENCES "blog_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "content_sources" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "rssFeedUrl" TEXT,
        "apiEndpoint" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "lastFetched" TIMESTAMP(3),
        "fetchFrequency" TEXT NOT NULL DEFAULT 'daily',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "blog_settings" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "key" TEXT NOT NULL UNIQUE,
        "value" TEXT NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedBy" TEXT
      );
    `);

    // Create indexes
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "blog_posts_status_publishedAt_idx" ON "blog_posts"("status", "publishedAt");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "_BlogPostToBlogTag_B_index" ON "_BlogPostToBlogTag"("B");`);

    // Seed categories
    await prisma.$executeRawUnsafe(`
      INSERT INTO "blog_categories" ("id", "name", "slug", "description")
      VALUES
        (gen_random_uuid()::text, 'Cybersecurity News', 'cybersecurity-news', 'Latest cybersecurity news and alerts'),
        (gen_random_uuid()::text, 'IT Tips', 'it-tips', 'Practical IT tips for small businesses')
      ON CONFLICT (slug) DO NOTHING;
    `);

    return NextResponse.json({
      success: true,
      message: 'All blog tables created! Blog system is now ready.',
      nextSteps: [
        'Visit /admin/blog',
        'Visit /admin/blog/settings to configure AI guidelines',
        'Generate your first post'
      ]
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Migration failed',
        hint: 'Check Vercel logs for details'
      },
      { status: 500 }
    );
  }
}
