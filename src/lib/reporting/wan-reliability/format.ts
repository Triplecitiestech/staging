/**
 * WAN Reliability Report — formatters (presentation only, no business logic).
 *
 * Renders a `WanReliabilityReport` into the four required output formats:
 *   - JSON  (the raw structured object)
 *   - Markdown
 *   - Plain text (formatted to paste straight into ChatGPT / Claude)
 *   - HTML  (printable; the basis for future PDF export)
 *
 * All numbers/labels are precomputed by the analyzer; these functions only
 * arrange them. Colours in the HTML follow the house palette (no amber/yellow).
 */

import type { WanReliabilityReport } from './types'

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export function renderJson(report: WanReliabilityReport): string {
  return JSON.stringify(report, null, 2)
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function renderMarkdown(report: WanReliabilityReport): string {
  const { site, summary, sla, performance, dailyInstability, outages, meta } = report
  const L: string[] = []
  const passFail = (ok: boolean) => (ok ? '✅ PASS' : '❌ FAIL')

  L.push(`# WAN Reliability Report — ${site.customer}`)
  L.push('')
  L.push(`_${site.site} · ${site.reportingPeriod.label}_`)
  L.push('')

  // Site information
  L.push('## Site Information')
  L.push('')
  L.push('| Field | Value |')
  L.push('| --- | --- |')
  L.push(`| Customer | ${site.customer} |`)
  L.push(`| Site | ${site.site} |`)
  L.push(`| Address | ${site.address ?? '—'} |`)
  L.push(`| Gateway | ${site.gateway ?? '—'} |`)
  L.push(`| ISP | ${site.isp ?? '—'} |`)
  L.push(`| Public IP | ${site.publicIp ?? '—'} |`)
  L.push(`| Device monitored | ${site.deviceMonitored ?? '—'} |`)
  L.push(`| Reporting period | ${site.reportingPeriod.label} |`)
  L.push(`| Outage signal | ${meta.outageSourceLabel} |`)
  L.push(`| Report generated | ${site.reportGeneratedEastern} |`)
  L.push('')

  // Outage history
  L.push('## WAN Outage History')
  L.push('')
  if (outages.length === 0) {
    L.push('_No outages recorded in the reporting period._')
  } else {
    L.push('| # | Date | Start (ET) | End (ET) | Duration |')
    L.push('| ---: | --- | --- | --- | --- |')
    outages.forEach((o, i) => {
      L.push(`| ${i + 1} | ${o.dateEastern} | ${o.startEastern} | ${o.endEastern ?? '(ongoing)'} | ${o.durationLabel} |`)
    })
  }
  L.push('')

  // Summary statistics
  L.push('## Summary Statistics')
  L.push('')
  L.push('| Metric | Value |')
  L.push('| --- | --- |')
  L.push(`| Total outages | ${summary.totalOutages} |`)
  L.push(`| Total downtime | ${summary.totalDowntimeLabel} |`)
  L.push(`| Overall uptime | ${summary.uptimePercentLabel} |`)
  L.push(`| Longest outage | ${summary.longestOutageLabel ?? '—'}${summary.longestOutageDateEastern ? ` (${summary.longestOutageDateEastern})` : ''} |`)
  L.push(`| Average outage duration | ${summary.averageOutageLabel ?? '—'} |`)
  L.push(`| Median outage duration | ${summary.medianOutageLabel ?? '—'} |`)
  L.push(`| Mean Time Between Failures (MTBF) | ${summary.mtbfLabel ?? '—'} |`)
  L.push(`| Mean Time To Repair (MTTR) | ${summary.mttrLabel ?? '—'} |`)
  L.push(`| Outages in last 30 days | ${summary.outagesLast30Days} |`)
  L.push(`| Outages in previous 60 days | ${summary.outagesPrevious60Days} |`)
  L.push(`| Trend | ${capitalize(summary.trend)} |`)
  L.push('')
  L.push(`_${summary.trendDetail}_`)
  L.push('')

  // Daily instability
  L.push('## Daily Instability')
  L.push('')
  if (dailyInstability.length === 0) {
    L.push('_No days with 3 or more outages._')
  } else {
    L.push('| Date (ET) | Outages | Downtime |')
    L.push('| --- | ---: | --- |')
    for (const d of dailyInstability) {
      L.push(`| ${d.dateEastern} | ${d.outageCount} | ${d.totalDowntimeLabel} |`)
    }
  }
  L.push('')

  // SLA comparison
  L.push('## SLA Comparison')
  L.push('')
  L.push('| Metric | Value |')
  L.push('| --- | --- |')
  L.push(`| Availability SLA | ${sla.availabilitySlaPercent}% |`)
  L.push(`| Actual uptime | ${sla.actualUptimePercent}% |`)
  L.push(`| Difference from SLA | ${formatSigned(sla.differenceFromSla)} pts |`)
  L.push(`| Availability SLA | ${passFail(sla.availabilityPassed)} |`)
  L.push(`| Repair SLA (MTTR) | ${sla.repairSlaHours}h target → ${sla.mttrSeconds != null ? `${report.summary.mttrLabel}` : '—'} ${sla.repairPassed == null ? '' : sla.repairPassed ? '✅ PASS' : '❌ FAIL'} |`)
  L.push(`| Allowed downtime (budget) | ${sla.allowedDowntimeLabel} |`)
  L.push(`| Actual downtime | ${formatSeconds(sla.actualDowntimeSeconds)} |`)
  L.push(`| Outages exceeding ${sla.repairSlaHours}h | ${sla.outagesExceedingRepairSla} |`)
  L.push(`| Total SLA impact (over budget) | ${sla.slaImpactLabel} |`)
  L.push('')

  // Performance trends
  L.push('## Performance Trends')
  L.push('')
  if (!performance.available) {
    L.push(`_${performance.note ?? 'No performance data available.'}_`)
  } else {
    L.push('| Metric | Value |')
    L.push('| --- | --- |')
    L.push(`| Average latency | ${fmtMs(performance.latency.averageMs)} |`)
    L.push(`| Median latency | ${fmtMs(performance.latency.medianMs)} |`)
    L.push(`| Maximum latency | ${fmtMs(performance.latency.maxMs)} |`)
    L.push(`| Average packet loss | ${fmtPct(performance.packetLoss.averagePercent)} |`)
    L.push(`| Maximum packet loss | ${fmtPct(performance.packetLoss.maxPercent)} |`)
    if (performance.speed) {
      L.push(`| Average download | ${performance.speed.averageDownloadMbps} Mbps |`)
      L.push(`| Average upload | ${performance.speed.averageUploadMbps} Mbps |`)
    }
    L.push('')
    if (performance.degradationPeriods.length > 0) {
      L.push('**Sustained degradation periods:**')
      L.push('')
      for (const d of performance.degradationPeriods) {
        L.push(`- ${d.metric}: ${d.startEastern} → ${d.endEastern} — ${d.detail}`)
      }
    } else {
      L.push('_No sustained degradation periods detected._')
    }
  }
  L.push('')

  // Executive summary
  L.push('## Executive Summary')
  L.push('')
  L.push(report.executiveSummary)
  L.push('')

  // Notes
  if (meta.dataNotes.length > 0) {
    L.push('---')
    L.push('')
    L.push('**Notes**')
    L.push('')
    for (const n of meta.dataNotes) L.push(`- ${n}`)
    L.push('')
  }
  L.push(`_Generated ${meta.generatedAtUtc} · times shown in ${meta.timezone} · data source: Domotz._`)

  return L.join('\n')
}

// ---------------------------------------------------------------------------
// Plain text (paste into ChatGPT / Claude)
// ---------------------------------------------------------------------------

export function renderPlainText(report: WanReliabilityReport): string {
  const { site, summary, sla, performance, dailyInstability, outages, meta } = report
  const L: string[] = []
  const rule = '='.repeat(64)
  const thin = '-'.repeat(64)
  const kv = (k: string, v: string) => `${(k + ':').padEnd(28)} ${v}`

  L.push(rule)
  L.push(`WAN RELIABILITY REPORT — ${site.customer.toUpperCase()}`)
  L.push(rule)
  L.push('')

  L.push('SITE INFORMATION')
  L.push(thin)
  L.push(kv('Customer', site.customer))
  L.push(kv('Site', site.site))
  L.push(kv('Address', site.address ?? '—'))
  L.push(kv('Gateway', site.gateway ?? '—'))
  L.push(kv('ISP', site.isp ?? '—'))
  L.push(kv('Public IP', site.publicIp ?? '—'))
  L.push(kv('Device monitored', site.deviceMonitored ?? '—'))
  L.push(kv('Reporting period', site.reportingPeriod.label))
  L.push(kv('Outage signal', meta.outageSourceLabel))
  L.push(kv('Report generated', site.reportGeneratedEastern))
  L.push('')

  L.push('WAN OUTAGE HISTORY')
  L.push(thin)
  if (outages.length === 0) {
    L.push('No outages recorded in the reporting period.')
  } else {
    L.push(`${'#'.padEnd(4)}${'Date'.padEnd(12)}${'Start (ET)'.padEnd(16)}${'End (ET)'.padEnd(16)}Duration`)
    outages.forEach((o, i) => {
      L.push(
        `${String(i + 1).padEnd(4)}${o.dateEastern.padEnd(12)}${stripZone(o.startEastern).padEnd(16)}${stripZone(o.endEastern ?? '(ongoing)').padEnd(16)}${o.durationLabel}`,
      )
    })
  }
  L.push('')

  L.push('SUMMARY STATISTICS')
  L.push(thin)
  L.push(kv('Total outages', String(summary.totalOutages)))
  L.push(kv('Total downtime', summary.totalDowntimeLabel))
  L.push(kv('Overall uptime', summary.uptimePercentLabel))
  L.push(kv('Longest outage', `${summary.longestOutageLabel ?? '—'}${summary.longestOutageDateEastern ? ` (${summary.longestOutageDateEastern})` : ''}`))
  L.push(kv('Average outage duration', summary.averageOutageLabel ?? '—'))
  L.push(kv('Median outage duration', summary.medianOutageLabel ?? '—'))
  L.push(kv('MTBF', summary.mtbfLabel ?? '—'))
  L.push(kv('MTTR', summary.mttrLabel ?? '—'))
  L.push(kv('Outages last 30 days', String(summary.outagesLast30Days)))
  L.push(kv('Outages previous 60 days', String(summary.outagesPrevious60Days)))
  L.push(kv('Trend', `${capitalize(summary.trend)} — ${summary.trendDetail}`))
  L.push('')

  L.push('DAILY INSTABILITY (3+ outages in a day)')
  L.push(thin)
  if (dailyInstability.length === 0) {
    L.push('No days with 3 or more outages.')
  } else {
    for (const d of dailyInstability) {
      L.push(`${d.dateEastern}   ${d.outageCount} outages   (${d.totalDowntimeLabel} downtime)`)
    }
  }
  L.push('')

  L.push('SLA COMPARISON')
  L.push(thin)
  L.push(kv('Availability SLA target', `${sla.availabilitySlaPercent}%`))
  L.push(kv('Actual uptime', `${sla.actualUptimePercent}%`))
  L.push(kv('Difference from SLA', `${formatSigned(sla.differenceFromSla)} pts`))
  L.push(kv('Availability result', sla.availabilityPassed ? 'PASS' : 'FAIL'))
  L.push(kv('Repair SLA target', `${sla.repairSlaHours} hour MTTR`))
  L.push(kv('Actual MTTR', summary.mttrLabel ?? '—'))
  L.push(kv('Repair result', sla.repairPassed == null ? 'N/A (no outages)' : sla.repairPassed ? 'PASS' : 'FAIL'))
  L.push(kv('Allowed downtime (budget)', sla.allowedDowntimeLabel))
  L.push(kv('Actual downtime', formatSeconds(sla.actualDowntimeSeconds)))
  L.push(kv(`Outages over ${sla.repairSlaHours}h`, String(sla.outagesExceedingRepairSla)))
  L.push(kv('Total SLA impact', sla.slaImpactLabel))
  L.push('')

  L.push('PERFORMANCE TRENDS')
  L.push(thin)
  if (!performance.available) {
    L.push(performance.note ?? 'No performance data available.')
  } else {
    L.push(kv('Average latency', fmtMs(performance.latency.averageMs)))
    L.push(kv('Median latency', fmtMs(performance.latency.medianMs)))
    L.push(kv('Maximum latency', fmtMs(performance.latency.maxMs)))
    L.push(kv('Average packet loss', fmtPct(performance.packetLoss.averagePercent)))
    L.push(kv('Maximum packet loss', fmtPct(performance.packetLoss.maxPercent)))
    if (performance.speed) {
      L.push(kv('Average download', `${performance.speed.averageDownloadMbps} Mbps`))
      L.push(kv('Average upload', `${performance.speed.averageUploadMbps} Mbps`))
    }
    if (performance.degradationPeriods.length > 0) {
      L.push('')
      L.push('Sustained degradation periods:')
      for (const d of performance.degradationPeriods) {
        L.push(`  - ${d.metric}: ${d.startEastern} -> ${d.endEastern} (${d.detail})`)
      }
    }
  }
  L.push('')

  L.push('EXECUTIVE SUMMARY')
  L.push(thin)
  L.push(wrap(report.executiveSummary, 64))
  L.push('')

  if (meta.dataNotes.length > 0) {
    L.push('NOTES')
    L.push(thin)
    for (const n of meta.dataNotes) L.push(wrap(`- ${n}`, 64))
    L.push('')
  }
  L.push(`Generated ${meta.generatedAtUtc} | times in ${meta.timezone} | source: Domotz`)

  return L.join('\n')
}

// ---------------------------------------------------------------------------
// HTML (printable; future PDF)
// ---------------------------------------------------------------------------

export function renderHtml(report: WanReliabilityReport): string {
  const { site, summary, sla, performance, dailyInstability, outages, meta } = report
  const badge = (ok: boolean) =>
    `<span class="badge ${ok ? 'pass' : 'fail'}">${ok ? 'PASS' : 'FAIL'}</span>`
  const card = (label: string, value: string, sub = '') =>
    `<div class="card"><div class="cv">${esc(value)}</div><div class="cl">${esc(label)}</div>${sub ? `<div class="cs">${esc(sub)}</div>` : ''}</div>`

  const outageRows =
    outages.length === 0
      ? `<tr><td colspan="5" class="muted">No outages recorded in the reporting period.</td></tr>`
      : outages
          .map(
            (o, i) =>
              `<tr><td>${i + 1}</td><td>${esc(o.dateEastern)}</td><td>${esc(o.startEastern)}</td><td>${esc(o.endEastern ?? '(ongoing)')}</td><td>${esc(o.durationLabel)}</td></tr>`,
          )
          .join('')

  const dailyRows =
    dailyInstability.length === 0
      ? `<tr><td colspan="3" class="muted">No days with 3 or more outages.</td></tr>`
      : dailyInstability
          .map((d) => `<tr><td>${esc(d.dateEastern)}</td><td class="num">${d.outageCount}</td><td class="num">${esc(d.totalDowntimeLabel)}</td></tr>`)
          .join('')

  const degradation =
    performance.available && performance.degradationPeriods.length > 0
      ? `<h3>Sustained degradation</h3><ul>${performance.degradationPeriods
          .map((d) => `<li><strong>${esc(d.metric)}</strong>: ${esc(d.startEastern)} → ${esc(d.endEastern)} — ${esc(d.detail)}</li>`)
          .join('')}</ul>`
      : ''

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WAN Reliability — ${esc(site.customer)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;background:#f1f5f9;margin:0;padding:32px;line-height:1.5}
  .wrap{max-width:920px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  header{background:linear-gradient(135deg,#0f172a,#0e7490);color:#fff;padding:32px}
  header .kicker{font-size:12px;letter-spacing:1px;color:#67e8f9;font-weight:700}
  header h1{margin:6px 0 4px;font-size:24px}
  header .meta{color:#cbd5e1;font-size:14px}
  .body{padding:28px 32px}
  h2{font-size:16px;color:#0e7490;border-bottom:2px solid #e2e8f0;padding-bottom:6px;margin:32px 0 12px}
  h3{font-size:13px;color:#334155;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.5px}
  .cards{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0 4px}
  .card{flex:1;min-width:150px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px}
  .cv{font-size:24px;font-weight:800;color:#0f172a}
  .cl{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
  .cs{font-size:11px;color:#94a3b8;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin:6px 0 4px;font-size:13px}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #eef2f7}
  th{background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  td.num{text-align:right}
  .muted{color:#94a3b8}
  .kv{width:100%;font-size:14px}
  .kv td:first-child{color:#64748b;width:40%}
  .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700}
  .badge.pass{background:#dcfce7;color:#166534}
  .badge.fail{background:#fee2e2;color:#991b1b}
  .summary-box{background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;padding:14px 18px;font-size:14px;color:#155e75}
  .note{font-size:12px;color:#64748b}
  footer{padding:20px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
  @media print{body{background:#fff;padding:0}.wrap{box-shadow:none}}
</style></head>
<body><div class="wrap">
<header>
  <div class="kicker">TRIPLE CITIES TECH · WAN RELIABILITY REPORT</div>
  <h1>${esc(site.customer)}</h1>
  <div class="meta">${esc(site.site)} · ${esc(site.reportingPeriod.label)} · generated ${esc(site.reportGeneratedEastern)}</div>
</header>
<div class="body">

  <h2>Site Information</h2>
  <table class="kv">
    <tr><td>Customer</td><td>${esc(site.customer)}</td></tr>
    <tr><td>Site</td><td>${esc(site.site)}</td></tr>
    <tr><td>Address</td><td>${esc(site.address ?? '—')}</td></tr>
    <tr><td>Gateway</td><td>${esc(site.gateway ?? '—')}</td></tr>
    <tr><td>ISP</td><td>${esc(site.isp ?? '—')}</td></tr>
    <tr><td>Public IP</td><td>${esc(site.publicIp ?? '—')}</td></tr>
    <tr><td>Device monitored</td><td>${esc(site.deviceMonitored ?? '—')}</td></tr>
    <tr><td>Outage signal</td><td>${esc(meta.outageSourceLabel)}</td></tr>
  </table>

  <h2>Headline</h2>
  <div class="cards">
    ${card('Uptime', summary.uptimePercentLabel, `${sla.availabilitySlaPercent}% SLA`)}
    ${card('Outages', String(summary.totalOutages), `${site.reportingPeriod.days}-day window`)}
    ${card('Total downtime', summary.totalDowntimeLabel)}
    ${card('MTTR', summary.mttrLabel ?? '—', `${sla.repairSlaHours}h target`)}
    ${card('MTBF', summary.mtbfLabel ?? '—')}
    ${card('Trend', capitalize(summary.trend))}
  </div>

  <h2>Executive Summary</h2>
  <div class="summary-box">${esc(report.executiveSummary)}</div>

  <h2>WAN Outage History</h2>
  <table>
    <thead><tr><th>#</th><th>Date</th><th>Start (ET)</th><th>End (ET)</th><th>Duration</th></tr></thead>
    <tbody>${outageRows}</tbody>
  </table>

  <h2>Summary Statistics</h2>
  <table class="kv">
    <tr><td>Total outages</td><td>${summary.totalOutages}</td></tr>
    <tr><td>Total downtime</td><td>${esc(summary.totalDowntimeLabel)}</td></tr>
    <tr><td>Overall uptime</td><td>${esc(summary.uptimePercentLabel)}</td></tr>
    <tr><td>Longest outage</td><td>${esc(summary.longestOutageLabel ?? '—')}${summary.longestOutageDateEastern ? ` (${esc(summary.longestOutageDateEastern)})` : ''}</td></tr>
    <tr><td>Average outage</td><td>${esc(summary.averageOutageLabel ?? '—')}</td></tr>
    <tr><td>Median outage</td><td>${esc(summary.medianOutageLabel ?? '—')}</td></tr>
    <tr><td>MTBF</td><td>${esc(summary.mtbfLabel ?? '—')}</td></tr>
    <tr><td>MTTR</td><td>${esc(summary.mttrLabel ?? '—')}</td></tr>
    <tr><td>Outages last 30 days</td><td>${summary.outagesLast30Days}</td></tr>
    <tr><td>Outages previous 60 days</td><td>${summary.outagesPrevious60Days}</td></tr>
    <tr><td>Trend</td><td>${capitalize(summary.trend)} — ${esc(summary.trendDetail)}</td></tr>
  </table>

  <h2>Daily Instability</h2>
  <table>
    <thead><tr><th>Date (ET)</th><th class="num">Outages</th><th class="num">Downtime</th></tr></thead>
    <tbody>${dailyRows}</tbody>
  </table>

  <h2>SLA Comparison</h2>
  <table class="kv">
    <tr><td>Availability SLA</td><td>${sla.availabilitySlaPercent}% &nbsp; ${badge(sla.availabilityPassed)}</td></tr>
    <tr><td>Actual uptime</td><td>${sla.actualUptimePercent}% (${formatSigned(sla.differenceFromSla)} pts vs SLA)</td></tr>
    <tr><td>Repair SLA (MTTR)</td><td>${sla.repairSlaHours}h target — ${esc(summary.mttrLabel ?? '—')} &nbsp; ${sla.repairPassed == null ? '<span class="muted">N/A</span>' : badge(sla.repairPassed)}</td></tr>
    <tr><td>Allowed downtime (budget)</td><td>${esc(sla.allowedDowntimeLabel)}</td></tr>
    <tr><td>Actual downtime</td><td>${esc(formatSeconds(sla.actualDowntimeSeconds))}</td></tr>
    <tr><td>Outages over ${sla.repairSlaHours}h</td><td>${sla.outagesExceedingRepairSla}</td></tr>
    <tr><td>Total SLA impact</td><td>${esc(sla.slaImpactLabel)}</td></tr>
  </table>

  <h2>Performance Trends</h2>
  ${
    performance.available
      ? `<table class="kv">
    <tr><td>Average latency</td><td>${esc(fmtMs(performance.latency.averageMs))}</td></tr>
    <tr><td>Median latency</td><td>${esc(fmtMs(performance.latency.medianMs))}</td></tr>
    <tr><td>Maximum latency</td><td>${esc(fmtMs(performance.latency.maxMs))}</td></tr>
    <tr><td>Average packet loss</td><td>${esc(fmtPct(performance.packetLoss.averagePercent))}</td></tr>
    <tr><td>Maximum packet loss</td><td>${esc(fmtPct(performance.packetLoss.maxPercent))}</td></tr>
    ${performance.speed ? `<tr><td>Average download</td><td>${performance.speed.averageDownloadMbps} Mbps</td></tr><tr><td>Average upload</td><td>${performance.speed.averageUploadMbps} Mbps</td></tr>` : ''}
  </table>${degradation}`
      : `<p class="muted">${esc(performance.note ?? 'No performance data available.')}</p>`
  }

</div>
<footer>
  ${meta.dataNotes.map((n) => `<div>• ${esc(n)}</div>`).join('')}
  <div style="margin-top:6px">Generated ${esc(meta.generatedAtUtc)} · times in ${esc(meta.timezone)} · data source: Domotz.</div>
</footer>
</div></body></html>`
}

// ---------------------------------------------------------------------------
// Shared little helpers
// ---------------------------------------------------------------------------

export type ReportFormat = 'json' | 'markdown' | 'text' | 'html'

/** Render a report in the requested format. */
export function renderReport(report: WanReliabilityReport, format: ReportFormat): string {
  switch (format) {
    case 'markdown':
      return renderMarkdown(report)
    case 'text':
      return renderPlainText(report)
    case 'html':
      return renderHtml(report)
    case 'json':
    default:
      return renderJson(report)
  }
}

export function contentTypeFor(format: ReportFormat): string {
  switch (format) {
    case 'html':
      return 'text/html; charset=utf-8'
    case 'json':
      return 'application/json; charset=utf-8'
    default:
      return 'text/plain; charset=utf-8'
  }
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (sec && !h) parts.push(`${sec}s`)
  return parts.join(' ') || '0s'
}

function fmtMs(v: number | null): string {
  return v == null ? '—' : `${v} ms`
}

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${v}%`
}

/** Drop the trailing timezone abbreviation for the compact plain-text outage table. */
function stripZone(s: string): string {
  return s.replace(/\s+[A-Z]{2,4}$/, '')
}

function wrap(text: string, width: number): string {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if (line.length + w.length + 1 > width) {
      if (line) lines.push(line)
      line = w
    } else {
      line = line ? `${line} ${w}` : w
    }
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
