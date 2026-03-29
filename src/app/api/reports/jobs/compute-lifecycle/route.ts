import { NextRequest, NextResponse } from 'next/server';
import { computeLifecycle } from '@/lib/reporting/lifecycle';
import { classifyError, withRetry } from '@/lib/resilience';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  const isAuthorized =
    secret === process.env.MIGRATION_SECRET ||
    secret === process.env.CRON_SECRET ||
    authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withRetry(() => computeLifecycle(), {
      maxRetries: 1,
      baseDelayMs: 2000,
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    const classified = classifyError(err);
    if (classified.isTransient) {
      return NextResponse.json({
        success: false,
        transient: true,
        message: `Transient ${classified.category} error: ${classified.message}`,
      });
    }
    return NextResponse.json(
      { error: classified.message },
      { status: 500 },
    );
  }
}
