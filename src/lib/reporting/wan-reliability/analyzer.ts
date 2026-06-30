/**
 * WAN Reliability Report — analyzer (pure business logic, no I/O).
 *
 * Turns raw Domotz telemetry (uptime intervals, state-change events, RTD
 * samples, speed samples) into the structured report shapes in `types.ts`.
 * Every function here is deterministic and side-effect free, so the maths
 * (outage detection, MTBF/MTTR, SLA, trend, performance) is unit-tested
 * directly in `analyzer.test.ts`.
 *
 * Time handling: durations and windows are computed from epoch milliseconds
 * (UTC, DST-agnostic). All customer-facing dates/times are rendered in
 * America/New_York via Intl.DateTimeFormat, which uses the IANA tz database and
 * therefore handles EST/EDT transitions correctly.
 */

import type { DomotzNetworkEvent, DomotzRtdSample, DomotzSpeedSample } from '@/lib/domotz'
import {
  DAILY_INSTABILITY_THRESHOLD,
  DEFAULT_AVAILABILITY_SLA_PERCENT,
  DEFAULT_REPAIR_SLA_HOURS,
  REPORT_TIMEZONE,
  type CadenceArtifact,
  type DailyInstability,
  type DataCoverage,
  type DegradationPeriod,
  type FailoverEpisode,
  type FailoverEventRecord,
  type Outage,
  type PerformanceTrends,
  type SlaComparison,
  type SummaryStatistics,
  type Trend,
} from './types'

// ---------------------------------------------------------------------------
// Tunables for performance-degradation detection (documented heuristics).
// ---------------------------------------------------------------------------
const PACKET_LOSS_DEGRADED_PERCENT = 2 // sustained loss at/above this is flagged
const LATENCY_DEGRADED_MIN_MS = 100 // latency must clear this floor to be "degraded"
const LATENCY_DEGRADED_MULTIPLE = 3 // ...and be this many× the overall median
const SUSTAINED_MIN_SAMPLES = 3 // consecutive bad samples needed to call it "sustained"

const MS_PER_DAY = 86_400_000

// ---------------------------------------------------------------------------
// Time / formatting helpers (exported for reuse + testing)
// ---------------------------------------------------------------------------

const easternDateKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const easternTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
  timeZoneName: 'short',
})
const easternDateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIMEZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
})
const easternDayLabelFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIMEZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** ET calendar date key, e.g. "2026-06-29". */
export function easternDateKey(d: Date): string {
  return easternDateKeyFmt.format(d)
}

/** ET clock time, e.g. "2:14:05 PM EDT". */
export function formatEasternTime(d: Date): string {
  return easternTimeFmt.format(d)
}

/** ET date + time, e.g. "Jun 29, 2026, 2:14 PM EDT". */
export function formatEasternDateTime(d: Date): string {
  return easternDateTimeFmt.format(d)
}

/** ET date label, e.g. "Jun 29, 2026". */
export function formatEasternDay(d: Date): string {
  return easternDayLabelFmt.format(d)
}

/** Human-readable duration, e.g. "3m 12s", "1h 5m", "2d 4h". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s === 0) return '0s'
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (sec && !d && !h) parts.push(`${sec}s`) // seconds only matter for sub-hour outages
  return parts.join(' ') || `${sec}s`
}

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// ---------------------------------------------------------------------------
// Outage construction
// ---------------------------------------------------------------------------

interface RawInterval {
  start: number // epoch ms
  end: number // epoch ms
  ongoing: boolean
}

/** Merge overlapping/touching intervals, OR-ing their `ongoing` flag. */
function mergeIntervals(ivs: RawInterval[]): RawInterval[] {
  if (ivs.length === 0) return []
  const sorted = [...ivs].sort((a, b) => a.start - b.start)
  const out: RawInterval[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]
    const last = out[out.length - 1]
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end)
      last.ongoing = last.ongoing || cur.ongoing
    } else {
      out.push({ ...cur })
    }
  }
  return out
}

