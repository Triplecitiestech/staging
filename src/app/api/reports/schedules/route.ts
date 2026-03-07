import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, getDeliveryHistory } from '@/lib/reporting/scheduler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/schedules
 * List all active report schedules and recent delivery history.
 */
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [schedules, deliveryHistory] = await Promise.all([
      getSchedules(),
      getDeliveryHistory(undefined, 50),
    ]);

    return NextResponse.json({ schedules, deliveryHistory });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch schedules' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reports/schedules
 * Create a new report schedule.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { reportType, name, schedule, dayOfWeek, dayOfMonth, monthOfQuarter, recipients, config } = body;

    if (!reportType || !name || !schedule || !recipients?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: reportType, name, schedule, recipients' },
        { status: 400 },
      );
    }

    const result = await createSchedule({
      reportType,
      name,
      schedule,
      dayOfWeek,
      dayOfMonth,
      monthOfQuarter,
      recipients,
      config,
      createdBy: session.user.email,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create schedule' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/reports/schedules
 * Update an existing schedule. Requires { id, ...updates }.
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing schedule id' }, { status: 400 });
    }

    const result = await updateSchedule(id, updates);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update schedule' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/reports/schedules
 * Soft-delete a schedule. Requires { id }.
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Missing schedule id' }, { status: 400 });
    }

    await deleteSchedule(body.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete schedule' },
      { status: 500 },
    );
  }
}
