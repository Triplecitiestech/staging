/**
 * Unit tests for the Site Connectivity & Stability analyzer (pure functions),
 * failover detection, report assembly, and the Domotz webhook normalizer.
 * No network access — all telemetry is synthetic.
 */

import { describe, it, expect } from 'vitest'
import {
  buildOutagesFromIntervals,
  buildOutagesFromEvents,
  computeSummary,
  computeTrend,
  computeDailyInstability,
  computeDataCoverage,
  detectCadenceArtifact,
  computeSla,
  computePerformance,
  formatDuration,
  easternDateKey,
  formatEasternTime,
  median,
} from './analyzer'
import { assessFailoverCapability } from './failover'
import { assembleReport, inferIspFromHostname, type WanTelemetry } from './service'
import { normalizeDomotzWebhook, SAMPLE_DOMOTZ_WEBHOOK } from '@/lib/domotz-events'

const ISO = (s: string) => new Date(s)

// A telemetry builder with sensible defaults so each test overrides only what it needs.
function telemetry(over: Partial<WanTelemetry> = {}): WanTelemetry {
  return {
    agent: {
      id: 90210,
      display_name: 'XNG - Montrose',
      status: { value: 'ONLINE', last_change: '2026-06-01T00:00:00Z' },
      licence: null,
      creation_time: '2025-01-01T00:00:00Z',
      timezone: 'America/New_York',
      version: null,
      wan_info: { ip: '50.107.49.134', hostname: '50-107-49-134.dia.frontiernet.net' },
      ...(over.agent ? {} : {}),
    },
    device: null,
    deviceUptime: null,
    agentUptime: { uptime: '100', online_seconds: 90 * 86400, total_seconds: 90 * 86400, downtime_intervals: [] },
    deviceEvents: [],
    agentEvents: [],
    rtd: [],
    speed: [],
    wanModeOverride: null,
    failoverActivity: { available: false, ingestionSinceUtc: null, eventCount: 0, events: [], note: 'not enabled' },
    fetchErrors: [],
    ...over,
  }
}

describe('formatDuration', () => {
  it('formats sub-minute, sub-hour, and multi-day durations', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(90)).toBe('1m 30s')
    expect(formatDuration(3672)).toBe('1h 1m')
    expect(formatDuration(2 * 86400 + 4 * 3600)).toBe('2d 4h')
  })
})

describe('Eastern timezone conversion (DST-correct)', () => {
  it('maps a summer UTC instant to EDT (UTC-4)', () => {
    const d = ISO('2026-06-29T02:00:00Z') // → 2026-06-28 22:00 EDT
    expect(easternDateKey(d)).toBe('2026-06-28')
    expect(formatEasternTime(d)).toContain('EDT')
    expect(formatEasternTime(d)).toContain('10:00:00')
  })
  it('maps a winter UTC instant to EST (UTC-5)', () => {
    const d = ISO('2026-01-15T02:00:00Z') // → 2026-01-14 21:00 EST
    expect(easternDateKey(d)).toBe('2026-01-14')
    expect(formatEasternTime(d)).toContain('EST')
  })
})

describe('buildOutagesFromIntervals', () => {
  const from = ISO('2026-06-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z')
  it('builds, clamps, merges, and flags ongoing', () => {
    expect(buildOutagesFromIntervals([{ start: '2026-06-02T10:00:00Z', end: '2026-06-02T10:05:00Z' }], from, to)[0].durationSeconds).toBe(300)
    expect(buildOutagesFromIntervals([{ start: '2026-05-30T00:00:00Z', end: '2026-06-01T01:00:00Z' }], from, to)[0].durationSeconds).toBe(3600)
    expect(
      buildOutagesFromIntervals(
        [
          { start: '2026-06-05T10:00:00Z', end: '2026-06-05T10:10:00Z' },
          { start: '2026-06-05T10:10:00Z', end: '2026-06-05T10:20:00Z' },
        ],
        from,
        to,
      ),
    ).toHaveLength(1)
    const ongoing = buildOutagesFromIntervals([{ start: '2026-06-29T23:00:00Z', end: '2026-06-30T00:00:00Z' }], from, to)[0]
    expect(ongoing.ongoing).toBe(true)
    expect(ongoing.endUtc).toBeNull()
  })
})

