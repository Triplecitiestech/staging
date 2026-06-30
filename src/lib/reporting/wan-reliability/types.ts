/**
 * Site Connectivity & Stability Report — shared types and SLA defaults.
 *
 * IMPORTANT framing: this report measures SITE CONNECTIVITY as seen by the
 * on-site Domotz collector — NOT per-ISP-circuit reliability. At a site with WAN
 * failover, a primary-circuit outage that failed over is invisible to Domotz
 * (the firewall keeps routing), so the report must caveat that rather than imply
 * the circuit is healthy. See `failover.ts` and `docs/reference/WAN_RELIABILITY_REPORT.md`.
 *
 * Telemetry comes live from Domotz (`src/lib/domotz.ts`); failover events come
 * from ingested Domotz `agent_wan_change` webhooks (`src/lib/domotz-events.ts`).
 * The analyzer (`analyzer.ts`) turns it into these shapes with no I/O.
 */

import type { FailoverAssessment } from './failover'

/**
 * SLA targets. Only applied as a pass/fail when a site is confirmed single-WAN
 * (otherwise reachability is not a valid proxy for circuit availability).
 */
export const DEFAULT_AVAILABILITY_SLA_PERCENT = 99.99
export const DEFAULT_REPAIR_SLA_HOURS = 4
/** A day with this many connectivity-loss events or more is flagged as "instability". */
export const DAILY_INSTABILITY_THRESHOLD = 3
/** IANA timezone all customer-facing times are rendered in. */
export const REPORT_TIMEZONE = 'America/New_York'

/**
 * Which Domotz signal a timeline was derived from:
 *  - 'agent'  = on-site collector connectivity (site fully dark) — the headline.
 *  - 'device' = a monitored device's LAN reachability — secondary detail.
 */
export type OutageSource = 'agent' | 'device'

/** Caller-supplied site metadata. Anything omitted is resolved from Domotz where possible. */
export interface SiteInfoInput {
  customer?: string
  site?: string
  address?: string
  gateway?: string
  isp?: string
  publicIp?: string
  deviceMonitored?: string
}

export interface ReportingPeriod {
  /** Window start/end, ISO-8601 UTC. */
  fromUtc: string
  toUtc: string
  /** Whole days in the window. */
  days: number
  /** Human label, e.g. "Mar 31 – Jun 29, 2026 (90 days)". */
  label: string
}

export interface SiteInformation {
  customer: string
  site: string
  address: string | null
  gateway: string | null
  isp: string | null
  publicIp: string | null
  deviceMonitored: string | null
  agentId: number
  deviceId: number | null
  reportingPeriod: ReportingPeriod
  /** Generation time, ET-formatted for display. */
  reportGeneratedEastern: string
}

/** One WAN outage. Times kept in both UTC (source of truth) and ET (display). */
export interface Outage {
  startUtc: string
  endUtc: string | null
  /** ET calendar date of the outage start, YYYY-MM-DD. */
  dateEastern: string
  /** ET clock time of start/end, e.g. "2:14:05 PM EDT". */
  startEastern: string
  endEastern: string | null
  durationSeconds: number
  durationLabel: string
  /** True when the circuit was still down at the end of the window. */
  ongoing: boolean
}

export type Trend = 'increasing' | 'decreasing' | 'stable'

export interface SummaryStatistics {
  totalOutages: number
  totalDowntimeSeconds: number
  totalDowntimeLabel: string
  /** Uptime % computed from the outage intervals over the window. */
  uptimePercent: number
  uptimePercentLabel: string
  /** Uptime % as reported directly by Domotz (cross-check), if available. */
  domotzReportedUptimePercent: number | null
  longestOutageSeconds: number | null
  longestOutageLabel: string | null
  longestOutageDateEastern: string | null
  averageOutageSeconds: number | null
  averageOutageLabel: string | null
  medianOutageSeconds: number | null
  medianOutageLabel: string | null
  /** Mean Time Between Failures — mean up-time per failure. */
  mtbfSeconds: number | null
  mtbfLabel: string | null
  /** Mean Time To Repair — mean outage duration. */
  mttrSeconds: number | null
  mttrLabel: string | null
  outagesLast30Days: number
  outagesPrevious60Days: number
  trend: Trend
  trendDetail: string
}

export interface DailyInstability {
  dateEastern: string
  outageCount: number
  totalDowntimeSeconds: number
  totalDowntimeLabel: string
}

