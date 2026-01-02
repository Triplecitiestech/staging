-- Blog System Database Migration
-- Run this in your Vercel Postgres SQL Editor
-- Dashboard: https://vercel.com/dashboard → Storage → Your Database → SQL Editor

-- ============================================
-- BLOG SYSTEM TABLES
-- ============================================

-- Blog Status Enum
DO $$ BEGIN
    CREATE TYPE "BlogStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Blog Categories
CREATE TABLE IF NOT EXISTS "blog_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "slug" TEXT NOT NULL UNIQUE,
    "description" TEXT
);

-- Blog Tags
CREATE TABLE IF NOT EXISTS "blog_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "slug" TEXT NOT NULL UNIQUE
);

-- Blog Posts
CREATE TABLE IF NOT EXISTS "blog_posts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL UNIQUE,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "featuredImage" TEXT,

    -- AI Generation metadata
    "sourceUrls" TEXT[] NOT NULL DEFAULT '{}',
    "aiPrompt" TEXT,
    "aiModel" TEXT,

    -- Publishing status
    "status" "BlogStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),

    -- SEO
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "keywords" TEXT[] NOT NULL DEFAULT '{}',

    -- Social media
    "facebookPostId" TEXT,
    "instagramPostId" TEXT,
    "linkedinPostId" TEXT,
    "twitterPostId" TEXT,

    -- Approval workflow
    "sentForApproval" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvalToken" TEXT UNIQUE,
    "rejectionReason" TEXT,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,

    -- Analytics
    "views" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Relations
    "authorId" TEXT,
    "categoryId" TEXT,

    CONSTRAINT "blog_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "blog_posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "blog_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Blog Post Tags (Many-to-Many)
CREATE TABLE IF NOT EXISTS "_BlogPostToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_BlogPostToTag_AB_unique" UNIQUE ("A", "B"),
    CONSTRAINT "_BlogPostToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BlogPostToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "blog_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Content Sources
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

-- Social Media Posts
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

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS "blog_posts_status_publishedAt_idx" ON "blog_posts"("status", "publishedAt");
CREATE INDEX IF NOT EXISTS "blog_posts_slug_idx" ON "blog_posts"("slug");
CREATE INDEX IF NOT EXISTS "blog_posts_approvalToken_idx" ON "blog_posts"("approvalToken");
CREATE INDEX IF NOT EXISTS "_BlogPostToTag_B_idx" ON "_BlogPostToTag"("B");
CREATE INDEX IF NOT EXISTS "social_media_posts_blogPostId_platform_idx" ON "social_media_posts"("blogPostId", "platform");

-- ============================================
-- SEED DEFAULT CATEGORIES
-- ============================================

INSERT INTO "blog_categories" ("id", "name", "slug", "description")
VALUES
    (gen_random_uuid()::text, 'Cybersecurity News', 'cybersecurity-news', 'Latest cybersecurity news and alerts'),
    (gen_random_uuid()::text, 'IT Tips', 'it-tips', 'Practical IT tips for small businesses'),
    (gen_random_uuid()::text, 'Microsoft 365', 'microsoft-365', 'Microsoft 365 updates and best practices'),
    (gen_random_uuid()::text, 'Data Protection', 'data-protection', 'Data backup and disaster recovery'),
    (gen_random_uuid()::text, 'Compliance', 'compliance', 'Compliance and regulatory updates')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- SEED DEFAULT CONTENT SOURCES
-- ============================================

INSERT INTO "content_sources" ("id", "name", "url", "rssFeedUrl", "isActive")
VALUES
    (gen_random_uuid()::text, 'Bleeping Computer', 'https://www.bleepingcomputer.com', 'https://www.bleepingcomputer.com/feed/', true),
    (gen_random_uuid()::text, 'Krebs on Security', 'https://krebsonsecurity.com', 'https://krebsonsecurity.com/feed/', true),
    (gen_random_uuid()::text, 'Microsoft Security Blog', 'https://www.microsoft.com/security/blog', 'https://www.microsoft.com/security/blog/feed/', true),
    (gen_random_uuid()::text, 'CISA Alerts', 'https://www.cisa.gov', 'https://www.cisa.gov/uscert/ncas/alerts.xml', true),
    (gen_random_uuid()::text, 'The Hacker News', 'https://thehackernews.com', 'https://feeds.feedburner.com/TheHackersNews', true),
    (gen_random_uuid()::text, 'Dark Reading', 'https://www.darkreading.com', 'https://www.darkreading.com/rss_simple.asp', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT 'Blog system tables created successfully!' AS message;
