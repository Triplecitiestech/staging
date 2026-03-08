import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Helper to safely query a Prisma model — returns empty array if the
 * underlying table doesn't exist (migration not yet run).
 */
async function safeQuery<T>(fn: () => Promise<T[]>): Promise<{ data: T[]; error: string | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('does not exist') || msg.includes('P2021') || msg.includes('P2010')) {
      return { data: [], error: 'Table not yet created. Run database migration.' };
    }
    return { data: [], error: msg };
  }
}

/**
 * GET /api/reports/selectors
 *
 * Returns all companies and technicians/resources for use in reporting
 * filter dropdowns and selectors. Each query is independent — if the
 * resources table doesn't exist yet, companies still load and vice versa.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Query companies and resources independently
  const [companiesResult, resourcesResult] = await Promise.all([
    safeQuery(() =>
      prisma.company.findMany({
        select: { id: true, displayName: true, autotaskCompanyId: true },
        orderBy: { displayName: 'asc' },
      })
    ),
    safeQuery(() =>
      prisma.resource.findMany({
        where: { isActive: true },
        select: { id: true, autotaskResourceId: true, firstName: true, lastName: true, email: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
    ),
  ]);

  if (companiesResult.error) {
    console.error('[reports/selectors] Companies query failed:', companiesResult.error);
  }
  if (resourcesResult.error) {
    console.warn('[reports/selectors] Resources query failed:', resourcesResult.error);
  }

  // Filter out API/system users from technician list
  const API_USER_PATTERNS = [
    /\bapi\b/i, /\badministrator\b/i, /\bdashboard user\b/i, /\bsystem\b/i,
    /\bintegration\b/i, /\bservice account\b/i, /\bautomation\b/i,
    /\bdatto\b/i, /\bedr\b/i, /\brmm\b/i, /\bmonitor/i, /\bagent\b/i,
    /\bbackup\b/i, /\bsync\b/i, /\bwebhook\b/i, /\bcron\b/i,
  ];
  const filteredTechnicians = resourcesResult.data.filter((r) => {
    const fullName = `${r.firstName} ${r.lastName}`.trim();
    return !API_USER_PATTERNS.some(p => p.test(fullName) || p.test(r.email));
  });

  return NextResponse.json({
    companies: companiesResult.data.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      hasAutotask: !!c.autotaskCompanyId,
    })),
    technicians: filteredTechnicians.map((r) => ({
      id: r.id,
      autotaskResourceId: r.autotaskResourceId,
      name: `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
    })),
    _errors: {
      companies: companiesResult.error,
      technicians: resourcesResult.error,
    },
  });
}