function intervalsToOutages(merged: RawInterval[]): Outage[] {
  return merged.map((iv) => {
    const start = new Date(iv.start)
    const end = iv.ongoing ? null : new Date(iv.end)
    const durationSeconds = Math.max(0, (iv.end - iv.start) / 1000)
    return {
      startUtc: start.toISOString(),
      endUtc: end ? end.toISOString() : null,
      dateEastern: easternDateKey(start),
      startEastern: formatEasternTime(start),
      endEastern: end ? formatEasternTime(end) : null,
      durationSeconds,
      durationLabel: formatDuration(durationSeconds),
      ongoing: iv.ongoing,
    }
  })
}

/**
 * Build outages from Domotz `downtime_intervals` (the authoritative source).
 * Each interval is clamped to the report window; touching/overlapping intervals
 * are merged. An interval whose end reaches the window end is treated as ongoing.
 */
export function buildOutagesFromIntervals(
  intervals: Array<{ start: string; end?: string | null }>,
  windowStart: Date,
  windowEnd: Date,
): Outage[] {
  const ws = windowStart.getTime()
  const we = windowEnd.getTime()
  const raw: RawInterval[] = []
  for (const iv of intervals ?? []) {
    const s = Date.parse(iv.start)
    if (Number.isNaN(s)) continue
    const rawEnd = iv.end ? Date.parse(iv.end) : NaN
    const ongoingRaw = Number.isNaN(rawEnd) || rawEnd >= we
    const e = Number.isNaN(rawEnd) ? we : rawEnd
    const cs = Math.max(s, ws)
    const ce = Math.min(e, we)
    if (ce > cs) raw.push({ start: cs, end: ce, ongoing: ongoingRaw })
  }
  return intervalsToOutages(mergeIntervals(raw))
}

/**
 * Build outages by pairing DOWN→UP state-change events. Handles the window
 * boundaries: a leading UP means the link was already down at window start; a
 * trailing DOWN with no recovery means it is still down (ongoing).
 *
 * `downTypes`/`upTypes` let the same logic serve device events (DOWN/UP) and
 * collector events (CONNECTION_LOST/CONNECTION_RECOVERED).
 */
export function buildOutagesFromEvents(
  events: DomotzNetworkEvent[],
  downTypes: string[],
  upTypes: string[],
  windowStart: Date,
  windowEnd: Date,
): Outage[] {
  const ws = windowStart.getTime()
  const we = windowEnd.getTime()
  const relevant = (events ?? [])
    .map((e) => ({ t: Date.parse(e.timestamp), type: e.type }))
    .filter((e) => !Number.isNaN(e.t) && (downTypes.includes(e.type) || upTypes.includes(e.type)))
    .sort((a, b) => a.t - b.t)

  const raw: RawInterval[] = []
  let downStart: number | null = null
  let seenAny = false
  for (const e of relevant) {
    const isDown = downTypes.includes(e.type)
    if (isDown) {
      if (downStart === null) downStart = e.t
    } else {
      // an UP / recovery
      if (downStart !== null) {
        raw.push({ start: downStart, end: e.t, ongoing: false })
        downStart = null
      } else if (!seenAny) {
        // first event is a recovery → link was down before the window opened
        raw.push({ start: ws, end: e.t, ongoing: false })
      }
      // else: redundant recovery with no open outage — ignore
    }
    seenAny = true
  }
  if (downStart !== null) raw.push({ start: downStart, end: we, ongoing: true })

  // Clamp to window before merging.
  const clamped = raw
    .map((iv) => ({ start: Math.max(iv.start, ws), end: Math.min(iv.end, we), ongoing: iv.ongoing }))
    .filter((iv) => iv.end > iv.start)
  return intervalsToOutages(mergeIntervals(clamped))
}

// ---------------------------------------------------------------------------
// Summary statistics
// ---------------------------------------------------------------------------

