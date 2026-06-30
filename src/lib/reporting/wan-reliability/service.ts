/**
 * WAN Reliability Report — service / orchestration (I/O layer).
 *
 * Pulls live telemetry from the shared Domotz client and assembles the
 * structured report. Kept deliberately separate from:
 *   - the analyzer (`analyzer.ts`) — pure maths, no I/O
 *   - the formatters (`format.ts`) — presentation only
 *
 * The fetch step (`fetchWanTelemetry`) and the assembly step (`assembleReport`)
 * are split so the assembly path can be exercised with fixture telemetry in
 * tests and for sample generation, with no network access.
 */

import type {
  DomotzAgent,
  DomotzClient,
  DomotzDeviceDetail,
  DomotzNetworkEvent,
  DomotzRtdSample,
  DomotzSpeedSample,
  DomotzUptime,
} from '@/lib/domotz'
import {
  buildOutagesFromEvents,
  buildOutagesFromIntervals,
  computeDailyInstability,
  computeDataCoverage,
  computePerformance,
  computeSla,
  computeSummary,
  detectCadenceArtifact,
  formatEasternDateTime,
  formatEasternDay,
} from './analyzer'
import { assessFailoverCapability, type WanModeOverride } from './failover'
import { buildExecutiveSummary } from './executive-summary'
import { buildFailoverActivity, getSiteWanMode } from '@/lib/domotz-events'
import {
  DAILY_INSTABILITY_THRESHOLD,
  type DeviceReachability,
  type FailoverActivity,
  type Outage,
  type SiteInfoInput,
  type SummaryStatistics,
  type WanReliabilityReport,
} from './types'

const MS_PER_DAY = 86_400_000
const UPTIME_CHUNK_DAYS = 30

export interface GenerateReportOptions {
  agentId: number
  deviceId?: number | null
  from: Date
  to: Date
  site?: SiteInfoInput
  sla?: { availabilityPercent?: number; repairHours?: number }
  dailyInstabilityThreshold?: number
  /** Extra provenance notes to surface (e.g. a sample-data warning). */
  extraNotes?: string[]
}

/** Everything gathered for one report. Any Domotz field may be null if a call failed. */
export interface WanTelemetry {
  agent: DomotzAgent | null
  device: DomotzDeviceDetail | null
  deviceUptime: DomotzUptime | null
  agentUptime: DomotzUptime | null
  deviceEvents: DomotzNetworkEvent[]
  agentEvents: DomotzNetworkEvent[]
  rtd: DomotzRtdSample[]
  speed: DomotzSpeedSample[]
  /** Per-site admin WAN-mode override (from domotz_site_settings). */
  wanModeOverride: WanModeOverride
  /** Failover activity from ingested agent_wan_change webhooks. */
  failoverActivity: FailoverActivity
  /** Non-fatal fetch errors, surfaced in the report's data notes. */
  fetchErrors: string[]
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Pull all telemetry for a report. Uses allSettled so a single failing endpoint
 * (e.g. RTD history for a device that isn't ICMP-monitored) degrades gracefully
 * instead of failing the whole report.
 */
export async function fetchWanTelemetry(
  client: DomotzClient,
  opts: GenerateReportOptions,
): Promise<WanTelemetry> {
  const { agentId, deviceId, from, to } = opts
  const fetchErrors: string[] = []
  const guard = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      fetchErrors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
      return fallback
    }
  }

  const hasDevice = deviceId != null

  const [agent, device, agentUptime, deviceUptime, agentEvents, deviceEvents, rtd, speed, wanModeOverride, failoverActivity] =
    await Promise.all([
      guard('agent detail', () => client.getAgent(agentId), null),
      hasDevice ? guard('device detail', () => client.getDevice(agentId, deviceId!), null) : Promise.resolve(null),
      guard('collector uptime', () => aggregateUptime((f, t) => client.getAgentUptime(agentId, f, t), from, to), null),
      hasDevice
        ? guard('device uptime', () => aggregateUptime((f, t) => client.getDeviceUptime(agentId, deviceId!, f, t), from, to), null)
        : Promise.resolve(null),
      guard('collector events', () => client.getAgentEventHistory(agentId, from, to), []),
      hasDevice ? guard('device events', () => client.getDeviceEventHistory(agentId, deviceId!, from, to), []) : Promise.resolve([]),
      hasDevice ? guard('latency/packet-loss history', () => client.getDeviceRtdHistory(agentId, deviceId!, from, to), []) : Promise.resolve([]),
      guard('speed-test history', () => client.getNetworkSpeedHistory(agentId, from, to), []),
      guard('site WAN-mode override', () => getSiteWanMode(agentId), null as WanModeOverride),
      guard('failover activity', () => buildFailoverActivity(agentId, from, to), {
        available: false,
        ingestionSinceUtc: null,
        eventCount: 0,
        events: [],
        note: 'Failover event store was unavailable for this request.',
      } as FailoverActivity),
    ])

