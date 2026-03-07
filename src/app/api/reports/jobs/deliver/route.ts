import { NextRequest, NextResponse } from 'next/server';
import { processScheduledReports } from '@/lib/reporting/scheduler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/reports/jobs/deliver?secret=CRON_SECRET
 * Process all due scheduled reports and send email deliveries.
 * Called by Vercel cron.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processScheduledReports();
    return NextResponse.json({
      status: result.failed > 0 ? 'partial' : 'success',
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delivery processing failed' },
      { status: 500 },
    );
  }
}