export interface SlaComparison {
  availabilitySlaPercent: number
  repairSlaHours: number
  actualUptimePercent: number
  /** actual − target, in percentage points (negative = below SLA). */
  differenceFromSla: number
  availabilityPassed: boolean
  /** Downtime budget the availability SLA permits over the window. */
  allowedDowntimeSeconds: number
  allowedDowntimeLabel: string
  actualDowntimeSeconds: number
  /** Downtime beyond the SLA budget (0 if within budget). */
  slaImpactSeconds: number
  slaImpactLabel: string
  mttrSeconds: number | null
  /** Whether MTTR met the repair SLA (null when there were no outages). */
  repairPassed: boolean | null
  outagesExceedingRepairSla: number
}

export interface LatencyTrend {
  averageMs: number | null
  medianMs: number | null
  maxMs: number | null
  sampleCount: number
}

export interface PacketLossTrend {
  averagePercent: number | null
  maxPercent: number | null
  sampleCount: number
}

export interface SpeedTrend {
  averageDownloadMbps: number | null
  averageUploadMbps: number | null
  minDownloadMbps: number | null
  sampleCount: number
}

export interface DegradationPeriod {
  startUtc: string
  endUtc: string
  startEastern: string
  endEastern: string
  /** What degraded (e.g. "Packet loss", "Latency"). */
  metric: string
  /** Short human description, e.g. "avg 7.3% loss over 6 samples". */
  detail: string
}

export interface PerformanceTrends {
  available: boolean
  note: string | null
  latency: LatencyTrend
  packetLoss: PacketLossTrend
  speed: SpeedTrend | null
  degradationPeriods: DegradationPeriod[]
}

/**
 * How much of the requested window we actually have data for. Domotz does not
 * document a retention period, so coverage is measured empirically from the
 * earliest data point — we never imply 100% over a span with no data.
 */
export interface DataCoverage {
  requestedFromUtc: string
  requestedToUtc: string
  requestedDays: number
  /** Earliest data point observed across the pulled signals (null = no data). */
  actualFromUtc: string | null
  actualToUtc: string | null
  coveredDays: number
  /** True when observed coverage ≈ the requested window. */
  complete: boolean
  note: string | null
}

/** A failover event derived from a Domotz `agent_wan_change` webhook. */
export interface FailoverEventRecord {
  timestampUtc: string
  dateEastern: string
  timeEastern: string
  oldIp: string | null
  newIp: string | null
  oldProvider: string | null
  newProvider: string | null
}

/**
 * Failover activity from ingested `agent_wan_change` webhooks — the closest
 * signal to "the primary circuit dropped" at a failover site. Only meaningful
 * when webhook ingestion was active during the window.
 */
export interface FailoverActivity {
  /** True when ingestion was active for at least part of the window. */
  available: boolean
  /** When we first started receiving Domotz events for this site (coverage floor). */
  ingestionSinceUtc: string | null
  eventCount: number
  events: FailoverEventRecord[]
  /** Always-present explanation of availability and how to enable it. */
  note: string
}

/** Flags when outage durations look like a polling-cadence artifact, not real lengths. */
export interface CadenceArtifact {
  suspected: boolean
  note: string | null
}

/** Secondary signal: LAN reachability of a monitored device (e.g. the gateway). */
export interface DeviceReachability {
  deviceName: string | null
  summary: SummaryStatistics
  outages: Outage[]
  /** Set when collector downtime overlapped, making some device state unknowable. */
  note: string | null
}

export interface WanReliabilityReport {
  meta: {
    generatedAtUtc: string
    timezone: string
    /** The headline signal. Defaults to collector connectivity (site fully dark). */
    outageSource: OutageSource
    outageSourceLabel: string
    /** Failover-capability assessment that governs caveats and SLA applicability. */
    failover: FailoverAssessment
    /** Prominent, must-read caveats (failover masking, coverage gaps, sample data). */
    caveats: string[]
    /** Lower-priority provenance/cross-check notes. */
    dataNotes: string[]
  }
  site: SiteInformation
  /** Headline: site connectivity-loss events (collector went fully dark). */
  outages: Outage[]
  summary: SummaryStatistics
  /** Secondary: monitored-device LAN reachability (null when no device selected). */
  deviceReachability: DeviceReachability | null
  /** Primary-circuit failover evidence from ingested webhooks. */
  failoverActivity: FailoverActivity
  dailyInstability: DailyInstability[]
  cadence: CadenceArtifact
  dataCoverage: DataCoverage
  /** SLA verdict — only populated for confirmed single-WAN sites; null otherwise. */
  sla: SlaComparison | null
  /** Why the SLA verdict is or isn't shown. */
  slaNote: string
  performance: PerformanceTrends
  executiveSummary: string
}
