import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DattoRmmClient } from '@/lib/datto-rmm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/datto-device-sync
 * Syncs device data from Datto RMM into local cache (every 30 min).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = new DattoRmmClient();
  if (!client.isConfigured()) {
    return NextResponse.json({ status: 'skipped', message: 'Datto RMM not configured' });
  }

  const startTime = Date.now();

  try {
    // Fetch devices (up to 10 pages = 2500 devices)
    const devices = await client.getDevices(10);

    let upserted = 0;
    for (const device of devices) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO datto_devices (id, "dattoDeviceId", hostname, "intIpAddress", "extIpAddress", "lastSeen", "lastUser", "siteId", "siteName", "operatingSystem", "deviceType", "lastSyncAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::timestamp, $6, $7, $8, $9, $10, now())
        ON CONFLICT ("dattoDeviceId") DO UPDATE SET
          hostname = $2,
          "intIpAddress" = $3,
          "extIpAddress" = $4,
          "lastSeen" = $5::timestamp,
          "lastUser" = $6,
          "siteId" = $7,
          "siteName" = $8,
          "operatingSystem" = $9,
          "deviceType" = $10,
          "lastSyncAt" = now()
      `,
        device.id,
        device.hostname,
        device.intIpAddress || null,
        device.extIpAddress || null,
        device.lastSeen || null,
        device.lastUser || null,
        device.siteId || null,
        device.siteName || null,
        device.operatingSystem || null,
        device.deviceType || null,
      );
      upserted++;
    }

    const durationMs = Date.now() - startTime;

    // Update job status
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO soc_job_status (id, "jobName", "lastRunAt", "lastRunStatus", "lastRunDurationMs", "lastRunMeta", "firstRunAt")
        VALUES (gen_random_uuid()::text, 'datto-device-sync', now(), 'success', $1, $2::jsonb, now())
        ON CONFLICT ("jobName") DO UPDATE SET
          "lastRunAt" = now(),
          "lastRunStatus" = 'success',
          "lastRunDurationMs" = $1,
          "lastRunMeta" = $2::jsonb
      `, durationMs, JSON.stringify({ devicesSync: upserted }));
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      status: 'ok',
      devicesSynced: upserted,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Datto Sync] Error:', err);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