describe('buildOutagesFromEvents', () => {
  const from = ISO('2026-06-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z')
  it('pairs DOWN→UP, handles open boundaries, ignores redundant recoveries', () => {
    expect(
      buildOutagesFromEvents(
        [
          { timestamp: '2026-06-10T08:00:00Z', type: 'DOWN' },
          { timestamp: '2026-06-10T08:30:00Z', type: 'UP' },
        ],
        ['DOWN'],
        ['UP'],
        from,
        to,
      )[0].durationSeconds,
    ).toBe(1800)
    // leading recovery → down since window start
    expect(buildOutagesFromEvents([{ timestamp: '2026-06-01T01:00:00Z', type: 'CONNECTION_RECOVERED' }], ['CONNECTION_LOST'], ['CONNECTION_RECOVERED'], from, to)[0].durationSeconds).toBe(3600)
    // trailing failure → ongoing
    const trailing = buildOutagesFromEvents([{ timestamp: '2026-06-29T22:00:00Z', type: 'DOWN' }], ['DOWN'], ['UP'], from, to)[0]
    expect(trailing.ongoing).toBe(true)
  })
})

describe('computeSummary', () => {
  const from = ISO('2026-04-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z') // 90 days
  it('computes uptime %, MTTR, MTBF, longest, median, last30/prev60', () => {
    const outages = buildOutagesFromIntervals(
      [
        { start: '2026-04-10T00:00:00Z', end: '2026-04-10T01:00:00Z' },
        { start: '2026-05-10T00:00:00Z', end: '2026-05-10T00:30:00Z' },
        { start: '2026-06-20T00:00:00Z', end: '2026-06-20T00:10:00Z' },
      ],
      from,
      to,
    )
    const s = computeSummary(outages, from, to)
    expect(s.totalOutages).toBe(3)
    expect(s.mttrSeconds).toBe(2000)
    expect(s.medianOutageSeconds).toBe(1800)
    expect(s.longestOutageSeconds).toBe(3600)
    expect(s.uptimePercent).toBeGreaterThan(99.9)
    expect(s.outagesLast30Days).toBe(1)
    expect(s.outagesPrevious60Days).toBe(2)
  })
  it('reports zero outages as 100% with null MTBF/MTTR', () => {
    const s = computeSummary([], from, to)
    expect(s.uptimePercent).toBe(100)
    expect(s.mtbfSeconds).toBeNull()
    expect(s.mttrSeconds).toBeNull()
  })
})

describe('computeTrend', () => {
  it('classifies increasing / decreasing / stable / no-prior', () => {
    expect(computeTrend(10, 2).trend).toBe('increasing')
    expect(computeTrend(1, 20).trend).toBe('decreasing')
    expect(computeTrend(5, 10).trend).toBe('stable')
    expect(computeTrend(3, 0).trend).toBe('increasing')
    expect(computeTrend(0, 0).trend).toBe('stable')
  })
})

describe('computeDailyInstability', () => {
  const from = ISO('2026-06-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z')
  it('lists only ET days with >= 3 outages, busiest first', () => {
    const mk = (t: string) => ({ start: t, end: new Date(Date.parse(t) + 60000).toISOString() })
    const daily = computeDailyInstability(
      buildOutagesFromIntervals(
        [mk('2026-06-15T13:00:00Z'), mk('2026-06-15T14:00:00Z'), mk('2026-06-15T15:00:00Z'), mk('2026-06-15T16:00:00Z'), mk('2026-06-16T13:00:00Z'), mk('2026-06-16T14:00:00Z')],
        from,
        to,
      ),
      3,
    )
    expect(daily).toHaveLength(1)
    expect(daily[0].dateEastern).toBe('2026-06-15')
    expect(daily[0].outageCount).toBe(4)
  })
})

describe('computeSla', () => {
  const from = ISO('2026-04-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z')
  it('passes within budget, fails on a long outage, counts >4h breaches', () => {
    const ok = buildOutagesFromIntervals([{ start: '2026-05-01T00:00:00Z', end: '2026-05-01T00:05:00Z' }], from, to)
    const sok = computeSummary(ok, from, to)
    const slaOk = computeSla({ windowStart: from, windowEnd: to, uptimePercent: sok.uptimePercent, totalDowntimeSeconds: sok.totalDowntimeSeconds, outages: ok, mttrSeconds: sok.mttrSeconds })
    expect(slaOk.slaImpactSeconds).toBe(0)
    expect(slaOk.outagesExceedingRepairSla).toBe(0)

    const bad = buildOutagesFromIntervals([{ start: '2026-05-01T00:00:00Z', end: '2026-05-01T06:00:00Z' }], from, to)
    const sbad = computeSummary(bad, from, to)
    const slaBad = computeSla({ windowStart: from, windowEnd: to, uptimePercent: sbad.uptimePercent, totalDowntimeSeconds: sbad.totalDowntimeSeconds, outages: bad, mttrSeconds: sbad.mttrSeconds })
    expect(slaBad.availabilityPassed).toBe(false)
    expect(slaBad.outagesExceedingRepairSla).toBe(1)
    expect(slaBad.repairPassed).toBe(false)
  })
})

