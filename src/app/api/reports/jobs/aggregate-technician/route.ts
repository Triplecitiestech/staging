import { NextRequest, NextResponse } from 'next/server';
import { aggregateTechnicianDaily } from '@/lib/reporting/aggregation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dateParam = request.nextUrl.searchParams.get('date');
    const date = dateParam ? new Date(dateParam) : undefined;
    const result = await aggregateTechnicianDaily(date);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Aggregation failed' },
      { status: 500 },
    );
  }
}
