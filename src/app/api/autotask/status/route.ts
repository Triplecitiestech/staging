import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * Autotask sync status - shows recent sync history.
 * Admin/Manager only - exposes credential config status and sync metadata.
 *
 * GET /api/autotask/status
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // Check if credentials are configured
    const credentialsConfigured = !!(
      process.env.AUTOTASK_API_USERNAME &&
      process.env.AUTOTASK_API_SECRET &&
      process.env.AUTOTASK_API_INTEGRATION_CODE &&
      process.env.AUTOTASK_API_BASE_URL
    );

    // Get recent sync logs
    let recentSyncs;
    try {
      recentSyncs = await prisma.autotaskSyncLog.findMany({
        orderBy: { startedAt: 'desc' },
        take: 10,
      });
    } catch {
      return NextResponse.json({
        credentialsConfigured,
        migrationApplied: false,
        message: 'The autotask_sync_logs table does not exist yet. Run the migration first: POST /api/migrations/autotask',
      });
    }

    const lastSuccessful = recentSyncs.find((s) => s.status === 'success');

    return NextResponse.json({
      credentialsConfigured,
      migrationApplied: true,
      totalSyncs: recentSyncs.length,
      lastSuccessfulSync: lastSuccessful
        ? {
            at: lastSuccessful.completedAt,
            type: lastSuccessful.syncType,
            companiesCreated: lastSuccessful.companiesCreated,
            companiesUpdated: lastSuccessful.companiesUpdated,
            projectsCreated: lastSuccessful.projectsCreated,
            projectsUpdated: lastSuccessful.projectsUpdated,
            contactsCreated: lastSuccessful.contactsCreated,
            contactsUpdated: lastSuccessful.contactsUpdated,
            tasksCreated: lastSuccessful.tasksCreated,
            tasksUpdated: lastSuccessful.tasksUpdated,
            durationMs: lastSuccessful.durationMs,
          }
        : null,
      recentSyncs: recentSyncs.map((s) => ({
        id: s.id,
        syncType: s.syncType,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        durationMs: s.durationMs,
        companiesCreated: s.companiesCreated,
        projectsCreated: s.projectsCreated,
        contactsCreated: s.contactsCreated,
        tasksCreated: s.tasksCreated,
        errors: s.errors ? JSON.parse(s.errors) : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
