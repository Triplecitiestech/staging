import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getResolvedStatuses } from '@/lib/reporting/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reports/diagnose
 * Data accuracy diagnostic endpoint — shows ticket status distribution,
 * null completedDate counts, resource list, and sync coverage.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Ticket status distribution
    const tickets = await prisma.ticket.findMany({
      select: { status: true, completedDate: true, assignedResourceId: true },
    });

    const statusCounts: Record<number, number> = {};
    let resolvedWithDate = 0;
    let resolvedWithoutDate = 0;
    let unresolvedTotal = 0;

    for (const t of tickets) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      const resolvedStatuses = getResolvedStatuses();
      const isTicketResolved = resolvedStatuses.includes(t.status);
      if (isTicketResolved) {
        if (t.completedDate) resolvedWithDate++;
        else resolvedWithoutDate++;
      } else {
        unresolvedTotal++;
      }
    }

    const resolvedStatuses = getResolvedStatuses();

    // 2. Status labels from picklist (if available)
    const statusLabels: Record<number, string> = {};
    try {
      const picklists = await prisma.$queryRawUnsafe<Array<{ status: number; statusLabel: string | null }>>(
        `SELECT DISTINCT status, "statusLabel" FROM tickets WHERE "statusLabel" IS NOT NULL ORDER BY status`
      );
      for (const p of picklists) {
        if (p.statusLabel) statusLabels[p.status] = p.statusLabel;
      }
    } catch {
      // statusLabel column might not exist
    }

    // 3. Resources (to identify API users)
    const resources = await prisma.resource.findMany({
      select: { autotaskResourceId: true, firstName: true, lastName: true, email: true, isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const API_USER_PATTERNS = [/\bapi\b/i, /\badministrator\b/i, /\bdashboard user\b/i];
    const resourceList = resources.map(r => {
      const fullName = `${r.firstName} ${r.lastName}`.trim();
      const isApi = !r.isActive || API_USER_PATTERNS.some(p => p.test(fullName) || p.test(r.email));
      return {
        id: r.autotaskResourceId,
        name: fullName,
        email: r.email,
        isActive: r.isActive,
        isApiUser: isApi,
      };
    });

    // 4. Per-resource ticket counts
    const resourceTickets: Record<number, { assigned: number; resolved: number; resolvedNoDate: number }> = {};
    for (const t of tickets) {
      if (!t.assignedResourceId) continue;
      if (!resourceTickets[t.assignedResourceId]) {
        resourceTickets[t.assignedResourceId] = { assigned: 0, resolved: 0, resolvedNoDate: 0 };
      }
      resourceTickets[t.assignedResourceId].assigned++;
      const isTicketResolved = resolvedStatuses.includes(t.status);
      if (isTicketResolved) {
        if (t.completedDate) resourceTickets[t.assignedResourceId].resolved++;
        else resourceTickets[t.assignedResourceId].resolvedNoDate++;
      }
    }

    // 5. Lifecycle stats
    let lifecycleCount = 0;
    let lifecycleResolved = 0;
    try {
      lifecycleCount = await prisma.ticketLifecycle.count();
      lifecycleResolved = await prisma.ticketLifecycle.count({ where: { isResolved: true } });
    } catch { /* table might not exist */ }

    // 6. Aggregation stats
    let techDailyRows = 0;
    let companyDailyRows = 0;
    try {
      techDailyRows = await prisma.technicianMetricsDaily.count();
      companyDailyRows = await prisma.companyMetricsDaily.count();
    } catch { /* table might not exist */ }

    // 7. Sync job status
    let jobStatuses: Array<{ jobName: string; lastRunAt: Date | null; lastRunStatus: string | null }> = [];
    try {
      jobStatuses = await prisma.reportingJobStatus.findMany({
        select: { jobName: true, lastRunAt: true, lastRunStatus: true },
        orderBy: { jobName: 'asc' },
      });
    } catch { /* table might not exist */ }

    return NextResponse.json({
      totalTickets: tickets.length,
      resolvedStatuses: resolvedStatuses,
      statusDistribution: Object.entries(statusCounts)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([status, count]) => ({
          status: Number(status),
          label: statusLabels[Number(status)] || `Status ${status}`,
          count,
          isResolvedInSystem: resolvedStatuses.includes(Number(status)),
        })),
      resolvedWithCompletedDate: resolvedWithDate,
      resolvedWithoutCompletedDate: resolvedWithoutDate,
      unresolvedTotal,
      dataAccuracyWarning: resolvedWithoutDate > 0
        ? `${resolvedWithoutDate} resolved tickets have NULL completedDate — these were previously uncounted in daily aggregation. Fixed in latest update.`
        : null,
      resources: resourceList,
      resourceTicketCounts: Object.entries(resourceTickets)
        .map(([id, counts]) => {
          const r = resourceList.find(r => r.id === Number(id));
          return {
            resourceId: Number(id),
            name: r?.name || 'Unknown',
            isApiUser: r?.isApiUser ?? false,
            ...counts,
          };
        })
        .sort((a, b) => b.resolved - a.resolved),
      lifecycle: { total: lifecycleCount, resolved: lifecycleResolved },
      aggregation: { technicianDailyRows: techDailyRows, companyDailyRows: companyDailyRows },
      jobStatuses: jobStatuses.map(j => ({
        job: j.jobName,
        lastRun: j.lastRunAt?.toISOString() || 'never',
        status: j.lastRunStatus || 'unknown',
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reports/diagnose] Failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
