/**
 * WAN Reliability Report module.
 *
 * Generates historical WAN/ISP reliability & SLA reports for any monitored
 * customer site, from the existing Domotz integration. Architecture:
 *   - types.ts             — report shapes + SLA defaults
 *   - analyzer.ts          — pure stats (outages, MTBF/MTTR, SLA, trend, perf)
 *   - executive-summary.ts — pure narrative generation
 *   - service.ts           — live Domotz fetch + assembly (I/O)
 *   - format.ts            — JSON / Markdown / plain-text / HTML renderers
 *
 * Usage:
 *   const client = new DomotzClient()
 *   const report = await generateWanReliabilityReport(client, { agentId, deviceId, from, to })
 *   const md = renderMarkdown(report)
 */

export * from './types'
export {
  assessFailoverCapability,
  type WanModeOverride,
  type FailoverCapability,
  type FailoverAssessment,
} from './failover'
export {
  generateWanReliabilityReport,
  fetchWanTelemetry,
  assembleReport,
  inferIspFromHostname,
  type GenerateReportOptions,
  type WanTelemetry,
} from './service'
export {
  buildOutagesFromIntervals,
  buildOutagesFromEvents,
  computeSummary,
  computeTrend,
  computeDailyInstability,
  computeDataCoverage,
  detectCadenceArtifact,
  pairFailoverEpisodes,
  computeSla,
  computePerformance,
  formatDuration,
  formatEasternTime,
  formatEasternDateTime,
  formatEasternDay,
  easternDateKey,
  median,
  mean,
  round,
} from './analyzer'
export { buildExecutiveSummary } from './executive-summary'
export {
  renderJson,
  renderMarkdown,
  renderPlainText,
  renderHtml,
  renderReport,
  contentTypeFor,
  type ReportFormat,
} from './format'