export function computeSummary(
  outages: Outage[],
  windowStart: Date,
  windowEnd: Date,
  opts: { domotzReportedUptimePercent?: number | null } = {},
): SummaryStatistics {
  const ws = windowStart.getTime()
  const we = windowEnd.getTime()
  const windowSeconds = Math.max(1, (we - ws) / 1000)

  const durations = outages.map((o) => o.durationSeconds)
  const totalDowntimeSeconds = durations.reduce((a, b) => a + b, 0)
  const n = outages.length

  const uptimeSeconds = Math.max(0, windowSeconds - totalDowntimeSeconds)
  const uptimePercent = clampPercent((uptimeSeconds / windowSeconds) * 100)

  // Longest outage + the ET day it started.
  let longest: Outage | null = null
  for (const o of outages) {
    if (!longest || o.durationSeconds > longest.durationSeconds) longest = o
  }

  const averageOutageSeconds = n > 0 ? totalDowntimeSeconds / n : null
  const medianOutageSeconds = median(durations)
  // MTTR = mean time to repair = mean outage duration.
  const mttrSeconds = averageOutageSeconds
  // MTBF = mean up-time per failure (undefined with zero failures).
  const mtbfSeconds = n > 0 ? uptimeSeconds / n : null

  // last-30 vs previous-60, anchored at the window end.
  const last30Start = we - 30 * MS_PER_DAY
  const prev60Start = we - 90 * MS_PER_DAY
  let outagesLast30Days = 0
  let outagesPrevious60Days = 0
  for (const o of outages) {
    const t = Date.parse(o.startUtc)
    if (Number.isNaN(t)) continue
    if (t >= last30Start) outagesLast30Days++
    else if (t >= prev60Start) outagesPrevious60Days++
  }
  const { trend, trendDetail } = computeTrend(outagesLast30Days, outagesPrevious60Days)

  return {
    totalOutages: n,
    totalDowntimeSeconds: round(totalDowntimeSeconds, 0),
    totalDowntimeLabel: formatDuration(totalDowntimeSeconds),
    uptimePercent: round(uptimePercent, 4),
    uptimePercentLabel: `${round(uptimePercent, 4)}%`,
    domotzReportedUptimePercent:
      opts.domotzReportedUptimePercent != null ? round(opts.domotzReportedUptimePercent, 4) : null,
    longestOutageSeconds: longest ? round(longest.durationSeconds, 0) : null,
    longestOutageLabel: longest ? longest.durationLabel : null,
    longestOutageDateEastern: longest ? longest.dateEastern : null,
    averageOutageSeconds: averageOutageSeconds != null ? round(averageOutageSeconds, 0) : null,
    averageOutageLabel: averageOutageSeconds != null ? formatDuration(averageOutageSeconds) : null,
    medianOutageSeconds: medianOutageSeconds != null ? round(medianOutageSeconds, 0) : null,
    medianOutageLabel: medianOutageSeconds != null ? formatDuration(medianOutageSeconds) : null,
    mtbfSeconds: mtbfSeconds != null ? round(mtbfSeconds, 0) : null,
    mtbfLabel: mtbfSeconds != null ? formatDuration(mtbfSeconds) : null,
    mttrSeconds: mttrSeconds != null ? round(mttrSeconds, 0) : null,
    mttrLabel: mttrSeconds != null ? formatDuration(mttrSeconds) : null,
    outagesLast30Days,
    outagesPrevious60Days,
    trend,
    trendDetail,
  }
}

/**
 * Compare the last-30-day outage count against the prior-60-day count,
 * normalised to a per-30-day rate. ±20% around the prior rate is "stable".
 */
