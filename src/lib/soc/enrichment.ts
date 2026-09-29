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
import { DattoRmmClient, type DattoDevice } from '@/lib/datto-rmm';
import { SaasAlertsClient } from '@/lib/saas-alerts';
import { detectAlertSource, isIdentityChangeAlert } from './rules';
import { extractIps, extractIpv6 } from './ip-extractor';
import { classifyEventTiming } from '@/lib/reporting/business-hours';
import { fetchM365Identity } from './m365-identity';
import { listSiteAlerts } from '@/lib/mcp-datto-rmm-tools';
import { extractDetectionFields, getEventMillis, eventId as rcEventId } from '@/lib/rocketcyber';
import {
  alertSourceName,
  buildEgressIndex,
  classifyIp,
  detectAutotaskChangeContext,
  detectFleetChangeWindows,
  extractIpv4s,
  normHost,
  normUser,
  resolveCompanyProfile,
  signalFromThreatName,
  toIsoUtc,
  type AutotaskWorkInput,
  type CompanySecurityProfile,
  type EvidenceEventInput,
  type EvidenceSignal,
  type PrimaryDetection,
  type RmmAlertInput,
  type VisibilityEntry,
} from './evidence';
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

/** How far back the planned-change check looks from the alert. */
export const CHANGE_LOOKBACK_HOURS = 72;
/** Runaway guard on Datto RMM sites read per company (every mapped site below this is read). */
export const MAX_RMM_SITES = 25;

/** Main entry: assemble the full cross-stack evidence bundle for a ticket. */
export async function enrichTicket(
  ticket: SecurityTicket,
  deviceVerification: DeviceVerification | null,
  opts: { now?: Date } = {},
): Promise<EnrichmentBundle> {
  const now = opts.now ?? new Date();
  const sourceSystem = detectAlertSource(ticket) as AlertSource;
  const text = `${ticket.title}\n${ticket.description || ''}`;
  const { incidentId, accountId } = extractRocketCyberIds(text);
  const companyId = ticket.companyId;
  const atCompanyId = ticket.autotaskCompanyId ?? null;
  const companyName = ticket.companyName || null;

  const dataSources: DataSourceStatus[] = [];
  const dataGaps: string[] = [];
  const visibility: VisibilityEntry[] = [];
  const contextSummaries: string[] = [];

  // 1. RocketCyber — fetch first; its device/org fields improve downstream lookups.
  let rocketCyber: RocketCyberDetail | null = null;
  if (sourceSystem === 'rocketcyber' || incidentId) {
    const rc = await fetchRocketCyber(incidentId, accountId);
    rocketCyber = rc.detail;
    dataSources.push(rc.status);
    visibility.push(rc.visibility);
    if (rc.gap) dataGaps.push(rc.gap);
  } else {
    dataSources.push({ source: 'RocketCyber', status: 'no_data', detail: 'Not a RocketCyber-sourced ticket; no incident ID found in ticket text.' });
    visibility.push({ source: 'RocketCyber', state: 'not_queried', mappedTo: null, detail: 'not a RocketCyber alert' });
  }

  const body = parseRocketCyberBody(text);
  const hostname = resolveHostname(rocketCyber, text, deviceVerification);
  const alertTime = rocketCyber?.eventTime || rocketCyber?.createdAt || body.platformTimeUtc || ticket.createDate;
  const { allIps } = extractIps(text);
  const alertIso = toIsoUtc(alertTime) ?? now.toISOString();
  const changeFrom = new Date(Math.min(Date.parse(alertIso), now.getTime()) - CHANGE_LOOKBACK_HOURS * 3600_000).toISOString();
  const changeTo = now.toISOString();

  // 2. Company context from Autotask: co-managed flag, contracts, open work.
  const company = await fetchCompanyContext(atCompanyId, companyName, changeFrom, changeTo, ticket.autotaskTicketId);
  dataGaps.push(...company.gaps);

  // 3. Datto RMM first — it resolves the device (by hostname, or by the source
  //    IP against the company's known devices), which scopes the EDR lookup,
  //    and yields the client's egress IPs and the fleet-wide change windows.
  const device = await fetchDeviceHealth(companyId, atCompanyId, companyName, hostname, allIps, { fromUtc: changeFrom, toUtc: changeTo });
  dataSources.push(device.status);
  visibility.push(device.visibility);
  if (device.gap) dataGaps.push(device.gap);
  dataGaps.push(...device.changeGaps);
  const effectiveHostname = device.result?.hostname || hostname;

  // 4–6. Correlate the rest of the stack in parallel.
  const [edr, dns, saas] = await Promise.all([
    fetchEdr(companyId, companyName, effectiveHostname, alertTime),
    fetchDns(companyId, companyName, alertTime, effectiveHostname, allIps),
    fetchSaasAlerts(companyId, companyName, alertTime),
  ]);

  for (const r of [edr, dns, saas]) {
    dataSources.push(r.status);
    visibility.push(r.visibility);
    if (r.gap) dataGaps.push(r.gap);
  }
  if (dns.result) {
    contextSummaries.push(`DNSFilter: ${dns.result.totalBlocked} blocked quer${dns.result.totalBlocked === 1 ? 'y' : 'ies'} in the ±6h window${dns.result.deviceScoped ? '' : ' (org-level, not tied to this device)'} — absence of blocks is not evidence either way.`);
  }
  if (edr.result && edr.result.detectionCount === 0) {
    contextSummaries.push(`Datto EDR: no detections in the ±6h window${edr.result.deviceScoped ? ` for ${effectiveHostname}` : ''} — absence of detections is not evidence either way.`);
  }
  if (saas.result && saas.result.eventCount === 0) {
    contextSummaries.push('SaaS Alerts: no events in the ±6h window — absence of events is not evidence either way.');
  }

  // 7. Known benign catalogue (informational only).
  const knownBenignMatches = await matchKnownBenign({
    path: rocketCyber?.path || body.filePath || null,
    processName: rocketCyber?.process || null,
    hash: rocketCyber?.hash || body.hash || null,
    companyId,
    hostname,
  });

  if (!hostname) dataGaps.push('Could not determine the affected device hostname from the alert; device-level correlation skipped.');

  // 8. M365 tenant correlation — ONLY for identity/MFA-change alerts. Scoped to
  //    the customer's own tenant (getTenantCredentials), so it is authoritative
  //    for what actually happened and can never reach another customer.
  let m365Identity: M365IdentityCorrelation | null = null;
  if (isIdentityChangeAlert(ticket)) {
    const upn = resolveUserPrincipalName(ticket, saas.result?.events || []);
    const m365 = await fetchM365Identity({ companyId, userPrincipalName: upn, alertTime });
    m365Identity = m365.result;
    dataSources.push(m365.status);
    if (m365.gap) dataGaps.push(m365.gap);
    visibility.push(m365VisibilityFromStatus(m365.status, m365.result));
  } else {
    visibility.push(await m365TenantVisibility(companyId));
  }

  // 9. The client's own egress IPs and every IP in the evidence.
  const egress = buildEgressIndex(device.devices.map(d => ({ hostname: d.hostname, extIpAddress: d.extIpAddress, siteName: d.siteName })));
  const ipText = [
    text,
    // Only this incident's own records — never otherEvents (other devices on the
    // account), whose addresses say nothing about this alert.
    rocketCyber ? JSON.stringify([rocketCyber.rawIncident, rocketCyber.rawEvents]) : '',
    ...(device.subjectIps ?? []),
    ...(saas.result?.events || []).map(e => e.ip || ''),
  ].join('\n');
  const ipClassifications = extractIpv4s(ipText).map(ip => classifyIp(ip, egress));

  // 10. The detection this assessment is anchored to, and every correlated event.
  const primary = primaryDetection(ticket, rocketCyber, body, sourceSystem, hostname);
  const eventInputs = buildEvidenceInputs({
    ticket, sourceSystem, primary, rocketCyber, edr: edr.result, dns: dns.result, saas: saas.result,
    deviceRecord: device.deviceRecord, rmmAlerts: device.rmmAlerts, alertDevice: effectiveHostname,
    clientHostnames: device.devices.map(d => d.hostname).filter(Boolean),
    window: { fromUtc: changeFrom, toUtc: changeTo },
  });

  // Assemble the independent signal axes (timing, geo, corroboration, identity-change).
  // recurrence is a placeholder here — the engine fills it from the analysis history.
  const alertIpClass = ipClassifications.find(c => c.class !== 'internal') ?? null;
  const signals = buildSignals({
    ticket,
    alertTime,
    saasEvents: saas.result?.events || [],
    ticketText: text,
    ipv4: allIps,
    onKnownNetwork: !!device.networkMatch || deviceVerification?.verified === true
      || alertIpClass?.class === 'client_office' || alertIpClass?.class === 'client_device_egress',
    dataSources,
    rocketCyber,
    deviceHealth: device.result,
    networkMatch: device.networkMatch || null,
    edr: edr.result,
    dns: dns.result,
    m365: m365Identity,
    timezone: company.profile.timezone,
  });

  const changeWindows = detectFleetChangeWindows(device.rmmAlerts, {
    siteDeviceCounts: device.siteDeviceCounts, fromUtc: changeFrom, toUtc: changeTo,
  });
  const changeContext = detectAutotaskChangeContext(company.work, { fromUtc: changeFrom, toUtc: changeTo, excludeTicketIds: [Number(ticket.autotaskTicketId)] });

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
    dataGaps: Array.from(new Set(dataGaps)),
    signals,
    visibility,
    eventInputs,
    changeWindows,
    changeContext,
    ipClassifications,
    profile: company.profile,
    primary,
    contextSummaries,
  };
}

