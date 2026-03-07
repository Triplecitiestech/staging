import { NextRequest, NextResponse } from 'next/server';
import { computeLifecycle } from '@/lib/reporting/lifecycle';

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
    const result = await computeLifecycle();
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Computation failed' },
      { status: 500 },
    );
  }
}
