import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/soc/status — SOC agent status and summary stats */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Job status
    const jobs = await prisma.$queryRaw<Array<{
      jobName: string; lastRunAt: Date | null; lastRunStatus: string | null;
      lastRunDurationMs: number | null; lastRunError: string | null;
      lastRunMeta: Record<string, unknown> | null;
    }>>`SELECT * FROM soc_job_status ORDER BY "lastRunAt" DESC NULLS LAST`;

    // Config
    const configRows = await prisma.$queryRaw<{ key: string; value: string }[]>`
      SELECT key, value FROM soc_config
    `;
    const config = Object.fromEntries(configRows.map(r => [r.key, r.value]));

    // Today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayStats] = await prisma.$queryRaw<[{
      total: bigint; false_positives: bigint; escalated: bigint; suspicious: bigint;
    }]>`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE verdict = 'false_positive') as false_positives,
        COUNT(*) FILTER (WHERE verdict = 'escalate') as escalated,
        COUNT(*) FILTER (WHERE verdict = 'suspicious') as suspicious
      FROM soc_ticket_analysis
      WHERE "processedAt" >= ${today}
    `;

    // Pending count
    const [pending] = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM soc_ticket_analysis WHERE status = 'pending'
    `;

    // Recent incidents
    const recentIncidents = await prisma.$queryRaw<Array<{
      id: string; title: string; ticketCount: number; verdict: string | null;
      confidenceScore: number | null; status: string; createdAt: Date;
    }>>`
      SELECT id, title, "ticketCount", verdict, "confidenceScore", status, "createdAt"
      FROM soc_incidents
      ORDER BY "createdAt" DESC
      LIMIT 5
    `;

    return NextResponse.json({
      jobs,
      config,
      today: {
        analyzed: Number(todayStats.total),
        falsePositives: Number(todayStats.false_positives),
        escalated: Number(todayStats.escalated),
        suspicious: Number(todayStats.suspicious),
      },
      pending: Number(pending.count),
      recentIncidents,
    });
  } catch (err) {
    console.error('[soc/status]', err);
    return NextResponse.json({ error: 'Failed to load status' }, { status: 500 });
  }
}
