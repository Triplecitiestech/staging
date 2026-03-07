import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sendBusinessReviewEmail } from '@/lib/reporting/business-review';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reports/business-review/[id]/send
 * Send the business review email to specified recipients.
 * Report must be in "ready" status.
 */
export async function POST(
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
    const { recipients } = body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Recipients array is required' },
        { status: 400 },
      );
    }

    const result = await sendBusinessReviewEmail(id, recipients);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send review' },
      { status: 500 },
    );
  }
}
