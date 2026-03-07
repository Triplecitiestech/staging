import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint to verify environment variable availability.
 * GET /api/reports/diagnose-env?secret=MIGRATION_SECRET
 *
 * Reports whether required env vars are set (never prints values).
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const check = (name: string) => ({
    name,
    set: !!process.env[name],
    length: process.env[name] ? process.env[name]!.length : 0,
  });

  const vars = [
    check('DATABASE_URL'),
    check('PRISMA_DATABASE_URL'),
    check('MIGRATION_SECRET'),
    check('POSTGRES_URL'),
    check('NEXTAUTH_SECRET'),
    check('NEXTAUTH_URL'),
    check('NEXT_PUBLIC_BASE_URL'),
    check('VERCEL_ENV'),
    check('VERCEL_URL'),
    check('VERCEL_GIT_COMMIT_REF'),
  ];

  // Test actual DB connectivity (without exposing connection string)
  let dbConnected = false;
  let dbError: string | null = null;
  try {
    const { prisma } = await import('@/lib/prisma');
    const result = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
    dbConnected = !!result[0]?.now;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    environment: process.env.VERCEL_ENV || 'unknown',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    variables: vars,
    database: {
      connected: dbConnected,
      error: dbError,
      usedVar: 'DATABASE_URL (via prisma.ts Pool constructor)',
    },
  });
}
