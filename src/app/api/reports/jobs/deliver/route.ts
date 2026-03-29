import { NextRequest, NextResponse } from 'next/server';
import { processScheduledReports } from '@/lib/reporting/scheduler';
import { classifyError, withRetry } from '@/lib/resilience';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/reports/jobs/deliver?secret=CRON_SECRET
 * Process all due scheduled reports and send email deliveries.
 * Called by Vercel cron.
 */
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
    const result = await withRetry(() => processScheduledReports(), { maxRetries: 1, baseDelayMs: 2000 });
    return NextResponse.json({
      status: result.failed > 0 ? 'partial' : 'success',
      ...result,
    });
  } catch (err) {
    const classified = classifyError(err);
    if (classified.isTransient) {
      return NextResponse.json({ error: classified.message, transient: true }, { status: 200 });
    }
    return NextResponse.json(
      { error: classified.message },
      { status: 500 },
    );
  }
}