// ── RocketCyber alert body (the notification RocketCyber writes into the ticket) ──

export interface RocketCyberBody {
  signature: string | null;
  device: string | null;
  filePath: string | null;
  hash: string | null;
  detectionUtc: string | null;
  platformTimeUtc: string | null;
  threatSource: string | null;
  executionStatus: string | null;
  detectionState: string | null;
}

/** Parse the RocketCyber-generated alert body. Never the title. */
export function parseRocketCyberBody(text: string): RocketCyberBody {
  const g = (re: RegExp) => { const m = text.match(re); const v = m?.[1]?.trim(); return v && !/^undefined$/i.test(v) ? v : null; };
  const epoch = g(/Defender Detection Time:\s*(\d{9,13})/i);
  return {
    signature: g(/detected by signature\s+([^\s\r\n]+)/i),
    device: g(/Device:\s*([A-Za-z0-9][A-Za-z0-9._-]{1,62})/),
    filePath: g(/File Path:\s*([^\r\n]+)/i),
    hash: g(/\b(?:SHA1|SHA256|MD5):\s*([0-9a-f]{32,64})/i),
    detectionUtc: epoch ? toIsoUtc(epoch) : null,
    platformTimeUtc: g(/Platform Time:\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i),
    threatSource: g(/Threat Source:\s*([^|\r\n]+)/i),
    executionStatus: g(/Execution Status:\s*([^|\r\n]+)/i),
    detectionState: g(/Detection State:\s*([^|\r\n]+)/i),
  };
}

const SIGNATURE_RE = /^[A-Za-z]+:[A-Za-z0-9]+\/[A-Za-z0-9._!-]+$/;

/**
 * The detection the assessment is anchored to. Incident id and threat name come
 * from the RocketCyber API record when it was retrieved (and only if its id is
 * the id the ticket names); otherwise from RocketCyber's own notification in
 * the ticket body. NEVER from the ticket title.
 */
