/**
 * Unit tests for the WAN reliability analyzer (pure functions) and report
 * assembly. No network access — all telemetry is synthetic.
 */

import { describe, it, expect } from 'vitest'
import {
  buildOutagesFromIntervals,
  buildOutagesFromEvents,
  computeSummary,
  computeTrend,
  computeDailyInstability,
  computeSla,
  computePerformance,
  formatDuration,
  easternDateKey,
  formatEasternTime,
  median,
} from './analyzer'
import { assembleReport, inferIspFromHostname, type WanTelemetry } from './service'

const ISO = (s: string) => new Date(s)

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
    // 2026-06-29 02:00Z → 2026-06-28 22:00 EDT
    const d = ISO('2026-06-29T02:00:00Z')
    expect(easternDateKey(d)).toBe('2026-06-28')
    expect(formatEasternTime(d)).toContain('EDT')
    expect(formatEasternTime(d)).toContain('10:00:00')
  })
  it('maps a winter UTC instant to EST (UTC-5)', () => {
    // 2026-01-15 02:00Z → 2026-01-14 21:00 EST
    const d = ISO('2026-01-15T02:00:00Z')
    expect(easternDateKey(d)).toBe('2026-01-14')
    expect(formatEasternTime(d)).toContain('EST')
  })
})

describe('buildOutagesFromIntervals', () => {
  const from = ISO('2026-06-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z')

  it('builds one outage per interval with correct duration', () => {
    const outages = buildOutagesFromIntervals(
      [{ start: '2026-06-02T10:00:00Z', end: '2026-06-02T10:05:00Z' }],
      from,
      to,
    )
    expect(outages).toHaveLength(1)
    expect(outages[0].durationSeconds).toBe(300)
    expect(outages[0].durationLabel).toBe('5m')
    expect(outages[0].ongoing).toBe(false)
  })

  it('clamps intervals to the window', () => {
    const outages = buildOutagesFromIntervals(
      [{ start: '2026-05-30T00:00:00Z', end: '2026-06-01T01:00:00Z' }], // starts before window
      from,
      to,
    )
    expect(outages).toHaveLength(1)
    // clamped start = window start → 1 hour inside window
    expect(outages[0].durationSeconds).toBe(3600)
  })

  it('merges overlapping/touching intervals', () => {
    const outages = buildOutagesFromIntervals(
      [
        { start: '2026-06-05T10:00:00Z', end: '2026-06-05T10:10:00Z' },
        { start: '2026-06-05T10:10:00Z', end: '2026-06-05T10:20:00Z' }, // touches previous
      ],
      from,
      to,
    )
    expect(outages).toHaveLength(1)
    expect(outages[0].durationSeconds).toBe(1200)
  })

  it('marks an interval reaching the window end as ongoing', () => {
    const outages = buildOutagesFromIntervals([{ start: '2026-06-29T23:00:00Z', end: '2026-06-30T00:00:00Z' }], from, to)
    expect(outages[0].ongoing).toBe(true)
    expect(outages[0].endUtc).toBeNull()
  })
})

describe('buildOutagesFromEvents', () => {
  const from = ISO('2026-06-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z')

  it('pairs DOWN→UP into outages', () => {
    const outages = buildOutagesFromEvents(
      [
        { timestamp: '2026-06-10T08:00:00Z', type: 'DOWN' },
        { timestamp: '2026-06-10T08:30:00Z', type: 'UP' },
      ],
      ['DOWN'],
      ['UP'],
      from,
      to,
    )
    expect(outages).toHaveLength(1)
    expect(outages[0].durationSeconds).toBe(1800)
  })

  it('treats a leading UP as down-since-window-start', () => {
    const outages = buildOutagesFromEvents(
      [{ timestamp: '2026-06-01T01:00:00Z', type: 'CONNECTION_RECOVERED' }],
      ['CONNECTION_LOST'],
      ['CONNECTION_RECOVERED'],
      from,
      to,
    )
    expect(outages).toHaveLength(1)
    expect(outages[0].durationSeconds).toBe(3600)
  })

  it('treats a trailing DOWN as ongoing until window end', () => {
    const outages = buildOutagesFromEvents(
      [{ timestamp: '2026-06-29T22:00:00Z', type: 'DOWN' }],
      ['DOWN'],
      ['UP'],
      from,
      to,
    )
    expect(outages).toHaveLength(1)
    expect(outages[0].ongoing).toBe(true)
    expect(outages[0].durationSeconds).toBe(2 * 3600)
  })

  it('ignores redundant UP events with no open outage', () => {
    const outages = buildOutagesFromEvents(
      [
        { timestamp: '2026-06-10T08:00:00Z', type: 'DOWN' },
        { timestamp: '2026-06-10T08:30:00Z', type: 'UP' },
        { timestamp: '2026-06-10T09:00:00Z', type: 'UP' }, // redundant
      ],
      ['DOWN'],
      ['UP'],
      from,
      to,
    )
    expect(outages).toHaveLength(1)
  })
})

