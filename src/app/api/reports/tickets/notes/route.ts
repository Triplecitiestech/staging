import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/tickets/notes?ticketId=xxx
 * Returns external (non-internal, non-system) notes for a ticket.
 * Admin-only endpoint for reporting ticket detail view.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ticketId = request.nextUrl.searchParams.get('ticketId');
  if (!ticketId) {
    return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
  }

  try {
    const notes = await prisma.ticketNote.findMany({
      where: {
        autotaskTicketId: ticketId,
        // Include external notes: publish=1 (all AT users), publish=3 (all including portal),
        // or null (unset). Exclude internal-only (publish=2).
        OR: [
          { publish: { not: 2 } },
          { publish: null },
        ],
      },
      select: {
        autotaskNoteId: true,
        title: true,
        description: true,
        noteType: true,
        publish: true,
        creatorResourceId: true,
        creatorContactId: true,
        createDateTime: true,
      },
      orderBy: { createDateTime: 'asc' },
    });

    // Get resource names for note authors
    const resourceIds = Array.from(
      new Set(notes.map(n => n.creatorResourceId).filter((v): v is number => v !== null))
    );
    const resources = await prisma.resource.findMany({
      where: { autotaskResourceId: { in: resourceIds } },
      select: { autotaskResourceId: true, firstName: true, lastName: true },
    });
    const resourceMap = new Map(
      resources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`.trim()])
    );

    return NextResponse.json({
      notes: notes.map(n => ({
        id: n.autotaskNoteId,
        title: n.title,
        description: n.description,
        author: n.creatorResourceId
          ? resourceMap.get(n.creatorResourceId) || 'Technician'
          : n.creatorContactId
            ? 'Customer'
            : 'System',
        authorType: n.creatorResourceId ? 'technician' : n.creatorContactId ? 'customer' : 'system',
        timestamp: n.createDateTime.toISOString(),
      })).filter(n => n.authorType !== 'system'), // Also filter out system-generated
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/tickets/notes] Failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