export function primaryDetection(
  ticket: SecurityTicket,
  rc: RocketCyberDetail | null,
  body: RocketCyberBody,
  sourceSystem: string,
  hostname: string | null,
): PrimaryDetection {
  const bodyText = ticket.description || '';
  const apiRecord = rc && rc.incidentRecordId === rc.incidentId ? rc : null;
  if (apiRecord) {
    const threat = apiRecord.threatName && SIGNATURE_RE.test(apiRecord.threatName.trim())
      ? apiRecord.threatName.trim()
      : body.signature ?? apiRecord.threatName;
    return {
      retrieved: true,
      recordSource: 'RocketCyber',
      incidentId: apiRecord.incidentId,
      threatName: threat,
      signal: signalFromThreatName(threat, `${apiRecord.description || ''} ${bodyText}`),
      deviceHostname: (apiRecord.device || '').split('|')[0].trim() || body.device || hostname,
      user: apiRecord.userContext,
      timestampUtc: toIsoUtc(apiRecord.eventTime) ?? body.detectionUtc ?? toIsoUtc(apiRecord.createdAt),
      actionReported: apiRecord.actionTaken ?? (body.threatSource ? `threat source: ${body.threatSource}` : null),
      executionStatus: body.executionStatus,
    };
  }
  const { incidentId } = extractRocketCyberIds(`${ticket.title}\n${bodyText}`);
  if (sourceSystem === 'rocketcyber' && body.signature) {
    return {
      retrieved: true,
      recordSource: 'RocketCyber alert notification (ticket body — API record not retrieved)',
      incidentId,
      threatName: body.signature,
      signal: signalFromThreatName(body.signature, bodyText),
      deviceHostname: body.device || hostname,
      user: null,
      timestampUtc: body.detectionUtc ?? body.platformTimeUtc,
      actionReported: body.threatSource ? `threat source: ${body.threatSource}` : null,
      executionStatus: body.executionStatus,
    };
  }
  if (sourceSystem === 'saas_alerts' || sourceSystem === 'datto_edr') {
    const email = `${ticket.title}\n${bodyText}`.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? null;
    return {
      retrieved: true,
      recordSource: sourceSystem === 'saas_alerts' ? 'SaaS Alerts' : 'Datto EDR',
      incidentId: null,
      threatName: null,
      signal: 'suspicious',
      deviceHostname: hostname,
      user: email,
      timestampUtc: toIsoUtc(ticket.createDate),
      actionReported: null,
      executionStatus: null,
    };
  }
  return {
    retrieved: false,
    recordSource: rc ? 'RocketCyber (returned a different incident — ignored)' : 'no detection record',
    incidentId,
    threatName: null,
    signal: 'suspicious',
    deviceHostname: hostname,
    user: null,
    timestampUtc: toIsoUtc(ticket.createDate),
    actionReported: null,
    executionStatus: null,
  };
}

function rcSignal(ev: unknown, threat: string | null): EvidenceSignal {
  const raw = JSON.stringify(ev ?? {}).toLowerCase();
  if (/"verdict"\s*:\s*"malicious"/.test(raw)) return 'malicious';
  if (/"verdict"\s*:\s*"informational"/.test(raw)) return 'informational';
  return threat && signalFromThreatName(threat) === 'malicious' ? 'malicious' : 'suspicious';
}

