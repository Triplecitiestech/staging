import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { parseFiltersFromParams } from '@/lib/reporting/filters';
import { getEnhancedHealthReport } from '@/lib/reporting/enhanced-services';
import { apiOk, apiError, generateRequestId } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const reqId = generateRequestId();
  const session = await auth();
  if (!session?.user?.email) {
    return apiError('Unauthorized', reqId, 401);
  }

  try {
    const filters = parseFiltersFromParams(request.nextUrl.searchParams);
    const result = await getEnhancedHealthReport(filters);
    return apiOk(result, reqId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/customer-health] Failed to load health metrics:', message);

    if (
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('P2021') ||
      message.includes('P2010')
    ) {
      return apiOk({
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
      }, reqId);
    }

    return apiError(`Failed to fetch health metrics: ${message}`, reqId, 500);
  }
}
