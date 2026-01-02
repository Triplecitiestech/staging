import { NextResponse } from 'next/server';

// Disable static generation for this API route
export const dynamic = 'force-dynamic';

/**
 * Automatic database migration for blog system
 * Creates all necessary tables and indexes
 * POST /api/blog/setup/migrate
 */
export async function POST() {
  try {
    // Dynamic import to prevent Prisma loading during build
    const { prisma } = await import('@/lib/prisma');

    console.log('🚀 Starting blog database migration...');

    const tablesCreated: string[] = [];

    // Check and create BlogStatus enum
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "BlogStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log('✅ BlogStatus enum ready');
    } catch (error) {
      console.log('⚠️ BlogStatus enum already exists or error:', error);
    }

    // Create blog_categories table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "blog_categories" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL UNIQUE,
          "slug" TEXT NOT NULL UNIQUE,
          "description" TEXT
        );
      `);
      tablesCreated.push('blog_categories');
    } catch (error) {
      console.log('⚠️ blog_categories error:', error);
    }

    // Create blog_tags table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "blog_tags" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL UNIQUE,
          "slug" TEXT NOT NULL UNIQUE
        );
      `);
      tablesCreated.push('blog_tags');
    } catch (error) {
      console.log('⚠️ blog_tags error:', error);
    }

    // Create blog_posts table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "blog_posts" (
          "id" TEXT NOT NULL PRIMARY KEY,
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
      tablesCreated.push('blog_posts');
    } catch (error) {
      console.log('⚠️ blog_posts error:', error);
    }

    // Create junction table for blog post tags
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "_BlogPostToTag" (
          "A" TEXT NOT NULL,
          "B" TEXT NOT NULL,
          CONSTRAINT "_BlogPostToTag_AB_unique" UNIQUE ("A", "B"),
          CONSTRAINT "_BlogPostToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "_BlogPostToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "blog_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      tablesCreated.push('_BlogPostToTag');
    } catch (error) {
      console.log('⚠️ _BlogPostToTag error:', error);
    }

    // Create content_sources table
    try {
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
      tablesCreated.push('content_sources');
    } catch (error) {
      console.log('⚠️ content_sources error:', error);
    }

    // Create social_media_posts table
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "social_media_posts" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "blogPostId" TEXT NOT NULL,
          "platform" TEXT NOT NULL,
          "platformId" TEXT,
          "content" TEXT NOT NULL,
          "imageUrl" TEXT,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "postedAt" TIMESTAMP(3),
          "error" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      tablesCreated.push('social_media_posts');
    } catch (error) {
      console.log('⚠️ social_media_posts error:', error);
    }

    // Create indexes
    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "blog_posts_status_publishedAt_idx" ON "blog_posts"("status", "publishedAt");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "blog_posts_slug_idx" ON "blog_posts"("slug");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "blog_posts_approvalToken_idx" ON "blog_posts"("approvalToken");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "_BlogPostToTag_B_idx" ON "_BlogPostToTag"("B");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "social_media_posts_blogPostId_platform_idx" ON "social_media_posts"("blogPostId", "platform");`);
      console.log('✅ Indexes created');
    } catch (error) {
      console.log('⚠️ Index creation error (may already exist):', error);
    }

    // Seed default categories
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "blog_categories" ("id", "name", "slug", "description")
        VALUES
          (gen_random_uuid()::text, 'Cybersecurity News', 'cybersecurity-news', 'Latest cybersecurity news and alerts'),
          (gen_random_uuid()::text, 'IT Tips', 'it-tips', 'Practical IT tips for small businesses'),
          (gen_random_uuid()::text, 'Microsoft 365', 'microsoft-365', 'Microsoft 365 updates and best practices'),
          (gen_random_uuid()::text, 'Data Protection', 'data-protection', 'Data backup and disaster recovery'),
          (gen_random_uuid()::text, 'Compliance', 'compliance', 'Compliance and regulatory updates')
        ON CONFLICT (slug) DO NOTHING;
      `);
      console.log('✅ Default categories seeded');
    } catch (error) {
      console.log('⚠️ Categories already exist or error:', error);
    }

    console.log('✅ Blog database migration complete!');

    return NextResponse.json({
      success: true,
      message: 'Database tables created successfully',
      tablesCreated
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Migration failed',
        details: 'Check server logs for more information'
      },
      { status: 500 }
    );
  }
}