describe('computeSummary', () => {
  const from = ISO('2026-04-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z') // 90 days

  it('computes uptime %, MTTR, MTBF, longest, median', () => {
    const outages = buildOutagesFromIntervals(
      [
        { start: '2026-04-10T00:00:00Z', end: '2026-04-10T01:00:00Z' }, // 1h
        { start: '2026-05-10T00:00:00Z', end: '2026-05-10T00:30:00Z' }, // 30m
        { start: '2026-06-20T00:00:00Z', end: '2026-06-20T00:10:00Z' }, // 10m
      ],
      from,
      to,
    )
    const s = computeSummary(outages, from, to)
    expect(s.totalOutages).toBe(3)
    expect(s.totalDowntimeSeconds).toBe(3600 + 1800 + 600)
    // MTTR = mean outage = 6000/3 = 2000s
    expect(s.mttrSeconds).toBe(2000)
    // median of [3600,1800,600] = 1800
    expect(s.medianOutageSeconds).toBe(1800)
    // longest = 1h on its ET date
    expect(s.longestOutageSeconds).toBe(3600)
    // uptime ~ (90d - 6000s)/90d
    expect(s.uptimePercent).toBeGreaterThan(99.9)
    expect(s.uptimePercent).toBeLessThan(100)
    // MTBF = uptime/n, positive
    expect(s.mtbfSeconds).toBeGreaterThan(0)
  })

  it('reports zero outages cleanly', () => {
    const s = computeSummary([], from, to)
    expect(s.totalOutages).toBe(0)
    expect(s.uptimePercent).toBe(100)
    expect(s.mtbfSeconds).toBeNull()
    expect(s.mttrSeconds).toBeNull()
    expect(s.trend).toBe('stable')
  })

  it('splits last-30 vs previous-60 day counts', () => {
    const outages = buildOutagesFromIntervals(
      [
        { start: '2026-06-25T00:00:00Z', end: '2026-06-25T00:05:00Z' }, // last 30d
        { start: '2026-05-01T00:00:00Z', end: '2026-05-01T00:05:00Z' }, // prev 60d
        { start: '2026-04-15T00:00:00Z', end: '2026-04-15T00:05:00Z' }, // prev 60d
      ],
      from,
      to,
    )
    const s = computeSummary(outages, from, to)
    expect(s.outagesLast30Days).toBe(1)
    expect(s.outagesPrevious60Days).toBe(2)
  })
})

describe('computeTrend', () => {
  it('flags increasing when recent rate exceeds prior by >20%', () => {
    expect(computeTrend(10, 2).trend).toBe('increasing') // prior rate 1/30d vs 10
  })
  it('flags decreasing when recent rate is well below prior', () => {
    expect(computeTrend(1, 20).trend).toBe('decreasing') // prior rate 10/30d vs 1
  })
  it('flags stable around the prior rate', () => {
    expect(computeTrend(5, 10).trend).toBe('stable') // prior rate 5/30d vs 5
  })
  it('handles no prior outages', () => {
    expect(computeTrend(3, 0).trend).toBe('increasing')
    expect(computeTrend(0, 0).trend).toBe('stable')
  })
})

describe('computeDailyInstability', () => {
  const from = ISO('2026-06-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z')
  it('lists only ET days with >= 3 outages, busiest first', () => {
    const mk = (t: string) => ({ start: t, end: new Date(Date.parse(t) + 60000).toISOString() })
    const outages = buildOutagesFromIntervals(
      [
        // 2026-06-15 ET: 4 outages (use times safely inside that ET day)
        mk('2026-06-15T13:00:00Z'),
        mk('2026-06-15T14:00:00Z'),
        mk('2026-06-15T15:00:00Z'),
        mk('2026-06-15T16:00:00Z'),
        // 2026-06-16 ET: only 2 outages → excluded
        mk('2026-06-16T13:00:00Z'),
        mk('2026-06-16T14:00:00Z'),
      ],
      from,
      to,
    )
    const daily = computeDailyInstability(outages, 3)
    expect(daily).toHaveLength(1)
    expect(daily[0].dateEastern).toBe('2026-06-15')
    expect(daily[0].outageCount).toBe(4)
  })
})

