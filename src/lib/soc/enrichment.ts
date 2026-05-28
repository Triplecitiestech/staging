/**
 * SOC Cross-Stack Enrichment
 *
 * The power of this SOC is correlation: before the AI classifies anything, we
 * pull the real detail from every security tool we can reach and assemble it
 * into a single EnrichmentBundle. The AI then reasons over evidence, not over
 * a gutted Autotask ticket body.
 *
 * Company→platform resolution uses the SAME `compliance_platform_mappings`
 * table the compliance tool uses (Datto RMM site UID, Datto EDR org, DNSFilter
 * org, SaaS Alerts customer ID), with company-name matching as a fallback. This
 * is why the compliance tool can pull this data and the earlier SOC code could
 * not — it was using the incomplete device cache and non-existent endpoints.
 *
 * Sources (all best-effort, each isolated so one failure never sinks the rest):
 *   - RocketCyber  → the actual incident/detection detail behind "Details"
 *   - Datto RMM    → live per-site device health (online, OS, patch, reboot, AV)
 *   - Datto EDR    → org-scoped endpoint detections around the alert window
 *   - DNSFilter    → org filtering deployment (v1 API has no per-event query log)
 *   - SaaS Alerts  → customer-scoped identity/SaaS events in the window
 *   - Known Benign → informational match against trusted-tool catalogue
 */

import { prisma } from '@/lib/prisma';
import { getPool } from '@/lib/db-pool';
import { matchesCompanyName } from '@/utils';
import { RocketCyberClient } from '@/lib/rocketcyber';
import { DattoRmmClient } from '@/lib/datto-rmm';
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

interface PlatformMapping {
  externalId: string;
  externalName: string | null;
  externalType: string | null;
}

/** Resolve a company's external IDs for a platform (same table the compliance tool uses). */
async function getPlatformMappings(companyId: string | null, platform: string): Promise<PlatformMapping[] | null> {
  if (!companyId) return null;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const res = await client.query<PlatformMapping>(
        `SELECT "externalId", "externalName", "externalType"
         FROM compliance_platform_mappings WHERE "companyId" = $1 AND platform = $2`,
        [companyId, platform],
      );
      return res.rows;
    } finally {
      client.release();
    }
  } catch {
    return null; // table may not exist
  }
}

/** Main entry: assemble the full cross-stack evidence bundle for a ticket. */
export async function enrichTicket(
  ticket: SecurityTicket,
  deviceVerification: DeviceVerification | null,
): Promise<EnrichmentBundle> {
  const sourceSystem = detectAlertSource(ticket) as AlertSource;
  const text = `${ticket.title}\n${ticket.description || ''}`;
  const { incidentId, accountId } = extractRocketCyberIds(text);
  const companyId = ticket.companyId;
  const companyName = ticket.companyName || null;

  const dataSources: DataSourceStatus[] = [];
  const dataGaps: string[] = [];

  // 1. RocketCyber — fetch first; its device/org fields improve downstream lookups.
  let rocketCyber: RocketCyberDetail | null = null;
  if (sourceSystem === 'rocketcyber' || incidentId) {
    const rc = await fetchRocketCyber(incidentId, accountId);
    rocketCyber = rc.detail;
    dataSources.push(rc.status);
    if (rc.gap) dataGaps.push(rc.gap);
  } else {
    dataSources.push({ source: 'RocketCyber', status: 'no_data', detail: 'Not a RocketCyber-sourced ticket; no incident ID found in ticket text.' });
  }

  const hostname = resolveHostname(rocketCyber, text, deviceVerification);
  const alertTime = rocketCyber?.eventTime || rocketCyber?.createdAt || ticket.createDate;

  // 2–5. Correlate the rest of the stack in parallel, scoped by platform mapping.
  const [device, edr, dns, saas] = await Promise.all([
    fetchDeviceHealth(companyId, companyName, hostname),
    fetchEdr(companyId, hostname, alertTime),
    fetchDns(companyId, companyName),
    fetchSaasAlerts(companyId, alertTime),
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
    companyId,
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
        status: { source: 'RocketCyber', status: 'no_data', detail: `Incident #${incidentId} returned no data from the API (account ${accountId || 'unknown'}).` },
        gap: `RocketCyber incident #${incidentId} could not be retrieved from the API.`,
      };
    }
    const summary = [
      detail.process && `process ${detail.process}`,
      detail.path && `path ${detail.path}`,
      detail.threatName && `threat ${detail.threatName}`,
      detail.actionTaken && `action ${detail.actionTaken}`,
    ].filter(Boolean).join(', ');
    const gotDetail = !!(detail.process || detail.path || detail.hash);
    return {
      detail,
      status: {
        source: 'RocketCyber',
        status: gotDetail ? 'used' : 'no_data',
        detail: gotDetail
          ? `Pulled incident #${incidentId}: ${summary}.`
          : `Retrieved incident #${incidentId} but it had no process/path/hash detail in the API response.`,
      },
      gap: gotDetail ? undefined : `RocketCyber incident #${incidentId} was retrieved but lacked detection detail; check the raw payload.`,
    };
  } catch (err) {
    return {
      detail: null,
      status: { source: 'RocketCyber', status: 'error', detail: msg(err) },
      gap: `RocketCyber lookup failed: ${msg(err)}`,
    };
  }
}

