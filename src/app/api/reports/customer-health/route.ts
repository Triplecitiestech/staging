import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getCustomerHealthMetrics } from '@/lib/reporting/services';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyId = request.nextUrl.searchParams.get('companyId');
    const result = await getCustomerHealthMetrics(companyId || undefined);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch health metrics' },
      { status: 500 },
    );
  }
}