export function computeTrend(last30: number, prev60: number): { trend: Trend; trendDetail: string } {
  const priorRate = prev60 / 2 // prior 60 days → equivalent 30-day rate
  if (last30 === 0 && prev60 === 0) {
    return { trend: 'stable', trendDetail: 'No outages in the reporting period.' }
  }
  if (priorRate === 0) {
    return {
      trend: 'increasing',
      trendDetail: `${last30} outage(s) in the last 30 days vs none in the prior 60 days.`,
    }
  }
  const detail = `${last30} outage(s) in the last 30 days vs ${prev60} in the prior 60 days (≈${round(priorRate, 1)}/30d).`
  if (last30 > priorRate * 1.2) return { trend: 'increasing', trendDetail: detail }
  if (last30 < priorRate * 0.8) return { trend: 'decreasing', trendDetail: detail }
  return { trend: 'stable', trendDetail: detail }
}

// ---------------------------------------------------------------------------
// Daily instability
// ---------------------------------------------------------------------------

/** Days (ET) with `threshold`+ outages, busiest first. Outages count on their start day. */
export function computeDailyInstability(
  outages: Outage[],
  threshold: number = DAILY_INSTABILITY_THRESHOLD,
): DailyInstability[] {
  const byDay = new Map<string, { count: number; downtime: number }>()
  for (const o of outages) {
    const e = byDay.get(o.dateEastern) ?? { count: 0, downtime: 0 }
    e.count += 1
    e.downtime += o.durationSeconds
    byDay.set(o.dateEastern, e)
  }
  return Array.from(byDay.entries())
    .filter(([, v]) => v.count >= threshold)
    .map(([dateEastern, v]) => ({
      dateEastern,
      outageCount: v.count,
      totalDowntimeSeconds: round(v.downtime, 0),
      totalDowntimeLabel: formatDuration(v.downtime),
    }))
    .sort((a, b) => b.outageCount - a.outageCount || a.dateEastern.localeCompare(b.dateEastern))
}

// ---------------------------------------------------------------------------
// SLA comparison
// ---------------------------------------------------------------------------

export function computeSla(params: {
  windowStart: Date
  windowEnd: Date
  uptimePercent: number
  totalDowntimeSeconds: number
  outages: Outage[]
  mttrSeconds: number | null
  availabilityPercent?: number
  repairHours?: number
}): SlaComparison {
  const availabilityPercent = params.availabilityPercent ?? DEFAULT_AVAILABILITY_SLA_PERCENT
  const repairHours = params.repairHours ?? DEFAULT_REPAIR_SLA_HOURS
  const windowSeconds = Math.max(1, (params.windowEnd.getTime() - params.windowStart.getTime()) / 1000)

  const allowedDowntimeSeconds = windowSeconds * (1 - availabilityPercent / 100)
  const slaImpactSeconds = Math.max(0, params.totalDowntimeSeconds - allowedDowntimeSeconds)
  const differenceFromSla = params.uptimePercent - availabilityPercent
  // Allow a hair of floating-point slack so 99.99 vs 99.99 doesn't fail spuriously.
  const availabilityPassed = params.uptimePercent >= availabilityPercent - 1e-6

  const repairSlaSeconds = repairHours * 3600
  const outagesExceedingRepairSla = params.outages.filter((o) => o.durationSeconds > repairSlaSeconds).length
  const repairPassed = params.mttrSeconds == null ? null : params.mttrSeconds <= repairSlaSeconds

  return {
    availabilitySlaPercent: availabilityPercent,
    repairSlaHours: repairHours,
    actualUptimePercent: round(params.uptimePercent, 4),
    differenceFromSla: round(differenceFromSla, 4),
    availabilityPassed,
    allowedDowntimeSeconds: round(allowedDowntimeSeconds, 0),
    allowedDowntimeLabel: formatDuration(allowedDowntimeSeconds),
    actualDowntimeSeconds: round(params.totalDowntimeSeconds, 0),
    slaImpactSeconds: round(slaImpactSeconds, 0),
    slaImpactLabel: formatDuration(slaImpactSeconds),
    mttrSeconds: params.mttrSeconds != null ? round(params.mttrSeconds, 0) : null,
    repairPassed,
    outagesExceedingRepairSla,
  }
}

