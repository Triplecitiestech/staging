import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { runAllValidationTests } from '@/lib/reporting/validation-tests';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/reports/validate-all?secret=MIGRATION_SECRET
 * Runs all reporting validation tests against the live database.
 * Auth via MIGRATION_SECRET or admin session.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  const secretValid = secret && secret === process.env.MIGRATION_SECRET;

  const isDev = process.env.NODE_ENV === 'development';

  if (!secretValid && !isDev) {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const report = await runAllValidationTests();
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/validate-all] Failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