/** Every correlated record, as an attributable evidence input. Pure. */
export function buildEvidenceInputs(a: {
  ticket: SecurityTicket;
  sourceSystem: string;
  primary: PrimaryDetection;
  rocketCyber: RocketCyberDetail | null;
  edr: EdrCorrelation | null;
  dns: DnsCorrelation | null;
  saas: SaasCorrelation | null;
  deviceRecord: { uid: string | null; hostname: string; lastSeen: string | null; summary: string } | null;
  rmmAlerts: RmmAlertInput[];
  alertDevice: string | null;
  /** Hostnames of THIS client's managed devices (Datto RMM) — scopes other-device events. */
  clientHostnames?: string[];
  /** The change-correlation window; other-device events outside it are not relevant. */
  window?: { fromUtc: string; toUtc: string };
}): EvidenceEventInput[] {
  const out: EvidenceEventInput[] = [];
  const src = alertSourceName(a.sourceSystem);
  const p = a.primary;

  // The alert itself.
  if (p.retrieved) {
    out.push({
      source: src ?? 'Autotask',
      sourceRecordId: p.incidentId ?? `ticket ${a.ticket.ticketNumber}`,
      deviceHostname: p.deviceHostname,
      user: p.user,
      ioc: a.rocketCyber?.hash ?? null,
      timestampUtc: p.timestampUtc,
      signal: p.signal,
      summary: [p.threatName, a.rocketCyber?.path].filter(Boolean).join(' — ') || a.ticket.title.slice(0, 160),
      isAlert: true,
    });
  }

  // Other RocketCyber events on the account — ONLY those about the same device,
  // user or IOC as this alert. The account-wide events feed carries every
  // device RocketCyber sees; before 2026-09-29 all of them (610 on T20260927.0006,
  // other machines' detections) were written into the assessment note.
  const subjDevice = normHost(p.deviceHostname ?? a.alertDevice);
  const subjUser = normUser(p.user);
  const subjIoc = (a.rocketCyber?.hash ?? '').toLowerCase() || null;
  // A detection on ANOTHER of this client's own managed devices inside the change
  // window is kept too — it is exactly what a fleet-wide TCT change produces, and
  // must be shown (labelled) rather than silently read as spread. A device that is
  // not one of this client's is never included, whatever its time.
  const clientHosts = new Set((a.clientHostnames ?? []).map(h => normHost(h)).filter((h): h is string => !!h));
  const MAX_OTHER_DEVICE_EVENTS = 50;
  let otherDeviceKept = 0;
  for (const ev of a.rocketCyber?.otherEvents ?? []) {
    const f = extractDetectionFields(ev);
    const evDevice = normHost((f.device || '').split('|')[0].trim() || null);
    const evUser = normUser(f.userContext);
    const evIoc = (f.hash ?? '').toLowerCase() || null;
    const ms = getEventMillis(ev);
    const evIso = ms != null ? new Date(ms).toISOString() : toIsoUtc(f.eventTime);
    const related = (subjDevice && evDevice === subjDevice) || (subjUser && evUser === subjUser) || (subjIoc && evIoc === subjIoc);
    const inWindow = !!(a.window && evIso && evIso >= a.window.fromUtc && evIso <= a.window.toUtc);
    const clientDeviceInWindow = inWindow && evDevice !== null && clientHosts.has(evDevice);
    if (!related) {
      if (!clientDeviceInWindow || otherDeviceKept >= MAX_OTHER_DEVICE_EVENTS) continue;
      otherDeviceKept++;
    }
    out.push({
      source: 'RocketCyber',
      sourceRecordId: rcEventId(ev),
      deviceHostname: (f.device || '').split('|')[0].trim() || null,
      user: f.userContext,
      ioc: f.hash,
      timestampUtc: ms != null ? new Date(ms).toISOString() : toIsoUtc(f.eventTime),
      signal: rcSignal(ev, f.threatName),
      summary: `Other RocketCyber detection: ${f.threatName || f.detectionMessage?.slice(0, 100) || 'unnamed'}`,
    });
  }

  // Datto EDR detections.
  for (const d of a.edr?.detections ?? []) {
    const suspicious = ['bad', 'suspicious'].includes(d.threatName.toLowerCase()) || ['compromised', 'malicious', 'suspicious'].includes(d.status);
    out.push({
      source: 'Datto EDR',
      sourceRecordId: d.id ?? null,
      deviceHostname: d.hostname,
      user: d.owner ?? null,
      ioc: d.hash,
      timestampUtc: toIsoUtc(d.timestamp),
      signal: d.status === 'malicious' || d.status === 'compromised' ? 'malicious' : suspicious ? 'suspicious' : 'informational',
      summary: `EDR ${d.threatName} detection: ${d.name}${d.path ? ` (${d.path})` : ''}`,
    });
  }

  // DNSFilter threat-flagged lookups (the query log carries no record id).
  for (const s of a.dns?.samples ?? []) {
    if (!s.threat) continue;
    out.push({
      source: 'DNSFilter',
      sourceRecordId: null,
      deviceHostname: s.device,
      user: null,
      ioc: s.fqdn,
      timestampUtc: toIsoUtc(s.time),
      signal: 'suspicious',
      summary: `DNSFilter threat-flagged lookup ${s.fqdn}${s.categories ? ` [${s.categories}]` : ''}`,
    });
  }

  // SaaS Alerts events.
  for (const e of a.saas?.events ?? []) {
    const sev = `${e.severity}`.toLowerCase();
    out.push({
      source: 'SaaS Alerts',
      sourceRecordId: e.id ?? null,
      deviceHostname: null,
      user: e.user,
      ioc: e.ip,
      timestampUtc: toIsoUtc(e.time),
      signal: /critical|high/.test(sev) ? 'suspicious' : 'informational',
      summary: `SaaS Alerts ${e.type}${e.description ? `: ${e.description.slice(0, 100)}` : ''}`,
    });
  }

  // The managed-device record (existence, patch, AV) — context by definition.
  if (a.deviceRecord) {
    out.push({
      source: 'Datto RMM',
      sourceRecordId: a.deviceRecord.uid,
      deviceHostname: a.deviceRecord.hostname,
      user: null,
      ioc: null,
      timestampUtc: toIsoUtc(a.deviceRecord.lastSeen),
      signal: 'informational',
      summary: a.deviceRecord.summary,
    });
  }

  // Datto RMM monitoring alerts on the alert's own device (health, not security).
  const dev = (a.alertDevice || '').toLowerCase();
  for (const r of a.rmmAlerts) {
    if (!dev || (r.deviceHostname || '').toLowerCase() !== dev) continue;
    out.push({
      source: 'Datto RMM',
      sourceRecordId: r.alertUid,
      deviceHostname: r.deviceHostname,
      user: null,
      ioc: null,
      timestampUtc: r.timestampUtc,
      signal: 'informational',
      summary: `Datto RMM ${r.type.replace(/_ctx$/, '')} alert: ${r.contextText.slice(0, 100)}`,
    });
  }
  return out;
}

// ── Company context (Autotask) ──

