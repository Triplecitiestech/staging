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
import { SaasAlertsClient } from '@/lib/saas-alerts';
import { detectAlertSource, isIdentityChangeAlert } from './rules';
import { extractIps, extractIpv6 } from './ip-extractor';
import { classifyEventTiming } from '@/lib/reporting/business-hours';
import { fetchM365Identity } from './m365-identity';
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
  CompanyNetworkMatch,
  AlertSource,
  AssessmentSignals,
  M365IdentityCorrelation,
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
  const { allIps } = extractIps(text);

  // 2. Datto RMM first — it resolves the device (by hostname, or by the source
  //    IP against the company's known devices), which scopes the EDR lookup.
  const device = await fetchDeviceHealth(companyId, companyName, hostname, allIps);
  dataSources.push(device.status);
  if (device.gap) dataGaps.push(device.gap);
  const effectiveHostname = device.result?.hostname || hostname;

  // 3–5. Correlate the rest of the stack in parallel.
  const [edr, dns, saas] = await Promise.all([
    fetchEdr(companyId, companyName, effectiveHostname, alertTime),
    fetchDns(companyId, companyName, alertTime, effectiveHostname, allIps),
    fetchSaasAlerts(companyId, companyName, alertTime),
  ]);

  for (const r of [edr, dns, saas]) {
    dataSources.push(r.status);
    if (r.gap) dataGaps.push(r.gap);
  }

  // 6. Known benign catalogue (informational only).
  const knownBenignMatches = await matchKnownBenign({
    path: rocketCyber?.path || null,
    processName: rocketCyber?.process || null,
    hash: rocketCyber?.hash || null,
    companyId,
    hostname,
  });

  if (!hostname) dataGaps.push('Could not determine the affected device hostname from the alert; device-level correlation skipped.');

  // 7. M365 tenant correlation — ONLY for identity/MFA-change alerts. Scoped to
  //    the customer's own tenant (getTenantCredentials), so it is authoritative
  //    for what actually happened and can never reach another customer.
  let m365Identity: M365IdentityCorrelation | null = null;
  if (isIdentityChangeAlert(ticket)) {
    const upn = resolveUserPrincipalName(ticket, saas.result?.events || []);
    const m365 = await fetchM365Identity({ companyId, userPrincipalName: upn, alertTime });
    m365Identity = m365.result;
    dataSources.push(m365.status);
    if (m365.gap) dataGaps.push(m365.gap);
  }

  // Assemble the independent signal axes (timing, geo, corroboration, identity-change).
  // recurrence is a placeholder here — the engine fills it from the analysis history.
  const signals = buildSignals({
    ticket,
    alertTime,
    saasEvents: saas.result?.events || [],
    ticketText: text,
    ipv4: allIps,
    onKnownNetwork: !!device.networkMatch || deviceVerification?.verified === true,
    dataSources,
    rocketCyber,
    deviceHealth: device.result,
    networkMatch: device.networkMatch || null,
    edr: edr.result,
    dns: dns.result,
    m365: m365Identity,
  });

  return {
    sourceSystem,
    externalIncidentId: incidentId,
    externalAccountId: accountId,
    rocketCyber,
    deviceHealth: device.result,
    companyNetworkMatch: device.networkMatch || null,
    edr: edr.result,
    dns: dns.result,
    saasAlerts: saas.result,
    m365Identity,
    knownBenignMatches,
    dataSources,
    dataGaps,
    signals,
  };
}

/**
 * Resolve the affected user's UPN/email for M365 correlation: prefer a SaaS
 * Alerts event user, else the first email address in the ticket title/body
 * (SaaS Alerts identity tickets carry it, e.g. "markk@c4isrcables.com/IAM Event…").
 */
function resolveUserPrincipalName(ticket: SecurityTicket, saasEvents: SaasCorrelation['events']): string | null {
  const fromEvent = saasEvents.map(e => e.user).find(u => u && u.includes('@'));
  if (fromEvent) return fromEvent;
  const m = `${ticket.title}\n${ticket.description || ''}`.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : null;
}