describe('computePerformance', () => {
  it('computes latency / packet loss / speed / degradation, sorting out-of-order input', () => {
    const base = Date.parse('2026-06-01T00:00:00Z')
    const rtd = Array.from({ length: 8 }, (_, i) => ({
      timestamp: new Date(base + i * 3_600_000).toISOString(),
      min: '10',
      median: i >= 5 ? '400' : '20',
      max: i >= 5 ? '500' : '30',
      sent_packet_count: 100,
      lost_packet_count: i >= 5 ? 10 : 0,
    }))
    const perf = computePerformance(rtd, [{ timestamp: new Date(base).toISOString(), values: [200_000_000, 20_000_000] }], { deviceSelected: true })
    expect(perf.latency.maxMs).toBe(500)
    expect(perf.packetLoss.maxPercent).toBe(10)
    expect(perf.degradationPeriods.length).toBeGreaterThanOrEqual(1)
  })
  it('detects two separate degradation clusters even when samples are out of order', () => {
    const bad = (t: string) => ({ timestamp: t, median: '20', max: '30', sent_packet_count: 100, lost_packet_count: 10 })
    const good = (t: string) => ({ timestamp: t, median: '20', max: '30', sent_packet_count: 100, lost_packet_count: 0 })
    const rtd = [bad('2026-06-10T02:00:00Z'), bad('2026-06-01T02:00:00Z'), good('2026-06-05T00:00:00Z'), bad('2026-06-01T01:00:00Z'), bad('2026-06-10T01:00:00Z'), bad('2026-06-01T00:00:00Z'), bad('2026-06-10T00:00:00Z')]
    expect(computePerformance(rtd, [], { deviceSelected: true }).degradationPeriods.filter((d) => d.metric === 'Packet loss')).toHaveLength(2)
  })
  it('notes when no device was selected', () => {
    const perf = computePerformance([], [], { deviceSelected: false })
    expect(perf.available).toBe(false)
    expect(perf.note).toMatch(/No device selected/i)
  })
})

describe('computeDataCoverage', () => {
  const from = ISO('2026-04-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z') // 90 days
  it('reports complete coverage from uptime totals', () => {
    const c = computeDataCoverage({ coveredSeconds: 90 * 86400, earliestDataMs: null, latestDataMs: null }, from, to)
    expect(c.complete).toBe(true)
    expect(c.coveredDays).toBe(90)
    expect(c.note).toBeNull()
  })
  it('flags partial coverage (collector younger than the window)', () => {
    const c = computeDataCoverage({ coveredSeconds: 30 * 86400, earliestDataMs: null, latestDataMs: null }, from, to)
    expect(c.complete).toBe(false)
    expect(c.coveredDays).toBe(30)
    expect(c.note).toMatch(/30 of the 90/)
  })
  it('handles no data at all', () => {
    const c = computeDataCoverage({ coveredSeconds: null, earliestDataMs: null, latestDataMs: null }, from, to)
    expect(c.complete).toBe(false)
    expect(c.coveredDays).toBe(0)
  })
})

describe('detectCadenceArtifact', () => {
  const from = ISO('2026-06-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z')
  it('suspects an artifact when most outages share a duration', () => {
    const mk = (t: string, secs: number) => ({ start: t, end: new Date(Date.parse(t) + secs * 1000).toISOString() })
    const outages = buildOutagesFromIntervals([mk('2026-06-02T00:00:00Z', 300), mk('2026-06-04T00:00:00Z', 300), mk('2026-06-06T00:00:00Z', 300), mk('2026-06-08T00:00:00Z', 300), mk('2026-06-10T00:00:00Z', 900)], from, to)
    expect(detectCadenceArtifact(outages).suspected).toBe(true)
  })
  it('does not flag varied durations or small samples', () => {
    const mk = (t: string, secs: number) => ({ start: t, end: new Date(Date.parse(t) + secs * 1000).toISOString() })
    const varied = buildOutagesFromIntervals([mk('2026-06-02T00:00:00Z', 120), mk('2026-06-04T00:00:00Z', 900), mk('2026-06-06T00:00:00Z', 3600), mk('2026-06-08T00:00:00Z', 7200)], from, to)
    expect(detectCadenceArtifact(varied).suspected).toBe(false)
    expect(detectCadenceArtifact(varied.slice(0, 2)).suspected).toBe(false)
  })
})

