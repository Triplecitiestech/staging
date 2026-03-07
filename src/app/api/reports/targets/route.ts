import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTargets, upsertTarget, seedDefaultTargets } from '@/lib/reporting/targets';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/targets — List all active targets
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const metricKey = request.nextUrl.searchParams.get('metricKey') || undefined;
    const targets = await getTargets(metricKey);
    return NextResponse.json({ data: targets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch targets' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reports/targets — Create/update a target or seed defaults
 * Body: { "metricKey": "...", "scope": "...", "scopeValue": "...", "targetValue": 15, "unit": "minutes" }
 * Or: { "action": "seed_defaults" }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (body.action === 'seed_defaults') {
      const result = await seedDefaultTargets(session.user.email);
      return NextResponse.json({ success: true, result });
    }

    const { metricKey, scope, scopeValue, targetValue, unit, description } = body;

    if (!metricKey || !scope || targetValue === undefined || !unit) {
      return NextResponse.json(
        { error: 'Required fields: metricKey, scope, targetValue, unit' },
        { status: 400 },
      );
    }

    const target = await upsertTarget({
      metricKey,
      scope,
      scopeValue: scopeValue || null,
      targetValue: parseFloat(targetValue),
      unit,
      description,
      createdBy: session.user.email,
    });

    return NextResponse.json({ success: true, data: target });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save target' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/reports/targets?id=xxx — Soft-delete a target
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing target id' }, { status: 400 });
    }

    await prisma.reportingTarget.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete target' },
      { status: 500 },
    );
  }
}
