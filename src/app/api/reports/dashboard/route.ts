import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { parseFiltersFromParams } from '@/lib/reporting/filters';
import { getEnhancedDashboardReport } from '@/lib/reporting/enhanced-services';
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
    const result = await getEnhancedDashboardReport(filters);
    return apiOk(result, reqId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/dashboard] Failed to load dashboard:', message);

    // If the error is about missing tables or no data, return an empty
    // dashboard rather than a 500, so the UI can show an empty state.
    if (
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('P2021') ||
      message.includes('P2010')
    ) {
      return apiOk({
        summary: {
          totalTicketsCreated: 0,
          totalTicketsClosed: 0,
          overallSlaCompliance: null,
          totalBacklog: 0,
          avgResolutionMinutes: null,
          topCompanies: [],
          topTechnicians: [],
          trendVsPrevious: {
            ticketsCreatedChange: null,
            ticketsClosedChange: null,
            resolutionTimeChange: null,
          },
        },
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

    return apiError(`Reporting dashboard failed to load: ${message}`, reqId, 500);
  }
}