/** Format a SaaS Alerts location object as "City, Region, Country" (non-empty parts). */
function formatSaasLocation(loc: { country?: string; region?: string; city?: string } | null | undefined): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.region, loc.country].map(p => (p || '').trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Build the independent signal axes from the correlated evidence. Each axis is
 * evaluated on its own so they can never be collapsed into one "it's fine"
 * verdict downstream. recurrence is zeroed here and filled by the engine.
 */
function buildSignals(params: {
  ticket: SecurityTicket;
  alertTime: string;
  saasEvents: SaasCorrelation['events'];
  ticketText: string;
  ipv4: string[];
  onKnownNetwork: boolean;
  dataSources: DataSourceStatus[];
  rocketCyber: import('@/lib/rocketcyber').RocketCyberDetail | null;
  deviceHealth: DeviceHealth | null;
  networkMatch: CompanyNetworkMatch | null;
  edr: EdrCorrelation | null;
  dns: DnsCorrelation | null;
  m365: M365IdentityCorrelation | null;
}): AssessmentSignals {
  // ── Timing ──
  const eventDate = new Date(params.alertTime);
  const validTime = !Number.isNaN(eventDate.getTime());
  const timing = validTime
    ? (() => {
        const t = classifyEventTiming(eventDate);
        return {
          eventTimeUtc: eventDate.toISOString(),
          eventTimeLocal: t.localTime,
          timezone: t.timezone,
          afterHours: t.afterHours,
          weekend: t.weekend,
        };
      })()
    : { eventTimeUtc: null, eventTimeLocal: null, timezone: 'America/New_York', afterHours: null, weekend: null };

  // ── Geolocation vs baseline ── (authoritative IP comes from the SaaS event)
  const eventWithIp = params.saasEvents.find(e => e.ip);
  const eventWithLoc = params.saasEvents.find(e => e.location);
  const ipv6 = extractIpv6(params.ticketText);
  const alertIp = eventWithIp?.ip || ipv6[0] || params.ipv4[0] || null;
  const alertLocation = eventWithLoc?.location || null;
  const locationsSeenNearby = Array.from(
    new Set(params.saasEvents.map(e => e.location).filter((l): l is string => !!l)),
  );
  const geoBaseline: 'matched_known_network' | 'no_baseline_match' | 'unknown' = params.onKnownNetwork
    ? 'matched_known_network'
    : (alertIp || alertLocation) ? 'no_baseline_match' : 'unknown';

  // ── Corroboration ── (independent telemetry — SaaS events are the alert itself, NOT corroboration)
  // For identity alerts, an M365 audit confirmation of a benign RE-ENROLLMENT
  // (the method was removed AND a strong method re-registered, with a strong
  // method still present) is positive, authoritative corroboration from the
  // tenant — the source of truth. A removal with no re-registration, or only a
  // weak factor left, is NOT treated as corroborating (stays cautious).
  const m365BenignReenrollment = Boolean(
    params.m365 && params.m365.removeThenReregister && params.m365.hasStrongMethodRemaining,
  );
  const sourcesUsed = params.dataSources.filter(s => s.status === 'used').map(s => s.source);
  const corroboratingTelemetry = Boolean(
    (params.rocketCyber && (params.rocketCyber.process || params.rocketCyber.path || params.rocketCyber.hash)) ||
    params.deviceHealth ||
    params.networkMatch ||
    (params.edr && params.edr.deviceScoped && params.edr.detectionCount > 0) ||
    (params.dns && params.dns.deviceScoped) ||
    m365BenignReenrollment,
  );

  return {
    timing,
    geo: {
      ipReputationChecked: false, // no reputation provider wired in — do not assert a clean reputation
      reputationVerdict: null,
      alertIp,
      alertLocation,
      onKnownCompanyNetwork: params.onKnownNetwork,
      locationsSeenNearby,
      baseline: geoBaseline,
    },
    recurrence: { similarAlertCount: 0, windowDays: 30, priorBenignCount: 0, recurringPattern: false },
    corroboration: { sourcesUsed, corroboratingTelemetry, confidenceCeiling: null },
    identityChange: isIdentityChangeAlert(params.ticket),
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
  alertIps: string[],
): Promise<SourceResult<DeviceHealth> & { networkMatch?: CompanyNetworkMatch | null }> {
  const client = new DattoRmmClient();
  if (!client.isConfigured()) {
    return {
      result: null,
      status: { source: 'Datto RMM', status: 'not_configured', detail: 'DATTO_RMM_API_KEY/SECRET not set.' },
      gap: 'Datto RMM not configured — no device health (patch/AV/reboot/online) available.',
    };
  }
  if (!hostname && alertIps.length === 0) {
    return { result: null, status: { source: 'Datto RMM', status: 'no_data', detail: 'No hostname or IP to look up.' } };
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

    // Pull all devices from the matched site(s) once (live per-site fetch — the
    // global /account/devices endpoint only returns a tiny subset).
    const all: Awaited<ReturnType<DattoRmmClient['getSiteDevices']>> = [];
    for (const site of matchedSites.slice(0, 5)) {
      try { all.push(...await client.getSiteDevices(site.uid)); } catch { /* skip site */ }
    }

    // 1. Exact device by hostname.
    let device = hostname
      ? (all.find(d => d.hostname && d.hostname.toLowerCase() === hostname.toLowerCase())
        || all.find(d => d.hostname && d.hostname.toLowerCase().includes(hostname.toLowerCase())))
      : undefined;

    // 2. No hostname match — identify the source device/network by IP. The
    //    alert's public IP usually NATs many company devices, so this confirms
    //    "known company location" (an FP-reducing signal for identity alerts).
    let networkMatch: CompanyNetworkMatch | null = null;
    if (!device && alertIps.length > 0) {
      const ipSet = new Set(alertIps);
      const ipMatches = all.filter(d =>
        (d.extIpAddress && ipSet.has(d.extIpAddress)) || (d.intIpAddress && ipSet.has(d.intIpAddress)));
      if (ipMatches.length === 1) {
        device = ipMatches[0];
      } else if (ipMatches.length > 1) {
        const ip = ipMatches[0].extIpAddress && ipSet.has(ipMatches[0].extIpAddress) ? ipMatches[0].extIpAddress : ipMatches[0].intIpAddress;
        networkMatch = {
          ip,
          deviceCount: ipMatches.length,
          hostnames: ipMatches.slice(0, 10).map(d => d.hostname).filter(Boolean),
        };
      }
    }

    if (!device) {
      if (networkMatch) {
        return {
          result: null,
          networkMatch,
          status: {
            source: 'Datto RMM',
            status: 'used',
            detail: `Source IP ${networkMatch.ip} matches ${companyName || 'the company'}'s known network — ${networkMatch.deviceCount} managed device(s) behind it (e.g. ${networkMatch.hostnames.slice(0, 4).join(', ')}). Activity originated from a known company location.`,
          },
        };
      }
      return {
        result: null,
        status: { source: 'Datto RMM', status: 'no_data', detail: hostname ? `Device "${hostname}" not found in the mapped site(s).` : `Source IP not matched to any managed device for ${companyName || 'this company'}.` },
        gap: hostname ? `Device "${hostname}" was not found in the mapped Datto RMM site(s).` : 'Could not match the alert to a known company device in Datto RMM.',
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
      status: { source: 'Datto RMM', status: 'used', detail: `Known company device "${device.hostname}" — ${bits}.` },
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'Datto RMM', status: 'error', detail: msg(err) },
      gap: `Datto RMM lookup failed: ${msg(err)}`,
    };
  }
}

/** Detection detail — on Datto EDR `/Alerts` these live nested under `data`. */
interface EdrDetectionData {
  threatName?: string; threatScore?: number; flagName?: string; type?: string;
  name?: string; path?: string; hostname?: string; createdOn?: string;
  compromised?: boolean; malicious?: boolean; suspicious?: boolean;
  md5?: string; sha256?: string;
  commandLine?: string; parentProcessName?: string; owner?: string;
  ruleName?: string; ruleMitreId?: string;
}

/**
 * A Datto EDR `/Alerts` row. The real detection detail (threatName, path,
 * hashes, command line, parent process, owner, rule) is nested under `data`;
 * only identity fields (name, hostname, severity, MITRE, description) are
 * top-level. We flatten `data` up before reading anything.
 */
interface RawEdrAlert extends EdrDetectionData {
  severity?: string; mitreId?: string; mitreTactic?: string;
  description?: string; sourceName?: string;
  data?: EdrDetectionData;
}

/**
 * Promote the nested `data` fields to the top level so every reader works off
 * one object. Identity fields stay authoritative at the top level; the original
 * nested `data` is preserved for the diagnostic raw passthrough.
 */
function flattenEdrAlert(a: RawEdrAlert): RawEdrAlert {
  const data = a.data;
  if (!data) return a;
  return {
    ...a,
    ...data,
    name: a.name ?? data.name,
    hostname: a.hostname ?? data.hostname,
    createdOn: a.createdOn ?? data.createdOn,
  };
}

/** A threatName of Bad/Suspicious matters; Good/Unknown is usually scan noise. */
function isSuspiciousThreat(a: RawEdrAlert): boolean {
  const tn = (a.threatName || '').toLowerCase();
  if (tn === 'bad' || tn === 'suspicious') return true;
  if (a.compromised || a.malicious || a.suspicious) return true;
  if (typeof a.threatScore === 'number' && a.threatScore >= 5) return true;
  return false;
}

async function fetchEdr(
  companyId: string | null,
  companyName: string | null,
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

    // Resolve the customer's EDR org: explicit mapping first, then name-match.
    // We NEVER query MSP-wide — an unscoped query returns every customer's
    // detections, which is misleading. If we can't resolve the org, we skip.
    let orgId = mappings && mappings.length > 0 && mappings[0].externalId !== 'msp_wide' ? mappings[0].externalId : null;
    let orgName = mappings && mappings.length > 0 ? mappings[0].externalName : null;
    if (!orgId && companyName) {
      try {
        const orgsRes = await fetch(`${edrUrl}/Organizations?${tokenParam}`, {
          headers: { Authorization: token, Accept: 'application/json' },
          signal: AbortSignal.timeout(15_000),
        });
        if (orgsRes.ok) {
          const orgs = (await orgsRes.json()) as Array<{ id?: string | number; name?: string }>;
          const matched = Array.isArray(orgs) ? orgs.find(o => o.name && matchesCompanyName(companyName, o.name)) : null;
          if (matched?.id != null) { orgId = String(matched.id); orgName = matched.name || orgName; }
        }
      } catch { /* name-match best-effort */ }
    }
    if (!orgId) {
      return {
        result: null,
        status: { source: 'Datto EDR', status: 'no_data', detail: `No Datto EDR org mapped/matched for ${companyName || 'this company'} — map it in Compliance > Connect Tools to enable EDR correlation.` },
        gap: `No Datto EDR organization resolved for ${companyName || 'this company'}; EDR correlation was skipped (not run MSP-wide to avoid other customers' data).`,
      };
    }

    const where: Record<string, unknown> = {
      createdOn: { gte: since.toISOString(), lte: until.toISOString() },
      organizationId: orgId,
    };
    const filter = JSON.stringify({ where, limit: 500, order: 'createdOn DESC' });
    const res = await fetch(`${edrUrl}/Alerts?filter=${encodeURIComponent(filter)}&${tokenParam}`, {
      headers: { Authorization: token, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return {
        result: null,
        status: { source: 'Datto EDR', status: 'error', detail: `Alerts query failed (${res.status}) for org "${orgName || orgId}"` },
        gap: `Datto EDR alerts query failed (${res.status}).`,
      };
    }
    const alerts = (await res.json()) as RawEdrAlert[];
    const all = (Array.isArray(alerts) ? alerts : []).map(flattenEdrAlert);

    // Scope to the specific device when we know it; otherwise it's org-scoped
    // (the customer's org only — never MSP-wide).
    const deviceScoped = !!hostname;
    const list = deviceScoped
      ? all.filter(a => a.hostname && a.hostname.toLowerCase().includes(hostname!.toLowerCase()))
      : all;

    if (list.length === 0) {
      return {
        result: { detectionCount: 0, suspiciousCount: 0, unclassifiedCount: 0, deviceScoped, byDevice: [], detections: [], rawDetections: [] },
        status: { source: 'Datto EDR', status: 'no_data', detail: deviceScoped ? `No EDR detections for "${hostname}" in window (org "${orgName || orgId}").` : `No EDR detections in window for org "${orgName || orgId}".` },
      };
    }

    const suspicious = list.filter(isSuspiciousThreat);
    const unclassified = list.length - suspicious.length;

    // Per-device rollup (only meaningful when not device-scoped).
    const byDeviceMap = new Map<string, { total: number; suspicious: number }>();
    for (const a of list) {
      const h = a.hostname || 'unknown';
      const cur = byDeviceMap.get(h) || { total: 0, suspicious: 0 };
      cur.total++;
      if (isSuspiciousThreat(a)) cur.suspicious++;
      byDeviceMap.set(h, cur);
    }
    const byDevice = Array.from(byDeviceMap.entries())
      .map(([h, c]) => ({ hostname: h, total: c.total, suspicious: c.suspicious }))
      .sort((a, b) => b.suspicious - a.suspicious || b.total - a.total)
      .slice(0, 8);

    // Surface suspicious detections first (with detail), then a few others.
    const ordered = [...suspicious, ...list.filter(a => !isSuspiciousThreat(a))];
    const detections = ordered.slice(0, 15).map(e => ({
      name: e.name || e.path || e.flagName || e.type || 'detection',
      path: e.path || null,
      hash: e.sha256 || e.md5 || null,
      threatName: e.threatName || 'Unknown',
      threatScore: typeof e.threatScore === 'number' ? e.threatScore : null,
      timestamp: e.createdOn || '',
      hostname: e.hostname || null,
      status: e.compromised ? 'compromised' : e.malicious ? 'malicious' : e.suspicious ? 'suspicious' : 'active',
      commandLine: e.commandLine || null,
      parentProcessName: e.parentProcessName || null,
      owner: e.owner || null,
      ruleName: e.ruleName || null,
      mitreId: e.ruleMitreId || e.mitreId || null,
      severity: e.severity || null,
    }));

    // Raw passthrough of the top suspicious alerts (or first few) so any fields
    // the /Alerts response carries — command line, parent, etc. — reach the AI
    // and the debug view, without us guessing the schema.
    const rawDetections = ordered.slice(0, 5);

    const detailNote = `${list.length} detection(s)${deviceScoped ? ` on "${hostname}"` : ` across org "${orgName || orgId}" (org-level, not device-confirmed)`} — ${suspicious.length} suspicious/bad, ${unclassified} unclassified/unknown.`;
    return {
      result: { detectionCount: list.length, suspiciousCount: suspicious.length, unclassifiedCount: unclassified, deviceScoped, byDevice, detections, rawDetections },
      status: { source: 'Datto EDR', status: 'used', detail: detailNote },
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'Datto EDR', status: 'error', detail: msg(err) },
      gap: `Datto EDR lookup failed: ${msg(err)}`,
    };
  }
}

interface DnsQueryLogRow {
  time?: string; fqdn?: string; domain?: string; result?: string; threat?: boolean;
  categories_names?: string[]; lan_device_name?: string; request_address?: string;
  local_ipv4_address?: string;
}

async function fetchDns(
  companyId: string | null,
  companyName: string | null,
  alertTime: string,
  hostname: string | null,
  alertIps: string[],
): Promise<SourceResult<DnsCorrelation>> {
  const token = process.env.DNSFILTER_API_TOKEN;
  if (!token) {
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
    const headers = { Authorization: `Token ${token}`, Accept: 'application/json' };

    // Resolve the org id from the mapping, or by name match.
    const orgRes = await fetch(`${baseUrl}/organizations`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!orgRes.ok) {
      return { result: null, status: { source: 'DNSFilter', status: 'error', detail: `Organizations endpoint failed (${orgRes.status})` }, gap: `DNSFilter lookup failed (${orgRes.status}).` };
    }
    const orgJson = (await orgRes.json()) as { data?: Array<{ id: string; attributes?: { name?: string } }> };
    const orgs = orgJson.data ?? [];
    let orgId: string | null = null;
    let orgName: string | null = null;
    if (mappings && mappings.length > 0) {
      orgId = mappings[0].externalId;
      orgName = orgs.find(o => o.id === orgId)?.attributes?.name ?? mappings[0].externalName;
    } else if (companyName) {
      const matched = orgs.find(o => matchesCompanyName(companyName, o.attributes?.name ?? ''));
      orgId = matched?.id ?? null;
      orgName = matched?.attributes?.name ?? null;
    }
    if (!orgId) {
      return {
        result: null,
        status: { source: 'DNSFilter', status: 'no_data', detail: `No DNSFilter org mapped/matched for ${companyName || 'this company'}.` },
        gap: `No DNSFilter org mapped to ${companyName || 'this company'}.`,
      };
    }

    // Pull blocked queries from the query log for the org in the alert window.
    // query_logs rejects a full-ISO `from` more than 9 days before now with 400,
    // but DATE-ONLY values lift that cap (see src/lib/dnsfilter.ts). Fresh alerts
    // keep the precise timestamp window (unchanged live behavior); re-triage of
    // older alerts uses date-only + a client-side time filter instead of 400ing.
    const center = new Date(alertTime).getTime() || Date.now();
    const windowStart = center - WINDOW_MS;
    const windowEnd = center + WINDOW_MS;
    const PRECISE_WINDOW_SAFE_MS = 8 * 24 * 60 * 60 * 1000; // stay under the API's 9-day full-ISO cap
    const usePreciseWindow = Date.now() - windowStart < PRECISE_WINDOW_SAFE_MS;
    const fmtPrecise = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const fmtDateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const fmt = usePreciseWindow ? fmtPrecise : fmtDateOnly;
    const qs = new URLSearchParams();
    qs.set('organization_id', orgId);
    qs.set('from', fmt(windowStart));
    qs.set('to', fmt(windowEnd));
    qs.set('result', 'blocked');
    qs.set('page[size]', '100');
    const logRes = await fetch(`${baseUrl}/traffic_reports/query_logs?${qs.toString()}`, { headers, signal: AbortSignal.timeout(30_000) });
    if (!logRes.ok) {
      return {
        result: null,
        status: { source: 'DNSFilter', status: 'error', detail: `query_logs failed (${logRes.status}) for org "${orgName}"` },
        gap: `DNSFilter query_logs failed (${logRes.status}).`,
      };
    }
    const logJson = (await logRes.json()) as { data?: { values?: DnsQueryLogRow[]; page?: { total?: number } } };
    let values = logJson.data?.values ?? [];
    let totalBlocked = logJson.data?.page?.total ?? values.length;
    if (!usePreciseWindow) {
      // Day-granularity pull — narrow the sampled rows back to the alert window
      // where the row carries a parsable time; the count is sample-derived.
      values = values.filter(v => {
        if (!v.time) return true;
        const t = new Date(v.time).getTime();
        return !Number.isFinite(t) || (t >= windowStart && t <= windowEnd);
      });
      totalBlocked = values.length;
    }

    // Try to tie the blocked lookups to the affected device/IP.
    const deviceVals = values.filter(v =>
      (hostname && v.lan_device_name && v.lan_device_name.toLowerCase().includes(hostname.toLowerCase())) ||
      (alertIps.length > 0 && ((v.request_address && alertIps.includes(v.request_address)) || (v.local_ipv4_address && alertIps.includes(v.local_ipv4_address)))));
    const deviceScoped = deviceVals.length > 0;
    const scope = deviceScoped ? deviceVals : values;

    const threats = scope.filter(v => v.threat);
    const domainCounts = new Map<string, number>();
    for (const v of scope) {
      const d = v.domain || v.fqdn || '';
      if (d) domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
    }
    const topBlockedDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([domain, count]) => ({ domain, count }));
    const samples = (threats.length > 0 ? threats : scope).slice(0, 10).map(v => ({
      time: v.time || '',
      fqdn: v.fqdn || v.domain || '',
      result: v.result || 'blocked',
      threat: !!v.threat,
      categories: (v.categories_names || []).join(', '),
      device: v.lan_device_name || null,
      requesterIp: v.request_address || v.local_ipv4_address || null,
    }));

    return {
      result: {
        orgName,
        totalBlocked,
        totalThreats: threats.length,
        deviceScoped,
        topBlockedDomains,
        samples,
      },
      status: {
        source: 'DNSFilter',
        status: 'used',
        detail: `${totalBlocked} blocked DNS quer${totalBlocked === 1 ? 'y' : 'ies'} in window for org "${orgName}"${usePreciseWindow ? '' : ' (historical alert — day-granularity sample)'}${deviceScoped ? ` — ${deviceVals.length} tied to this device` : ''}${threats.length > 0 ? `; ${threats.length} flagged as threats` : ''}.`,
      },
      gap: deviceScoped ? undefined : 'DNSFilter blocked-query data could not be tied to this specific device/IP (org-level).',
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'DNSFilter', status: 'error', detail: msg(err) },
      gap: `DNSFilter lookup failed: ${msg(err)}`,
    };
  }
}