  return { agent, device, agentUptime, deviceUptime, agentEvents, deviceEvents, rtd, speed, wanModeOverride, failoverActivity, fetchErrors }
}

/**
 * Aggregate the per-window uptime endpoint across 30-day chunks and merge:
 * online/total seconds sum, downtime intervals concatenate, and the percentage
 * is recomputed. Guards the documented one-week default window / any server cap.
 */
async function aggregateUptime(
  fetchOne: (from: Date, to: Date) => Promise<DomotzUptime>,
  from: Date,
  to: Date,
): Promise<DomotzUptime> {
  const chunks: Array<{ from: Date; to: Date }> = []
  let cursor = from.getTime()
  const end = to.getTime()
  while (cursor < end) {
    const next = Math.min(cursor + UPTIME_CHUNK_DAYS * MS_PER_DAY, end)
    chunks.push({ from: new Date(cursor), to: new Date(next) })
    cursor = next
  }
  if (chunks.length <= 1) {
    return fetchOne(from, to)
  }

  const parts = await Promise.all(chunks.map((c) => fetchOne(c.from, c.to)))
  let online = 0
  let total = 0
  let agentOnlineKnown = false
  let agentUptimeWeightedNum = 0
  const intervals: Array<{ start: string; end: string }> = []
  for (const p of parts) {
    online += p.online_seconds ?? 0
    total += p.total_seconds ?? 0
    if (p.downtime_intervals) intervals.push(...p.downtime_intervals)
    const au = p.agent_uptime != null ? parseFloat(p.agent_uptime) : NaN
    if (Number.isFinite(au) && (p.total_seconds ?? 0) > 0) {
      agentOnlineKnown = true
      agentUptimeWeightedNum += (au / 100) * (p.total_seconds ?? 0)
    }
  }
  const uptimePct = total > 0 ? (online / total) * 100 : 0
  const agentUptimePct = agentOnlineKnown && total > 0 ? (agentUptimeWeightedNum / total) * 100 : undefined
  return {
    uptime: uptimePct.toFixed(4),
    online_seconds: online,
    total_seconds: total,
    agent_uptime: agentUptimePct != null ? agentUptimePct.toFixed(4) : undefined,
    downtime_intervals: intervals,
  }
}

// ---------------------------------------------------------------------------
// Assemble (pure given telemetry)
// ---------------------------------------------------------------------------

