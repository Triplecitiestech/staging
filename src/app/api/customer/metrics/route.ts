import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedCompany } from '@/lib/onboarding-session';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/metrics?companySlug=xxx
 *
 * Returns customer-facing metrics for the current month:
 * - hoursWorkedThisMonth: total hours logged on their tickets
 * - ticketsClosedThisMonth: count of resolved tickets
 * - avgResolutionHours: average resolution time for closed tickets
 */
export async function GET(request: NextRequest) {
  const companySlug = request.nextUrl.searchParams.get('companySlug');
  if (!companySlug) {
    return NextResponse.json({ error: 'companySlug is required' }, { status: 400 });
  }

  // Verify customer auth
  const authenticatedSlug = await getAuthenticatedCompany();
  if (!authenticatedSlug || authenticatedSlug !== companySlug.toLowerCase().trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Look up company
    const company = await prisma.company.findUnique({
      where: { slug: companySlug.toLowerCase().trim() },
      select: { id: true, autotaskCompanyId: true },
    });

    if (!company) {
      return NextResponse.json({
        hoursWorkedThisMonth: 0,
        ticketsClosedThisMonth: 0,
        avgResolutionHours: null,
      });
    }

    // Current month range
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Get all company tickets — companyId FK references Company.id (UUID), not autotaskCompanyId
    const tickets = await prisma.ticket.findMany({
      where: { companyId: company.id },
      select: {
        autotaskTicketId: true,
        status: true,
        completedDate: true,
        createDate: true,
      },
    });

    const ticketIds = tickets.map(t => t.autotaskTicketId);

    // Hours worked this month from time entries
    const RESOLVED_STATUSES = new Set([5, 13, 29]);
    let hoursWorkedThisMonth = 0;
    if (ticketIds.length > 0) {
      const timeEntries = await prisma.ticketTimeEntry.findMany({
        where: {
          autotaskTicketId: { in: ticketIds },
          dateWorked: { gte: monthStart, lte: monthEnd },
        },
        select: { hoursWorked: true },
      });
      hoursWorkedThisMonth = timeEntries.reduce((sum, te) => sum + te.hoursWorked, 0);
    }

    // Tickets closed this month
    const ticketsClosedThisMonth = tickets.filter(
      t => RESOLVED_STATUSES.has(t.status) && t.completedDate && t.completedDate >= monthStart && t.completedDate <= monthEnd
    ).length;

    // Average resolution time for tickets closed this month
    const closedThisMonth = tickets.filter(
      t => RESOLVED_STATUSES.has(t.status) && t.completedDate && t.completedDate >= monthStart && t.completedDate <= monthEnd
    );
    let avgResolutionHours: number | null = null;
    if (closedThisMonth.length > 0) {
      const totalMinutes = closedThisMonth.reduce((sum, t) => {
        const mins = (t.completedDate!.getTime() - t.createDate.getTime()) / (1000 * 60);
        return sum + Math.max(0, mins);
      }, 0);
      avgResolutionHours = Math.round((totalMinutes / closedThisMonth.length / 60) * 10) / 10;
    }

    return NextResponse.json({
      hoursWorkedThisMonth: Math.round(hoursWorkedThisMonth * 10) / 10,
      ticketsClosedThisMonth,
      avgResolutionHours,
    });
  } catch (err) {
    console.error('[api/customer/metrics] Failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to load metrics' }, { status: 500 });
  }
}
