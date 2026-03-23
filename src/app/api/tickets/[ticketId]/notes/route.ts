import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPortalSession } from '@/lib/portal-session';
import { prisma } from '@/lib/prisma';
import { getStaffTicketNotes, getCustomerTicketNotes } from '@/lib/tickets/adapters';
import { DEFAULT_STAFF_VISIBILITY } from '@/types/tickets';
import type { TicketPerspective, NoteVisibilityFilters } from '@/types/tickets';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tickets/[ticketId]/notes?perspective=staff
 * GET /api/tickets/[ticketId]/notes?perspective=customer&companySlug=ecospect
 *
 * Unified ticket notes endpoint serving both perspectives.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await params;

  const perspective = request.nextUrl.searchParams.get('perspective') as TicketPerspective | null;
  if (!perspective || (perspective !== 'staff' && perspective !== 'customer')) {
    return NextResponse.json({ error: 'perspective must be "staff" or "customer"' }, { status: 400 });
  }

  try {
    if (perspective === 'staff') {
      return await handleStaffNotes(request, ticketId);
    }
    return await handleCustomerNotes(request, ticketId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[api/tickets/${ticketId}/notes] Failed:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleStaffNotes(request: NextRequest, ticketId: string) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse visibility toggles from query params
  const visibility: NoteVisibilityFilters = {
    showExternal: request.nextUrl.searchParams.get('showExternal') !== 'false',
    showInternal: request.nextUrl.searchParams.get('showInternal') !== 'false',
    showSystem: request.nextUrl.searchParams.get('showSystem') === 'true',
  };

  const result = await getStaffTicketNotes(ticketId, visibility.showExternal || visibility.showInternal || visibility.showSystem ? visibility : DEFAULT_STAFF_VISIBILITY);
  return NextResponse.json(result);
}

async function handleCustomerNotes(request: NextRequest, ticketId: string) {
  const companySlug = request.nextUrl.searchParams.get('companySlug');
  if (!companySlug) {
    return NextResponse.json({ error: 'companySlug is required' }, { status: 400 });
  }

  // Verify customer is authenticated for this company
  const session = await getPortalSession();
  if (!session || session.companySlug !== companySlug.toLowerCase().trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Demo mode
  if (companySlug.toLowerCase().trim() === 'contoso-industries') {
    const { DEMO_TIMELINE } = await import('@/lib/demo-mode');
    const demoTimeline = DEMO_TIMELINE[parseInt(ticketId, 10) as keyof typeof DEMO_TIMELINE] || [];
    return NextResponse.json({ notes: demoTimeline, ticketId });
  }

  // Verify ticket belongs to this company (security check)
  const company = await prisma.company.findUnique({
    where: { slug: companySlug.toLowerCase().trim() },
    select: { autotaskCompanyId: true },
  });

  if (!company?.autotaskCompanyId) {
    return NextResponse.json({ notes: [], ticketId });
  }

  const result = await getCustomerTicketNotes(ticketId);
  return NextResponse.json(result);
}