// ---------------------------------------------------------------------------
// Performance trends (latency / packet loss / speed)
// ---------------------------------------------------------------------------

function parseNum(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : null
}

export function computePerformance(
  rtd: DomotzRtdSample[],
  speed: DomotzSpeedSample[],
  opts: { deviceSelected: boolean } = { deviceSelected: true },
): PerformanceTrends {
  // Sort by timestamp so degradation-run detection is correct regardless of the
  // order the caller supplied (the live client already sorts, but this keeps the
  // function self-contained).
  const byTs = (a: { timestamp: string }, b: { timestamp: string }) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  const rtdSamples = [...(rtd ?? [])].sort(byTs)
  const speedSamples = [...(speed ?? [])].sort(byTs)

  // Latency: use each sample's median as the representative value; the worst
  // single max is the spike.
  const medians: number[] = []
  const maxes: number[] = []
  for (const s of rtdSamples) {
    const med = parseNum(s.median)
    const mx = parseNum(s.max)
    if (med != null) medians.push(med)
    if (mx != null) maxes.push(mx)
  }
  const avgLatency = mean(medians)
  const medLatency = median(medians)
  const maxLatency = maxes.length ? Math.max(...maxes) : null

  // Packet loss: per-sample loss% where packets were actually sent.
  const lossSeries: Array<{ t: number; pct: number }> = []
  for (const s of rtdSamples) {
    const sent = s.sent_packet_count ?? 0
    const lost = s.lost_packet_count ?? 0
    if (sent > 0) {
      const t = Date.parse(s.timestamp)
      lossSeries.push({ t, pct: (lost / sent) * 100 })
    }
  }
  const lossValues = lossSeries.map((x) => x.pct)
  const avgLoss = mean(lossValues)
  const maxLoss = lossValues.length ? Math.max(...lossValues) : null

  // Speed: values = [downloadBps, uploadBps].
  const downloads: number[] = []
  const uploads: number[] = []
  for (const s of speedSamples) {
    const dl = s.values?.[0]
    const ul = s.values?.[1]
    if (typeof dl === 'number') downloads.push(dl / 1_000_000)
    if (typeof ul === 'number') uploads.push(ul / 1_000_000)
  }
  const speedTrend =
    downloads.length || uploads.length
      ? {
          averageDownloadMbps: round(mean(downloads) ?? 0, 1),
          averageUploadMbps: round(mean(uploads) ?? 0, 1),
          minDownloadMbps: downloads.length ? round(Math.min(...downloads), 1) : null,
          sampleCount: speedSamples.length,
        }
      : null

  const degradationPeriods = detectDegradation(rtdSamples, lossSeries, medLatency)

  const available = rtdSamples.length > 0 || speedSamples.length > 0
  let note: string | null = null
  if (!opts.deviceSelected) {
    note = 'No device selected — latency/packet-loss are measured per monitored device. Select the WAN gateway device to include them.'
  } else if (!available) {
    note = 'Domotz returned no RTD/speed samples for this device in the selected window.'
  }

  return {
    available,
    note,
    latency: {
      averageMs: avgLatency != null ? round(avgLatency, 1) : null,
      medianMs: medLatency != null ? round(medLatency, 1) : null,
      maxMs: maxLatency != null ? round(maxLatency, 1) : null,
      sampleCount: medians.length,
    },
    packetLoss: {
      averagePercent: avgLoss != null ? round(avgLoss, 2) : null,
      maxPercent: maxLoss != null ? round(maxLoss, 2) : null,
      sampleCount: lossSeries.length,
    },
    speed: speedTrend,
    degradationPeriods,
  }
}