describe('assessFailoverCapability', () => {
  it('detects a Meraki MX as failover-capable (caveat ON)', () => {
    const a = assessFailoverCapability({ vendor: 'Cisco Meraki', model: 'MX68CW' })
    expect(a.capability).toBe('failover_capable')
    expect(a.showMaskingCaveat).toBe(true)
  })
  it('detects SonicWall / FortiGate / Peplink families', () => {
    expect(assessFailoverCapability({ model: 'SonicWall TZ370' }).capability).toBe('failover_capable')
    expect(assessFailoverCapability({ vendor: 'Fortinet', model: 'FortiGate 60F' }).capability).toBe('failover_capable')
    expect(assessFailoverCapability({ model: 'Peplink Balance 20X' }).capability).toBe('failover_capable')
  })
  it('honors the admin single-WAN override (caveat OFF)', () => {
    const a = assessFailoverCapability({ vendor: 'Cisco Meraki', model: 'MX68CW', override: 'single_wan' })
    expect(a.capability).toBe('single_wan')
    expect(a.showMaskingCaveat).toBe(false)
    expect(a.source).toBe('admin')
  })
  it('returns unknown (caveat ON) for an unrecognized gateway', () => {
    const a = assessFailoverCapability({ vendor: 'Acme', model: 'Router 1' })
    expect(a.capability).toBe('unknown')
    expect(a.showMaskingCaveat).toBe(true)
  })
})

