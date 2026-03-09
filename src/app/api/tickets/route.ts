import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAuthenticatedCompany } from '@/lib/onboarding-session';
import { parseFiltersFromParams } from '@/lib/reporting/filters';
import { getStaffTicketList, getCustomerTicketList } from '@/lib/tickets/adapters';
import type { TicketPerspective } from '@/types/tickets';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tickets?perspective=staff&companyId=xxx&preset=last_30_days
 * GET /api/tickets?perspective=customer&companySlug=ecospect
 *
 * Unified ticket list endpoint serving both perspectives.
 */
export async function GET(request: NextRequest) {
  const perspective = request.nextUrl.searchParams.get('perspective') as TicketPerspective | null;

  if (!perspective || (perspective !== 'staff' && perspective !== 'customer')) {
    return NextResponse.json({ error: 'perspective must be "staff" or "customer"' }, { status: 400 });
  }

  try {
    if (perspective === 'staff') {
      return handleStaffRequest(request);
    }
    return handleCustomerRequest(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/tickets] Failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleStaffRequest(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const companyId = request.nextUrl.searchParams.get('companyId') || undefined;
  const resourceId = request.nextUrl.searchParams.get('resourceId');

  if (!companyId && !resourceId) {
    return NextResponse.json({ error: 'companyId or resourceId is required' }, { status: 400 });
  }

  const filters = parseFiltersFromParams(request.nextUrl.searchParams);
  const result = await getStaffTicketList({
    companyId,
    resourceId: resourceId ? Number(resourceId) : undefined,
    dateRange: filters.dateRange,
  });

  return NextResponse.json(result);
}

async function handleCustomerRequest(request: NextRequest) {
  const companySlug = request.nextUrl.searchParams.get('companySlug');
  if (!companySlug) {
    return NextResponse.json({ error: 'companySlug is required' }, { status: 400 });
  }

  // Verify customer is authenticated for this company
  const authenticatedCompany = await getAuthenticatedCompany();
  if (authenticatedCompany !== companySlug.toLowerCase().trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Demo company: return synthetic tickets
  if (companySlug.toLowerCase().trim() === 'contoso-industries') {
    const { DEMO_TICKETS } = await import('@/lib/demo-mode');
    return NextResponse.json({
      tickets: DEMO_TICKETS,
      totalTickets: DEMO_TICKETS.length,
      openCount: DEMO_TICKETS.filter((t: { completedDate?: string | null }) => !t.completedDate).length,
      resolvedCount: DEMO_TICKETS.filter((t: { completedDate?: string | null }) => !!t.completedDate).length,
      companyName: 'Contoso Industries (Demo)',
    });
  }

  const result = await getCustomerTicketList({ companySlug });
  return NextResponse.json(result);
}
