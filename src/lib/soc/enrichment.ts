/**
 * SOC Cross-Stack Enrichment
 *
 * The power of this SOC is correlation: before the AI classifies anything, we
 * pull the real detail from every security tool we can reach and assemble it
 * into a single EnrichmentBundle. The AI then reasons over evidence, not over
 * a gutted Autotask ticket body.
 *
 * Sources (all best-effort, each isolated so one failure never sinks the rest):
 *   - RocketCyber  → the actual incident/detection detail behind "Details"
 *   - Datto RMM    → device health (online, OS, patch, reboot, AV, user, software)
 *   - Datto EDR    → endpoint detections around the alert window
 *   - DNSFilter    → blocked/threat lookups in the window (org-level)
 *   - SaaS Alerts  → identity/SaaS events for the customer in the window
 *   - Known Benign → informational match against trusted-tool catalogue
 */

import { prisma } from '@/lib/prisma';
import { RocketCyberClient } from '@/lib/rocketcyber';
import { DattoRmmClient } from '@/lib/datto-rmm';
import { DattoEdrClient } from '@/lib/datto-edr';
import { DnsFilterClient } from '@/lib/dnsfilter';
import { SaasAlertsClient } from '@/lib/saas-alerts';
import { detectAlertSource } from './rules';
import type {
  SecurityTicket,
  DeviceVerification,
  EnrichmentBundle,
  DataSourceStatus,
  DeviceHealth,
  EdrCorrelation,
  DnsCorrelation,
  SaasCorrelation,
  KnownBenignMatch,
  AlertSource,
} from './types';
import type { RocketCyberDetail } from '@/lib/rocketcyber';

const WINDOW_MS = 6 * 60 * 60 * 1000; // ±6h correlation window

/** Main entry: assemble the full cross-stack evidence bundle for a ticket. */
export async function enrichTicket(
  ticket: SecurityTicket,
  deviceVerification: DeviceVerification | null,
): Promise<EnrichmentBundle> {
  const sourceSystem = detectAlertSource(ticket) as AlertSource;
  const text = `${ticket.title}\n${ticket.description || ''}`;
  const { incidentId, accountId } = extractRocketCyberIds(text);

  const dataSources: DataSourceStatus[] = [];
  const dataGaps: string[] = [];

  // 1. RocketCyber — fetch first, since its device/org fields improve every
  //    downstream lookup.
  let rocketCyber: RocketCyberDetail | null = null;
  if (sourceSystem === 'rocketcyber' || incidentId) {
    const rc = await fetchRocketCyber(incidentId, accountId);
    rocketCyber = rc.detail;
    dataSources.push(rc.status);
    if (rc.gap) dataGaps.push(rc.gap);
  } else {
    dataSources.push({ source: 'RocketCyber', status: 'no_data', detail: 'Not a RocketCyber-sourced ticket; no incident ID found in ticket text.' });
  }

  // Resolve the affected device hostname from RC detail (most reliable) or text.
  const hostname = resolveHostname(rocketCyber, text, deviceVerification);
  const alertTime = rocketCyber?.eventTime || rocketCyber?.createdAt || ticket.createDate;

  // 2–5. Correlate the rest of the stack in parallel.
  const [device, edr, dns, saas] = await Promise.all([
    fetchDeviceHealth(hostname),
    fetchEdr(hostname, alertTime),
    fetchDns(alertTime),
    fetchSaasAlerts(ticket.companyName || rocketCyber?.organization || null, alertTime),
  ]);

  for (const r of [device, edr, dns, saas]) {
    dataSources.push(r.status);
    if (r.gap) dataGaps.push(r.gap);
  }

  // 6. Known benign catalogue (informational only).
  const knownBenignMatches = await matchKnownBenign({
    text,
    path: rocketCyber?.path || null,
    hash: rocketCyber?.hash || null,
    companyId: ticket.companyId,
    hostname,
  });

  if (!hostname) dataGaps.push('Could not determine the affected device hostname from the alert; device-level correlation skipped.');

  return {
    sourceSystem,
    externalIncidentId: incidentId,
    externalAccountId: accountId,
    rocketCyber,
    deviceHealth: device.result,
    edr: edr.result,
    dns: dns.result,
    saasAlerts: saas.result,
    knownBenignMatches,
    dataSources,
    dataGaps,
  };
}

