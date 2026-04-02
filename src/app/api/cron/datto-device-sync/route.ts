import { cronHandler } from '@/lib/cron-wrapper';
import { prisma } from '@/lib/prisma';
import { DattoRmmClient } from '@/lib/datto-rmm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/datto-device-sync
 * Syncs device data from Datto RMM into local cache (every 30 min).
 */
export const GET = cronHandler(
  { name: 'datto-device-sync', timeoutMs: 55000 },
  async () => {
    const client = new DattoRmmClient();
    if (!client.isConfigured()) {
      return { success: true, message: 'Datto RMM not configured — skipped' };
    }

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

    // Update job status
    try {
      const durationMs = Date.now(); // approximate — cron-wrapper tracks the real duration
      await prisma.$executeRawUnsafe(`
        INSERT INTO soc_job_status (id, "jobName", "lastRunAt", "lastRunStatus", "lastRunDurationMs", "lastRunMeta", "firstRunAt")
        VALUES (gen_random_uuid()::text, 'datto-device-sync', now(), 'success', $1, $2::jsonb, now())
        ON CONFLICT ("jobName") DO UPDATE SET
          "lastRunAt" = now(),
          "lastRunStatus" = 'success',
          "lastRunDurationMs" = $1,
          "lastRunMeta" = $2::jsonb
      `, 0, JSON.stringify({ devicesSync: upserted }));
    } catch {
      // Non-critical — job status tracking failure doesn't affect sync
    }

    return {
      success: true,
      message: `Synced ${upserted} devices from Datto RMM`,
      data: { devicesSynced: upserted },
    };
  },
);