describe('median', () => {
  it('handles even and odd lengths', () => {
    expect(median([1, 2, 3])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('inferIspFromHostname', () => {
  it('maps known ISP hostname fragments and falls back to the domain', () => {
    expect(inferIspFromHostname('50-107-49-134.frontiernet.net')).toBe('Frontier Communications')
    expect(inferIspFromHostname('host.rr.com')).toBe('Spectrum (Charter)')
    expect(inferIspFromHostname('host.example.co')).toBe('example.co')
    expect(inferIspFromHostname(null)).toBeNull()
  })
})

describe('normalizeDomotzWebhook', () => {
  it('parses the sample agent_wan_change into a failover event', () => {
    const events = normalizeDomotzWebhook(SAMPLE_DOMOTZ_WEBHOOK)
    expect(events).toHaveLength(1)
    const e = events[0]
    expect(e.signalType).toBe('failover')
    expect(e.agentId).toBe(90210)
    expect(e.oldIp).toBe('50.107.49.134')
    expect(e.newProvider).toBe('SPACEX-STARLINK')
    expect(e.externalId).toContain('90210:agent_wan_change')
  })
  it('parses collector status and arrays, and ignores junk', () => {
    expect(normalizeDomotzWebhook({ name: 'agent_status_down', timestamp: '2026-06-01T00:00:00Z', data: { agent_id: 5 } })[0].statusValue).toBe('DOWN')
    expect(normalizeDomotzWebhook([SAMPLE_DOMOTZ_WEBHOOK, SAMPLE_DOMOTZ_WEBHOOK])).toHaveLength(2)
    expect(normalizeDomotzWebhook({ foo: 'bar' })).toHaveLength(0)
    expect(normalizeDomotzWebhook(null)).toHaveLength(0)
  })
})

describe('assembleReport — failover-capable site (the Montrose case)', () => {
  const from = ISO('2026-03-31T00:00:00Z')
  const to = ISO('2026-06-29T00:00:00Z')

  const base = telemetry({
    device: {
      id: 5577,
      display_name: 'XNG-Montrose-MX68CW',
      hw_address: null,
      ip_addresses: ['192.168.128.1'],
      protocol: 'IP',
      importance: 'VITAL',
      first_seen_on: '2025-01-01T00:00:00Z',
      last_status_change: null,
      status: 'ONLINE',
      type: { id: 1, detected_id: 1, label: 'Router' },
      details: null,
      snmp_status: null,
      vendor: 'Cisco Meraki',
      model: 'MX68CW',
      os: null,
      user_data: null,
    },
    // Collector stayed up the whole time (failover masked the primary outages).
    agentUptime: { uptime: '100', online_seconds: 90 * 86400, total_seconds: 90 * 86400, downtime_intervals: [] },
    deviceUptime: { uptime: '100', online_seconds: 90 * 86400, total_seconds: 90 * 86400, downtime_intervals: [] },
  })

  it('flags failover masking, shows no clean ISP-SLA verdict, and does not claim health', () => {
    const report = assembleReport(base, {
      agentId: 90210,
      deviceId: 5577,
      from,
      to,
      site: { customer: 'Xpress Natural Gas', site: 'XNG - Montrose' },
    })
    expect(report.meta.outageSource).toBe('agent') // headline = collector connectivity
    expect(report.meta.failover.capability).toBe('failover_capable')
    expect(report.summary.totalOutages).toBe(0) // collector never went fully dark
    // The critical assertion: NO clean SLA pass, and a masking caveat is present.
    expect(report.sla).toBeNull()
    expect(report.meta.caveats.join(' ')).toMatch(/failover/i)
    expect(report.meta.caveats.join(' ')).toMatch(/not.*visible|masked|invisible/i)
    expect(report.executiveSummary).not.toMatch(/SLA-compliant|no escalation required/i)
    expect(report.site.gateway).toBe('Cisco Meraki MX68CW') // de-duplicated
    expect(report.deviceReachability).not.toBeNull()
  })

  it('surfaces failover events when webhook ingestion is available', () => {
    const withFailovers = telemetry({
      ...base,
      failoverActivity: {
        available: true,
        ingestionSinceUtc: '2026-03-31T00:00:00Z',
        eventCount: 2,
        events: [
          { timestampUtc: '2026-05-20T14:00:00Z', dateEastern: '2026-05-20', timeEastern: '10:00:00 AM EDT', oldIp: '50.107.49.134', newIp: '100.64.12.7', oldProvider: 'Frontier', newProvider: 'Starlink' },
          { timestampUtc: '2026-05-20T14:17:00Z', dateEastern: '2026-05-20', timeEastern: '10:17:00 AM EDT', oldIp: '100.64.12.7', newIp: '50.107.49.134', oldProvider: 'Starlink', newProvider: 'Frontier' },
        ],
        note: 'Failover detection active across the full window. 2 failover event(s) detected.',
      },
    })
    const report = assembleReport(withFailovers, { agentId: 90210, deviceId: 5577, from, to, site: { customer: 'Xpress Natural Gas', site: 'XNG - Montrose' } })
    expect(report.failoverActivity.eventCount).toBe(2)
    expect(report.executiveSummary).toMatch(/2 failover event/i)
  })
})

describe('assembleReport — confirmed single-WAN site enables the SLA verdict', () => {
  const from = ISO('2026-04-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z')
  it('produces an SLA verdict only when marked single-WAN', () => {
    const t = telemetry({
      wanModeOverride: 'single_wan',
      agentUptime: {
        uptime: '99.9',
        online_seconds: 90 * 86400 - 3600,
        total_seconds: 90 * 86400,
        downtime_intervals: [{ start: '2026-05-01T00:00:00Z', end: '2026-05-01T01:00:00Z' }],
      },
    })
    const report = assembleReport(t, { agentId: 90210, from, to })
    expect(report.meta.failover.capability).toBe('single_wan')
    expect(report.sla).not.toBeNull()
    expect(report.meta.caveats.join(' ')).not.toMatch(/failover/i)
    expect(report.summary.totalOutages).toBe(1)
  })
})

describe('assembleReport — partial coverage is reported honestly', () => {
  const from = ISO('2026-04-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z') // requested 90 days
  it('never implies a clean record over a span with no data', () => {
    const t = telemetry({
      // Collector only has ~30 days of history.
      agentUptime: { uptime: '100', online_seconds: 30 * 86400, total_seconds: 30 * 86400, downtime_intervals: [] },
      wanModeOverride: 'single_wan',
    })
    const report = assembleReport(t, { agentId: 90210, from, to })
    expect(report.dataCoverage.complete).toBe(false)
    expect(report.dataCoverage.coveredDays).toBe(30)
    expect(report.meta.caveats.join(' ')).toMatch(/covers about 30 of the 90/i)
  })
})
