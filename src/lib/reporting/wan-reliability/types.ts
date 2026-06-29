/**
 * WAN Reliability Report — shared types and SLA defaults.
 *
 * These types describe the structured report produced by the analyzer/service
 * and consumed by the formatters (JSON / Markdown / plain text / HTML) and the
 * admin UI. Telemetry comes live from Domotz (`src/lib/domotz.ts`); the analyzer
 * (`analyzer.ts`) turns it into these shapes with no I/O.
 */

/** Default SLA targets for an ISP/WAN circuit. Overridable per report. */
export const DEFAULT_AVAILABILITY_SLA_PERCENT = 99.99
export const DEFAULT_REPAIR_SLA_HOURS = 4
/** A day with this many outages or more is flagged as "instability". */
export const DAILY_INSTABILITY_THRESHOLD = 3
/** IANA timezone all customer-facing times are rendered in. */
export const REPORT_TIMEZONE = 'America/New_York'

/** Which Domotz signal the outage timeline was derived from. */
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

export interface WanReliabilityReport {
  meta: {
    generatedAtUtc: string
    timezone: string
    outageSource: OutageSource
    outageSourceLabel: string
    /** Caveats / provenance shown to the reader (e.g. cross-check uptime, sample-data warnings). */
    dataNotes: string[]
  }
  site: SiteInformation
  outages: Outage[]
  summary: SummaryStatistics
  dailyInstability: DailyInstability[]
  sla: SlaComparison
  performance: PerformanceTrends
  executiveSummary: string
}