/** Flag runs of >= SUSTAINED_MIN_SAMPLES consecutive samples with high loss or high latency. */
function detectDegradation(
  rtd: DomotzRtdSample[],
  lossSeries: Array<{ t: number; pct: number }>,
  overallMedianLatency: number | null,
): DegradationPeriod[] {
  const periods: DegradationPeriod[] = []

  // Packet-loss runs.
  flagRuns(
    lossSeries.map((x) => ({ t: x.t, bad: x.pct >= PACKET_LOSS_DEGRADED_PERCENT, value: x.pct })),
    (run) => {
      const avg = mean(run.map((r) => r.value)) ?? 0
      periods.push(makePeriod(run[0].t, run[run.length - 1].t, 'Packet loss', `avg ${round(avg, 1)}% loss over ${run.length} samples`))
    },
  )

  // Latency runs (only meaningful with a baseline median).
  if (overallMedianLatency != null && overallMedianLatency > 0) {
    const latThreshold = Math.max(LATENCY_DEGRADED_MIN_MS, overallMedianLatency * LATENCY_DEGRADED_MULTIPLE)
    const latSeries = rtd
      .map((s) => ({ t: Date.parse(s.timestamp), value: parseNum(s.median) }))
      .filter((x) => !Number.isNaN(x.t) && x.value != null) as Array<{ t: number; value: number }>
    flagRuns(
      latSeries.map((x) => ({ t: x.t, bad: x.value >= latThreshold, value: x.value })),
      (run) => {
        const avg = mean(run.map((r) => r.value)) ?? 0
        periods.push(makePeriod(run[0].t, run[run.length - 1].t, 'Latency', `avg ${round(avg, 0)}ms over ${run.length} samples (baseline ≈${round(overallMedianLatency, 0)}ms)`))
      },
    )
  }

  return periods.sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc))
}

function flagRuns(
  series: Array<{ t: number; bad: boolean; value: number }>,
  onRun: (run: Array<{ t: number; value: number }>) => void,
): void {
  let run: Array<{ t: number; value: number }> = []
  const flush = () => {
    if (run.length >= SUSTAINED_MIN_SAMPLES) onRun(run)
    run = []
  }
  for (const s of series) {
    if (s.bad) run.push({ t: s.t, value: s.value })
    else flush()
  }
  flush()
}

function makePeriod(startMs: number, endMs: number, metric: string, detail: string): DegradationPeriod {
  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    startEastern: formatEasternDateTime(new Date(startMs)),
    endEastern: formatEasternDateTime(new Date(endMs)),
    metric,
    detail,
  }
}

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0
  return Math.min(100, Math.max(0, p))
}

// ---------------------------------------------------------------------------
// Failover episodes — estimate primary-circuit downtime by pairing out→back
// ---------------------------------------------------------------------------

export interface FailoverEpisodeResult {
  episodes: FailoverEpisode[]
  estimatedPrimaryDownSeconds: number
  longestEpisodeSeconds: number | null
  approximate: boolean
}

/**
 * Pair `agent_wan_change` events into failover episodes (time the site was OFF
 * its primary uplink). Each episode's duration is the best estimate of how long
 * the primary circuit was down.
 *
 * Classification: an event whose NEW uplink matches the site's primary (by public
 * IP, else by ISP/provider name) is a failback; anything else is a failover-out.
 * Boundaries: if the first event's OLD uplink wasn't the primary, the site was
 * already on backup at the window start (down-since-start); a trailing out with
 * no failback is ongoing at the window end.
 *
 * When the primary can't be identified (no IP/ISP), falls back to pairing
 * consecutive events (out, back, out, back, …) and flags the result approximate.
 *
 * Assumes the site is normally on its primary uplink — documented as a caveat.
 */