async function fetchCompanyContext(
  atCompanyId: string | null,
  companyName: string | null,
  fromUtc: string,
  toUtc: string,
  alertTicketId: string,
): Promise<{ profile: CompanySecurityProfile; work: AutotaskWorkInput[]; gaps: string[] }> {
  const gaps: string[] = [];
  let isEnabledForComanaged: boolean | null = null;
  let contractNames: string[] = [];
  const work: AutotaskWorkInput[] = [];
  const id = atCompanyId ? parseInt(atCompanyId, 10) : NaN;
  if (Number.isNaN(id)) {
    gaps.push('The ticket\'s Autotask company id is not known locally, so co-managed status and open TCT work could not be read — planned-change check incomplete.');
    return { profile: resolveCompanyProfile({ autotaskCompanyId: null, companyName, isEnabledForComanaged: null, activeContractNames: [] }), work, gaps };
  }
  try {
    const { AutotaskClient } = await import('@/lib/autotask');
    const client = new AutotaskClient();
    const [company, contracts, projects, tickets] = await Promise.allSettled([
      client.getCompanyById(id),
      client.listContracts({ companyId: id, activeOnly: true }),
      client.getProjectsByCompany(id),
      client.getCompanyTickets(id, Math.ceil(CHANGE_LOOKBACK_HOURS / 24) + 1, true),
    ]);
    if (company.status === 'fulfilled' && company.value) {
      const flag = (company.value as unknown as Record<string, unknown>).isEnabledForComanaged;
      isEnabledForComanaged = typeof flag === 'boolean' ? flag : null;
    } else gaps.push('Autotask company record could not be read — co-managed flag unknown.');
    if (contracts.status === 'fulfilled') contractNames = contracts.value.map(c => c.contractName).filter(Boolean);
    else gaps.push('Autotask contracts could not be read.');
    if (projects.status === 'fulfilled') {
      for (const pr of projects.value) {
        const r = pr as unknown as Record<string, unknown>;
        if (r.completedDateTime) continue;
        work.push({
          kind: 'project', id: pr.id, number: (r.projectNumber as string) ?? null, title: pr.projectName,
          status: String(pr.status), startUtc: toIsoUtc(pr.startDateTime), endUtc: toIsoUtc(pr.endDateTime),
          lastActivityUtc: toIsoUtc(pr.lastActivityDateTime),
        });
      }
    } else gaps.push('Autotask projects could not be read — planned-change check incomplete (open onboarding/security-stack projects unknown).');
    if (tickets.status === 'fulfilled') {
      for (const t of tickets.value) {
        const r = t as unknown as Record<string, unknown>;
        if (String(r.id) === alertTicketId) continue;
        work.push({
          kind: 'ticket', id: Number(r.id), number: (r.ticketNumber as string) ?? null, title: String(r.title ?? ''),
          status: r.status == null ? null : String(r.status), startUtc: toIsoUtc(r.createDate), endUtc: null,
          lastActivityUtc: toIsoUtc(r.lastActivityDate),
        });
      }
    } else gaps.push('Autotask open tickets could not be read — planned-change check incomplete.');
  } catch (err) {
    gaps.push(`Autotask company context failed (${msg(err)}) — co-managed status and planned-change check incomplete.`);
  }
  return {
    profile: resolveCompanyProfile({ autotaskCompanyId: atCompanyId, companyName, isEnabledForComanaged, activeContractNames: contractNames }),
    work,
    gaps,
  };
}

// ── M365 tenant visibility (is the client's tenant connected at all?) ──

async function m365TenantVisibility(companyId: string | null): Promise<VisibilityEntry> {
  if (!companyId) return { source: 'M365', state: 'not_connected', mappedTo: null, detail: 'no local company record' };
  try {
    const { getTenantCredentials } = await import('@/lib/graph');
    const creds = await getTenantCredentials(companyId);
    return creds
      ? { source: 'M365', state: 'connected', mappedTo: `tenant ${String((creds as { tenantId?: string }).tenantId ?? '').slice(0, 8)}…`, detail: 'not queried for this alert type (identity alerts only)' }
      : { source: 'M365', state: 'not_connected', mappedTo: null, detail: 'no tenant consent/app registration recorded for this client' };
  } catch (err) {
    return { source: 'M365', state: 'unreachable', mappedTo: null, detail: msg(err).slice(0, 120) };
  }
}

