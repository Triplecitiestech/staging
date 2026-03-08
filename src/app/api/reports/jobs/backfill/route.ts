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
 * Fully automatic backfill. Runs one iteration (~50s), then fire-and-forget
 * calls itself to continue. You open the URL once, and it keeps going
 * server-side until everything is synced.
 *
 * Add &nochain=1 to disable auto-chaining (manual mode).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const months = parseInt(request.nextUrl.searchParams.get('months') || '6', 10);
  const startStep = request.nextUrl.searchParams.get('step') || undefined;
  const noChain = request.nextUrl.searchParams.get('nochain') === '1';
  const chainCount = parseInt(request.nextUrl.searchParams.get('chain') || '0', 10);
  const MAX_CHAINS = 30; // Safety: stop after 30 self-calls (~25 min max)
  const allResults: BackfillResult[] = [];
  let iteration = 0;

  let currentStep = startStep;
  const overallStart = Date.now();

  // Run as many iterations as we can within this request's timeout
  while (iteration < 5) {
    iteration++;
    const iterBudget = Math.min(45000, 52000 - (Date.now() - overallStart));
    if (iterBudget < 5000) break;

    try {
      const result = await runBackfill(months, currentStep, iterBudget);
      allResults.push(result);

      if (result.complete) {
        return NextResponse.json({
          success: true,
          complete: true,
          totalChains: chainCount + 1,
          iterations: iteration,
          totalDurationMs: Date.now() - overallStart,
          results: allResults,
        });
      }

      currentStep = result.nextStep || undefined;
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : 'Backfill failed',
        totalChains: chainCount + 1,
        iterations: iteration,
        totalDurationMs: Date.now() - overallStart,
        results: allResults,
        continueFrom: currentStep,
      }, { status: 500 });
    }
  }

  // We ran out of time in this request. Fire-and-forget the next one.
  const lastResult = allResults[allResults.length - 1];
  const continueStep = lastResult?.nextStep || currentStep;

  if (!noChain && continueStep && chainCount < MAX_CHAINS) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || '';
    const secret = request.nextUrl.searchParams.get('secret') || '';
    const continueUrl = `${baseUrl}/api/reports/jobs/backfill?secret=${encodeURIComponent(secret)}&step=${continueStep}&months=${months}&chain=${chainCount + 1}`;

    // Fire-and-forget: trigger next iteration server-side
    // Using void to not await — this request returns immediately while the next one starts
    void fetch(continueUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'backfill-autochain' },
    }).catch(() => {
      // Silently ignore — if this fails, the user can manually continue
    });

    return NextResponse.json({
      success: true,
      complete: false,
      autoChaining: true,
      chainNumber: chainCount + 1,
      iterations: iteration,
      totalDurationMs: Date.now() - overallStart,
      results: allResults,
      continueFrom: continueStep,
      message: `Chain ${chainCount + 1}/${MAX_CHAINS}: processed this batch, auto-triggering next batch. It will keep going automatically.`,
    });
  }

  // Either nochain=1 or hit MAX_CHAINS
  return NextResponse.json({
    success: true,
    complete: false,
    totalChains: chainCount + 1,
    iterations: iteration,
    totalDurationMs: Date.now() - overallStart,
    results: allResults,
    continueFrom: continueStep,
    message: chainCount >= MAX_CHAINS
      ? `Reached max chain limit (${MAX_CHAINS}). Run again to continue from step: ${continueStep}`
      : `Auto-chaining disabled. Run again to continue from step: ${continueStep}`,
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