export function pairFailoverEpisodes(
  events: FailoverEventRecord[],
  opts: { primaryProvider: string | null; primaryIp: string | null; windowStart: Date; windowEnd: Date; ingestionSinceMs?: number | null },
): FailoverEpisodeResult {
  const sorted = [...(events ?? [])]
    .filter((e) => !Number.isNaN(Date.parse(e.timestampUtc)))
    .sort((a, b) => Date.parse(a.timestampUtc) - Date.parse(b.timestampUtc))
  const ws = opts.windowStart.getTime()
  const we = opts.windowEnd.getTime()
  const floor = Math.max(ws, opts.ingestionSinceMs ?? ws)

  const canClassify = !!((opts.primaryProvider && opts.primaryProvider.trim()) || (opts.primaryIp && opts.primaryIp.trim()))
  const raw: Array<{ start: number; end: number | null; backup: string | null }> = []

  if (!canClassify) {
    // Fallback: alternate out/back across consecutive events.
    for (let i = 0; i < sorted.length; i += 2) {
      const out = sorted[i]
      const back = sorted[i + 1]
      raw.push({ start: Date.parse(out.timestampUtc), end: back ? Date.parse(back.timestampUtc) : null, backup: out.newProvider })
    }
  } else {
    const onPrimary = (provider: string | null, ip: string | null): boolean => matchesPrimary(provider, ip, opts.primaryProvider, opts.primaryIp)
    const startedOnPrimary = sorted.length === 0 ? true : onPrimary(sorted[0].oldProvider, sorted[0].oldIp)
    let openOut: number | null = startedOnPrimary ? null : floor
    let openBackup: string | null = startedOnPrimary ? null : sorted[0].oldProvider
    for (const e of sorted) {
      const toPrimary = onPrimary(e.newProvider, e.newIp)
      if (!toPrimary && openOut === null) {
        openOut = Date.parse(e.timestampUtc)
        openBackup = e.newProvider
      } else if (toPrimary && openOut !== null) {
        raw.push({ start: openOut, end: Date.parse(e.timestampUtc), backup: openBackup })
        openOut = null
        openBackup = null
      }
      // else: backup→backup or primary→primary change — no episode boundary
    }
    if (openOut !== null) raw.push({ start: openOut, end: null, backup: openBackup })
  }

  const episodes: FailoverEpisode[] = raw
    .map(({ start, end, backup }) => {
      const s = Math.max(ws, start)
      const ongoing = end == null
      const e = ongoing ? we : Math.min(we, end as number)
      const durationSeconds = Math.max(0, (e - s) / 1000)
      return {
        startUtc: new Date(s).toISOString(),
        endUtc: ongoing ? null : new Date(e).toISOString(),
        startEastern: formatEasternDateTime(new Date(s)),
        endEastern: ongoing ? null : formatEasternDateTime(new Date(e)),
        durationSeconds,
        durationLabel: formatDuration(durationSeconds),
        ongoing,
        backupProvider: backup,
      }
    })
    .filter((ep) => ep.durationSeconds > 0 || ep.ongoing)
    .sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc))

  const durations = episodes.map((e) => e.durationSeconds)
  return {
    episodes,
    estimatedPrimaryDownSeconds: round(durations.reduce((a, b) => a + b, 0), 0),
    longestEpisodeSeconds: durations.length ? round(Math.max(...durations), 0) : null,
    approximate: !canClassify,
  }
}

function matchesPrimary(provider: string | null, ip: string | null, primaryProvider: string | null, primaryIp: string | null): boolean {
  if (primaryIp && ip && ip.trim() === primaryIp.trim()) return true
  if (primaryProvider && provider && providersMatch(provider, primaryProvider)) return true
  return false
}

function providersMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, '')
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!na || !nb) return false
  if (na.includes(nb) || nb.includes(na)) return true
  const tokensA = a.toLowerCase().match(/[a-z]{4,}/g) ?? []
  const tokensB = new Set(b.toLowerCase().match(/[a-z]{4,}/g) ?? [])
  return tokensA.some((t) => tokensB.has(t))
}

// ---------------------------------------------------------------------------
// Data coverage (never report 100% over a span we have no data for)
// ---------------------------------------------------------------------------

/**
 * Measure how much of the requested window we actually have data for. Domotz
 * doesn't document retention, so this is empirical. Preferred signal is the
 * uptime endpoint's `total_seconds` (the monitored duration in-window — reliable
 * even for a quiet site with no events); falls back to the observed
 * earliest/latest data-point span when uptime totals are unavailable.
 */
