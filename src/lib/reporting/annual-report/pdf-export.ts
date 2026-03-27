/**
 * PDF export for Annual Service Reports.
 * Consumes ProcessedReport — the SAME source of truth as the browser renderer.
 * NO filtering logic in this file. All visibility/variant decisions come from the processor.
 */

import { ProcessedReport } from './types';

export function generateAnnualReportHTML(r: ProcessedReport): string {
  const sec = (key: string) => r.sections.find(s => s.key === key);
  const isVis = (key: string) => sec(key)?.visible ?? false;

  // Number visible main sections for the PDF
  let sectionNum = 0;
  const nextNum = () => ++sectionNum;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${r.metadata.companyName} — Annual Service Report — ${r.metadata.periodStart} to ${r.metadata.periodEnd}</title>
<style>
  @page { margin: 0.6in 0.75in; size: letter; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-break { page-break-before: always; }
    .no-print { display: none !important; }
    .avoid-break { page-break-inside: avoid; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #1e293b; background: #ffffff; line-height: 1.6; font-size: 10.5pt;
  }
  .cover {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0e7490 100%);
    color: #ffffff; padding: 48px 56px 56px; display: flex; flex-direction: column;
    justify-content: center; border-radius: 0 0 16px 16px; margin-bottom: 32px;
  }
  .cover .brand-name { font-size: 11pt; color: #06b6d4; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 20px; }
  .cover h1 { font-size: 28pt; font-weight: 800; margin-bottom: 4px; line-height: 1.2; }
  .cover h2 { font-size: 15pt; font-weight: 400; color: #67e8f9; margin-bottom: 20px; }
  .cover .meta { font-size: 10pt; color: #94a3b8; }
  .content { padding: 0 8px; }
  .section { margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; background: #ffffff; }
  .section-title { font-size: 13pt; font-weight: 700; color: #0e7490; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
  .narrative { font-size: 10.5pt; color: #475569; line-height: 1.7; margin-bottom: 12px; }
  .stat-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-bottom: 16px; }
  .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; text-align: center; min-width: 140px; }
  .stat-label { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .stat-value { font-size: 20pt; font-weight: 800; color: #0f172a; margin-top: 2px; line-height: 1.2; font-variant-numeric: tabular-nums; }
  .stat-value.na { color: #94a3b8; font-size: 14pt; font-style: italic; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; table-layout: fixed; }
  th { background: #f1f5f9; color: #475569; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 10pt; color: #334155; font-variant-numeric: tabular-nums; }
  tr:last-child td { border-bottom: none; }
  .td-right { text-align: right; }
  .th-right { text-align: right; }
  .th-center { text-align: center; }
  .td-center { text-align: center; }
  .coverage-available { color: #10b981; font-weight: 700; }
  .coverage-missing { color: #ef4444; font-weight: 700; }
  .health-container { display: flex; align-items: center; gap: 20px; margin-bottom: 14px; }
  .health-score { display: flex; align-items: center; justify-content: center; width: 72px; height: 72px; border-radius: 50%; font-size: 24pt; font-weight: 800; color: #ffffff; flex-shrink: 0; }
  .health-healthy { background: #10b981; }
  .health-watch { background: #0891b2; }
  .health-at-risk { background: #f97316; }
  .health-critical { background: #dc2626; }
  .internal-banner { background: #fff7ed; border: 1px solid #fdba74; color: #c2410c; padding: 8px 16px; border-radius: 8px; font-size: 9pt; font-weight: 700; text-align: center; margin-bottom: 20px; letter-spacing: 1px; }
  .data-notice { background: #eff6ff; border: 1px solid #93c5fd; color: #1e40af; padding: 10px 16px; border-radius: 8px; font-size: 9pt; margin-bottom: 16px; }
  .svc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .svc-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
  .svc-card-name { font-size: 9.5pt; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
  .svc-card-desc { font-size: 8.5pt; color: #64748b; line-height: 1.4; }
  .svc-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; margin-right: 6px; vertical-align: middle; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8.5pt; font-weight: 600; margin: 2px; }
  .badge-sev-critical { background: #fef2f2; color: #dc2626; }
  .badge-sev-high { background: #fff1f2; color: #e11d48; }
  .badge-sev-medium { background: #ecfeff; color: #0891b2; }
  .badge-sev-low { background: #f8fafc; color: #64748b; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 8.5pt; text-align: center; }
  .footer p { margin-bottom: 2px; }
  .download-bar { position: fixed; top: 0; left: 0; right: 0; background: #0f172a; padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .download-bar span { color: #94a3b8; font-size: 10pt; }
  .download-btn { background: #0891b2; color: #ffffff; border: none; padding: 8px 20px; border-radius: 6px; font-size: 10pt; font-weight: 600; cursor: pointer; }
  .download-btn:hover { background: #0e7490; }
  .spacer-for-bar { height: 52px; }
</style>
</head>
<body>

<div class="download-bar no-print">
  <span>${esc(r.metadata.companyName)} — Annual Service Report</span>
  <button class="download-btn" onclick="window.print()">&#128196; Download PDF</button>
</div>
<div class="spacer-for-bar no-print"></div>

<!-- COVER -->
<div class="cover">
  <div class="brand-name">Triple Cities Tech</div>
  <h2>Annual Service Report</h2>
  <h1>${esc(r.metadata.companyName)}</h1>
  <div class="meta">${r.metadata.periodStart} to ${r.metadata.periodEnd}</div>
</div>

<div class="content">

${r.metadata.isInternal ? '<div class="internal-banner">&#9888; INTERNAL DOCUMENT — NOT FOR CUSTOMER DISTRIBUTION</div>' : ''}

<!-- DATA COVERAGE -->
${r.dataSources.length > 0 ? `
<div class="section avoid-break">
  <div class="section-title">${sec('dataSources')?.title || 'Services Covered'}</div>
  ${r.metadata.isInternal
    ? '<div class="narrative">This report aggregates data from multiple systems. The table below shows what data is available for the reporting period.</div>'
    : '<div class="narrative">The following managed services are active for your organization during this reporting period.</div>'}
  <table>
    <thead><tr><th>${r.metadata.isInternal ? 'Data Source' : 'Service'}</th><th class="th-center" style="width:100px">Status</th><th>Coverage</th>${r.metadata.isInternal ? '<th>Notes</th>' : ''}</tr></thead>
    <tbody>
    ${r.dataSources.map(ds => {
      const statusClass = ds.available ? 'coverage-available' : 'coverage-missing';
      const statusLabel = ds.available ? (r.metadata.isInternal ? 'Available' : 'Active') : 'Not Available';
      const coverage = ds.coverageStart && ds.coverageEnd ? `${ds.coverageStart} to ${ds.coverageEnd}` : '—';
      const label = r.metadata.isInternal ? (ds.internalSource || ds.source) : ds.source;
      return `<tr><td>${esc(label)}</td><td class="td-center ${statusClass}">${statusLabel}</td><td>${coverage}</td>${r.metadata.isInternal ? `<td style="font-size:9pt;color:#64748b">${ds.note || '—'}</td>` : ''}</tr>`;
    }).join('')}
    </tbody>
  </table>
</div>` : ''}

<!-- EXECUTIVE SUMMARY -->
${r.summaryCards.length > 0 ? `
<div class="section avoid-break">
  <div class="section-title">${nextNum()}. Executive Summary</div>
  <div class="stat-grid">
    ${r.summaryCards.map(c => statCard(c.label, c.value)).join('')}
  </div>
  ${r.topIssueCategories.length > 0 ? `<div class="narrative"><strong>Top Issue Categories:</strong> ${r.topIssueCategories.join(', ')}</div>` : ''}
  ${r.keyTrends.map(t => `<div class="narrative">${esc(t)}</div>`).join('')}
  ${r.dataCoverageNotes.length > 0 ? `<div class="data-notice"><strong>Data Coverage Notes:</strong><br/>${r.dataCoverageNotes.map(n => `&#8226; ${esc(n)}`).join('<br/>')}</div>` : ''}
</div>` : ''}

<!-- TICKETING -->
${isVis('ticketing') ? `
<div class="section page-break">
  <div class="section-title">${nextNum()}. ${sec('ticketing')!.title}</div>
  ${!sec('ticketing')!.hasData ? '<div class="data-notice">No tickets found for this company in the specified period.</div>' : `
  <div class="stat-grid">
    ${statCard('Tickets Created', r.ticketing.totalTickets)}
    ${statCard('First Touch Rate', r.ticketing.responseMetrics.firstTouchResolutionRate !== null ? `${r.ticketing.responseMetrics.firstTouchResolutionRate}%` : '—')}
    ${r.showInternalColumns ? statCard('Avg Response', r.ticketing.responseMetrics.avgFirstResponseMinutes !== null ? fmtMin(r.ticketing.responseMetrics.avgFirstResponseMinutes) : '—') : ''}
    ${r.showInternalColumns ? statCard('Avg Resolution', r.ticketing.responseMetrics.avgResolutionMinutes !== null ? fmtMin(r.ticketing.responseMetrics.avgResolutionMinutes) : '—') : ''}
    ${r.showInternalColumns && r.ticketing.responseMetrics.slaResponseCompliance !== null ? statCard('SLA Compliance', `${r.ticketing.responseMetrics.slaResponseCompliance}%`) : ''}
    ${r.showInternalColumns ? statCard('Median Resolution', r.ticketing.responseMetrics.medianResolutionMinutes !== null ? fmtMin(r.ticketing.responseMetrics.medianResolutionMinutes) : '—') : ''}
  </div>

  ${isVis('ticketingPriority') && r.ticketing.ticketsByPriority.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Tickets by Priority</h3>
  <table>
    <thead><tr><th>Priority</th><th class="th-right" style="width:80px">Count</th><th class="th-right" style="width:80px">Share</th>${r.showInternalColumns ? '<th class="th-right" style="width:100px">Avg Resolution</th>' : ''}</tr></thead>
    <tbody>
    ${r.ticketing.ticketsByPriority.map(p =>
      `<tr><td>${p.priority}</td><td class="td-right">${p.count}</td><td class="td-right">${p.percentage}%</td>${r.showInternalColumns ? `<td class="td-right">${p.avgResolutionMinutes !== null ? fmtMin(p.avgResolutionMinutes) : '—'}</td>` : ''}</tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${isVis('ticketingCategories') && r.ticketing.ticketsByCategory.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Tickets by Category</h3>
  <table>
    <thead><tr><th>Category</th><th class="th-right" style="width:80px">Tickets</th><th class="th-right" style="width:80px">Share</th></tr></thead>
    <tbody>
    ${r.ticketing.ticketsByCategory.slice(0, 10).map(c =>
      `<tr><td>${esc(c.category)}</td><td class="td-right">${c.count}</td><td class="td-right">${c.percentage}%</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${isVis('ticketingTrends') && r.ticketing.monthlyTrends.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Monthly Ticket Trends</h3>
  <table>
    <thead><tr><th>Month</th><th class="th-right" style="width:80px">Created</th><th class="th-right" style="width:80px">Closed</th>${r.showInternalColumns ? '<th class="th-right" style="width:80px">Hours</th><th class="th-right" style="width:100px">Avg Resolution</th>' : ''}</tr></thead>
    <tbody>
    ${r.ticketing.monthlyTrends.map(m =>
      `<tr><td>${m.label}</td><td class="td-right">${m.ticketsCreated}</td><td class="td-right">${m.ticketsClosed}</td>${r.showInternalColumns ? `<td class="td-right">${m.supportHours}h</td><td class="td-right">${m.avgResolutionMinutes !== null ? fmtMin(m.avgResolutionMinutes) : '—'}</td>` : ''}</tr>`
    ).join('')}
    </tbody>
  </table>` : ''}
  `}
</div>` : ''}

<!-- RMM / ENDPOINT MANAGEMENT -->
${isVis('rmm') ? `
<div class="section page-break avoid-break">
  <div class="section-title">${nextNum()}. ${sec('rmm')!.title}</div>
  ${!sec('rmm')!.hasData ? (r.showInternalColumns ? `<div class="data-notice">${esc(r.dattoRmm.note || 'RMM data not available for this report.')}</div>` : '<div class="narrative" style="color:#64748b;font-style:italic">Data for this section was unavailable during this reporting period.</div>') : `
  <div class="stat-grid">
    ${statCard('Endpoints Managed', r.dattoRmm.endpointCount || r.dattoRmm.devicesManaged)}
    ${(r.dattoRmm.serverCount ?? 0) > 0 ? statCard('Servers', r.dattoRmm.serverCount) : ''}
    ${(r.dattoRmm.serverCount ?? 0) > 0 && (r.dattoRmm.workstationCount ?? 0) > 0 ? statCard('Workstations', r.dattoRmm.workstationCount) : ''}
    ${statCard('Devices Online', `${r.dattoRmm.devicesOnline ?? 0}/${r.dattoRmm.endpointCount || r.dattoRmm.devicesManaged}`)}
  </div>
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Patch Management</h3>
  <div class="stat-grid">
    ${statCard('Patch Compliance', `${(r.dattoRmm.endpointCount || r.dattoRmm.devicesManaged) > 0 ? Math.round(((r.dattoRmm.patchFullyPatched ?? 0) / (r.dattoRmm.endpointCount || r.dattoRmm.devicesManaged)) * 100) : 0}%`)}
    ${statCard('Fully Patched', `${r.dattoRmm.patchFullyPatched ?? 0}/${r.dattoRmm.endpointCount || r.dattoRmm.devicesManaged}`)}
    ${statCard('Patches Installed', (r.dattoRmm.patchInstalledTotal ?? 0).toLocaleString())}
  </div>
  ${r.dattoRmm.alertsResolved > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Alerts Resolved</h3>
  <div class="stat-grid">
    ${statCard('Alerts Resolved', r.dattoRmm.alertsResolved.toLocaleString())}
    ${(r.dattoRmm.patchAlertsCount ?? 0) > 0 ? statCard('Patch & Update Alerts Resolved', r.dattoRmm.patchAlertsCount) : ''}
  </div>` : ''}
  `}
</div>` : ''}

<!-- EDR -->
${isVis('edr') ? `
<div class="section page-break avoid-break">
  <div class="section-title">${nextNum()}. ${sec('edr')!.title}</div>
  ${!sec('edr')!.hasData ? (r.showInternalColumns ? `<div class="data-notice">${esc(r.dattoEdr?.note || 'EDR data not available.')}</div>` : '<div class="narrative" style="color:#64748b;font-style:italic">Data for this section was unavailable during this reporting period.</div>') : `
  <div class="stat-grid">
    ${statCard('Security Events Analyzed', r.dattoEdr.totalEvents.toLocaleString())}
    ${r.dattoEdr.eventsBySeverity.filter(s => s.severity === 'critical' || s.severity === 'high').length > 0 ? statCard('Critical/High Severity', r.dattoEdr.eventsBySeverity.filter(s => s.severity === 'critical' || s.severity === 'high').reduce((sum, s) => sum + s.count, 0).toLocaleString()) : ''}
    ${r.dattoEdr.topThreats.length > 0 ? statCard('Unique Threats Detected', r.dattoEdr.topThreats.length) : ''}
  </div>
  ${r.dattoEdr.eventsBySeverity.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Events by Severity</h3>
  <div style="margin-bottom:12px">${r.dattoEdr.eventsBySeverity.map(s => {
    const cls = s.severity === 'critical' ? 'badge-sev-critical' : s.severity === 'high' ? 'badge-sev-high' : s.severity === 'medium' ? 'badge-sev-medium' : 'badge-sev-low';
    return `<span class="badge ${cls}">${esc(s.severity)}: ${s.count.toLocaleString()}</span>`;
  }).join('')}</div>` : ''}
  ${r.dattoEdr.topThreats.length > 0 && r.showInternalColumns ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Top Threats</h3>
  <table><thead><tr><th>Threat</th><th class="th-right" style="width:80px">Count</th></tr></thead><tbody>
  ${r.dattoEdr.topThreats.slice(0, 10).map(t => `<tr><td>${esc(t.threat)}</td><td class="td-right">${t.count}</td></tr>`).join('')}
  </tbody></table>` : ''}
  `}
</div>` : ''}

<!-- DNS -->
${isVis('dns') ? `
<div class="section avoid-break">
  <div class="section-title">${nextNum()}. ${sec('dns')!.title}</div>
  ${!sec('dns')!.hasData ? (r.showInternalColumns ? `<div class="data-notice">${esc(r.dnsFilter?.note || 'DNS data not available.')}</div>` : '<div class="narrative" style="color:#64748b;font-style:italic">Data for this section was unavailable during this reporting period.</div>') : `
  <div class="stat-grid">
    ${statCard('Total Queries', r.dnsFilter.totalQueries.toLocaleString())}
    ${statCard('Threats Blocked', r.dnsFilter.blockedQueries.toLocaleString())}
    ${statCard('Block Rate', r.dnsFilter.totalQueries > 0 ? `${(r.dnsFilter.blockedQueries / r.dnsFilter.totalQueries * 100).toFixed(2)}%` : '—')}
  </div>
  `}
</div>` : ''}

<!-- BCDR -->
${isVis('bcdr') ? `
<div class="section avoid-break">
  <div class="section-title">${nextNum()}. ${sec('bcdr')!.title}</div>
  ${!sec('bcdr')!.hasData ? (r.showInternalColumns ? `<div class="data-notice">${esc(r.dattoBcdr?.note || 'BCDR data not available.')}</div>` : '<div class="narrative" style="color:#64748b;font-style:italic">Data for this section was unavailable during this reporting period.</div>') : `
  <div class="stat-grid">
    ${statCard('Total Devices', r.dattoBcdr.totalDevices)}
    ${statCard('Protected Systems', r.dattoBcdr.totalAgents)}
    ${(r.dattoBcdr.applianceCount ?? 0) > 0 ? statCard('Server Appliances', r.dattoBcdr.applianceCount) : ''}
    ${r.dattoBcdr.totalAlerts === 0 ? statCard('Alert Status', 'All Clear') : ''}
  </div>
  `}
</div>` : ''}

<!-- SAAS BACKUPS -->
${isVis('saas') ? `
<div class="section avoid-break">
  <div class="section-title">${nextNum()}. ${sec('saas')!.title}</div>
  ${!sec('saas')!.hasData ? (r.showInternalColumns ? `<div class="data-notice">${esc(r.dattoSaas?.note || 'SaaS backup data not available.')}</div>` : '<div class="narrative" style="color:#64748b;font-style:italic">Data for this section was unavailable during this reporting period.</div>') : `
  <div class="stat-grid">
    ${statCard('Protected Seats', r.dattoSaas.activeSeats)}
    ${statCard('Domains', r.dattoSaas.totalDomains)}
  </div>
  ${r.dattoSaas.seatsByType.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Protected Services</h3>
  <div style="margin-bottom:12px">${r.dattoSaas.seatsByType.map(s => `<span class="badge" style="background:#ecfeff;color:#0891b2">${esc(s.type)}: ${s.count}</span>`).join('')}</div>` : ''}
  `}
</div>` : ''}

<!-- SECURITY OPERATIONS -->
${isVis('security') ? `
<div class="section page-break avoid-break">
  <div class="section-title">${nextNum()}. ${sec('security')!.title}</div>
  ${r.metadata.isInternal ? `
  <table>
    <thead><tr><th>Source</th><th class="th-center" style="width:100px">Status</th><th>Notes</th></tr></thead>
    <tbody>
    ${r.security.sources.map(s => {
      const cls = s.available ? 'coverage-available' : 'coverage-missing';
      return `<tr><td>${esc(s.internalName || s.name)}</td><td class="td-center ${cls}">${s.available ? 'Active' : 'Not Connected'}</td><td style="font-size:9pt;color:#64748b">${s.note || '—'}</td></tr>`;
    }).join('')}
    </tbody>
  </table>` : `
  <div class="narrative">Our Security Operations Center continuously monitors your environment for threats and anomalies across the following areas:</div>
  <div class="svc-grid">
  ${r.security.sources.map(s => `
    <div class="svc-card">
      <div class="svc-card-name"><span class="svc-dot"></span>${esc(s.name)}</div>
      ${s.note ? `<div class="svc-card-desc">${esc(s.note)}</div>` : ''}
    </div>`).join('')}
  </div>`}
  ${r.security.socIncidents.available && r.security.socIncidents.totalIncidents > 0 && r.showInternalColumns ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">SOC Incidents</h3>
  <div class="stat-grid">${statCard('Total Incidents', r.security.socIncidents.totalIncidents)}</div>
  ${r.security.socIncidents.bySeverity.length > 0 ? `<table><thead><tr><th>Severity</th><th class="th-right" style="width:80px">Count</th></tr></thead><tbody>${r.security.socIncidents.bySeverity.map(s => `<tr><td>${esc(s.severity)}</td><td class="td-right">${s.count}</td></tr>`).join('')}</tbody></table>` : ''}` : ''}
</div>` : ''}

<!-- EMAIL SECURITY (internal only) -->
${isVis('emailSecurity') ? `
<div class="section avoid-break">
  <div class="section-title">${nextNum()}. ${sec('emailSecurity')!.title}</div>
  <div class="data-notice"><strong>Integration Not Yet Connected</strong><br/>${esc(r.emailSecurity.note)}</div>
</div>` : ''}

<!-- USER PROTECTION -->
${isVis('userProtection') ? `
<div class="section avoid-break">
  <div class="section-title">${nextNum()}. ${sec('userProtection')!.title}</div>
  <div class="narrative">We actively protect your users and their identities across the following areas:</div>
  <div class="svc-grid">
  ${r.userProtection.services.filter(s => s.active).map(s => `
    <div class="svc-card">
      <div class="svc-card-name"><span class="svc-dot"></span>${esc(s.name)}</div>
      <div class="svc-card-desc">${esc(s.description)}</div>
    </div>`).join('')}
  </div>
</div>` : ''}

<!-- HEALTH SNAPSHOT -->
${isVis('health') && r.healthSnapshot ? `
<div class="section avoid-break">
  <div class="section-title">${sec('health')!.title}</div>
  <div class="health-container">
    <div class="health-score ${healthClass(r.healthSnapshot.tier)}">${Math.round(r.healthSnapshot.overallScore)}</div>
    <div>
      <div style="font-size:14pt;font-weight:700;color:#0f172a;">${r.healthSnapshot.tier}</div>
      ${r.healthSnapshot.trend ? `<div style="font-size:9pt;color:#64748b;">Trend: ${r.healthSnapshot.trend}</div>` : ''}
      ${r.healthSnapshot.previousScore !== null && r.showInternalColumns ? `<div style="font-size:9pt;color:#64748b;">Previous: ${Math.round(r.healthSnapshot.previousScore)}</div>` : ''}
    </div>
  </div>
</div>` : ''}

<div class="footer">
  <p>Generated by Triple Cities Tech &mdash; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <p>${r.metadata.isInternal ? 'INTERNAL DOCUMENT' : `Prepared for ${esc(r.metadata.companyName)}`}</p>
</div>

</div>
</body>
</html>`;
}

// ============================================
// HELPERS
// ============================================

function statCard(label: string, value: string | number): string {
  const isNA = value === '—' || value === 0;
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value${isNA && value === '—' ? ' na' : ''}">${value}</div></div>`;
}

function fmtMin(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

function healthClass(tier: string): string {
  switch (tier) {
    case 'Healthy': return 'health-healthy';
    case 'Watch': return 'health-watch';
    case 'At Risk': return 'health-at-risk';
    case 'Critical': return 'health-critical';
    default: return 'health-watch';
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br/>');
}
