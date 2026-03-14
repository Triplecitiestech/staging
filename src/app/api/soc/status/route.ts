import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getAutotaskWebUrl } from '@/lib/tickets/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/soc/status — SOC agent status and summary stats */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Run all queries in parallel
    const [jobs, configRows, todayStatsResult, pendingResult, recentIncidents] = await Promise.all([
      prisma.$queryRaw<Array<{
        jobName: string; lastRunAt: Date | null; lastRunStatus: string | null;
        lastRunDurationMs: number | null; lastRunError: string | null;
        lastRunMeta: Record<string, unknown> | null;
      }>>`SELECT * FROM soc_job_status ORDER BY "lastRunAt" DESC NULLS LAST`
        .catch(() => [] as Array<Record<string, unknown>>),
      prisma.$queryRaw<{ key: string; value: string }[]>`
        SELECT key, value FROM soc_config
      `.catch(() => [] as { key: string; value: string }[]),
      prisma.$queryRaw<[{
        total: bigint; false_positives: bigint; escalated: bigint; suspicious: bigint;
      }]>`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE verdict = 'false_positive') as false_positives,
          COUNT(*) FILTER (WHERE verdict = 'escalate') as escalated,
          COUNT(*) FILTER (WHERE verdict = 'suspicious') as suspicious
        FROM soc_ticket_analysis
        WHERE "processedAt" >= ${today}
      `.catch(() => [{ total: BigInt(0), false_positives: BigInt(0), escalated: BigInt(0), suspicious: BigInt(0) }] as [{ total: bigint; false_positives: bigint; escalated: bigint; suspicious: bigint }]),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM soc_ticket_analysis WHERE status = 'pending'
      `.catch(() => [{ count: BigInt(0) }] as [{ count: bigint }]),
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT id, title, "ticketCount", verdict, "confidenceScore", status, "createdAt",
               "companyName", "deviceHostname", "alertSource", "correlationReason",
               "proposedActions", "humanGuidance"
        FROM soc_incidents
        ORDER BY "createdAt" DESC
        LIMIT 10
      `.catch(() => [] as Array<Record<string, unknown>>),
    ]);

    const config = Object.fromEntries(configRows.map(r => [r.key, r.value]));
    const todayStats = todayStatsResult[0];
    const pending = pendingResult[0];

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
      autotaskWebUrl: getAutotaskWebUrl(),
    });
  } catch (err) {
    console.error('[soc/status]', err);
    return NextResponse.json({ error: 'Failed to load status' }, { status: 500 });
  }
}
