import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/selectors
 *
 * Returns all companies and technicians/resources for use in reporting
 * filter dropdowns and selectors. Reads from the base Company and Resource
 * tables — NOT from materialized reporting tables — so it always returns
 * data even if the reporting pipeline hasn't run yet.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [companies, resources] = await Promise.all([
      prisma.company.findMany({
        select: {
          id: true,
          displayName: true,
          autotaskCompanyId: true,
        },
        orderBy: { displayName: 'asc' },
      }),
      prisma.resource.findMany({
        where: { isActive: true },
        select: {
          id: true,
          autotaskResourceId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);

    return NextResponse.json({
      companies: companies.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        hasAutotask: !!c.autotaskCompanyId,
      })),
      technicians: resources.map((r) => ({
        id: r.id,
        autotaskResourceId: r.autotaskResourceId,
        name: `${r.firstName} ${r.lastName}`.trim(),
        email: r.email,
      })),
    });
  } catch (err) {
    console.error('[reports/selectors] Failed to load selectors:', err);
    return NextResponse.json(
      { error: 'Failed to load company and technician data', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
