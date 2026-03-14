import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAutotaskWebUrl } from '@/lib/tickets/utils';

export const dynamic = 'force-dynamic';

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

  // Fetch the ticket itself
  const ticket = await prisma.ticket.findUnique({
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
  });

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  // Resolve assigned technician name
  let assignedTo = 'Unassigned';
  if (ticket.assignedResourceId) {
    const resource = await prisma.resource.findUnique({
      where: { autotaskResourceId: ticket.assignedResourceId },
      select: { firstName: true, lastName: true },
    });
    if (resource) {
      assignedTo = `${resource.firstName} ${resource.lastName}`.trim();
    }
  }

  // Fetch SOC analysis for this ticket
  let analysis: Record<string, unknown> | null = null;
  try {
    const analyses = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM soc_ticket_analysis
      WHERE "autotaskTicketId" = ${autotaskTicketId}
      ORDER BY "processedAt" DESC
      LIMIT 1
    `;
    analysis = analyses[0] || null;
  } catch {
    // SOC tables may not exist
  }

  // If there's an incident, fetch the action plan from the incident
  let incidentActionPlan: Record<string, unknown> | null = null;
  let pendingActions: Array<Record<string, unknown>> = [];
  if (analysis?.incidentId) {
    try {
      const incidents = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT id, title, verdict, "confidenceScore", "aiSummary",
               "proposedActions", "humanGuidance", "customerCommunication",
               "nextCycleChecks", "supportingReasoning", status,
               "correlationReason", "ticketCount"
        FROM soc_incidents
        WHERE id = ${String(analysis.incidentId)}
      `;
      if (incidents.length > 0) {
        incidentActionPlan = incidents[0];
      }
    } catch {
      // Non-fatal
    }

    // Fetch pending actions for this specific ticket
    try {
      pendingActions = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM soc_pending_actions
        WHERE "autotaskTicketId" = ${autotaskTicketId}
        ORDER BY "createdAt" DESC
      `;
    } catch {
      // Non-fatal
    }
  }

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
    incidentActionPlan,
    pendingActions,
    autotaskWebUrl: getAutotaskWebUrl(),
  });
}