async function fetchDeviceHealth(
  companyId: string | null,
  companyName: string | null,
  hostname: string | null,
): Promise<SourceResult<DeviceHealth>> {
  const client = new DattoRmmClient();
  if (!client.isConfigured()) {
    return {
      result: null,
      status: { source: 'Datto RMM', status: 'not_configured', detail: 'DATTO_RMM_API_KEY/SECRET not set.' },
      gap: 'Datto RMM not configured — no device health (patch/AV/reboot/online) available.',
    };
  }
  if (!hostname) {
    return { result: null, status: { source: 'Datto RMM', status: 'no_data', detail: 'No hostname to look up.' } };
  }

  try {
    const sites = await client.getSites();
    const mappings = await getPlatformMappings(companyId, 'datto_rmm');

    if (mappings && mappings.some(m => m.externalId === '__none__')) {
      return { result: null, status: { source: 'Datto RMM', status: 'not_configured', detail: 'Company marked as not using Datto RMM.' } };
    }

    let matchedSites = sites;
    if (mappings && mappings.length > 0) {
      const ids = new Set(mappings.map(m => m.externalId));
      matchedSites = sites.filter(s => ids.has(s.uid) || ids.has(String(s.id)));
    } else if (companyName) {
      matchedSites = sites.filter(s => matchesCompanyName(companyName, s.name));
    } else {
      matchedSites = [];
    }

    if (matchedSites.length === 0) {
      return {
        result: null,
        status: { source: 'Datto RMM', status: 'no_data', detail: `No Datto RMM site mapped/matched for ${companyName || 'this company'}.` },
        gap: `No Datto RMM site is mapped to ${companyName || 'this company'}; map it at the compliance Connect Tools step for device correlation.`,
      };
    }

    // Search matched sites for the device (live per-site fetch — the global
    // /account/devices endpoint only returns a tiny subset).
    const want = hostname.toLowerCase();
    let device: Awaited<ReturnType<DattoRmmClient['getSiteDevices']>>[number] | undefined;
    for (const site of matchedSites.slice(0, 5)) {
      const devices = await client.getSiteDevices(site.uid);
      device = devices.find(d => d.hostname && d.hostname.toLowerCase() === want)
        || devices.find(d => d.hostname && d.hostname.toLowerCase().includes(want));
      if (device) break;
    }

    if (!device) {
      return {
        result: null,
        status: { source: 'Datto RMM', status: 'no_data', detail: `Device "${hostname}" not found in the ${matchedSites.length} mapped Datto RMM site(s).` },
        gap: `Device "${hostname}" was not found in the mapped Datto RMM site(s) — verify the hostname/site mapping.`,
      };
    }

    const software = await client.getDeviceSoftware(device.id).catch(() => []);
    const recentSoftware = software
      .filter(s => s.installDate)
      .sort((a, b) => new Date(b.installDate!).getTime() - new Date(a.installDate!).getTime())
      .slice(0, 10);

    const health: DeviceHealth = {
      hostname: device.hostname,
      online: device.online,
      operatingSystem: device.operatingSystem || null,
      lastUser: device.lastUser || null,
      lastSeen: device.lastSeen || null,
      rebootRequired: device.rebootRequired,
      patchStatus: device.patchStatus || null,
      patchesApprovedPending: device.patchesApprovedPending,
      antivirusProduct: device.antivirusProduct || null,
      antivirusStatus: device.antivirusStatus || null,
      siteName: device.siteName || null,
      recentSoftware,
    };
    const bits = [
      device.online ? 'online' : 'offline',
      device.patchStatus && `patch: ${device.patchStatus}`,
      device.antivirusStatus && `AV: ${device.antivirusStatus}`,
    ].filter(Boolean).join(', ');
    return {
      result: health,
      status: { source: 'Datto RMM', status: 'used', detail: `Device "${device.hostname}" found — ${bits}.` },
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'Datto RMM', status: 'error', detail: msg(err) },
      gap: `Datto RMM lookup failed: ${msg(err)}`,
    };
  }
}

