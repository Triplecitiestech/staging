/**
 * Technician Verification
 *
 * Cross-references alert IPs with Datto RMM device cache to determine
 * if an alert was caused by a known Triple Cities Tech technician.
 */

import { prisma } from '@/lib/prisma';
import type { DeviceVerification } from './types';

interface CachedDevice {
  hostname: string;
  extIpAddress: string | null;
  intIpAddress: string | null;
  lastUser: string | null;
  siteName: string | null;
  siteId: string | null;
  lastSeen: Date | null;
  isTechDevice: boolean;
}

/**
 * Verify if an IP address belongs to a known technician device.
 *
 * 1. Check datto_devices cache by IP
 * 2. Determine if device belongs to an internal TCT site
 * 3. Cross-reference lastUser with Resource table (known technicians)
 */
export async function verifyTechnicianByIp(
  ipAddress: string,
  internalSiteIds: string[],
): Promise<DeviceVerification> {
  try {
    // Step 1: Look up device in cache by external IP
    const devices = await prisma.$queryRaw<CachedDevice[]>`
      SELECT hostname, "extIpAddress", "intIpAddress", "lastUser", "siteName", "siteId", "lastSeen", "isTechDevice"
      FROM datto_devices
      WHERE "extIpAddress" = ${ipAddress}
      ORDER BY "lastSeen" DESC NULLS LAST
      LIMIT 5
    `;

    if (devices.length === 0) {
      return { verified: false, reason: `No device found with IP ${ipAddress} in Datto RMM cache` };
    }

    // Step 2: Check each matching device
    for (const device of devices) {
      // Check if manually flagged as tech device
      if (device.isTechDevice) {
        return buildVerifiedResult(device, ipAddress);
      }

      // Check if device belongs to an internal TCT site
      if (device.siteId && internalSiteIds.includes(device.siteId)) {
        return buildVerifiedResult(device, ipAddress);
      }

      // Step 3: Cross-reference lastUser with known technicians
      if (device.lastUser) {
        const technicianName = await lookupTechnician(device.lastUser);
        if (technicianName) {
          return {
            verified: true,
            device: {
              hostname: device.hostname,
              extIpAddress: ipAddress,
              lastUser: device.lastUser,
              siteName: device.siteName || 'Unknown',
              lastSeen: device.lastSeen?.toISOString() || 'Unknown',
            },
            technician: technicianName,
          };
        }
      }
    }

    return {
      verified: false,
      reason: `Device found at IP ${ipAddress} (${devices[0].hostname}) but not identified as technician device`,
    };
  } catch (err) {
    console.error('[SOC] Technician verification error:', err);
    return {
      verified: false,
      reason: `Verification error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Look up a username against known technician resources.
 * Matches against firstName, lastName, or combined name.
 */
async function lookupTechnician(username: string): Promise<string | null> {
  if (!username) return null;

  const normalized = username.toLowerCase().replace(/[\\\\@]/g, ' ').trim();
  // Extract the last part (after domain backslash or @ sign)
  const parts = normalized.split(/[\s]+/).filter(Boolean);

  try {
    const resources = await prisma.resource.findMany({
      select: { firstName: true, lastName: true },
    });

    for (const r of resources) {
      const first = (r.firstName || '').toLowerCase();
      const last = (r.lastName || '').toLowerCase();
      const full = `${first} ${last}`;

      // Check if any part of the username matches
      if (parts.some(p => p === first || p === last || normalized.includes(full))) {
        return `${r.firstName} ${r.lastName}`.trim();
      }
    }

    return null;
  } catch {
    // Resource table may not exist in all environments
    return null;
  }
}

function buildVerifiedResult(device: CachedDevice, ipAddress: string): DeviceVerification {
  return {
    verified: true,
    device: {
      hostname: device.hostname,
      extIpAddress: ipAddress,
      lastUser: device.lastUser || 'Unknown',
      siteName: device.siteName || 'Unknown',
      lastSeen: device.lastSeen?.toISOString() || 'Unknown',
    },
    technician: device.lastUser || 'Unknown technician',
  };
}

/**
 * Live fallback: query Datto RMM API directly when IP not in cache.
 * Only used when cache misses and DattoRmmClient is available.
 */
export async function verifyTechnicianLive(
  ipAddress: string,
  internalSiteIds: string[],
): Promise<DeviceVerification> {
  try {
    const { DattoRmmClient } = await import('@/lib/datto-rmm');
    const client = new DattoRmmClient();

    if (!client.isConfigured()) {
      return { verified: false, reason: 'Datto RMM not configured' };
    }

    // Fetch all devices and search for IP match
    // This is expensive — only used as fallback
    const devices = await client.getDevices(2); // First 2 pages only
    const match = devices.find(d => d.extIpAddress === ipAddress);

    if (!match) {
      return { verified: false, reason: `No device found with IP ${ipAddress} in Datto RMM (live query)` };
    }

    // Check if device is from internal site
    const isInternal = internalSiteIds.includes(match.siteId);

    if (isInternal || match.lastUser) {
      const techName = match.lastUser ? await lookupTechnician(match.lastUser) : null;
      if (isInternal || techName) {
        return {
          verified: true,
          device: {
            hostname: match.hostname,
            extIpAddress: match.extIpAddress,
            lastUser: match.lastUser,
            siteName: match.siteName,
            lastSeen: match.lastSeen,
          },
          technician: techName || match.lastUser,
        };
      }
    }

    return {
      verified: false,
      reason: `Device "${match.hostname}" found at IP ${ipAddress} but not identified as technician`,
    };
  } catch (err) {
    return {
      verified: false,
      reason: `Live verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
