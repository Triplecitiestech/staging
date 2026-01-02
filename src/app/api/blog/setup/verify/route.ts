import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Disable static generation for this API route
export const dynamic = 'force-dynamic';

/**
 * Verify blog system configuration
 * GET /api/blog/setup/verify
 */
export async function GET() {
  try {
    const checks = {
      database: false,
      categories: false,
      contentSources: false,
      anthropicKey: false,
      resendKey: false,
      approvalEmail: false,
      cronSecret: false
    };

    const missing: string[] = [];

    // Check database tables
    try {
      const categoryCount = await prisma.blogCategory.count();
      checks.database = true;
      checks.categories = categoryCount > 0;

      if (!checks.categories) {
        missing.push('No blog categories found');
      }
    } catch (error) {
      checks.database = false;
      missing.push('Database tables not created');
    }

    // Check content sources
    try {
      const sourceCount = await prisma.contentSource.count();
      checks.contentSources = sourceCount > 0;

      if (!checks.contentSources) {
        missing.push('No content sources configured');
      }
    } catch (error) {
      checks.contentSources = false;
      missing.push('Content sources table not created');
    }

    // Check environment variables
    checks.anthropicKey = !!process.env.ANTHROPIC_API_KEY;
    checks.resendKey = !!process.env.RESEND_API_KEY;
    checks.approvalEmail = !!process.env.APPROVAL_EMAIL;
    checks.cronSecret = !!process.env.BLOG_CRON_SECRET;

    if (!checks.anthropicKey) {
      missing.push('ANTHROPIC_API_KEY not set (required for AI generation)');
    }
    if (!checks.resendKey) {
      missing.push('RESEND_API_KEY not set (required for approval emails)');
    }
    if (!checks.approvalEmail) {
      missing.push('APPROVAL_EMAIL not set');
    }
    if (!checks.cronSecret) {
      missing.push('BLOG_CRON_SECRET not set (will be auto-generated)');
    }

    const ready = checks.database && checks.categories && checks.contentSources;

    return NextResponse.json({
      ready,
      checks,
      missing: missing.length > 0 ? missing : undefined,
      status: ready ? 'Blog system is ready!' : 'Some configuration needed',
      nextSteps: !ready ? [
        'Visit /blog/setup to run automatic setup',
        'Configure missing environment variables in Vercel'
      ] : [
        'Visit /blog to see your blog',
        'AI will generate posts Mon/Wed/Fri at 8 AM',
        'Check email for approval requests'
      ]
    });

  } catch (error) {
    return NextResponse.json(
      {
        ready: false,
        error: error instanceof Error ? error.message : 'Verification failed',
        suggestion: 'Run setup at /blog/setup'
      },
      { status: 500 }
    );
  }
}
