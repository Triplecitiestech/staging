import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { runAllValidationTests } from '@/lib/reporting/validation-tests';
import { checkSecretAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/reports/validate-all
 * Runs all reporting validation tests against the live database.
 * Auth via Authorization header, query param secret, or admin session.
 */
export async function GET(request: NextRequest) {
  const secretDenied = checkSecretAuth(request);

  const isDev = process.env.NODE_ENV === 'development';

  if (secretDenied && !isDev) {
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
