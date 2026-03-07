import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  generateBusinessReview,
  listBusinessReviews,
} from '@/lib/reporting/business-review';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isMissingTable(message: string): boolean {
  return message.includes('does not exist') || message.includes('P2021') || message.includes('P2010');
}

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
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (isMissingTable(message)) {
      console.warn('[business-review] business_reviews table does not exist yet — migration needed');
      return NextResponse.json({
        reviews: [],
        _warning: 'Business reviews table not yet created. Run database migration to enable this feature.',
      });
    }

    console.error('[business-review] Failed to list reviews:', message);
    return NextResponse.json(
      { error: `Failed to list reviews: ${message}` },
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
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (isMissingTable(message)) {
      return NextResponse.json(
        { error: 'Business reviews table not yet created. Run database migration first.' },
        { status: 503 },
      );
    }

    console.error('[business-review] Failed to generate review:', message);
    return NextResponse.json(
      { error: `Failed to generate review: ${message}` },
      { status: 500 },
    );
  }
}