// ── ID + hostname extraction ──

/** Pull the RocketCyber incident ID and account ID out of the Autotask ticket text. */
export function extractRocketCyberIds(text: string): { incidentId: string | null; accountId: string | null } {
  let incidentId: string | null = null;
  let accountId: string | null = null;

  // Account ID is most reliable from the portal URL: /accounts/<id>/apps/incidents/<incidentId>
  const urlMatch = text.match(/accounts\/(\d+)\/apps\/incidents\/(\d+)/i);
  if (urlMatch) {
    accountId = urlMatch[1];
    incidentId = urlMatch[2];
  }

  if (!incidentId) {
    const incMatch =
      text.match(/Alert\/Incident\s*#?\s*(\d+)/i) ||
      text.match(/incidents\/(\d+)/i) ||
      text.match(/incident\s*#\s*(\d+)/i);
    if (incMatch) incidentId = incMatch[1];
  }

  if (!accountId) {
    const acctMatch =
      text.match(/switch_account_id=(\d+)/i) ||
      text.match(/Organization:[^\n]*\(ID:\s*(\d+)\)/i) ||
      text.match(/account[_\s]?id[:\s]+(\d+)/i);
    if (acctMatch) accountId = acctMatch[1];
  }

  return { incidentId, accountId };
}

/** Best-effort hostname: RocketCyber device field, then common ticket patterns. */
function resolveHostname(
  rc: RocketCyberDetail | null,
  text: string,
  deviceVerification: DeviceVerification | null,
): string | null {
  const rcDevice = rc?.device?.split('|')[0]?.trim();
  if (rcDevice) return rcDevice;
  if (deviceVerification?.verified && deviceVerification.device?.hostname) {
    return deviceVerification.device.hostname;
  }

  const patterns = [
    /Device:\s*([A-Za-z0-9][A-Za-z0-9_-]{2,})/,
    /\b(DESKTOP-[A-Z0-9]+)\b/i,
    /\b(LAPTOP-[A-Z0-9]+)\b/i,
    /\b([A-Z]{2,5}-\d{2,4})\b/, // e.g. EP-008
    /hostname[:\s]+([A-Za-z0-9][A-Za-z0-9_-]{2,})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

// ── Per-source fetchers ──

interface SourceResult<T> {
  result: T | null;
  status: DataSourceStatus;
  gap?: string;
}

async function fetchRocketCyber(
  incidentId: string | null,
  accountId: string | null,
): Promise<{ detail: RocketCyberDetail | null; status: DataSourceStatus; gap?: string }> {
  const client = new RocketCyberClient();
  if (!client.isConfigured()) {
    return {
      detail: null,
      status: { source: 'RocketCyber', status: 'not_configured', detail: 'ROCKETCYBER_API_TOKEN not set.' },
      gap: 'RocketCyber API not configured — could not pull the detailed detection record behind the alert.',
    };
  }
  if (!incidentId) {
    return {
      detail: null,
      status: { source: 'RocketCyber', status: 'no_data', detail: 'No RocketCyber incident ID found in ticket.' },
      gap: 'No RocketCyber incident ID in the ticket; detailed detection data unavailable.',
    };
  }
  try {
    const detail = await client.getIncidentDetail(incidentId, accountId);
    if (!detail) {
      return {
        detail: null,
        status: { source: 'RocketCyber', status: 'no_data', detail: `Incident #${incidentId} not found via API.` },
        gap: `RocketCyber incident #${incidentId} could not be retrieved.`,
      };
    }
    const summary = [
      detail.process && `process ${detail.process}`,
      detail.path && `path ${detail.path}`,
      detail.threatName && `threat ${detail.threatName}`,
      detail.actionTaken && `action ${detail.actionTaken}`,
    ].filter(Boolean).join(', ');
    return {
      detail,
      status: {
        source: 'RocketCyber',
        status: 'used',
        detail: `Pulled incident #${incidentId}${summary ? `: ${summary}` : ''}.`,
      },
    };
  } catch (err) {
    return {
      detail: null,
      status: { source: 'RocketCyber', status: 'error', detail: msg(err) },
      gap: `RocketCyber lookup failed: ${msg(err)}`,
    };
  }
}

async function fetchDeviceHealth(hostname: string | null): Promise<SourceResult<DeviceHealth>> {
  const client = new DattoRmmClient();
  if (!client.isConfigured()) {
    return {
      result: null,
      status: { source: 'Datto RMM', status: 'not_configured', detail: 'DATTO_RMM_API_KEY/SECRET not set.' },
      gap: 'Datto RMM not configured — no device health (patch/AV/reboot/online) available.',
    };
  }
  if (!hostname) {
    return {
      result: null,
      status: { source: 'Datto RMM', status: 'no_data', detail: 'No hostname to look up.' },
    };
  }

  try {
    // Resolve the device from the local cache first (fast, populated by the
    // datto-device-sync cron), then enrich with a live detail call.
    const rows = await prisma.$queryRaw<Array<{
      dattoDeviceId: string; hostname: string; lastUser: string | null;
      siteName: string | null; operatingSystem: string | null; lastSeen: Date | null;
    }>>`
      SELECT "dattoDeviceId", hostname, "lastUser", "siteName", "operatingSystem", "lastSeen"
      FROM datto_devices
      WHERE hostname ILIKE ${hostname}
      ORDER BY "lastSeen" DESC NULLS LAST
      LIMIT 1
    `;

    if (rows.length === 0) {
      return {
        result: null,
        status: { source: 'Datto RMM', status: 'no_data', detail: `No device named "${hostname}" in Datto RMM cache.` },
        gap: `Device "${hostname}" not found in Datto RMM — could not verify device health.`,
      };
    }

    const cached = rows[0];
    let online: boolean | null = null;
    let rebootRequired: boolean | null = null;
    let patchStatus: string | null = null;
    let patchesApprovedPending: number | null = null;
    let antivirusProduct: string | null = null;
    let antivirusStatus: string | null = null;
    let recentSoftware: DeviceHealth['recentSoftware'] = [];

    try {
      const [live, software] = await Promise.all([
        client.getDevice(cached.dattoDeviceId),
        client.getDeviceSoftware(cached.dattoDeviceId),
      ]);
      online = live.online;
      rebootRequired = live.rebootRequired;
      patchStatus = live.patchStatus;
      patchesApprovedPending = live.patchesApprovedPending;
      antivirusProduct = live.antivirusProduct || null;
      antivirusStatus = live.antivirusStatus || null;
      recentSoftware = (software || [])
        .filter(s => s.installDate)
        .sort((a, b) => new Date(b.installDate!).getTime() - new Date(a.installDate!).getTime())
        .slice(0, 10);
    } catch {
      // Live detail failed — fall back to cached basics only.
    }

    const health: DeviceHealth = {
      hostname: cached.hostname,
      online,
      operatingSystem: cached.operatingSystem,
      lastUser: cached.lastUser,
      lastSeen: cached.lastSeen ? cached.lastSeen.toISOString() : null,
      rebootRequired,
      patchStatus,
      patchesApprovedPending,
      antivirusProduct,
      antivirusStatus,
      siteName: cached.siteName,
      recentSoftware,
    };

    const bits = [
      online === null ? null : (online ? 'online' : 'offline'),
      patchStatus && `patch: ${patchStatus}`,
      antivirusStatus && `AV: ${antivirusStatus}`,
    ].filter(Boolean).join(', ');
    return {
      result: health,
      status: { source: 'Datto RMM', status: 'used', detail: `Device "${cached.hostname}"${bits ? ` — ${bits}` : ''}.` },
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'Datto RMM', status: 'error', detail: msg(err) },
      gap: `Datto RMM lookup failed: ${msg(err)}`,
    };
  }
}

async function fetchEdr(hostname: string | null, alertTime: string): Promise<SourceResult<EdrCorrelation>> {
  const client = new DattoEdrClient();
  if (!client.isConfigured()) {
    return {
      result: null,
      status: { source: 'Datto EDR', status: 'not_configured', detail: 'DATTO_EDR_API_TOKEN not set.' },
      gap: 'Datto EDR not configured — could not check for related endpoint detections.',
    };
  }
  try {
    const center = new Date(alertTime).getTime() || Date.now();
    const since = new Date(center - WINDOW_MS);
    const until = new Date(center + WINDOW_MS);
    const events = await client.getEvents(since, until);
    const relevant = hostname
      ? events.filter(e => e.hostname && e.hostname.toLowerCase().includes(hostname.toLowerCase()))
      : events;

    if (relevant.length === 0) {
      return {
        result: { detectionCount: 0, detections: [] },
        status: { source: 'Datto EDR', status: 'no_data', detail: hostname ? `No EDR detections for "${hostname}" in window.` : 'No EDR detections in window.' },
      };
    }

    return {
      result: {
        detectionCount: relevant.length,
        detections: relevant.slice(0, 10).map(e => ({
          type: e.type,
          severity: e.severity,
          description: e.description,
          timestamp: e.timestamp,
          status: e.status,
        })),
      },
      status: { source: 'Datto EDR', status: 'used', detail: `${relevant.length} EDR detection(s) near alert time.` },
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'Datto EDR', status: 'error', detail: msg(err) },
      gap: `Datto EDR lookup failed: ${msg(err)}`,
    };
  }
}

async function fetchDns(alertTime: string): Promise<SourceResult<DnsCorrelation>> {
  const client = new DnsFilterClient();
  if (!client.isConfigured()) {
    return {
      result: null,
      status: { source: 'DNSFilter', status: 'not_configured', detail: 'DNSFILTER_API_TOKEN not set.' },
      gap: 'DNSFilter not configured — could not check for blocked/suspicious DNS lookups.',
    };
  }
  try {
    const center = new Date(alertTime).getTime() || Date.now();
    const since = new Date(center - WINDOW_MS);
    const until = new Date(center + WINDOW_MS);
    const report = await client.getTrafficReport(since, until);
    return {
      result: {
        blockedQueries: report.blocked_queries,
        totalQueries: report.total_queries,
        topBlockedDomains: report.top_blocked.slice(0, 10),
        orgLevelOnly: true,
      },
      status: {
        source: 'DNSFilter',
        status: report.total_queries > 0 || report.blocked_queries > 0 ? 'used' : 'no_data',
        detail: `${report.blocked_queries} blocked / ${report.total_queries} total queries (org-level).`,
      },
      gap: 'DNSFilter data is org-level only; could not isolate this specific device/user in the window.',
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'DNSFilter', status: 'error', detail: msg(err) },
      gap: `DNSFilter lookup failed: ${msg(err)}`,
    };
  }
}

async function fetchSaasAlerts(companyName: string | null, alertTime: string): Promise<SourceResult<SaasCorrelation>> {
  const client = new SaasAlertsClient();
  if (!client.isConfigured()) {
    return {
      result: null,
      status: { source: 'SaaS Alerts', status: 'not_configured', detail: 'SaaS Alerts credentials not set.' },
      gap: 'SaaS Alerts not configured — could not correlate identity/SaaS events.',
    };
  }
  try {
    const center = new Date(alertTime).getTime() || Date.now();
    const since = new Date(center - WINDOW_MS).toISOString();
    const until = new Date(center + WINDOW_MS).toISOString();
    const { events } = await client.getEvents({ since, until, limit: 200 });

    // No reliable company→SaaS-customer mapping exists, so match on name.
    const relevant = companyName
      ? events.filter(e => (e.customerName || '').toLowerCase().includes(companyName.toLowerCase()))
      : [];

    if (relevant.length === 0) {
      return {
        result: { eventCount: 0, events: [] },
        status: { source: 'SaaS Alerts', status: 'no_data', detail: companyName ? `No SaaS Alerts events matched "${companyName}" in window.` : 'No company name to match SaaS Alerts events.' },
        gap: companyName ? undefined : 'No company name available to correlate SaaS Alerts events.',
      };
    }

    return {
      result: {
        eventCount: relevant.length,
        events: relevant.slice(0, 10).map(e => ({
          type: e.jointType || e.eventType || e.type || 'event',
          severity: e.alertStatus || e.severity || 'unknown',
          description: e.jointDesc || e.description || '',
          time: e.time || e.timestamp || '',
          user: typeof e.user === 'string' ? e.user : (e.user?.email || e.user?.name || null),
        })),
      },
      status: { source: 'SaaS Alerts', status: 'used', detail: `${relevant.length} SaaS Alerts event(s) for ${companyName} near alert time.` },
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'SaaS Alerts', status: 'error', detail: msg(err) },
      gap: `SaaS Alerts lookup failed: ${msg(err)}`,
    };
  }
}