function m365VisibilityFromStatus(status: DataSourceStatus, result: M365IdentityCorrelation | null): VisibilityEntry {
  if (status.status === 'not_configured') return { source: 'M365', state: 'not_connected', mappedTo: null, detail: status.detail };
  if (status.status === 'error') return { source: 'M365', state: 'unreachable', mappedTo: null, detail: status.detail };
  if (result && result.permissionGaps.length > 0) return { source: 'M365', state: 'permission_blocked', mappedTo: null, detail: result.permissionGaps.join('; ') };
  return { source: 'M365', state: 'connected', mappedTo: result?.userPrincipalName ?? null, detail: status.detail };
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
  timezone?: string;
}): AssessmentSignals {
  // ── Timing ──
  const eventDate = new Date(params.alertTime);
  const validTime = !Number.isNaN(eventDate.getTime());
  const timing = validTime
    ? (() => {
        const t = params.timezone ? classifyEventTiming(eventDate, { startHour: 8, endHour: 17, workDays: [1, 2, 3, 4, 5], timezone: params.timezone }) : classifyEventTiming(eventDate);
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

  // ── Corroboration ── PLACEHOLDER. The engine replaces this with the result of
  // attributeEvents()/classifyFromEvidence() in evidence.ts: corroboration is an
  // INDEPENDENT source reporting its OWN malicious/suspicious signal about the
  // same device, user or IOC. Device existence (deviceHealth), a network match,
  // or "DNSFilter blocked 0 queries" are context and never set this — the old
  // expression here did, which is how Wilmar T20260927.0006 read "Corroborated
  // by: Datto RMM, DNSFilter".
  const sourcesUsed: string[] = [];
  const corroboratingTelemetry = false;
  void params.dataSources; void params.rocketCyber; void params.deviceHealth; void params.networkMatch; void params.edr; void params.dns; void params.m365;

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

type VisibleResult<T> = SourceResult<T> & { visibility: VisibilityEntry };

async function fetchRocketCyber(
  incidentId: string | null,
  accountId: string | null,
): Promise<{ detail: RocketCyberDetail | null; status: DataSourceStatus; visibility: VisibilityEntry; gap?: string }> {
  const client = new RocketCyberClient();
  const org = accountId ? `account ${accountId}` : null;
  if (!client.isConfigured()) {
    return {
      detail: null,
      status: { source: 'RocketCyber', status: 'not_configured', detail: 'ROCKETCYBER_API_TOKEN not set.' },
      visibility: { source: 'RocketCyber', state: 'not_configured', mappedTo: org, detail: 'API token not set' },
      gap: 'RocketCyber API not configured — could not pull the detailed detection record behind the alert.',
    };
  }
  if (!incidentId) {
    return {
      detail: null,
      status: { source: 'RocketCyber', status: 'no_data', detail: 'No RocketCyber incident ID found in ticket.' },
      visibility: { source: 'RocketCyber', state: 'not_connected', mappedTo: org, detail: 'no incident id in the ticket' },
      gap: 'No RocketCyber incident ID in the ticket; detailed detection data unavailable.',
    };
  }
  try {
    const detail = await client.getIncidentDetail(incidentId, accountId);
    if (!detail) {
      return {
        detail: null,
        status: { source: 'RocketCyber', status: 'no_data', detail: `Incident #${incidentId} returned no data from the API (account ${accountId || 'unknown'}).` },
        visibility: { source: 'RocketCyber', state: 'unreachable', mappedTo: org, detail: `incident ${incidentId} not returned by the API` },
        gap: `RocketCyber incident #${incidentId} could not be retrieved from the API — the assessment falls back to RocketCyber's alert text in the ticket body.`,
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
      visibility: { source: 'RocketCyber', state: 'connected', mappedTo: `account ${detail.accountId ?? accountId ?? 'unknown'}`, detail: `incident ${incidentId} retrieved${detail.otherEvents.length ? `; ${detail.otherEvents.length} other account event(s) not used unless about the same device, user or file` : ''}` },
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
      visibility: { source: 'RocketCyber', state: 'unreachable', mappedTo: org, detail: msg(err).slice(0, 120) },
      gap: `RocketCyber lookup failed: ${msg(err)}`,
    };
  }
}

interface RmmResult extends SourceResult<DeviceHealth> {
  networkMatch?: CompanyNetworkMatch | null;
  visibility: VisibilityEntry;
  /** Every device on the client's mapped sites (egress IPs come from these). */
  devices: DattoDevice[];
  siteDeviceCounts: Record<string, number>;
  /** Open + resolved site alerts in the planned-change window. */
  rmmAlerts: RmmAlertInput[];
  changeGaps: string[];
  deviceRecord: { uid: string | null; hostname: string; lastSeen: string | null; summary: string } | null;
  /** The alerting device's own addresses from its RMM record (so its office egress IP is classified). */
  subjectIps?: string[];
}

/** Flatten an RMM alertContext into the text used only to categorise it. */
function rmmContextText(ctx: Record<string, unknown> | null): string {
  if (!ctx) return '';
  const samples = ctx.samples && typeof ctx.samples === 'object' ? Object.values(ctx.samples as Record<string, unknown>).map(String).join(' ') : '';
  const extra = ['type', 'serviceName', 'status', 'description', 'diskName'].map(k => (ctx[k] == null ? '' : `${k}=${String(ctx[k])}`)).filter(Boolean).join(' ');
  return `${samples} ${extra}`.trim();
}

async function fetchDeviceHealth(
  companyId: string | null,
  atCompanyId: string | null,
  companyName: string | null,
  hostname: string | null,
  alertIps: string[],
  window: { fromUtc: string; toUtc: string },
): Promise<RmmResult> {
  const empty = { devices: [] as DattoDevice[], siteDeviceCounts: {}, rmmAlerts: [] as RmmAlertInput[], deviceRecord: null };
  const client = new DattoRmmClient();
  if (!client.isConfigured()) {
    return {
      ...empty,
      result: null,
      status: { source: 'Datto RMM', status: 'not_configured', detail: 'DATTO_RMM_API_KEY/SECRET not set.' },
      visibility: { source: 'Datto RMM', state: 'not_configured', mappedTo: null, detail: 'API credentials not set' },
      gap: 'Datto RMM not configured — no device health (patch/AV/reboot/online) available.',
      changeGaps: ['Datto RMM not configured — the planned-change check (fleet-wide installs, reboots, resource spikes) could not run; a TCT-initiated change cannot be ruled out.'],
    };
  }

  try {
    const sites = await client.getSites();
    const mappings = await getPlatformMappings(companyId, 'datto_rmm');

    if (mappings && mappings.some(m => m.externalId === '__none__')) {
      return {
        ...empty,
        result: null,
        status: { source: 'Datto RMM', status: 'not_configured', detail: 'Company marked as not using Datto RMM.' },
        visibility: { source: 'Datto RMM', state: 'not_connected', mappedTo: null, detail: 'company marked as not using Datto RMM' },
        changeGaps: ['Datto RMM is not used for this client — the planned-change check could not run; a TCT-initiated change cannot be ruled out.'],
      };
    }

    // Site resolution, most authoritative first. Datto RMM's OWN mapping of a
    // site to an Autotask company is exact and needs no compliance-tool step —
    // before 2026-09-28 it was never consulted, so Wilmar's sites read as
    // "unmapped" on one run and "known device" on the next.
    const byRmm = atCompanyId ? sites.filter(s => s.autotaskCompanyId === atCompanyId) : [];
    const mappedIds = new Set((mappings ?? []).map(m => m.externalId));
    const byMapping = sites.filter(s => mappedIds.has(s.uid) || mappedIds.has(String(s.id)));
    let matchedSites = Array.from(new Map([...byRmm, ...byMapping].map(s => [s.uid, s])).values());
    let basis = byRmm.length ? `Datto RMM sites mapped to Autotask company ${atCompanyId}` : byMapping.length ? 'compliance platform mapping' : '';
    let verified = matchedSites.length > 0;
    if (matchedSites.length === 0 && companyName) {
      matchedSites = sites.filter(s => matchesCompanyName(companyName, s.name));
      basis = 'company-name match';
      verified = false;
    }
    matchedSites.sort((a, b) => a.name.localeCompare(b.name));

    if (matchedSites.length === 0) {
      return {
        ...empty,
        result: null,
        status: { source: 'Datto RMM', status: 'no_data', detail: `No Datto RMM site mapped/matched for ${companyName || 'this company'}.` },
        visibility: { source: 'Datto RMM', state: 'not_connected', mappedTo: null, detail: 'no site mapped to this Autotask company' },
        gap: `No Datto RMM site is mapped to ${companyName || 'this company'}; map the site to the Autotask company in Datto RMM (or at the compliance Connect Tools step) for device correlation.`,
        changeGaps: ['No Datto RMM site is mapped — the planned-change check could not run; a TCT-initiated change cannot be ruled out.'],
      };
    }
    const visibility: VisibilityEntry = {
      source: 'Datto RMM',
      state: verified ? 'connected' : 'unverified_mapping',
      mappedTo: matchedSites.map(s => s.name).join(', '),
      detail: basis,
    };

    // Pull all devices from the matched site(s) once (live per-site fetch — the
    // global /account/devices endpoint only returns a tiny subset).
    const all: DattoDevice[] = [];
    const siteDeviceCounts: Record<string, number> = {};
    const changeGaps: string[] = [];
    const rmmAlerts: RmmAlertInput[] = [];
    // EVERY mapped site is read. Before 2026-09-29 only the first 5 (alphabetical)
    // were, so Wilmar's two EZ Red sites pushed Wilmar - Washington — the site the
    // alerting device lives on — out of the check: no device record, no egress IP,
    // no change windows. A cap exists only as a runaway guard and is reported.
    for (const site of matchedSites.slice(0, MAX_RMM_SITES)) {
      try {
        const devs = await client.getSiteDevices(site.uid);
        all.push(...devs);
        siteDeviceCounts[site.name] = devs.length;
      } catch (e) {
        changeGaps.push(`Datto RMM devices for site ${site.name} could not be read (${msg(e)}).`);
      }
      // Site alerts through the connector's own sweep (datto_rmm_alerts).
      for (const status of ['open', 'resolved'] as const) {
        try {
          const { alerts, truncated } = await listSiteAlerts(site.uid, status, { max: 250, maxPages: 4 });
          if (truncated) changeGaps.push(`Datto RMM ${status} alerts for ${site.name} were truncated at 1000 — older alerts in the change window may be missing.`);
          for (const a of alerts) {
            if (!a.alertUid || !a.timestamp) continue;
            rmmAlerts.push({
              alertUid: a.alertUid, type: a.type, timestampUtc: a.timestamp, resolvedOnUtc: a.resolvedOn,
              deviceHostname: a.deviceName, siteName: a.siteName ?? site.name, contextText: rmmContextText(a.alertContext),
            });
          }
        } catch (e) {
          changeGaps.push(`Datto RMM ${status} alerts for site ${site.name} could not be read (${msg(e)}) — planned-change check incomplete.`);
        }
      }
    }
    if (matchedSites.length > MAX_RMM_SITES) changeGaps.push(`Only ${MAX_RMM_SITES} of ${matchedSites.length} Datto RMM sites were checked — devices, IPs and changes on the others are unknown.`);
    changeGaps.push('Datto RMM job history is not listable through its API (a job can only be read by its UID), so job-based change detection is unavailable — only fleet-wide alert patterns are checked.');
    const inWindow = rmmAlerts.filter(a => a.timestampUtc >= window.fromUtc && a.timestampUtc <= window.toUtc);
    const base = { devices: all, siteDeviceCounts, rmmAlerts: inWindow, visibility, changeGaps };

    if (!hostname && alertIps.length === 0) {
      return { ...base, result: null, deviceRecord: null, status: { source: 'Datto RMM', status: 'no_data', detail: 'No hostname or IP to look up.' } };
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
          ...base,
          result: null,
          deviceRecord: null,
          networkMatch,
          status: {
            source: 'Datto RMM',
            status: 'used',
            detail: `Source IP ${networkMatch.ip} matches ${companyName || 'the company'}'s known network — ${networkMatch.deviceCount} managed device(s) behind it (e.g. ${networkMatch.hostnames.slice(0, 4).join(', ')}). Context only, not corroboration.`,
          },
        };
      }
      return {
        ...base,
        result: null,
        deviceRecord: null,
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
      ...base,
      result: health,
      deviceRecord: {
        uid: device.id || null,
        hostname: device.hostname,
        lastSeen: device.lastSeen || null,
        summary: `Managed device record (${device.siteName || 'site unknown'}) — ${bits}. Proves the device exists and its state; not a security signal.`,
      },
      subjectIps: [device.extIpAddress, device.intIpAddress].filter((x): x is string => !!x),
      status: { source: 'Datto RMM', status: 'used', detail: `Known company device "${device.hostname}" — ${bits}. Context only, not corroboration.` },
    };
  } catch (err) {
    return {
      ...empty,
      result: null,
      status: { source: 'Datto RMM', status: 'error', detail: msg(err) },
      visibility: { source: 'Datto RMM', state: 'unreachable', mappedTo: null, detail: msg(err).slice(0, 120) },
      gap: `Datto RMM lookup failed: ${msg(err)}`,
      changeGaps: [`Datto RMM lookup failed (${msg(err)}) — the planned-change check could not run; a TCT-initiated change cannot be ruled out.`],
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
  id?: string | number;
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
): Promise<VisibleResult<EdrCorrelation>> {
  const V = (state: VisibilityEntry['state'], mappedTo: string | null, detail: string): VisibilityEntry => ({ source: 'Datto EDR', state, mappedTo, detail });
  const token = process.env.DATTO_EDR_API_TOKEN;
  if (!token) {
    return {
      result: null,
      status: { source: 'Datto EDR', status: 'not_configured', detail: 'DATTO_EDR_API_TOKEN not set.' },
      visibility: V('not_configured', null, 'API token not set'),
      gap: 'Datto EDR not configured — could not check for related endpoint detections.',
    };
  }
  const mappings = await getPlatformMappings(companyId, 'datto_edr');
  if (mappings && mappings.some(m => m.externalId === '__none__')) {
    return { result: null, status: { source: 'Datto EDR', status: 'not_configured', detail: 'Company marked as not using Datto EDR.' }, visibility: V('not_connected', null, 'company marked as not using Datto EDR') };
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
    const edrMapped = !!orgId;
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
        visibility: V('not_connected', null, 'no EDR organization mapped or name-matched'),
        gap: `No Datto EDR organization resolved for ${companyName || 'this company'}; EDR correlation was skipped (not run MSP-wide to avoid other customers' data).`,
      };
    }

    const edrVis = V(edrMapped ? 'connected' : 'unverified_mapping', orgName || orgId, edrMapped ? 'compliance platform mapping' : 'company-name match');
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
        visibility: V('unreachable', orgName || orgId, `alerts query failed (${res.status})`),
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
        visibility: edrVis,
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
      id: e.id == null ? null : String(e.id),
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
      visibility: edrVis,
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'Datto EDR', status: 'error', detail: msg(err) },
      visibility: V('unreachable', null, msg(err).slice(0, 120)),
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
): Promise<VisibleResult<DnsCorrelation>> {
  const V = (state: VisibilityEntry['state'], mappedTo: string | null, detail: string): VisibilityEntry => ({ source: 'DNSFilter', state, mappedTo, detail });
  const token = process.env.DNSFILTER_API_TOKEN;
  if (!token) {
    return {
      result: null,
      status: { source: 'DNSFilter', status: 'not_configured', detail: 'DNSFILTER_API_TOKEN not set.' },
      visibility: V('not_configured', null, 'API token not set'),
      gap: 'DNSFilter not configured.',
    };
  }
  const mappings = await getPlatformMappings(companyId, 'dnsfilter');
  if (mappings && mappings.some(m => m.externalId === '__none__')) {
    return { result: null, status: { source: 'DNSFilter', status: 'not_configured', detail: 'Company marked as not using DNSFilter.' }, visibility: V('not_connected', null, 'company marked as not using DNSFilter') };
  }

  try {
    const baseUrl = (process.env.DNSFILTER_API_URL || 'https://api.dnsfilter.com/v1').replace(/\/$/, '');
    const headers = { Authorization: `Token ${token}`, Accept: 'application/json' };

    // Resolve the org id from the mapping, or by name match.
    const orgRes = await fetch(`${baseUrl}/organizations`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!orgRes.ok) {
      return { result: null, status: { source: 'DNSFilter', status: 'error', detail: `Organizations endpoint failed (${orgRes.status})` }, visibility: V('unreachable', null, `organizations endpoint failed (${orgRes.status})`), gap: `DNSFilter lookup failed (${orgRes.status}).` };
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
        visibility: V('not_connected', null, 'no DNSFilter organization mapped or name-matched'),
        gap: `No DNSFilter org mapped to ${companyName || 'this company'}.`,
      };
    }
    const dnsVis = V(mappings && mappings.length > 0 ? 'connected' : 'unverified_mapping', orgName || orgId, mappings && mappings.length > 0 ? 'compliance platform mapping' : 'company-name match');

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
        visibility: V('unreachable', orgName, `query_logs failed (${logRes.status})`),
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
        detail: `${totalBlocked} blocked DNS quer${totalBlocked === 1 ? 'y' : 'ies'} in window for org "${orgName}"${usePreciseWindow ? '' : ' (historical alert — day-granularity sample)'}${deviceScoped ? ` — ${deviceVals.length} tied to this device` : ''}${threats.length > 0 ? `; ${threats.length} flagged as threats` : ''}. Context only unless a threat-flagged lookup is tied to this device.`,
      },
      visibility: dnsVis,
      gap: deviceScoped ? undefined : 'DNSFilter blocked-query data could not be tied to this specific device/IP (org-level).',
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'DNSFilter', status: 'error', detail: msg(err) },
      visibility: V('unreachable', null, msg(err).slice(0, 120)),
      gap: `DNSFilter lookup failed: ${msg(err)}`,
    };
  }
}

