import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { addAutotaskNote } from '@/lib/soc/engine';

export const dynamic = 'force-dynamic';

/** GET /api/soc/pending-actions — List pending actions (optionally filtered by incidentId or status) */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const incidentId = request.nextUrl.searchParams.get('incidentId');
  const statusFilter = request.nextUrl.searchParams.get('status') || 'pending';
  const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 100);
  const offset = (page - 1) * limit;

  // Determine the Autotask API sender identity from env vars
  const autotaskApiUser = process.env.AUTOTASK_API_USERNAME || 'Unknown API User';

  let actions: Array<Record<string, unknown>>;
  let totalCount: number;

  if (incidentId) {
    actions = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM soc_pending_actions
      WHERE "incidentId" = ${incidentId}
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM soc_pending_actions WHERE "incidentId" = ${incidentId}
    `;
    totalCount = Number(countResult[0]?.count || 0);
  } else if (statusFilter === 'all') {
    actions = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM soc_pending_actions
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM soc_pending_actions
    `;
    totalCount = Number(countResult[0]?.count || 0);
  } else {
    actions = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM soc_pending_actions
      WHERE status = ${statusFilter}
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM soc_pending_actions WHERE status = ${statusFilter}
    `;
    totalCount = Number(countResult[0]?.count || 0);
  }

  return NextResponse.json({
    actions,
    autotaskApiUser,
    pagination: {
      page,
      limit,
      total: totalCount,
      pages: Math.ceil(totalCount / limit),
    },
  });
}

/** PUT /api/soc/pending-actions — Approve or reject a pending action */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !['ADMIN', 'MANAGER'].includes(session.user?.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { actionId, decision } = body as { actionId: string; decision: 'approve' | 'reject' };

  if (!actionId || !['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ error: 'actionId and decision (approve|reject) required' }, { status: 400 });
  }

  // Fetch the pending action
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM soc_pending_actions WHERE id = ${actionId} AND status = 'pending'
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Pending action not found or already decided' }, { status: 404 });
  }

  const action = rows[0];
  const payload = action.actionPayload as Record<string, unknown>;

  if (decision === 'reject') {
    await prisma.$executeRawUnsafe(`
      UPDATE soc_pending_actions SET status = 'rejected', "decidedBy" = $1, "decidedAt" = now() WHERE id = $2
    `, session.user.email, actionId);

    // Log the rejection
    await prisma.$executeRawUnsafe(`
      INSERT INTO soc_activity_log (id, "incidentId", "autotaskTicketId", action, detail, metadata)
      VALUES (gen_random_uuid()::text, $1, $2, 'action_rejected', $3, $4::jsonb)
    `,
      action.incidentId,
      action.autotaskTicketId,
      `Action rejected by ${session.user.email}: ${String(action.previewSummary).slice(0, 200)}`,
      JSON.stringify({ actionType: action.actionType, decidedBy: session.user.email }),
    );

    return NextResponse.json({ success: true, status: 'rejected' });
  }

  // Execute the approved action
  try {
    if (action.actionType === 'add_note') {
      // Internal note — publish type 2 (Internal Only)
      await addAutotaskNote(
        String(action.autotaskTicketId),
        String(payload.noteBody || ''),
      );
    } else if (action.actionType === 'send_customer_message') {
      // Customer-facing note via Autotask API — publish type 1 (All Autotask Users = visible to customer)
      const { AutotaskClient } = await import('@/lib/autotask');
      const client = new AutotaskClient();
      await client.createTicketNote(parseInt(String(action.autotaskTicketId), 10), {
        title: String(payload.noteTitle || 'SOC Security Alert - Action Required'),
        description: String(payload.noteBody || ''),
        noteType: 1,
        publish: 1, // All Autotask Users (customer-visible)
      });

      // Set ticket status to Waiting Customer if requested
      if (payload.setStatusWaitingCustomer) {
        // Log the status change intent (actual Autotask ticket PATCH may not work per CLAUDE.md)
        await prisma.$executeRawUnsafe(`
          INSERT INTO soc_activity_log (id, "incidentId", "autotaskTicketId", action, detail, metadata)
          VALUES (gen_random_uuid()::text, $1, $2, 'status_change_requested', $3, $4::jsonb)
        `,
          action.incidentId,
          action.autotaskTicketId,
          `Requested status change to Waiting Customer for ticket #${String(action.ticketNumber)}`,
          JSON.stringify({ from: 'current', to: 'Waiting Customer', actionType: 'send_customer_message' }),
        );
      }
    }

    await prisma.$executeRawUnsafe(`
      UPDATE soc_pending_actions SET status = 'executed', "decidedBy" = $1, "decidedAt" = now(),
      "executionResult" = '{"success": true}'::jsonb WHERE id = $2
    `, session.user.email, actionId);

    // Log the approval + execution
    await prisma.$executeRawUnsafe(`
      INSERT INTO soc_activity_log (id, "incidentId", "autotaskTicketId", action, detail, metadata)
      VALUES (gen_random_uuid()::text, $1, $2, 'action_approved', $3, $4::jsonb)
    `,
      action.incidentId,
      action.autotaskTicketId,
      `Action approved and executed by ${session.user.email}: ${String(action.previewSummary).slice(0, 200)}`,
      JSON.stringify({ actionType: action.actionType, decidedBy: session.user.email }),
    );

    return NextResponse.json({ success: true, status: 'executed' });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    await prisma.$executeRawUnsafe(`
      UPDATE soc_pending_actions SET status = 'failed', "decidedBy" = $1, "decidedAt" = now(),
      "executionResult" = $2::jsonb WHERE id = $3
    `, session.user.email, JSON.stringify({ error: errMsg }), actionId);

    return NextResponse.json({ error: `Action execution failed: ${errMsg}` }, { status: 500 });
  }
}
