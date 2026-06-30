/**
 * Site Connectivity & Stability Report — formatters (presentation only).
 *
 * Renders a `WanReliabilityReport` into JSON / Markdown / plain text (paste into
 * ChatGPT/Claude) / printable HTML. All numbers/labels are precomputed by the
 * analyzer; these functions only arrange them, lead with the must-read caveats,
 * and never imply ISP-circuit health that the data can't support.
 */

import type { FailoverAssessment } from './failover'
import type { WanReliabilityReport } from './types'

const TITLE = 'Site Connectivity & Stability'

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export function renderJson(report: WanReliabilityReport): string {
  return JSON.stringify(report, null, 2)
}

function capabilityLabel(f: FailoverAssessment): string {
  if (f.capability === 'single_wan') return 'Single-WAN (no failover)'
  if (f.capability === 'failover_capable') return `Failover-capable${f.matchedReason ? ` — ${f.matchedReason}` : ''}`
  return 'Unknown (treated as failover-capable)'
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function renderMarkdown(report: WanReliabilityReport): string {
  const { site, summary, sla, slaNote, performance, dailyInstability, outages, meta, failoverActivity, deviceReachability, dataCoverage, cadence } = report
  const L: string[] = []

  L.push(`# ${TITLE} — ${site.customer}`)
  L.push('')
  L.push(`_${site.site} · ${site.reportingPeriod.label}_`)
  L.push('')

  // Must-read caveats first.
  if (meta.caveats.length > 0) {
    L.push('> ⚠️ **Read first**')
    for (const c of meta.caveats) L.push(`> - ${c}`)
    L.push('')
  }

  // Site information
  L.push('## Site Information')
  L.push('')
  L.push('| Field | Value |')
  L.push('| --- | --- |')
  L.push(`| Customer | ${site.customer} |`)
  L.push(`| Site | ${site.site} |`)
  L.push(`| Address | ${site.address ?? '—'} |`)
  L.push(`| Gateway | ${site.gateway ?? '—'} |`)
  L.push(`| WAN configuration | ${capabilityLabel(meta.failover)} |`)
  L.push(`| ISP (current) | ${site.isp ?? '—'} |`)
  L.push(`| Public IP (current) | ${site.publicIp ?? '—'} |`)
  L.push(`| Device monitored | ${site.deviceMonitored ?? '—'} |`)
  L.push(`| Measured signal | ${meta.outageSourceLabel} |`)
  L.push(`| Data coverage | ${dataCoverage.coveredDays} of ${dataCoverage.requestedDays} days |`)
  L.push(`| Report generated | ${site.reportGeneratedEastern} |`)
  L.push('')

  // Failover activity (the closest signal to primary-circuit drops)
  L.push('## Failover Activity (primary-circuit drop evidence)')
  L.push('')
  L.push(`_${failoverActivity.note}_`)
  L.push('')
  if (failoverActivity.available && failoverActivity.events.length > 0) {
    L.push('| # | Date | Time (ET) | From ISP/IP | To ISP/IP |')
    L.push('| ---: | --- | --- | --- | --- |')
    failoverActivity.events.forEach((e, i) => {
      L.push(`| ${i + 1} | ${e.dateEastern} | ${e.timeEastern} | ${fmtEndpoint(e.oldProvider, e.oldIp)} | ${fmtEndpoint(e.newProvider, e.newIp)} |`)
    })
    L.push('')
  }

  // Site connectivity (headline)
  L.push('## Full-Site Outages (collector lost all connectivity)')
  L.push('')
  if (outages.length === 0) {
    L.push('_No full-site connectivity loss recorded in the covered window._')
  } else {
    L.push('| # | Date | Start (ET) | End (ET) | Duration |')
    L.push('| ---: | --- | --- | --- | --- |')
    outages.forEach((o, i) => {
      L.push(`| ${i + 1} | ${o.dateEastern} | ${o.startEastern} | ${o.endEastern ?? '(ongoing)'} | ${o.durationLabel} |`)
    })
  }
  L.push('')

  // Connectivity summary
  L.push('## Connectivity Summary')
  L.push('')
  L.push('| Metric | Value |')
  L.push('| --- | --- |')
  L.push(`| Full-site outages | ${summary.totalOutages} |`)
  L.push(`| Total time unreachable | ${summary.totalDowntimeLabel} |`)
  L.push(`| Site connectivity uptime | ${summary.uptimePercentLabel} |`)
  L.push(`| Longest outage | ${summary.longestOutageLabel ?? '—'}${summary.longestOutageDateEastern ? ` (${summary.longestOutageDateEastern})` : ''} |`)
  L.push(`| Average / median outage | ${summary.averageOutageLabel ?? '—'} / ${summary.medianOutageLabel ?? '—'} |`)
  L.push(`| MTBF / MTTR | ${summary.mtbfLabel ?? '—'} / ${summary.mttrLabel ?? '—'} |`)
  L.push(`| Outages last 30 / prev 60 days | ${summary.outagesLast30Days} / ${summary.outagesPrevious60Days} |`)
  L.push(`| Trend | ${capitalize(summary.trend)} |`)
  if (cadence.suspected) L.push(`| ⚠ Duration caveat | ${cadence.note} |`)
  L.push('')

  // Device reachability (secondary)
  if (deviceReachability) {
    L.push('## Monitored Device Reachability (secondary, LAN-side)')
    L.push('')
    L.push(`Device: **${deviceReachability.deviceName ?? '—'}** · reachability uptime **${deviceReachability.summary.uptimePercentLabel}** · ${deviceReachability.summary.totalOutages} reachability drop(s).`)
    if (deviceReachability.note) L.push(`\n_${deviceReachability.note}_`)
    L.push('')
  }

  // Daily instability
  L.push('## Days With Repeated Drops')
  L.push('')
  if (dailyInstability.length === 0) {
    L.push('_No day had 3 or more full-site outages._')
  } else {
    L.push('| Date (ET) | Outages | Downtime |')
    L.push('| --- | ---: | --- |')
    for (const d of dailyInstability) L.push(`| ${d.dateEastern} | ${d.outageCount} | ${d.totalDowntimeLabel} |`)
  }
  L.push('')

  // SLA (conditional)
  L.push('## SLA Comparison')
  L.push('')
  if (sla) {
    L.push('| Metric | Value |')
    L.push('| --- | --- |')
    L.push(`| Availability SLA | ${sla.availabilitySlaPercent}% → ${sla.availabilityPassed ? '✅ PASS' : '❌ FAIL'} |`)
    L.push(`| Actual connectivity uptime | ${sla.actualUptimePercent}% (${formatSigned(sla.differenceFromSla)} pts) |`)
    L.push(`| Repair SLA (MTTR) | ${sla.repairSlaHours}h → ${summary.mttrLabel ?? '—'} ${sla.repairPassed == null ? '' : sla.repairPassed ? '✅ PASS' : '❌ FAIL'} |`)
    L.push(`| Outages exceeding ${sla.repairSlaHours}h | ${sla.outagesExceedingRepairSla} |`)
    L.push(`| Total SLA impact (over budget) | ${sla.slaImpactLabel} |`)
    L.push('')
  }
  L.push(`_${slaNote}_`)
  L.push('')

  // Performance
  L.push('## Performance Trends')
  L.push('')
  if (!performance.available) {
    L.push(`_${performance.note ?? 'No performance data available.'}_`)
  } else {
    L.push('| Metric | Value |')
    L.push('| --- | --- |')
    L.push(`| Average / median / max latency | ${fmtMs(performance.latency.averageMs)} / ${fmtMs(performance.latency.medianMs)} / ${fmtMs(performance.latency.maxMs)} |`)
    L.push(`| Average / max packet loss | ${fmtPct(performance.packetLoss.averagePercent)} / ${fmtPct(performance.packetLoss.maxPercent)} |`)
    if (performance.speed) L.push(`| Average download / upload | ${performance.speed.averageDownloadMbps} / ${performance.speed.averageUploadMbps} Mbps |`)
    L.push('')
    if (performance.degradationPeriods.length > 0) {
      L.push('**Sustained degradation:**')
      L.push('')
      for (const d of performance.degradationPeriods) L.push(`- ${d.metric}: ${d.startEastern} → ${d.endEastern} — ${d.detail}`)
      L.push('')
    }
  }

  // Executive summary
  L.push('## Executive Summary')
  L.push('')
  L.push(report.executiveSummary)
  L.push('')

  if (meta.dataNotes.length > 0) {
    L.push('---')
    L.push('')
    L.push('**Notes**')
    L.push('')
    for (const n of meta.dataNotes) L.push(`- ${n}`)
    L.push('')
  }
  L.push(`_Generated ${meta.generatedAtUtc} · times in ${meta.timezone} · data source: Domotz (reachability + ingested failover webhooks)._`)
  return L.join('\n')
}

// ---------------------------------------------------------------------------
// Plain text (paste into ChatGPT / Claude)
// ---------------------------------------------------------------------------

export function renderPlainText(report: WanReliabilityReport): string {
  const { site, summary, sla, slaNote, performance, dailyInstability, outages, meta, failoverActivity, deviceReachability, dataCoverage, cadence } = report
  const L: string[] = []
  const rule = '='.repeat(66)
  const thin = '-'.repeat(66)
  const kv = (k: string, v: string) => `${(k + ':').padEnd(30)} ${v}`

  L.push(rule)
  L.push(`${TITLE.toUpperCase()} — ${site.customer.toUpperCase()}`)
  L.push(rule)
  L.push('')

  if (meta.caveats.length > 0) {
    L.push('!! READ FIRST')
    L.push(thin)
    for (const c of meta.caveats) L.push(wrap(`- ${c}`, 66))
    L.push('')
  }

  L.push('SITE INFORMATION')
  L.push(thin)
  L.push(kv('Customer', site.customer))
  L.push(kv('Site', site.site))
  L.push(kv('Address', site.address ?? '—'))
  L.push(kv('Gateway', site.gateway ?? '—'))
  L.push(kv('WAN configuration', capabilityLabel(meta.failover)))
  L.push(kv('ISP (current)', site.isp ?? '—'))
  L.push(kv('Public IP (current)', site.publicIp ?? '—'))
  L.push(kv('Device monitored', site.deviceMonitored ?? '—'))
  L.push(kv('Measured signal', meta.outageSourceLabel))
  L.push(kv('Data coverage', `${dataCoverage.coveredDays} of ${dataCoverage.requestedDays} days`))
  L.push(kv('Report generated', site.reportGeneratedEastern))
  L.push('')

  L.push('FAILOVER ACTIVITY (primary-circuit drop evidence)')
  L.push(thin)
  L.push(wrap(failoverActivity.note, 66))
  if (failoverActivity.available && failoverActivity.events.length > 0) {
    L.push('')
    failoverActivity.events.forEach((e, i) => {
      L.push(`${String(i + 1).padEnd(3)}${e.dateEastern} ${stripZone(e.timeEastern).padEnd(12)} ${fmtEndpoint(e.oldProvider, e.oldIp)} -> ${fmtEndpoint(e.newProvider, e.newIp)}`)
    })
  }
  L.push('')

  L.push('FULL-SITE OUTAGES (collector lost all connectivity)')
  L.push(thin)
  if (outages.length === 0) {
    L.push('No full-site connectivity loss recorded in the covered window.')
  } else {
    L.push(`${'#'.padEnd(4)}${'Date'.padEnd(12)}${'Start (ET)'.padEnd(16)}${'End (ET)'.padEnd(16)}Duration`)
    outages.forEach((o, i) => {
      L.push(`${String(i + 1).padEnd(4)}${o.dateEastern.padEnd(12)}${stripZone(o.startEastern).padEnd(16)}${stripZone(o.endEastern ?? '(ongoing)').padEnd(16)}${o.durationLabel}`)
    })
  }
  L.push('')

  L.push('CONNECTIVITY SUMMARY')
  L.push(thin)
  L.push(kv('Full-site outages', String(summary.totalOutages)))
  L.push(kv('Total time unreachable', summary.totalDowntimeLabel))
  L.push(kv('Site connectivity uptime', summary.uptimePercentLabel))
  L.push(kv('Longest outage', `${summary.longestOutageLabel ?? '—'}${summary.longestOutageDateEastern ? ` (${summary.longestOutageDateEastern})` : ''}`))
  L.push(kv('Average / median outage', `${summary.averageOutageLabel ?? '—'} / ${summary.medianOutageLabel ?? '—'}`))
  L.push(kv('MTBF / MTTR', `${summary.mtbfLabel ?? '—'} / ${summary.mttrLabel ?? '—'}`))
  L.push(kv('Outages last30 / prev60', `${summary.outagesLast30Days} / ${summary.outagesPrevious60Days}`))
  L.push(kv('Trend', `${capitalize(summary.trend)} — ${summary.trendDetail}`))
  if (cadence.suspected) L.push(wrap(`NOTE: ${cadence.note}`, 66))
  L.push('')

  if (deviceReachability) {
    L.push('MONITORED DEVICE REACHABILITY (secondary, LAN-side)')
    L.push(thin)
    L.push(kv('Device', deviceReachability.deviceName ?? '—'))
    L.push(kv('Reachability uptime', deviceReachability.summary.uptimePercentLabel))
    L.push(kv('Reachability drops', String(deviceReachability.summary.totalOutages)))
    if (deviceReachability.note) L.push(wrap(deviceReachability.note, 66))
    L.push('')
  }

  L.push('DAYS WITH REPEATED DROPS (3+ in a day)')
  L.push(thin)
  if (dailyInstability.length === 0) L.push('None.')
  else for (const d of dailyInstability) L.push(`${d.dateEastern}   ${d.outageCount} outages   (${d.totalDowntimeLabel})`)
  L.push('')

  L.push('SLA COMPARISON')
  L.push(thin)
  if (sla) {
    L.push(kv('Availability SLA', `${sla.availabilitySlaPercent}% -> ${sla.availabilityPassed ? 'PASS' : 'FAIL'}`))
    L.push(kv('Actual uptime', `${sla.actualUptimePercent}% (${formatSigned(sla.differenceFromSla)} pts)`))
    L.push(kv('Repair SLA (MTTR)', `${sla.repairSlaHours}h -> ${summary.mttrLabel ?? '—'} ${sla.repairPassed == null ? '' : sla.repairPassed ? 'PASS' : 'FAIL'}`))
    L.push(kv(`Outages over ${sla.repairSlaHours}h`, String(sla.outagesExceedingRepairSla)))
    L.push(kv('Total SLA impact', sla.slaImpactLabel))
  }
  L.push(wrap(slaNote, 66))
  L.push('')

  L.push('PERFORMANCE TRENDS')
  L.push(thin)
  if (!performance.available) {
    L.push(wrap(performance.note ?? 'No performance data available.', 66))
  } else {
    L.push(kv('Latency avg/median/max', `${fmtMs(performance.latency.averageMs)} / ${fmtMs(performance.latency.medianMs)} / ${fmtMs(performance.latency.maxMs)}`))
    L.push(kv('Packet loss avg/max', `${fmtPct(performance.packetLoss.averagePercent)} / ${fmtPct(performance.packetLoss.maxPercent)}`))
    if (performance.speed) L.push(kv('Download/upload avg', `${performance.speed.averageDownloadMbps} / ${performance.speed.averageUploadMbps} Mbps`))
    if (performance.degradationPeriods.length > 0) {
      L.push('Sustained degradation:')
      for (const d of performance.degradationPeriods) L.push(`  - ${d.metric}: ${d.startEastern} -> ${d.endEastern} (${d.detail})`)
    }
  }
  L.push('')

  L.push('EXECUTIVE SUMMARY')
  L.push(thin)
  L.push(wrap(report.executiveSummary, 66))
  L.push('')

  if (meta.dataNotes.length > 0) {
    L.push('NOTES')
    L.push(thin)
    for (const n of meta.dataNotes) L.push(wrap(`- ${n}`, 66))
    L.push('')
  }
  L.push(`Generated ${meta.generatedAtUtc} | times in ${meta.timezone} | source: Domotz`)
  return L.join('\n')
}

// ---------------------------------------------------------------------------
// HTML (printable; future PDF)
// ---------------------------------------------------------------------------

export function renderHtml(report: WanReliabilityReport): string {
  const { site, summary, sla, slaNote, performance, dailyInstability, outages, meta, failoverActivity, deviceReachability, dataCoverage, cadence } = report
  const badge = (ok: boolean) => `<span class="badge ${ok ? 'pass' : 'fail'}">${ok ? 'PASS' : 'FAIL'}</span>`
  const card = (label: string, value: string, sub = '') =>
    `<div class="card"><div class="cv">${esc(value)}</div><div class="cl">${esc(label)}</div>${sub ? `<div class="cs">${esc(sub)}</div>` : ''}</div>`

  const caveatBlock = meta.caveats.length
    ? `<div class="warn"><div class="warn-h">⚠ Read first — what this report can and cannot tell you</div><ul>${meta.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>`
    : ''

  const failoverRows =
    failoverActivity.available && failoverActivity.events.length
      ? failoverActivity.events
          .map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.dateEastern)}</td><td>${esc(e.timeEastern)}</td><td>${esc(fmtEndpoint(e.oldProvider, e.oldIp))}</td><td>${esc(fmtEndpoint(e.newProvider, e.newIp))}</td></tr>`)
          .join('')
      : ''

  const outageRows =
    outages.length === 0
      ? `<tr><td colspan="5" class="muted">No full-site connectivity loss recorded in the covered window.</td></tr>`
      : outages.map((o, i) => `<tr><td>${i + 1}</td><td>${esc(o.dateEastern)}</td><td>${esc(o.startEastern)}</td><td>${esc(o.endEastern ?? '(ongoing)')}</td><td>${esc(o.durationLabel)}</td></tr>`).join('')

  const dailyRows =
    dailyInstability.length === 0
      ? `<tr><td colspan="3" class="muted">No day had 3 or more full-site outages.</td></tr>`
      : dailyInstability.map((d) => `<tr><td>${esc(d.dateEastern)}</td><td class="num">${d.outageCount}</td><td class="num">${esc(d.totalDowntimeLabel)}</td></tr>`).join('')

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE)} — ${esc(site.customer)}</title>
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
  .warn{background:#fff1f2;border:1px solid #fecdd3;border-left:4px solid #e11d48;border-radius:8px;padding:14px 18px;margin:18px 0}
  .warn-h{font-weight:700;color:#9f1239;margin-bottom:6px}
  .warn ul{margin:0;padding-left:18px;color:#9f1239;font-size:13px}
  .summary-box{background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;padding:14px 18px;font-size:14px;color:#155e75}
  .note{font-size:12px;color:#64748b;margin-top:6px}
  footer{padding:20px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
  @media print{body{background:#fff;padding:0}.wrap{box-shadow:none}}
</style></head>
<body><div class="wrap">
<header>
  <div class="kicker">TRIPLE CITIES TECH · ${esc(TITLE.toUpperCase())}</div>
  <h1>${esc(site.customer)}</h1>
  <div class="meta">${esc(site.site)} · ${esc(site.reportingPeriod.label)} · ${esc(capabilityLabel(meta.failover))} · generated ${esc(site.reportGeneratedEastern)}</div>
</header>
<div class="body">

  ${caveatBlock}

  <h2>Headline</h2>
  <div class="cards">
    ${card('Site connectivity', summary.uptimePercentLabel, `${dataCoverage.coveredDays}/${dataCoverage.requestedDays} days covered`)}
    ${card('Full-site outages', String(summary.totalOutages))}
    ${card('Failovers detected', failoverActivity.available ? String(failoverActivity.eventCount) : 'n/a', failoverActivity.available ? 'primary-circuit drops' : 'webhook not enabled')}
    ${card('Time unreachable', summary.totalDowntimeLabel)}
    ${card('MTTR', summary.mttrLabel ?? '—')}
  </div>

  <h2>Executive Summary</h2>
  <div class="summary-box">${esc(report.executiveSummary)}</div>

  <h2>Site Information</h2>
  <table class="kv">
    <tr><td>Customer</td><td>${esc(site.customer)}</td></tr>
    <tr><td>Site</td><td>${esc(site.site)}</td></tr>
    <tr><td>Address</td><td>${esc(site.address ?? '—')}</td></tr>
    <tr><td>Gateway</td><td>${esc(site.gateway ?? '—')}</td></tr>
    <tr><td>WAN configuration</td><td>${esc(capabilityLabel(meta.failover))}</td></tr>
    <tr><td>ISP (current)</td><td>${esc(site.isp ?? '—')}</td></tr>
    <tr><td>Public IP (current)</td><td>${esc(site.publicIp ?? '—')}</td></tr>
    <tr><td>Device monitored</td><td>${esc(site.deviceMonitored ?? '—')}</td></tr>
    <tr><td>Measured signal</td><td>${esc(meta.outageSourceLabel)}</td></tr>
  </table>

  <h2>Failover Activity <span class="muted" style="font-size:12px">(primary-circuit drop evidence)</span></h2>
  <p class="note">${esc(failoverActivity.note)}</p>
  ${
    failoverRows
      ? `<table><thead><tr><th>#</th><th>Date</th><th>Time (ET)</th><th>From ISP/IP</th><th>To ISP/IP</th></tr></thead><tbody>${failoverRows}</tbody></table>`
      : ''
  }

  <h2>Full-Site Outages <span class="muted" style="font-size:12px">(collector lost all connectivity)</span></h2>
  <table><thead><tr><th>#</th><th>Date</th><th>Start (ET)</th><th>End (ET)</th><th>Duration</th></tr></thead><tbody>${outageRows}</tbody></table>

  <h2>Connectivity Summary</h2>
  <table class="kv">
    <tr><td>Full-site outages</td><td>${summary.totalOutages}</td></tr>
    <tr><td>Total time unreachable</td><td>${esc(summary.totalDowntimeLabel)}</td></tr>
    <tr><td>Site connectivity uptime</td><td>${esc(summary.uptimePercentLabel)}</td></tr>
    <tr><td>Longest outage</td><td>${esc(summary.longestOutageLabel ?? '—')}${summary.longestOutageDateEastern ? ` (${esc(summary.longestOutageDateEastern)})` : ''}</td></tr>
    <tr><td>Average / median</td><td>${esc(summary.averageOutageLabel ?? '—')} / ${esc(summary.medianOutageLabel ?? '—')}</td></tr>
    <tr><td>MTBF / MTTR</td><td>${esc(summary.mtbfLabel ?? '—')} / ${esc(summary.mttrLabel ?? '—')}</td></tr>
    <tr><td>Outages last 30 / prev 60</td><td>${summary.outagesLast30Days} / ${summary.outagesPrevious60Days}</td></tr>
    <tr><td>Trend</td><td>${capitalize(summary.trend)} — ${esc(summary.trendDetail)}</td></tr>
    ${cadence.suspected ? `<tr><td>Duration caveat</td><td class="muted">${esc(cadence.note ?? '')}</td></tr>` : ''}
  </table>

  ${
    deviceReachability
      ? `<h2>Monitored Device Reachability <span class="muted" style="font-size:12px">(secondary, LAN-side)</span></h2>
  <table class="kv">
    <tr><td>Device</td><td>${esc(deviceReachability.deviceName ?? '—')}</td></tr>
    <tr><td>Reachability uptime</td><td>${esc(deviceReachability.summary.uptimePercentLabel)}</td></tr>
    <tr><td>Reachability drops</td><td>${deviceReachability.summary.totalOutages}</td></tr>
  </table>${deviceReachability.note ? `<p class="note">${esc(deviceReachability.note)}</p>` : ''}`
      : ''
  }

  <h2>Days With Repeated Drops</h2>
  <table><thead><tr><th>Date (ET)</th><th class="num">Outages</th><th class="num">Downtime</th></tr></thead><tbody>${dailyRows}</tbody></table>

  <h2>SLA Comparison</h2>
  ${
    sla
      ? `<table class="kv">
    <tr><td>Availability SLA</td><td>${sla.availabilitySlaPercent}% &nbsp; ${badge(sla.availabilityPassed)}</td></tr>
    <tr><td>Actual uptime</td><td>${sla.actualUptimePercent}% (${formatSigned(sla.differenceFromSla)} pts)</td></tr>
    <tr><td>Repair SLA (MTTR)</td><td>${sla.repairSlaHours}h — ${esc(summary.mttrLabel ?? '—')} &nbsp; ${sla.repairPassed == null ? '<span class="muted">N/A</span>' : badge(sla.repairPassed)}</td></tr>
    <tr><td>Outages over ${sla.repairSlaHours}h</td><td>${sla.outagesExceedingRepairSla}</td></tr>
    <tr><td>Total SLA impact</td><td>${esc(sla.slaImpactLabel)}</td></tr>
  </table>`
      : ''
  }
  <p class="note">${esc(slaNote)}</p>

  <h2>Performance Trends</h2>
  ${
    performance.available
      ? `<table class="kv">
    <tr><td>Latency avg / median / max</td><td>${esc(fmtMs(performance.latency.averageMs))} / ${esc(fmtMs(performance.latency.medianMs))} / ${esc(fmtMs(performance.latency.maxMs))}</td></tr>
    <tr><td>Packet loss avg / max</td><td>${esc(fmtPct(performance.packetLoss.averagePercent))} / ${esc(fmtPct(performance.packetLoss.maxPercent))}</td></tr>
    ${performance.speed ? `<tr><td>Download / upload avg</td><td>${performance.speed.averageDownloadMbps} / ${performance.speed.averageUploadMbps} Mbps</td></tr>` : ''}
  </table>${performance.degradationPeriods.length ? `<ul>${performance.degradationPeriods.map((d) => `<li><strong>${esc(d.metric)}</strong>: ${esc(d.startEastern)} → ${esc(d.endEastern)} — ${esc(d.detail)}</li>`).join('')}</ul>` : ''}`
      : `<p class="muted">${esc(performance.note ?? 'No performance data available.')}</p>`
  }

</div>
<footer>
  ${meta.dataNotes.map((n) => `<div>• ${esc(n)}</div>`).join('')}
  <div style="margin-top:6px">Generated ${esc(meta.generatedAtUtc)} · times in ${esc(meta.timezone)} · data source: Domotz (reachability + ingested failover webhooks).</div>
</footer>
</div></body></html>`
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export type ReportFormat = 'json' | 'markdown' | 'text' | 'html'

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

function fmtEndpoint(provider: string | null, ip: string | null): string {
  if (provider && ip) return `${provider} (${ip})`
  return provider || ip || '—'
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function fmtMs(v: number | null): string {
  return v == null ? '—' : `${v} ms`
}

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${v}%`
}

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
