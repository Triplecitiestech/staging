import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { parseFiltersFromParams } from '@/lib/reporting/filters';
import { getEnhancedHealthReport } from '@/lib/reporting/enhanced-services';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const filters = parseFiltersFromParams(request.nextUrl.searchParams);
    const result = await getEnhancedHealthReport(filters);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/customer-health] Failed to load health metrics:', message);

    if (
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('P2021') ||
      message.includes('P2010')
    ) {
      return NextResponse.json({
        scores: [],
        distribution: { healthy: 0, needsAttention: 0, atRisk: 0, critical: 0 },
        meta: {
          period: {
            from: new Date().toISOString().split('T')[0],
            to: new Date().toISOString().split('T')[0],
          },
          generatedAt: new Date().toISOString(),
          dataFreshness: null,
          ticketCount: 0,
        },
        _warning: 'Reporting data pipeline has not been run yet. Run sync jobs to populate data.',
      });
    }

    return NextResponse.json(
      { error: `Failed to fetch health metrics: ${message}` },
      { status: 500 },
    );
  }
}
