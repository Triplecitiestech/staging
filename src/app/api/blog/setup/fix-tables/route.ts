import { NextResponse } from 'next/server';

// Disable static generation for this API route
export const dynamic = 'force-dynamic';

/**
 * Fix existing blog database schema issues
 * This endpoint fixes tables created with wrong names
 * GET /api/blog/setup/fix-tables
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    console.log('🔧 Fixing blog database schema...');

    const fixes: string[] = [];
    const errors: string[] = [];

    // Fix 1: Rename wrong join table if it exists
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          -- Check if wrong table exists
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_BlogPostToTag') THEN
            -- Check if correct table already exists
            IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_BlogPostToBlogTag') THEN
              -- Rename the table
              ALTER TABLE "_BlogPostToTag" RENAME TO "_BlogPostToBlogTag";

              -- Rename constraints
              ALTER TABLE "_BlogPostToBlogTag" RENAME CONSTRAINT "_BlogPostToTag_AB_unique" TO "_BlogPostToBlogTag_AB_pkey";
              ALTER TABLE "_BlogPostToBlogTag" RENAME CONSTRAINT "_BlogPostToTag_A_fkey" TO "_BlogPostToBlogTag_A_fkey";
              ALTER TABLE "_BlogPostToBlogTag" RENAME CONSTRAINT "_BlogPostToTag_B_fkey" TO "_BlogPostToBlogTag_B_fkey";

              -- Rename index
              ALTER INDEX IF EXISTS "_BlogPostToTag_B_idx" RENAME TO "_BlogPostToBlogTag_B_index";

              RAISE NOTICE 'Renamed _BlogPostToTag to _BlogPostToBlogTag';
            ELSE
              -- Copy data from wrong table to correct table
              INSERT INTO "_BlogPostToBlogTag" (SELECT * FROM "_BlogPostToTag" ON CONFLICT DO NOTHING);
              DROP TABLE "_BlogPostToTag";
              RAISE NOTICE 'Migrated data from _BlogPostToTag to _BlogPostToBlogTag';
            END IF;
          ELSE
            RAISE NOTICE 'Join table already has correct name';
          END IF;
        END $$;
      `);
      fixes.push('Join table name corrected');
    } catch (error) {
      console.error('Error fixing join table:', error);
      errors.push(`Join table: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Fix 2: Ensure blog_settings table exists
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "blog_settings" (
          "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "key" TEXT NOT NULL UNIQUE,
          "value" TEXT NOT NULL,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedBy" TEXT
        );
      `);
      fixes.push('blog_settings table verified');
    } catch (error) {
      console.error('Error creating blog_settings:', error);
      errors.push(`blog_settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Fix 3: Add missing indexes
    try {
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "_BlogPostToBlogTag_B_index" ON "_BlogPostToBlogTag"("B");`);
      fixes.push('Indexes verified');
    } catch (error) {
      console.error('Error creating indexes:', error);
      errors.push(`Indexes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Verify the schema is correct now
    const verification = {
      join_table: false,
      settings_table: false,
      can_query: false
    };

    try {
      // Test if we can query the join table
      await prisma.$queryRaw`SELECT COUNT(*) FROM "_BlogPostToBlogTag"`;
      verification.join_table = true;
    } catch (error) {
      console.error('Join table verification failed:', error);
    }

    try {
      // Test if we can query blog_settings
      await prisma.$queryRaw`SELECT COUNT(*) FROM "blog_settings"`;
      verification.settings_table = true;
    } catch (error) {
      console.error('Settings table verification failed:', error);
    }

    try {
      // Test if we can query blog posts with tags
      await prisma.blogPost.findFirst({
        include: { tags: true }
      });
      verification.can_query = true;
    } catch (error) {
      console.error('Blog post query verification failed:', error);
    }

    const allFixed = verification.join_table && verification.settings_table && verification.can_query;

    return NextResponse.json({
      success: allFixed,
      fixes,
      errors: errors.length > 0 ? errors : undefined,
      verification,
      message: allFixed
        ? '✅ All schema issues fixed! Blog system should now work.'
        : '⚠️ Some issues remain. Check errors array.',
      nextSteps: allFixed ? [
        'Refresh your browser',
        'Visit /admin/blog to manage posts',
        'Visit /admin/blog/settings to configure AI guidelines'
      ] : [
        'Check Vercel logs for detailed errors',
        'Try running /api/blog/setup/migrate',
        'Contact support if issues persist'
      ]
    });

  } catch (error) {
    console.error('❌ Schema fix failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Schema fix failed',
        details: 'Check server logs for more information'
      },
      { status: 500 }
    );
  }
}
