import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  generateBusinessReview,
  listBusinessReviews,
} from '@/lib/reporting/business-review';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/reports/business-review
 * List business reviews with optional filters.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const params = request.nextUrl.searchParams;
    const reviews = await listBusinessReviews({
      companyId: params.get('companyId') || undefined,
      reportType: params.get('reportType') || undefined,
      status: params.get('status') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : undefined,
    });

    return NextResponse.json({ reviews });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list reviews' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/reports/business-review
 * Generate a new business review report.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { companyId, reportType, variant, periodStart, periodEnd } = body;

    if (!companyId || !reportType || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'Required: companyId, reportType, periodStart, periodEnd' },
        { status: 400 },
      );
    }

    const result = await generateBusinessReview({
      companyId,
      reportType: reportType || 'monthly',
      variant: variant || 'customer',
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      createdBy: session.user.email,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate review' },
      { status: 500 },
    );
  }
}