describe('computeSla', () => {
  const from = ISO('2026-04-01T00:00:00Z')
  const to = ISO('2026-06-30T00:00:00Z') // 90 days → 99.99% budget ≈ 777.6s

  it('passes when within budget and MTTR under target', () => {
    const outages = buildOutagesFromIntervals([{ start: '2026-05-01T00:00:00Z', end: '2026-05-01T00:05:00Z' }], from, to)
    const s = computeSummary(outages, from, to)
    const sla = computeSla({
      windowStart: from,
      windowEnd: to,
      uptimePercent: s.uptimePercent,
      totalDowntimeSeconds: s.totalDowntimeSeconds,
      outages,
      mttrSeconds: s.mttrSeconds,
    })
    expect(sla.availabilitySlaPercent).toBe(99.99)
    expect(sla.repairSlaHours).toBe(4)
    expect(sla.slaImpactSeconds).toBe(0) // 300s within 777.6s budget
    expect(sla.repairPassed).toBe(true)
    expect(sla.outagesExceedingRepairSla).toBe(0)
  })

  it('fails availability and counts outages over the 4h repair target', () => {
    const outages = buildOutagesFromIntervals(
      [{ start: '2026-05-01T00:00:00Z', end: '2026-05-01T06:00:00Z' }], // 6h outage
      from,
      to,
    )
    const s = computeSummary(outages, from, to)
    const sla = computeSla({
      windowStart: from,
      windowEnd: to,
      uptimePercent: s.uptimePercent,
      totalDowntimeSeconds: s.totalDowntimeSeconds,
      outages,
      mttrSeconds: s.mttrSeconds,
    })
    expect(sla.availabilityPassed).toBe(false)
    expect(sla.differenceFromSla).toBeLessThan(0)
    expect(sla.outagesExceedingRepairSla).toBe(1)
    expect(sla.repairPassed).toBe(false) // 6h MTTR > 4h
    expect(sla.slaImpactSeconds).toBeGreaterThan(0)
  })
})

