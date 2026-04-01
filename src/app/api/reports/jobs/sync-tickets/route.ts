import { NextRequest, NextResponse } from 'next/server';
import { syncTickets } from '@/lib/reporting/sync';
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
    // Default 180 days to cover quarterly reports plus buffer
    const days = parseInt(request.nextUrl.searchParams.get('days') || '180', 10);
    // force=true ignores lastSync date and does a full re-sync for the given days window
    const force = request.nextUrl.searchParams.get('force') === 'true';
    // company= filter to sync a single company (by name or ID) — avoids timeout on full force sync
    const companyFilter = request.nextUrl.searchParams.get('company') || undefined;
    // Do NOT wrap in withRetry — this job has its own time budget and can take
    // 50s+. Retrying the whole thing just guarantees a timeout.
    const result = await syncTickets(days, 2, force, companyFilter);
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
