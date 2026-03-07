import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getReviewPrintableHTML } from '@/lib/reporting/business-review';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/business-review/[id]/pdf
 * Returns branded HTML optimized for PDF printing.
 * Use browser print (Ctrl+P / Cmd+P) to save as PDF.
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
    const html = await getReviewPrintableHTML(id);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate PDF' },
      { status: 500 },
    );
  }
}