async function fetchSaasAlerts(companyId: string | null, companyName: string | null, alertTime: string): Promise<VisibleResult<SaasCorrelation>> {
  const V = (state: VisibilityEntry['state'], mappedTo: string | null, detail: string): VisibilityEntry => ({ source: 'SaaS Alerts', state, mappedTo, detail });
  const client = new SaasAlertsClient();
  if (!client.isConfigured()) {
    return {
      result: null,
      status: { source: 'SaaS Alerts', status: 'not_configured', detail: `Missing ${client.missingCredentials().join(', ')}.` },
      visibility: V('not_configured', null, 'API credentials not set'),
      gap: 'SaaS Alerts not configured — could not correlate identity/SaaS events.',
    };
  }
  const mappings = await getPlatformMappings(companyId, 'saas_alerts');
  if (mappings && mappings.some(m => m.externalId === '__none__')) {
    return { result: null, status: { source: 'SaaS Alerts', status: 'not_configured', detail: 'Company marked as not using SaaS Alerts.' }, visibility: V('not_connected', null, 'company marked as not using SaaS Alerts') };
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
      visibility: V('not_connected', null, 'no SaaS Alerts customer mapped or name-matched'),
      gap: `No SaaS Alerts customer resolved for ${companyName || 'this company'}; map it at the compliance Connect Tools step for reliable identity correlation.`,
    };
  }

  const saasVis = V(matchedBy === 'mapping' ? 'connected' : 'unverified_mapping', customerIds.join(', '), matchedBy === 'mapping' ? 'compliance platform mapping' : 'company-name match');
  try {
    const center = new Date(alertTime).getTime() || Date.now();
    const since = new Date(center - WINDOW_MS).toISOString();
    const until = new Date(center + WINDOW_MS).toISOString();
    const events: SaasCorrelation['events'] = [];
    for (const customerId of customerIds) {
      const { events: rows } = await client.getEvents({ customerId, since, until, limit: 200 });
      for (const e of rows) {
        events.push({
          id: e.eventId || e.id || null,
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
        visibility: saasVis,
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
      visibility: saasVis,
    };
  } catch (err) {
    return {
      result: null,
      status: { source: 'SaaS Alerts', status: 'error', detail: msg(err) },
      visibility: V('unreachable', customerIds.join(', '), msg(err).slice(0, 120)),
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