interface RawEdrAlert {
  threatName?: string; threatScore?: number; flagName?: string; type?: string;
  name?: string; path?: string; hostname?: string; createdOn?: string; compromised?: boolean; malicious?: boolean;
}

async function fetchEdr(
  companyId: string | null,
  hostname: string | null,
  alertTime: string,
): Promise<SourceResult<EdrCorrelation>> {
  const token = process.env.DATTO_EDR_API_TOKEN;
  if (!token) {
    return {
      result: null,
      status: { source: 'Datto EDR', status: 'not_configured', detail: 'DATTO_EDR_API_TOKEN not set.' },
      gap: 'Datto EDR not configured — could not check for related endpoint detections.',
    };
  }
  const mappings = await getPlatformMappings(companyId, 'datto_edr');
  if (mappings && mappings.some(m => m.externalId === '__none__')) {
    return { result: null, status: { source: 'Datto EDR', status: 'not_configured', detail: 'Company marked as not using Datto EDR.' } };
  }

  try {
    const edrUrl = (process.env.DATTO_EDR_API_URL || 'https://triple5695.infocyte.com/api').replace(/\/$/, '');
    const tokenParam = `access_token=${encodeURIComponent(token)}`;
    const center = new Date(alertTime).getTime() || Date.now();
    const since = new Date(center - WINDOW_MS);
    const until = new Date(center + WINDOW_MS);
    const orgId = mappings && mappings.length > 0 && mappings[0].externalId !== 'msp_wide' ? mappings[0].externalId : null;

    const where: Record<string, unknown> = {
      createdOn: { gte: since.toISOString(), lte: until.toISOString() },
      ...(orgId ? { organizationId: orgId } : {}),
    };
    const filter = JSON.stringify({ where, limit: 500, order: 'createdOn DESC' });
    const res = await fetch(`${edrUrl}/Alerts?filter=${encodeURIComponent(filter)}&${tokenParam}`, {
      headers: { Authorization: token, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return {
        result: null,
        status: { source: 'Datto EDR', status: 'error', detail: `Alerts query failed (${res.status})` },
        gap: `Datto EDR alerts query failed (${res.status}).`,
      };
    }
    const alerts = (await res.json()) as RawEdrAlert[];
    const list = Array.isArray(alerts) ? alerts : [];
    const relevant = hostname
      ? list.filter(a => a.hostname && a.hostname.toLowerCase().includes(hostname.toLowerCase()))
      : list;

    if (relevant.length === 0) {
      return {
        result: { detectionCount: 0, detections: [] },
        status: { source: 'Datto EDR', status: 'no_data', detail: hostname ? `No EDR detections for "${hostname}" in window${orgId ? ` (org ${orgId})` : ''}.` : 'No EDR detections in window.' },
      };
    }
    return {
      result: {
        detectionCount: relevant.length,
        detections: relevant.slice(0, 10).map(e => ({
          type: e.flagName || e.type || 'detection',
          severity: e.threatName || 'unknown',
          description: e.name || e.path || '',
          timestamp: e.createdOn || '',
          status: e.compromised ? 'compromised' : e.malicious ? 'malicious' : 'active',
        })),
      },
      status: { source: 'Datto EDR', status: 'used', detail: `${relevant.length} EDR detection(s) near alert time${orgId ? ` (org ${orgId})` : ''}.` },
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'Datto EDR', status: 'error', detail: msg(err) },
      gap: `Datto EDR lookup failed: ${msg(err)}`,
    };
  }
}

async function fetchDns(companyId: string | null, companyName: string | null): Promise<SourceResult<DnsCorrelation>> {
  const client = new DnsFilterClient();
  if (!client.isConfigured()) {
    return {
      result: null,
      status: { source: 'DNSFilter', status: 'not_configured', detail: 'DNSFILTER_API_TOKEN not set.' },
      gap: 'DNSFilter not configured.',
    };
  }
  const mappings = await getPlatformMappings(companyId, 'dnsfilter');
  if (mappings && mappings.some(m => m.externalId === '__none__')) {
    return { result: null, status: { source: 'DNSFilter', status: 'not_configured', detail: 'Company marked as not using DNSFilter.' } };
  }

  try {
    const baseUrl = (process.env.DNSFILTER_API_URL || 'https://api.dnsfilter.com/v1').replace(/\/$/, '');
    const headers = { Authorization: `Token ${process.env.DNSFILTER_API_TOKEN}`, Accept: 'application/json' };

    const orgRes = await fetch(`${baseUrl}/organizations`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!orgRes.ok) {
      return { result: null, status: { source: 'DNSFilter', status: 'error', detail: `Organizations endpoint failed (${orgRes.status})` }, gap: `DNSFilter lookup failed (${orgRes.status}).` };
    }
    const orgJson = (await orgRes.json()) as { data?: Array<{ id: string; attributes?: { name?: string } }> };
    const orgs = orgJson.data ?? [];

    let orgName: string | null = null;
    if (mappings && mappings.length > 0) {
      const matched = orgs.find(o => o.id === mappings[0].externalId);
      orgName = matched?.attributes?.name ?? mappings[0].externalName;
    } else if (companyName) {
      const matched = orgs.find(o => matchesCompanyName(companyName, o.attributes?.name ?? ''));
      orgName = matched?.attributes?.name ?? null;
    }

    // The DNSFilter v1 API has no per-event query-log endpoint, so we confirm
    // the org's filtering deployment rather than point-in-time blocked lookups.
    return {
      result: null,
      status: {
        source: 'DNSFilter',
        status: orgName ? 'used' : 'no_data',
        detail: orgName
          ? `DNS filtering deployed for org "${orgName}" (${orgs.length} org(s) visible).`
          : `No DNSFilter org mapped/matched for ${companyName || 'this company'}.`,
      },
      gap: 'DNSFilter v1 API exposes no per-event query log, so point-in-time blocked-domain correlation for this device/timeframe is not available.',
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'DNSFilter', status: 'error', detail: msg(err) },
      gap: `DNSFilter lookup failed: ${msg(err)}`,
    };
  }
}

