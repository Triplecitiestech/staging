/**
 * GET /api/reports/annual-report/[id]
 * Returns a single annual report by ID.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAnnualReport, deleteAnnualReport, parseStoredReport, processReport } from '@/lib/reporting/annual-report';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const review = await getAnnualReport(id);

    if (!review) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Debug mode: show raw stored data + processing decisions
    if (request.nextUrl.searchParams.get('debug') === 'true') {
      const { raw, config } = parseStoredReport(review.reportData, review.variant);
      const processed = processReport(raw, config);
      const rmmSection = processed.sections.find(s => s.key === 'rmm');
      return NextResponse.json({
        variant: review.variant,
        config,
        rmmRaw: {
          available: raw.dattoRmm?.available,
          devicesManaged: raw.dattoRmm?.devicesManaged,
          endpointCount: raw.dattoRmm?.endpointCount,
          totalAlerts: raw.dattoRmm?.totalAlerts,
          note: raw.dattoRmm?.note,
        },
        rmmSection,
        allSectionVisibility: processed.sections.map(s => ({ key: s.key, visible: s.visible, hasData: s.hasData })),
      });
    }

    return NextResponse.json({ review });
  } catch (error) {
    console.error('[annual-report] GET by ID error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await deleteAnnualReport(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[annual-report] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