/** Build the full report object from already-fetched telemetry. No network access. */
export function assembleReport(telemetry: WanTelemetry, opts: GenerateReportOptions): WanReliabilityReport {
  const { deviceId, from, to } = opts
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / MS_PER_DAY))
  const threshold = opts.dailyInstabilityThreshold ?? DAILY_INSTABILITY_THRESHOLD
  const dataNotes: string[] = []
  const caveats: string[] = [...(opts.extraNotes ?? [])]

  // --- Failover-capability assessment (governs caveats + SLA applicability) ---
  const failover = assessFailoverCapability({
    vendor: telemetry.device?.vendor,
    model: telemetry.device?.model,
    typeLabel: telemetry.device?.type?.label,
    deviceName: telemetry.device?.display_name,
    override: telemetry.wanModeOverride,
  })

  // --- HEADLINE: collector connectivity (site fully dark) ---
  // The truest "site lost all connectivity" signal. NOT per-ISP-circuit.
  let outages: Outage[]
  if (telemetry.agentUptime?.downtime_intervals) {
    outages = buildOutagesFromIntervals(telemetry.agentUptime.downtime_intervals, from, to)
  } else if (telemetry.agentEvents.length > 0) {
    outages = buildOutagesFromEvents(telemetry.agentEvents, ['DOWN', 'CONNECTION_LOST'], ['UP', 'CONNECTION_RECOVERED'], from, to)
    dataNotes.push('Connectivity timeline derived from collector state-change events (uptime summary was unavailable).')
  } else {
    outages = []
    if (!telemetry.agentUptime) {
      caveats.push('No collector connectivity data was returned for this window — the connectivity record below may be incomplete.')
    }
  }
  outages.sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc))

  const collectorReportedUptime = telemetry.agentUptime ? safeParsePercent(telemetry.agentUptime.uptime) : null
  const summary = computeSummary(outages, from, to, { domotzReportedUptimePercent: collectorReportedUptime })
  const dailyInstability = computeDailyInstability(outages, threshold)
  const cadence = detectCadenceArtifact(outages)

  // --- SECONDARY: monitored-device LAN reachability ---
  const deviceReachability = buildDeviceReachability(telemetry, outages.length, from, to, threshold)

  // --- Performance (latency / packet loss / speed) ---
  const performance = computePerformance(telemetry.rtd, telemetry.speed, { deviceSelected: deviceId != null })

  // --- Data coverage (never imply 100% over a span we have no data for) ---
  const bounds = dataTimeBounds(telemetry)
  const coveredSeconds = telemetry.agentUptime?.total_seconds ?? telemetry.deviceUptime?.total_seconds ?? null
  const dataCoverage = computeDataCoverage(
    { coveredSeconds, earliestDataMs: bounds.earliestMs, latestDataMs: bounds.latestMs },
    from,
    to,
  )

  // --- SLA: only for confirmed single-WAN sites ---
  let sla = null as WanReliabilityReport['sla']
  let slaNote: string
  if (failover.capability === 'single_wan') {
    sla = computeSla({
      windowStart: from,
      windowEnd: to,
      uptimePercent: summary.uptimePercent,
      totalDowntimeSeconds: summary.totalDowntimeSeconds,
      outages,
      mttrSeconds: summary.mttrSeconds,
      availabilityPercent: opts.sla?.availabilityPercent,
      repairHours: opts.sla?.repairHours,
    })
    slaNote = 'Site is marked single-WAN, so collector connectivity is a reasonable proxy for ISP-circuit availability. SLA is evaluated against connectivity, with the coverage caveats above.'
  } else if (failover.capability === 'failover_capable') {
    slaNote = 'No ISP-circuit SLA verdict: this site has WAN failover, so reachability does not measure the primary circuit. Use Failover Activity below and the ISP’s own reporting for circuit compliance.'
  } else {
    slaNote = 'No ISP-circuit SLA verdict: failover capability is unknown, so reachability may not reflect the primary circuit. Mark the site single-WAN (admin override) if it truly has one uplink to enable an SLA verdict.'
  }

  // --- Caveats (must-read) ---
  if (failover.showMaskingCaveat) {
    caveats.push(buildMaskingCaveat(failover, telemetry.failoverActivity))
  }
  if (!dataCoverage.complete && dataCoverage.note) caveats.push(dataCoverage.note)
  if (cadence.suspected && cadence.note) caveats.push(cadence.note)

  // --- Lower-priority provenance notes ---
  dataNotes.push(
    'Headline reflects the on-site collector’s connectivity (the whole site being unreachable). Device reachability, where shown, is a LAN-side signal — neither measures a single ISP circuit at a failover site.',
  )
  const deviceUp = telemetry.deviceUptime ? safeParsePercent(telemetry.deviceUptime.uptime) : null
  if (deviceUp != null && collectorReportedUptime != null) {
    dataNotes.push(`Cross-check — collector connectivity ${collectorReportedUptime}%, monitored device reachability ${deviceUp}% (Domotz-reported).`)
  }
  if (telemetry.fetchErrors.length > 0) {
    dataNotes.push(`Some telemetry was unavailable: ${telemetry.fetchErrors.join('; ')}.`)
  }

  const site = resolveSiteInfo(telemetry, opts, days)

  const report: WanReliabilityReport = {
    meta: {
      generatedAtUtc: new Date().toISOString(),
      timezone: 'America/New_York',
      outageSource: 'agent',
      outageSourceLabel: 'On-site collector connectivity (whole-site reachability)',
      failover,
      caveats,
      dataNotes,
    },
    site,
    outages,
    summary,
    deviceReachability,
    failoverActivity: telemetry.failoverActivity,
    dailyInstability,
    cadence,
    dataCoverage,
    sla,
    slaNote,
    performance,
    executiveSummary: '',
  }
  report.executiveSummary = buildExecutiveSummary({
    site,
    failover,
    summary,
    deviceReachability,
    failoverActivity: telemetry.failoverActivity,
    dataCoverage,
    sla,
    performance,
    dailyInstability,
  })
  return report
}

