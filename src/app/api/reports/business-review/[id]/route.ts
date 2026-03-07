import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getBusinessReview,
  updateReviewStatus,
  deleteBusinessReview,
} from '@/lib/reporting/business-review';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/business-review/[id]
 * Get a specific business review.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const review = await getBusinessReview(id);
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }
    return NextResponse.json(review);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch review' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/reports/business-review/[id]
 * Update review status (draft → review → ready → sent).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !['draft', 'review', 'ready', 'sent'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: draft, review, ready, sent' },
        { status: 400 },
      );
    }

    const review = await updateReviewStatus(id, status, session.user.email);
    return NextResponse.json(review);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update review' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/reports/business-review/[id]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    await deleteBusinessReview(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete review' },
      { status: 500 },
    );
  }
}