describe('computePerformance', () => {
  it('computes latency, packet loss, speed, and degradation periods', () => {
    const base = Date.parse('2026-06-01T00:00:00Z')
    const rtd = Array.from({ length: 8 }, (_, i) => ({
      timestamp: new Date(base + i * 3_600_000).toISOString(),
      min: '10',
      median: i >= 5 ? '400' : '20', // last 3 samples spike → latency degradation
      max: i >= 5 ? '500' : '30',
      sent_packet_count: 100,
      lost_packet_count: i >= 5 ? 10 : 0, // last 3 samples 10% loss → loss degradation
    }))
    const speed = [
      { timestamp: new Date(base).toISOString(), values: [200_000_000, 20_000_000] },
      { timestamp: new Date(base + 3_600_000).toISOString(), values: [100_000_000, 10_000_000] },
    ]
    const perf = computePerformance(rtd, speed, { deviceSelected: true })
    expect(perf.available).toBe(true)
    expect(perf.latency.maxMs).toBe(500)
    expect(perf.latency.averageMs).not.toBeNull()
    expect(perf.packetLoss.maxPercent).toBe(10)
    expect(perf.speed?.averageDownloadMbps).toBe(150)
    expect(perf.speed?.minDownloadMbps).toBe(100)
    // two degradation runs (latency + packet loss), each 3 samples long
    expect(perf.degradationPeriods.length).toBeGreaterThanOrEqual(1)
    expect(perf.degradationPeriods.some((d) => d.metric === 'Packet loss')).toBe(true)
  })

  it('notes when no device was selected', () => {
    const perf = computePerformance([], [], { deviceSelected: false })
    expect(perf.available).toBe(false)
    expect(perf.note).toMatch(/No device selected/i)
  })

  it('detects degradation correctly even when samples are supplied out of order', () => {
    const good = (t: string) => ({ timestamp: t, median: '20', max: '30', sent_packet_count: 100, lost_packet_count: 0 })
    const bad = (t: string) => ({ timestamp: t, median: '20', max: '30', sent_packet_count: 100, lost_packet_count: 10 })
    // Two separate 3-sample loss clusters, with a clean sample between them —
    // but shuffled so a naive array-order scan would merge them into one run.
    const rtd = [
      bad('2026-06-10T02:00:00Z'),
      bad('2026-06-01T02:00:00Z'),
      good('2026-06-05T00:00:00Z'),
      bad('2026-06-01T01:00:00Z'),
      bad('2026-06-10T01:00:00Z'),
      bad('2026-06-01T00:00:00Z'),
      bad('2026-06-10T00:00:00Z'),
    ]
    const perf = computePerformance(rtd, [], { deviceSelected: true })
    const lossPeriods = perf.degradationPeriods.filter((d) => d.metric === 'Packet loss')
    expect(lossPeriods).toHaveLength(2) // not merged into one
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
  it('maps known ISP hostname fragments', () => {
    expect(inferIspFromHostname('50-107-49-134.frontiernet.net')).toBe('Frontier Communications')
    expect(inferIspFromHostname('host.rr.com')).toBe('Spectrum (Charter)')
    expect(inferIspFromHostname(null)).toBeNull()
  })
  it('falls back to the registrable domain hint', () => {
    expect(inferIspFromHostname('host.example.co')).toBe('example.co')
  })
})

describe('assembleReport (end-to-end, synthetic telemetry)', () => {
  const from = ISO('2026-03-31T00:00:00Z')
  const to = ISO('2026-06-29T00:00:00Z')

  const telemetry: WanTelemetry = {
    agent: {
      id: 123,
      display_name: 'XNG - Montrose',
      status: { value: 'ONLINE', last_change: '2026-06-01T00:00:00Z' },
      licence: null,
      creation_time: '2025-01-01T00:00:00Z',
      timezone: 'America/New_York',
      version: null,
      wan_info: { ip: '50.107.49.134', hostname: '50-107-49-134.frontiernet.net' },
    },
    device: {
      id: 456,
      display_name: 'Meraki MX68CW',
      hw_address: null,
      ip_addresses: ['192.168.1.1'],
      protocol: 'IP',
      importance: 'VITAL',
      first_seen_on: '2025-01-01T00:00:00Z',
      last_status_change: null,
      status: 'ONLINE',
      type: null,
      details: null,
      snmp_status: null,
      vendor: 'Cisco Meraki',
      model: 'MX68CW',
      os: null,
      user_data: null,
    },
    deviceUptime: {
      uptime: '99.95',
      online_seconds: 7_000_000,
      total_seconds: 7_004_000,
      downtime_intervals: [
        { start: '2026-04-12T14:00:00Z', end: '2026-04-12T14:08:00Z' },
        { start: '2026-06-20T09:00:00Z', end: '2026-06-20T13:30:00Z' }, // > 4h
      ],
    },
    agentUptime: {
      uptime: '99.93',
      online_seconds: 6_999_000,
      total_seconds: 7_004_000,
      downtime_intervals: [{ start: '2026-04-12T14:00:00Z', end: '2026-04-12T14:08:00Z' }],
    },
    deviceEvents: [],
    agentEvents: [],
    rtd: [],
    speed: [],
    fetchErrors: [],
  }

  it('produces a complete report with resolved site info and SLA verdict', () => {
    const report = assembleReport(telemetry, {
      agentId: 123,
      deviceId: 456,
      from,
      to,
      site: { customer: 'Xpress Natural Gas', site: 'XNG - Montrose', address: '3814 North Rd, Montrose, PA' },
    })

    expect(report.site.customer).toBe('Xpress Natural Gas')
    expect(report.site.publicIp).toBe('50.107.49.134')
    expect(report.site.isp).toBe('Frontier Communications') // inferred from hostname
    expect(report.site.gateway).toBe('Cisco Meraki MX68CW')
    expect(report.meta.outageSource).toBe('device') // device selected → device signal

    expect(report.outages).toHaveLength(2)
    expect(report.summary.totalOutages).toBe(2)
    // one outage (4.5h) exceeds the 4h repair SLA
    expect(report.sla.outagesExceedingRepairSla).toBe(1)
    expect(report.executiveSummary.length).toBeGreaterThan(0)
    expect(report.executiveSummary).toContain('Frontier')
  })
})
