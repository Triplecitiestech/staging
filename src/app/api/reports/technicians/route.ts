import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTechnicianMetrics } from '@/lib/reporting/services';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');
    const resourceId = request.nextUrl.searchParams.get('resourceId');

    const range = from && to
      ? { from: new Date(from), to: new Date(to) }
      : undefined;

    const result = await getTechnicianMetrics(
      range,
      resourceId ? parseInt(resourceId, 10) : undefined,
    );

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch technician metrics' },
      { status: 500 },
    );
  }
}