export function computeDataCoverage(
  observed: { coveredSeconds: number | null; earliestDataMs: number | null; latestDataMs: number | null },
  windowStart: Date,
  windowEnd: Date,
): DataCoverage {
  const ws = windowStart.getTime()
  const we = windowEnd.getTime()
  const requestedDays = Math.max(1, Math.round((we - ws) / MS_PER_DAY))
  const requestedSeconds = (we - ws) / 1000

  let coveredSeconds: number | null = null
  if (observed.coveredSeconds != null && observed.coveredSeconds > 0) {
    coveredSeconds = Math.min(observed.coveredSeconds, requestedSeconds)
  } else if (observed.earliestDataMs != null) {
    const obsStart = Math.max(ws, observed.earliestDataMs)
    const obsEnd = Math.min(we, observed.latestDataMs ?? we)
    coveredSeconds = Math.max(0, (obsEnd - obsStart) / 1000)
  }

  if (coveredSeconds == null) {
    return {
      requestedFromUtc: windowStart.toISOString(),
      requestedToUtc: windowEnd.toISOString(),
      requestedDays,
      actualFromUtc: null,
      actualToUtc: null,
      coveredDays: 0,
      complete: false,
      note: 'Domotz returned no uptime totals or data points for this window — coverage could not be confirmed, so figures below may be incomplete.',
    }
  }

  const coveredDays = Math.round(coveredSeconds / 86_400)
  const complete = coveredSeconds >= requestedSeconds * 0.98
  // Imply the covered span's start: prefer an observed earliest point, else back-fill from the covered duration.
  const actualFromMs = observed.earliestDataMs != null ? Math.max(ws, observed.earliestDataMs) : we - coveredSeconds * 1000
  const actualToMs = observed.latestDataMs != null ? Math.min(we, observed.latestDataMs) : we

  return {
    requestedFromUtc: windowStart.toISOString(),
    requestedToUtc: windowEnd.toISOString(),
    requestedDays,
    actualFromUtc: new Date(actualFromMs).toISOString(),
    actualToUtc: new Date(actualToMs).toISOString(),
    coveredDays,
    complete,
    note: complete
      ? null
      : `History covers about ${coveredDays} of the ${requestedDays} requested days (data begins ~${formatEasternDay(new Date(actualFromMs))}). Domotz retention or collector age limits how far back we can see; all figures reflect only the covered span — they are NOT a clean record over the full ${requestedDays} days.`,
  }
}

// ---------------------------------------------------------------------------
// Cadence-artifact detection (don't present the poll interval as outage length)
// ---------------------------------------------------------------------------

/**
 * Detect when outage durations are dominated by a single near-identical value —
 * the signature of a fixed monitoring/poll interval rather than true outage
 * lengths. When suspected, the report says durations are "at least one missed
 * poll", not precise.
 */
export function detectCadenceArtifact(outages: Outage[]): CadenceArtifact {
  const durations = outages.filter((o) => !o.ongoing).map((o) => o.durationSeconds)
  if (durations.length < 4) return { suspected: false, note: null }

  // Bucket to the nearest 60s and find the modal bucket.
  const buckets = new Map<number, number>()
  for (const d of durations) {
    const b = Math.max(60, Math.round(d / 60) * 60)
    buckets.set(b, (buckets.get(b) ?? 0) + 1)
  }
  let modalBucket = 0
  let modalCount = 0
  for (const [b, c] of Array.from(buckets.entries())) {
    if (c > modalCount) {
      modalCount = c
      modalBucket = b
    }
  }
  const fraction = modalCount / durations.length
  if (fraction >= 0.6) {
    return {
      suspected: true,
      note: `${modalCount} of ${durations.length} outages cluster around ${formatDuration(modalBucket)} — this usually reflects the monitoring poll interval, not true outage length. Treat short durations as "at least one missed poll", not precise downtime.`,
    }
  }
  return { suspected: false, note: null }
}
