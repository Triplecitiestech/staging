/**
 * Annual Service Report PDF endpoint.
 * Returns branded HTML suitable for browser print-to-PDF.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAnnualReportPrintableHTML } from '@/lib/reporting/annual-report';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const html = await getAnnualReportPrintableHTML(id);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[annual-report-pdf] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
