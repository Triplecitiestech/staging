/**
 * Annual Service Report API
 * POST: Generate a new annual report
 * GET: List existing annual reports
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { generateAnnualReport, listAnnualReports } from '@/lib/reporting/annual-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { companyId, variant, periodStart, periodEnd } = body;

    if (!companyId || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'Missing required fields: companyId, periodStart, periodEnd' },
        { status: 400 },
      );
    }

    const result = await generateAnnualReport({
      companyId,
      variant: variant || 'customer',
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      createdBy: session.user.email,
    });

    return NextResponse.json({
      id: result.id,
      data: result.data,
    });
  } catch (error) {
    console.error('[annual-report] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || undefined;
    const status = searchParams.get('status') || undefined;

    const reports = await listAnnualReports({ companyId, status });

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('[annual-report] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
