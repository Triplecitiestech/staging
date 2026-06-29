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
  computePerformance,
  computeSla,
  computeSummary,
  formatEasternDateTime,
  formatEasternDay,
} from './analyzer'
import { buildExecutiveSummary } from './executive-summary'
import {
  DAILY_INSTABILITY_THRESHOLD,
  type Outage,
  type OutageSource,
  type SiteInfoInput,
  type WanReliabilityReport,
} from './types'

const MS_PER_DAY = 86_400_000
const UPTIME_CHUNK_DAYS = 30

export interface GenerateReportOptions {
  agentId: number
  deviceId?: number | null
  from: Date
  to: Date
  /** 'auto' (default) uses the device signal when a device is selected, else the collector. */
  source?: OutageSource | 'auto'
  site?: SiteInfoInput
  sla?: { availabilityPercent?: number; repairHours?: number }
  dailyInstabilityThreshold?: number
  /** Extra provenance notes to surface (e.g. a sample-data warning). */
  extraNotes?: string[]
}

/** Everything pulled from Domotz for one report. Any field may be null if a call failed. */
export interface WanTelemetry {
  agent: DomotzAgent | null
  device: DomotzDeviceDetail | null
  deviceUptime: DomotzUptime | null
  agentUptime: DomotzUptime | null
  deviceEvents: DomotzNetworkEvent[]
  agentEvents: DomotzNetworkEvent[]
  rtd: DomotzRtdSample[]
  speed: DomotzSpeedSample[]
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

  const [agent, device, agentUptime, deviceUptime, agentEvents, deviceEvents, rtd, speed] = await Promise.all([
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
  ])

  return { agent, device, agentUptime, deviceUptime, agentEvents, deviceEvents, rtd, speed, fetchErrors }
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
  const dataNotes: string[] = [...(opts.extraNotes ?? [])]

  // Decide which signal drives the outage timeline.
  const effectiveSource: OutageSource =
    opts.source === 'agent' || opts.source === 'device'
      ? opts.source
      : deviceId != null
        ? 'device'
        : 'agent'

  const chosenUptime = effectiveSource === 'device' ? telemetry.deviceUptime : telemetry.agentUptime
  const chosenEvents = effectiveSource === 'device' ? telemetry.deviceEvents : telemetry.agentEvents
  const downTypes = effectiveSource === 'device' ? ['DOWN'] : ['DOWN', 'CONNECTION_LOST']
  const upTypes = effectiveSource === 'device' ? ['UP'] : ['UP', 'CONNECTION_RECOVERED']

  // Primary: authoritative downtime_intervals. Fallback: pair DOWN→UP events.
  let outages: Outage[]
  if (chosenUptime && chosenUptime.downtime_intervals) {
    outages = buildOutagesFromIntervals(chosenUptime.downtime_intervals, from, to)
  } else if (chosenEvents.length > 0) {
    outages = buildOutagesFromEvents(chosenEvents, downTypes, upTypes, from, to)
    dataNotes.push('Outage timeline derived from state-change events (uptime summary was unavailable).')
  } else {
    outages = []
    if (!chosenUptime) {
      dataNotes.push(
        `No ${effectiveSource === 'device' ? 'device' : 'collector'} uptime or event data was returned for this window — outage history may be incomplete.`,
      )
    }
  }
  outages.sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc))

  const domotzReportedUptimePercent = chosenUptime ? safeParsePercent(chosenUptime.uptime) : null
  const summary = computeSummary(outages, from, to, { domotzReportedUptimePercent })
  const dailyInstability = computeDailyInstability(outages, threshold)
  const sla = computeSla({
    windowStart: from,
    windowEnd: to,
    uptimePercent: summary.uptimePercent,
    totalDowntimeSeconds: summary.totalDowntimeSeconds,
    outages,
    mttrSeconds: summary.mttrSeconds,
    availabilityPercent: opts.sla?.availabilityPercent,
    repairHours: opts.sla?.repairHours,
  })
  const performance = computePerformance(telemetry.rtd, telemetry.speed, { deviceSelected: deviceId != null })

  // Cross-check / provenance notes.
  dataNotes.push(
    effectiveSource === 'device'
      ? 'Outage timeline reflects reachability of the monitored device from the on-site Domotz collector.'
      : 'Outage timeline reflects the on-site Domotz collector’s internet connectivity — the most direct signal that the WAN circuit was down.',
  )
  const deviceUp = telemetry.deviceUptime ? safeParsePercent(telemetry.deviceUptime.uptime) : null
  const agentUp = telemetry.agentUptime ? safeParsePercent(telemetry.agentUptime.uptime) : null
  if (deviceUp != null && agentUp != null) {
    dataNotes.push(
      `Cross-check — collector (WAN) uptime ${agentUp}%, monitored device uptime ${deviceUp}% (Domotz-reported).`,
    )
  }
  if (telemetry.fetchErrors.length > 0) {
    dataNotes.push(`Some telemetry was unavailable: ${telemetry.fetchErrors.join('; ')}.`)
  }

  const site = resolveSiteInfo(telemetry, opts, days)

  const report: WanReliabilityReport = {
    meta: {
      generatedAtUtc: new Date().toISOString(),
      timezone: 'America/New_York',
      outageSource: effectiveSource,
      outageSourceLabel:
        effectiveSource === 'device' ? 'Monitored device reachability' : 'On-site collector internet connectivity',
      dataNotes,
    },
    site,
    outages,
    summary,
    dailyInstability,
    sla,
    performance,
    executiveSummary: '',
  }
  report.executiveSummary = buildExecutiveSummary({ site, summary, sla, performance, dailyInstability })
  return report
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
  const gatewayFromDevice = device ? [device.vendor, device.model].filter(Boolean).join(' ').trim() || null : null
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
