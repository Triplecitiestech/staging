import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAutotaskWebUrl } from '@/lib/tickets/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/soc/tickets/[id]/analysis
 * Fetch SOC analysis data for a single ticket by autotaskTicketId.
 * Uses a single combined query to avoid multiple round-trips.
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

  try {
    // Fetch ticket with company in one Prisma query
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

    // Resolve resource name and SOC data in parallel
    const [resource, analysisRows, pendingRows] = await Promise.all([
      ticket.assignedResourceId
        ? prisma.resource.findUnique({
            where: { autotaskResourceId: ticket.assignedResourceId },
            select: { firstName: true, lastName: true },
          })
        : Promise.resolve(null),
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT sa.*, si.title as "incidentTitle", si.verdict as "incidentVerdict",
               si."confidenceScore" as "incidentConfidence", si."aiSummary",
               si."proposedActions", si."humanGuidance", si."customerCommunication",
               si."nextCycleChecks", si."supportingReasoning", si.status as "incidentStatus",
               si."correlationReason", si."ticketCount"
        FROM soc_ticket_analysis sa
        LEFT JOIN soc_incidents si ON si.id = sa."incidentId"
        WHERE sa."autotaskTicketId" = ${autotaskTicketId}
        ORDER BY sa."processedAt" DESC
        LIMIT 1
      `.catch(() => [] as Array<Record<string, unknown>>),
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM soc_pending_actions
        WHERE "autotaskTicketId" = ${autotaskTicketId}
        ORDER BY "createdAt" DESC
      `.catch(() => [] as Array<Record<string, unknown>>),
    ]);

    const assignedTo = resource
      ? `${resource.firstName} ${resource.lastName}`.trim()
      : 'Unassigned';

    const row = analysisRows[0] || null;

    // Split the joined row into analysis + incident plan
    const analysis = row ? {
      verdict: row.verdict,
      confidenceScore: row.confidenceScore,
      alertSource: row.alertSource,
      alertCategory: row.alertCategory,
      aiReasoning: row.aiReasoning,
      recommendedAction: row.recommendedAction,
      deviceVerified: row.deviceVerified,
      technicianVerified: row.technicianVerified,
      ipExtracted: row.ipExtracted,
      processedAt: row.processedAt,
      incidentId: row.incidentId,
    } : null;

    const incidentActionPlan = row?.incidentId ? {
      id: row.incidentId,
      title: row.incidentTitle,
      verdict: row.incidentVerdict,
      confidenceScore: row.incidentConfidence,
      aiSummary: row.aiSummary,
      proposedActions: row.proposedActions,
      humanGuidance: row.humanGuidance,
      customerCommunication: row.customerCommunication,
      nextCycleChecks: row.nextCycleChecks,
      supportingReasoning: row.supportingReasoning,
      status: row.incidentStatus,
      correlationReason: row.correlationReason,
      ticketCount: row.ticketCount,
    } : null;

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
      pendingActions: pendingRows,
      autotaskWebUrl: getAutotaskWebUrl(),
    });
  } catch (err) {
    console.error('[soc/tickets/analysis]', err);
    return NextResponse.json({ error: 'Failed to load ticket analysis' }, { status: 500 });
  }
}
