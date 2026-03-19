import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { parseFiltersFromParams } from '@/lib/reporting/filters';
import { getEnhancedTechnicianReport } from '@/lib/reporting/enhanced-services';
import { generateTechnicianPrintableHTML } from '@/lib/reporting/technician-pdf';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/technicians/pdf?preset=last_7_days&...
 * Returns a printable HTML page optimized for PDF export (browser print dialog).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const params = request.nextUrl.searchParams;
    const filters = parseFiltersFromParams(params);
    // Always include comparison and breakdown for the PDF
    filters.includeComparison = true;
    filters.includeBreakdown = true;
    filters.includeTrend = true;

    const report = await getEnhancedTechnicianReport(filters);

    // Determine selected technician name (if filtered to one)
    let selectedTechnician: string | undefined;
    if (filters.resourceId && report.summary.length > 0) {
      const tech = report.summary[0];
      selectedTechnician = `${tech.firstName} ${tech.lastName}`.trim();
    }

    const html = generateTechnicianPrintableHTML({
      summary: report.summary,
      period: report.meta.period,
      comparison: report.comparison,
      techComparison: report.techComparison,
      benchmarks: report.benchmarks,
      generatedAt: report.meta.generatedAt,
      selectedTechnician,
    });

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/technicians/pdf] Failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
