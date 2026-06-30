/**
 * Site Connectivity & Stability — executive summary generator (pure).
 *
 * Honesty rules baked in:
 *  - Never claims ISP-circuit SLA compliance from reachability at a failover or
 *    unknown-capability site.
 *  - Never prints "no escalation required" off reachability alone when the
 *    primary circuit isn't visible.
 *  - Always states the visibility limit (failover masking) and data coverage.
 *
 * Deterministic — no AI call required; the plain-text format is built to paste
 * into ChatGPT/Claude if a narrative rewrite is wanted.
 */

import type { FailoverAssessment } from './failover'
import type {
  DailyInstability,
  DataCoverage,
  FailoverActivity,
  PerformanceTrends,
  SiteInformation,
  SlaComparison,
  SummaryStatistics,
} from './types'

export function buildExecutiveSummary(parts: {
  site: SiteInformation
  failover: FailoverAssessment
  summary: SummaryStatistics
  deviceReachability: { summary: SummaryStatistics } | null
  failoverActivity: FailoverActivity
  dataCoverage: DataCoverage
  sla: SlaComparison | null
  performance: PerformanceTrends
  dailyInstability: DailyInstability[]
}): string {
  const { site, failover, summary, failoverActivity, dataCoverage, sla, performance, dailyInstability } = parts
  const isp = site.isp || 'the ISP'
  const sentences: string[] = []

  // 1. What we measured + coverage.
  const span = dataCoverage.complete
    ? `the ${site.reportingPeriod.days}-day period`
    : `${dataCoverage.coveredDays} of the requested ${site.reportingPeriod.days} days (the only span with data)`
  if (summary.totalOutages === 0) {
    sentences.push(`Over ${span}, ${site.site} stayed continuously reachable to our on-site monitoring (${summary.uptimePercentLabel} connectivity), with no full-site outages recorded.`)
  } else {
    sentences.push(`Over ${span}, ${site.site} went fully unreachable ${summary.totalOutages} time(s) totaling ${summary.totalDowntimeLabel} (${summary.uptimePercentLabel} site connectivity).`)
  }

  // 2. Failover framing — the central honesty point.
  if (failover.capability === 'failover_capable') {
    sentences.push(`This site has WAN failover (${failover.matchedReason}), so this connectivity figure does NOT measure the primary ${isp} circuit — a primary outage that failed over keeps the site reachable and is invisible here.`)
    if (failoverActivity.available && failoverActivity.eventCount > 0) {
      sentences.push(`Domotz did detect ${failoverActivity.eventCount} failover event(s) (public-IP/ISP changes) in the covered period — direct evidence the primary circuit dropped at least that many times.`)
    } else if (failoverActivity.available) {
      sentences.push('No failover events were detected in the covered period, but absence of detection is not proof the circuit was clean.')
    } else {
      sentences.push('Failover detection is not yet enabled (no Domotz failover webhooks ingested), so primary-circuit drops currently cannot be counted at all.')
    }
  } else if (failover.capability === 'unknown') {
    sentences.push(`Failover capability for this site is unconfirmed, so treat the connectivity figure as a floor — it may hide primary-circuit outages that failed over, and it is not ISP-circuit reliability.`)
  } else {
    // single_wan
    if (sla) {
      sentences.push(sla.availabilityPassed
        ? `This site is single-WAN, so connectivity is a reasonable ISP proxy: it met the ${sla.availabilitySlaPercent}% availability target for the covered span.`
        : `This site is single-WAN, so connectivity is a reasonable ISP proxy: it fell ${Math.abs(sla.differenceFromSla).toFixed(4)} points short of the ${sla.availabilitySlaPercent}% availability target for the covered span.`)
    } else {
      sentences.push('This site is marked single-WAN, so connectivity is a reasonable proxy for the ISP circuit.')
    }
  }

  // 3. Notable findings.
  const notable: string[] = []
  if (summary.longestOutageLabel && summary.longestOutageDateEastern) {
    notable.push(`longest full-site outage ${summary.longestOutageLabel} on ${summary.longestOutageDateEastern}`)
  }
  if (dailyInstability.length > 0) {
    notable.push(`${dailyInstability.length} day(s) with repeated drops (worst: ${dailyInstability[0].outageCount} on ${dailyInstability[0].dateEastern})`)
  }
  if (performance.available && performance.packetLoss.maxPercent != null && performance.packetLoss.maxPercent >= 2) {
    notable.push(`packet loss peaked at ${performance.packetLoss.maxPercent}%`)
  }
  if (notable.length > 0) sentences.push(`Notable: ${notable.join('; ')}.`)

  // 4. Recommendation — honest about visibility.
  sentences.push(buildRecommendation({ site, failover, summary, failoverActivity, sla, isp }))

  return sentences.join(' ')
}

function buildRecommendation(p: {
  site: SiteInformation
  failover: FailoverAssessment
  summary: SummaryStatistics
  failoverActivity: FailoverActivity
  sla: SlaComparison | null
  isp: string
}): string {
  const { failover, summary, failoverActivity, sla, isp } = p

  if (failover.capability === 'single_wan' && sla && !sla.availabilityPassed) {
    return `Recommendation: open a circuit-quality case with ${isp} citing the outage history above.`
  }
  if (failover.capability === 'failover_capable') {
    if (failoverActivity.available && failoverActivity.eventCount > 0) {
      return `Recommendation: if ${isp} is the primary uplink, open a circuit-quality case citing the ${failoverActivity.eventCount} failover event timestamps below; reachability alone understates the impact.`
    }
    if (!failoverActivity.available) {
      return 'Recommendation: enable the Domotz failover webhook for this site (see setup notes) so primary-circuit drops can be measured; until then this report cannot confirm ISP-circuit health.'
    }
  }
  if (summary.totalOutages > 0) {
    return `Recommendation: investigate the ${summary.totalOutages} full-site outage(s) — these mean the site lost all connectivity (power, collector, or simultaneous loss of every uplink), which is distinct from a single-circuit drop.`
  }
  if (failover.capability === 'unknown') {
    return 'Recommendation: confirm whether this site has WAN failover and mark it accordingly — that determines whether this connectivity record can be read as ISP-circuit reliability.'
  }
  return 'Recommendation: no action indicated from the connectivity data, noting the visibility limits above.'
}
