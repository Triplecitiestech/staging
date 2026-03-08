import { NextRequest, NextResponse } from 'next/server';
import { runBackfill, BackfillResult } from '@/lib/reporting/backfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = request.nextUrl.searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  return (
    secret === process.env.MIGRATION_SECRET ||
    secret === process.env.CRON_SECRET ||
    authHeader === `Bearer ${process.env.CRON_SECRET}`
  );
}

/**
 * GET /api/reports/jobs/backfill?secret=XXX
 *
 * Auto-chaining backfill: runs as much as possible within 50s,
 * then automatically calls itself to continue if there's more work.
 * One URL, no manual re-running needed.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const months = parseInt(request.nextUrl.searchParams.get('months') || '6', 10);
  const startStep = request.nextUrl.searchParams.get('step') || undefined;
  const allResults: BackfillResult[] = [];
  let iteration = 0;
  const MAX_ITERATIONS = 30; // Safety limit

  let currentStep = startStep;
  const overallStart = Date.now();

  // Auto-chain: keep running until complete or we hit the time/iteration limit
  // Each iteration gets a 45s budget, and we leave buffer for the response
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    const iterBudget = Math.min(45000, 55000 - (Date.now() - overallStart));
    if (iterBudget < 5000) break; // Not enough time for another iteration

    try {
      const result = await runBackfill(months, currentStep, iterBudget);
      allResults.push(result);

      if (result.complete) {
        // All done!
        return NextResponse.json({
          success: true,
          complete: true,
          iterations: iteration,
          totalDurationMs: Date.now() - overallStart,
          results: allResults,
        });
      }

      // More work to do — continue in this request if we have time
      currentStep = result.nextStep || undefined;
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : 'Backfill failed',
        iterations: iteration,
        totalDurationMs: Date.now() - overallStart,
        results: allResults,
        continueFrom: currentStep,
      }, { status: 500 });
    }
  }

  // Ran out of time in this request — tell user to continue
  const lastResult = allResults[allResults.length - 1];
  const continueStep = lastResult?.nextStep || currentStep;

  // Build the continuation URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || '';
  const secret = request.nextUrl.searchParams.get('secret') || '';
  const continueUrl = continueStep
    ? `${baseUrl}/api/reports/jobs/backfill?secret=${encodeURIComponent(secret)}&step=${continueStep}&months=${months}`
    : null;

  return NextResponse.json({
    success: true,
    complete: false,
    iterations: iteration,
    totalDurationMs: Date.now() - overallStart,
    results: allResults,
    continueFrom: continueStep,
    continueUrl,
    message: continueUrl
      ? `More work remaining. Open this URL to continue: ${continueUrl}`
      : 'More work remaining. Run again to continue.',
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const months = parseInt(request.nextUrl.searchParams.get('months') || '6', 10);
  const startStep = request.nextUrl.searchParams.get('step') || undefined;

  try {
    const result = await runBackfill(months, startStep);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backfill failed' },
      { status: 500 },
    );
  }
}
