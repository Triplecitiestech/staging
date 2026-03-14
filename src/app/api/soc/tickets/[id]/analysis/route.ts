import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAutotaskWebUrl } from '@/lib/tickets/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/soc/tickets/[id]/analysis
 * Fetch SOC analysis data for a single ticket by autotaskTicketId.
 * Returns: ticket info, AI analysis, incident action plan, pending actions.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: autotaskTicketId } = await params;

  // Run ticket fetch and SOC analysis fetch in parallel
  const [ticket, analysisResult] = await Promise.all([
    prisma.ticket.findUnique({
      where: { autotaskTicketId },
      select: {
        autotaskTicketId: true,
        ticketNumber: true,
        title: true,
        description: true,
        status: true,
        statusLabel: true,
        priority: true,
        priorityLabel: true,
        assignedResourceId: true,
        createDate: true,
        completedDate: true,
        queueLabel: true,
        sourceLabel: true,
        companyId: true,
        company: { select: { displayName: true, slug: true } },
      },
    }),
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM soc_ticket_analysis
      WHERE "autotaskTicketId" = ${autotaskTicketId}
      ORDER BY "processedAt" DESC
      LIMIT 1
    `.catch(() => [] as Array<Record<string, unknown>>),
  ]);

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  const analysis = analysisResult[0] || null;

  // Resolve resource name + incident data in parallel
  const incidentId = analysis?.incidentId ? String(analysis.incidentId) : null;

  const [resource, incidentResult, pendingResult] = await Promise.all([
    ticket.assignedResourceId
      ? prisma.resource.findUnique({
          where: { autotaskResourceId: ticket.assignedResourceId },
          select: { firstName: true, lastName: true },
        })
      : null,
    incidentId
      ? prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT id, title, verdict, "confidenceScore", "aiSummary",
                 "proposedActions", "humanGuidance", "customerCommunication",
                 "nextCycleChecks", "supportingReasoning", status,
                 "correlationReason", "ticketCount"
          FROM soc_incidents
          WHERE id = ${incidentId}
        `.catch(() => [] as Array<Record<string, unknown>>)
      : [],
    incidentId
      ? prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM soc_pending_actions
          WHERE "autotaskTicketId" = ${autotaskTicketId}
          ORDER BY "createdAt" DESC
        `.catch(() => [] as Array<Record<string, unknown>>)
      : [],
  ]);

  const assignedTo = resource
    ? `${resource.firstName} ${resource.lastName}`.trim()
    : 'Unassigned';

  return NextResponse.json({
    ticket: {
      autotaskTicketId: ticket.autotaskTicketId,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      statusLabel: ticket.statusLabel,
      priority: ticket.priority,
      priorityLabel: ticket.priorityLabel,
      assignedTo,
      createDate: ticket.createDate.toISOString(),
      completedDate: ticket.completedDate?.toISOString() || null,
      queueLabel: ticket.queueLabel,
      sourceLabel: ticket.sourceLabel,
      companyName: ticket.company?.displayName || null,
      companySlug: ticket.company?.slug || null,
    },
    analysis,
    incidentActionPlan: incidentResult[0] || null,
    pendingActions: pendingResult,
    autotaskWebUrl: getAutotaskWebUrl(),
  });
}