async function fetchSaasAlerts(companyId: string | null, alertTime: string): Promise<SourceResult<SaasCorrelation>> {
  const client = new SaasAlertsClient();
  if (!client.isConfigured()) {
    return {
      result: null,
      status: { source: 'SaaS Alerts', status: 'not_configured', detail: `Missing ${client.missingCredentials().join(', ')}.` },
      gap: 'SaaS Alerts not configured — could not correlate identity/SaaS events.',
    };
  }
  const mappings = await getPlatformMappings(companyId, 'saas_alerts');
  if (mappings && mappings.some(m => m.externalId === '__none__')) {
    return { result: null, status: { source: 'SaaS Alerts', status: 'not_configured', detail: 'Company marked as not using SaaS Alerts.' } };
  }
  const customerIds = (mappings ?? []).map(m => m.externalId).filter(id => id && id !== '__none__');
  if (customerIds.length === 0) {
    return {
      result: null,
      status: { source: 'SaaS Alerts', status: 'no_data', detail: 'No SaaS Alerts customer mapped for this company.' },
      gap: 'No SaaS Alerts customer is mapped to this company; map it at the compliance Connect Tools step for identity correlation.',
    };
  }

  try {
    const center = new Date(alertTime).getTime() || Date.now();
    const since = new Date(center - WINDOW_MS).toISOString();
    const until = new Date(center + WINDOW_MS).toISOString();
    const events: SaasCorrelation['events'] = [];
    for (const customerId of customerIds) {
      const { events: rows } = await client.getEvents({ customerId, since, until, limit: 200 });
      for (const e of rows) {
        events.push({
          type: e.jointType || e.eventType || e.type || 'event',
          severity: e.alertStatus || e.severity || 'unknown',
          description: e.jointDesc || e.description || '',
          time: e.time || e.timestamp || '',
          user: typeof e.user === 'string' ? e.user : (e.user?.email || e.user?.name || null),
        });
      }
    }

    if (events.length === 0) {
      return { result: { eventCount: 0, events: [] }, status: { source: 'SaaS Alerts', status: 'no_data', detail: `No SaaS Alerts events for the mapped customer(s) in window.` } };
    }
    return {
      result: { eventCount: events.length, events: events.slice(0, 10) },
      status: { source: 'SaaS Alerts', status: 'used', detail: `${events.length} SaaS Alerts event(s) for the mapped customer(s) near alert time.` },
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
    return [];
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
    if (!matchedOn && r.hashValue && params.hash && r.hashValue.toLowerCase() === params.hash.toLowerCase()) matchedOn = 'hash';
    if (!matchedOn && r.certificateSigner && lowerText.includes(r.certificateSigner.toLowerCase())) matchedOn = 'signer';
    if (!matchedOn && r.vendor && r.product && lowerText.includes(r.vendor.toLowerCase()) && lowerText.includes(r.product.toLowerCase())) matchedOn = 'vendor_product';

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