/** Build the secondary device-reachability block, noting collector-down blind spots. */
function buildDeviceReachability(
  telemetry: WanTelemetry,
  collectorOutageCount: number,
  from: Date,
  to: Date,
  threshold: number,
): DeviceReachability | null {
  if (!telemetry.device || !telemetry.deviceUptime) return null
  const outages = telemetry.deviceUptime.downtime_intervals
    ? buildOutagesFromIntervals(telemetry.deviceUptime.downtime_intervals, from, to)
    : buildOutagesFromEvents(telemetry.deviceEvents, ['DOWN'], ['UP'], from, to)
  outages.sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc))
  const summary: SummaryStatistics = computeSummary(outages, from, to, {
    domotzReportedUptimePercent: safeParsePercent(telemetry.deviceUptime.uptime),
  })
  // Daily-instability for the device isn't surfaced separately; the threshold is
  // accepted for signature symmetry / future use.
  void threshold
  const note =
    collectorOutageCount > 0
      ? 'While the collector itself was offline, the device’s reachability could not be observed — those spans are blind spots in this device figure, not confirmed "up".'
      : null
  return { deviceName: telemetry.device.display_name ?? null, summary, outages, note }
}

/** Earliest/latest data-point timestamps across all pulled signals (for coverage). */
function dataTimeBounds(t: WanTelemetry): { earliestMs: number | null; latestMs: number | null } {
  let earliest = Infinity
  let latest = -Infinity
  const consider = (iso: string | undefined | null) => {
    if (!iso) return
    const ms = Date.parse(iso)
    if (!Number.isNaN(ms)) {
      if (ms < earliest) earliest = ms
      if (ms > latest) latest = ms
    }
  }
  for (const e of t.agentEvents) consider(e.timestamp)
  for (const e of t.deviceEvents) consider(e.timestamp)
  for (const s of t.rtd) consider(s.timestamp)
  for (const s of t.speed) consider(s.timestamp)
  for (const iv of t.agentUptime?.downtime_intervals ?? []) {
    consider(iv.start)
    consider(iv.end)
  }
  for (const iv of t.deviceUptime?.downtime_intervals ?? []) {
    consider(iv.start)
    consider(iv.end)
  }
  return {
    earliestMs: Number.isFinite(earliest) ? earliest : null,
    latestMs: Number.isFinite(latest) ? latest : null,
  }
}

function buildMaskingCaveat(
  failover: ReturnType<typeof assessFailoverCapability>,
  failoverActivity: FailoverActivity,
): string {
  const tail = failoverActivity.available
    ? 'See "Failover Activity" below for failovers detected from public-IP/ISP changes.'
    : 'Failover detection is not yet enabled for this site (no Domotz failover webhooks ingested), so failed-over outages are currently invisible here.'
  if (failover.capability === 'failover_capable') {
    return `This site has WAN failover (${failover.matchedReason}). When the primary ISP circuit drops and the firewall fails over to a secondary uplink, the site stays reachable — so primary-circuit outages are NOT visible to this monitoring and will NOT appear in the connectivity history below. A clean connectivity record here does NOT mean the ISP circuit was healthy. ${tail}`
  }
  return `Failover capability for this site could not be confirmed, so primary-circuit outages may be masked by failover and absent from the connectivity history below. Treat these connectivity figures as a floor — not ISP-circuit reliability. If this site truly has a single uplink, mark it single-WAN (admin override) to get an ISP SLA verdict. ${tail}`
}

