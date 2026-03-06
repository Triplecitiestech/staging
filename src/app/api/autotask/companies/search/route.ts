import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/autotask/companies/search?q=name
 * Searches Autotask companies by name for the company creation flow.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ companies: [] });
    }

    const query = request.nextUrl.searchParams.get('q');
    if (!query || query.length < 2) {
      return NextResponse.json({ companies: [] });
    }

    const { AutotaskClient } = await import('@/lib/autotask');
    const client = new AutotaskClient();

    const companies = await client.searchCompanies(query);

    // Return top 20 matches
    const results = companies.slice(0, 20).map((c) => ({
      id: c.id,
      name: c.companyName,
      phone: c.phone || null,
    }));

    return NextResponse.json({ companies: results });
  } catch (error) {
    console.error('[Autotask Company Search] Error:', error);
    return NextResponse.json({ companies: [], error: 'Search failed' });
  }
}
