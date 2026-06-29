/**
 * WAN Reliability Report — executive summary generator (pure).
 *
 * Produces a short, plain-language management summary from the computed report
 * sections. Deterministic by design: no AI call is required to generate the
 * report, and the plain-text format is built to be pasted into ChatGPT/Claude
 * if a narrative rewrite is wanted.
 */

import type {
  DailyInstability,
  PerformanceTrends,
  SiteInformation,
  SlaComparison,
  SummaryStatistics,
} from './types'

export function buildExecutiveSummary(parts: {
  site: SiteInformation
  summary: SummaryStatistics
  sla: SlaComparison
  performance: PerformanceTrends
  dailyInstability: DailyInstability[]
}): string {
  const { site, summary, sla, performance, dailyInstability } = parts
  const isp = site.isp || 'the circuit provider'
  const circuit = site.deviceMonitored || site.gateway || 'the WAN circuit'
  const sentences: string[] = []

  // 1. Overall reliability.
  if (summary.totalOutages === 0) {
    sentences.push(
      `Over the ${site.reportingPeriod.days}-day reporting period, ${site.site} recorded no WAN outages on ${circuit}, for ${summary.uptimePercentLabel} uptime.`,
    )
  } else {
    sentences.push(
      `Over the ${site.reportingPeriod.days}-day reporting period, ${site.site} experienced ${summary.totalOutages} WAN outage${summary.totalOutages === 1 ? '' : 's'} totaling ${summary.totalDowntimeLabel} of downtime, for ${summary.uptimePercentLabel} uptime.`,
    )
  }

  // 2. SLA compliance.
  if (sla.availabilityPassed && (sla.repairPassed ?? true)) {
    sentences.push(
      `This meets the ${sla.availabilitySlaPercent}% availability target, so ${isp} appears compliant with its service-level agreement for this window.`,
    )
  } else {
    const failures: string[] = []
    if (!sla.availabilityPassed) {
      failures.push(
        `availability fell ${Math.abs(sla.differenceFromSla).toFixed(4)} points short of the ${sla.availabilitySlaPercent}% target`,
      )
    }
    if (sla.repairPassed === false) {
      failures.push(`average time to restore (${summary.mttrLabel}) exceeded the ${sla.repairSlaHours}-hour repair target`)
    }
    sentences.push(`${capitalize(failures.join(' and '))}, so ${isp} did not meet its service-level agreement for this window.`)
  }

  // 3. Trend / whether reliability is improving.
  if (summary.trend === 'decreasing') {
    sentences.push('Reliability is improving: outages in the last 30 days are down versus the prior 60 days.')
  } else if (summary.trend === 'increasing') {
    sentences.push('Reliability is getting worse: outages in the last 30 days are up versus the prior 60 days.')
  } else {
    sentences.push('Outage frequency has been broadly stable across the period.')
  }

  // 4. Major incidents.
  const incidents: string[] = []
  if (summary.longestOutageLabel && summary.longestOutageDateEastern) {
    incidents.push(`the longest single outage was ${summary.longestOutageLabel} on ${summary.longestOutageDateEastern}`)
  }
  if (sla.outagesExceedingRepairSla > 0) {
    incidents.push(
      `${sla.outagesExceedingRepairSla} outage${sla.outagesExceedingRepairSla === 1 ? '' : 's'} ran longer than the ${sla.repairSlaHours}-hour repair target`,
    )
  }
  if (dailyInstability.length > 0) {
    const worst = dailyInstability[0]
    incidents.push(
      `${dailyInstability.length} day${dailyInstability.length === 1 ? '' : 's'} saw repeated flapping (worst: ${worst.outageCount} outages on ${worst.dateEastern})`,
    )
  }
  if (performance.packetLoss.maxPercent != null && performance.packetLoss.maxPercent >= 2) {
    incidents.push(`packet loss peaked at ${performance.packetLoss.maxPercent}%`)
  }
  if (incidents.length > 0) {
    sentences.push(`Notable findings: ${incidents.join('; ')}.`)
  }

  // 5. Escalation recommendation.
  const escalate =
    !sla.availabilityPassed ||
    sla.repairPassed === false ||
    sla.outagesExceedingRepairSla > 0 ||
    summary.trend === 'increasing' ||
    dailyInstability.length > 0 ||
    (performance.packetLoss.maxPercent != null && performance.packetLoss.maxPercent >= 5)

  if (escalate) {
    sentences.push(
      `Recommendation: open a circuit-quality case with ${isp}, citing the outage history and SLA shortfall above, and request a root-cause review${site.publicIp ? ` for the circuit on ${site.publicIp}` : ''}.`,
    )
  } else {
    sentences.push(`Recommendation: no escalation required at this time; continue monitoring ${circuit}.`)
  }

  return sentences.join(' ')
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}