// ── Known Benign matching (informational only — never auto-suppresses) ──

export async function matchKnownBenign(params: {
  text: string;
  path: string | null;
  hash: string | null;
  companyId: string | null;
  hostname: string | null;
}): Promise<KnownBenignMatch[]> {
  let rows: Array<{
    id: string; vendor: string; product: string; executablePath: string | null;
    hashValue: string | null; certificateSigner: string | null; detectionType: string | null;
    recommendedHandling: string | null; scope: string; companyId: string | null; deviceHostname: string | null;
  }>;
  try {
    rows = await prisma.$queryRaw`
      SELECT id, vendor, product, "executablePath", "hashValue", "certificateSigner",
             "detectionType", "recommendedHandling", scope, "companyId", "deviceHostname"
      FROM soc_known_benign
      WHERE "isActive" = true
        AND (
          scope = 'global'
          OR (scope = 'tenant' AND "companyId" = ${params.companyId})
          OR (scope = 'device' AND ${params.hostname}::text IS NOT NULL AND "deviceHostname" ILIKE ${params.hostname})
        )
    `;
  } catch {
    return []; // table may not exist yet
  }

  const matches: KnownBenignMatch[] = [];
  const lowerText = params.text.toLowerCase();
  const lowerPath = (params.path || '').toLowerCase();

  for (const r of rows) {
    let matchedOn: string | null = null;

    if (r.executablePath) {
      const ep = r.executablePath.toLowerCase();
      if ((lowerPath && lowerPath.includes(ep)) || lowerText.includes(ep)) matchedOn = 'path';
    }
    if (!matchedOn && r.hashValue && params.hash && r.hashValue.toLowerCase() === params.hash.toLowerCase()) {
      matchedOn = 'hash';
    }
    if (!matchedOn && r.certificateSigner && lowerText.includes(r.certificateSigner.toLowerCase())) {
      matchedOn = 'signer';
    }
    if (!matchedOn && r.vendor && r.product) {
      // Require both vendor and product tokens to appear to avoid loose hits.
      if (lowerText.includes(r.vendor.toLowerCase()) && lowerText.includes(r.product.toLowerCase())) {
        matchedOn = 'vendor_product';
      }
    }

    if (matchedOn) {
      matches.push({
        id: r.id,
        vendor: r.vendor,
        product: r.product,
        executablePath: r.executablePath,
        detectionType: r.detectionType,
        recommendedHandling: r.recommendedHandling,
        scope: r.scope as KnownBenignMatch['scope'],
        matchedOn,
      });
    }
  }

  return matches;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
