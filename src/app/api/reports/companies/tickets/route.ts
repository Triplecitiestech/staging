import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { parseFiltersFromParams } from '@/lib/reporting/filters';
import { getRealtimeTicketList } from '@/lib/reporting/realtime-queries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/companies/tickets?companyId=xxx&preset=last_30_days
 * Returns individual tickets for a company or technician within the date range.
 * Uses real-time queries against raw Ticket tables for accurate data.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const companyId = request.nextUrl.searchParams.get('companyId') || undefined;
  const resourceId = request.nextUrl.searchParams.get('resourceId');

  if (!companyId && !resourceId) {
    return NextResponse.json({ error: 'companyId or resourceId is required' }, { status: 400 });
  }

  try {
    const filters = parseFiltersFromParams(request.nextUrl.searchParams);
    const result = await getRealtimeTicketList(filters.dateRange, {
      companyId,
      resourceId: resourceId ? Number(resourceId) : undefined,
    });

    // Build Autotask web URL for ticket deep-linking
    const apiBaseUrl = process.env.AUTOTASK_API_BASE_URL || '';
    const zoneMatch = apiBaseUrl.match(/webservices(\d+)/);
    const autotaskWebUrl = zoneMatch
      ? `https://ww${zoneMatch[1]}.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc`
      : null;

    return NextResponse.json({
      ...result,
      companyId: companyId || '',
      autotaskWebUrl,
      meta: {
        period: {
          from: filters.dateRange.from.toISOString().split('T')[0],
          to: filters.dateRange.to.toISOString().split('T')[0],
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/companies/tickets] Failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
