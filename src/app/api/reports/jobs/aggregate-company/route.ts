import { NextRequest, NextResponse } from 'next/server';
import { aggregateCompanyDaily } from '@/lib/reporting/aggregation';
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
    const dateParam = request.nextUrl.searchParams.get('date');
    const date = dateParam ? new Date(dateParam) : undefined;
    const result = await withRetry(() => aggregateCompanyDaily(date), { maxRetries: 1, baseDelayMs: 2000 });
    return NextResponse.json({ success: true, result });
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