async function fetchSaasAlerts(companyId: string | null, companyName: string | null, alertTime: string): Promise<SourceResult<SaasCorrelation>> {
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
  let customerIds = (mappings ?? []).map(m => m.externalId).filter(id => id && id !== '__none__');
  let matchedBy = 'mapping';

  // No explicit mapping — resolve the SaaS Alerts customer by company name.
  // (These alerts are sourced FROM SaaS Alerts, so the customer exists there.)
  if (customerIds.length === 0 && companyName) {
    try {
      const { customers } = await client.getCustomers();
      customerIds = customers.filter(c => c.name && matchesCompanyName(companyName, c.name)).map(c => c.id).filter(Boolean);
      matchedBy = 'name';
    } catch { /* customer list unavailable */ }
  }

  if (customerIds.length === 0) {
    return {
      result: null,
      status: { source: 'SaaS Alerts', status: 'no_data', detail: `No SaaS Alerts customer mapped or name-matched for ${companyName || 'this company'}.` },
      gap: `No SaaS Alerts customer resolved for ${companyName || 'this company'}; map it at the compliance Connect Tools step for reliable identity correlation.`,
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
          // Surface the source IP + geolocation — separate axes the analyst must
          // weigh independently. Previously dropped here, so geo never reached the AI.
          ip: e.ip || null,
          location: formatSaasLocation(e.location),
        });
      }
    }

    if (events.length === 0) {
      const idList = customerIds.join(', ');
      return {
        result: { eventCount: 0, events: [] },
        status: {
          source: 'SaaS Alerts',
          status: 'no_data',
          detail: `No SaaS Alerts events for ${matchedBy}-resolved customer id(s) [${idList}] in the ±6h window (${since} – ${until}).`,
        },
        // If the alert itself came from SaaS Alerts but the events query is empty,
        // the customer→id resolution is the likely culprit (especially on a fuzzy
        // name-match). Point the tech at the durable fix.
        gap: matchedBy === 'name'
          ? `SaaS Alerts returned no events for the name-matched customer id(s) [${idList}]. If this alert originated from SaaS Alerts, add an explicit SaaS Alerts customer mapping for ${companyName || 'this company'} at Compliance > Connect Tools — fuzzy name-matching may have resolved the wrong customer id.`
          : `SaaS Alerts returned no events for mapped customer id(s) [${idList}] in the window; verify the mapping is current.`,
      };
    }
    return {
      result: { eventCount: events.length, events: events.slice(0, 10) },
      status: { source: 'SaaS Alerts', status: 'used', detail: `${events.length} SaaS Alerts event(s) for the ${matchedBy}-resolved customer(s) near alert time.` },
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
  path: string | null;
  processName: string | null;
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
  // Match ONLY against the flagged artifact — the process/file the alert is
  // actually about (its path, name, hash) — never the alert narrative. The
  // narrative names the DETECTING tools (Windows Defender, Datto EDR Agent),
  // so matching it made benign-catalogue entries for those tools match the
  // very alerts they raised, nudging real detections toward false-positive.
  const artifact = [params.path, params.processName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const r of rows) {
    let matchedOn: string | null = null;
    if (r.executablePath && artifact) {
      const ep = r.executablePath.toLowerCase();
      if (artifact.includes(ep)) matchedOn = 'path';
    }
    if (!matchedOn && r.hashValue && params.hash && r.hashValue.toLowerCase() === params.hash.toLowerCase()) matchedOn = 'hash';
    if (!matchedOn && r.certificateSigner && artifact && artifact.includes(r.certificateSigner.toLowerCase())) matchedOn = 'signer';
    if (!matchedOn && r.vendor && r.product && artifact && artifact.includes(r.vendor.toLowerCase()) && artifact.includes(r.product.toLowerCase())) matchedOn = 'vendor_product';

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