/**
 * Generate a WAN reliability report end-to-end: fetch live telemetry, then
 * assemble. This is the function API routes and crons should call.
 */
export async function generateWanReliabilityReport(
  client: DomotzClient,
  opts: GenerateReportOptions,
): Promise<WanReliabilityReport> {
  const telemetry = await fetchWanTelemetry(client, opts)
  return assembleReport(telemetry, opts)
}

// ---------------------------------------------------------------------------
// Site-info resolution
// ---------------------------------------------------------------------------

function resolveSiteInfo(telemetry: WanTelemetry, opts: GenerateReportOptions, days: number) {
  const agent = telemetry.agent
  const device = telemetry.device
  const input = opts.site ?? {}

  const agentName = agent?.display_name ?? `Collector ${opts.agentId}`
  const gatewayFromDevice = device ? dedupeWords([device.vendor, device.model].filter(Boolean).join(' ')) || null : null
  const publicIp = input.publicIp || agent?.wan_info?.ip || firstExternalIp(device) || null
  const isp = input.isp || inferIspFromHostname(agent?.wan_info?.hostname ?? null)

  const reportGeneratedEastern = formatEasternDateTime(new Date())

  return {
    customer: input.customer || agentName,
    site: input.site || agentName,
    address: input.address || null,
    gateway: input.gateway || gatewayFromDevice,
    isp,
    publicIp,
    deviceMonitored: input.deviceMonitored || device?.display_name || null,
    agentId: opts.agentId,
    deviceId: opts.deviceId ?? null,
    reportingPeriod: {
      fromUtc: opts.from.toISOString(),
      toUtc: opts.to.toISOString(),
      days,
      label: `${formatEasternDay(opts.from)} – ${formatEasternDay(opts.to)} (${days} days)`,
    },
    reportGeneratedEastern,
  }
}

function firstExternalIp(device: DomotzDeviceDetail | null): string | null {
  if (!device || !Array.isArray(device.ip_addresses)) return null
  return device.ip_addresses[0] ?? null
}

/** Collapse consecutive duplicate words, e.g. "Cisco Meraki Meraki MX68CW" → "Cisco Meraki MX68CW". */
function dedupeWords(s: string): string {
  const words = s.trim().split(/\s+/)
  const out: string[] = []
  for (const w of words) {
    if (out.length === 0 || out[out.length - 1].toLowerCase() !== w.toLowerCase()) out.push(w)
  }
  return out.join(' ')
}

function safeParsePercent(value: string | null | undefined): number | null {
  if (value == null) return null
  const n = parseFloat(value)
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null
}

/**
 * Best-effort ISP inference from the WAN public IP's reverse-DNS hostname.
 * Domotz does not expose the ISP directly, but the PTR record usually names it.
 * The caller can always override via the `isp` site input.
 */
export function inferIspFromHostname(hostname: string | null): string | null {
  if (!hostname) return null
  const h = hostname.toLowerCase()
  const known: Array<[string, string]> = [
    ['frontier', 'Frontier Communications'],
    ['frontiernet', 'Frontier Communications'],
    ['ftr.com', 'Frontier Communications'],
    ['spectrum', 'Spectrum (Charter)'],
    ['charter', 'Spectrum (Charter)'],
    ['rr.com', 'Spectrum (Charter)'],
    ['comcast', 'Comcast Business'],
    ['xfinity', 'Comcast'],
    ['verizon', 'Verizon'],
    ['vzbusiness', 'Verizon Business'],
    ['fios', 'Verizon Fios'],
    ['sbcglobal', 'AT&T'],
    ['att.net', 'AT&T'],
    ['lumen', 'Lumen / CenturyLink'],
    ['centurylink', 'CenturyLink'],
    ['windstream', 'Windstream'],
    ['cox.net', 'Cox Communications'],
    ['optimum', 'Optimum (Altice)'],
    ['cablevision', 'Optimum (Altice)'],
    ['mchsi', 'Mediacom'],
    ['mediacom', 'Mediacom'],
  ]
  for (const [needle, name] of known) {
    if (h.includes(needle)) return name
  }
  // Fall back to the registrable-looking domain as a hint.
  const parts = h.split('.').filter(Boolean)
  if (parts.length >= 2) return parts.slice(-2).join('.')
  return null
}
