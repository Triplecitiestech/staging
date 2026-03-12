import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { detectAnomalies, generateInsights, predictTrends } from '@/lib/reporting/analytics';
import { parseFiltersFromParams } from '@/lib/reporting/filters';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/analytics
 * Returns anomalies, operational insights, and predictive trends.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const filters = parseFiltersFromParams(request.nextUrl.searchParams);
    const forecastDays = parseInt(request.nextUrl.searchParams.get('forecastDays') || '30', 10);

    const [anomalies, insights, predictions] = await Promise.all([
      detectAnomalies(filters.dateRange),
      generateInsights(filters.dateRange),
      predictTrends(forecastDays, filters.dateRange),
    ]);

    return NextResponse.json({
      anomalies,
      insights,
      predictions,
      meta: {
        generatedAt: new Date().toISOString(),
        period: {
          from: filters.dateRange.from.toISOString().split('T')[0],
          to: filters.dateRange.to.toISOString().split('T')[0],
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/analytics] Failed:', message);

    if (message.includes('does not exist') || message.includes('P2021') || message.includes('P2010')) {
      return NextResponse.json({
        anomalies: [],
        insights: [],
        predictions: [],
        meta: {
          generatedAt: new Date().toISOString(),
          period: { from: '', to: '' },
        },
        _warning: 'Reporting tables not yet created. Run database migration and data pipeline.',
      });
    }

    return NextResponse.json(
      { error: `Failed to generate analytics: ${message}` },
      { status: 500 },
    );
  }
}
