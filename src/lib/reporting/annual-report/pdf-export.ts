/**
 * PDF export for Annual Service Reports.
 * Generates branded HTML suitable for printing/PDF conversion.
 * Extends the existing business review PDF pattern.
 */

import { AnnualReportData, AnnualReportVariant } from './types';

export function generateAnnualReportHTML(
  data: AnnualReportData,
  variant: AnnualReportVariant,
): string {
  const isInternal = variant === 'internal';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.company.name} — Annual Service Report — ${data.period.start} to ${data.period.end}</title>
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
    color: #1e293b;
    background: #ffffff;
    line-height: 1.6;
    font-size: 10.5pt;
  }
  .cover {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0e7490 100%);
    color: #ffffff;
    padding: 48px 56px 56px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-radius: 0 0 16px 16px;
    margin-bottom: 32px;
  }
  .cover .brand-name {
    font-size: 11pt; color: #06b6d4; font-weight: 700;
    letter-spacing: 3px; text-transform: uppercase; margin-bottom: 20px;
  }
  .cover h1 { font-size: 28pt; font-weight: 800; margin-bottom: 4px; line-height: 1.2; }
  .cover h2 { font-size: 15pt; font-weight: 400; color: #67e8f9; margin-bottom: 20px; }
  .cover .meta { font-size: 10pt; color: #94a3b8; }
  .content { padding: 0 8px; }
  .section {
    margin-bottom: 24px; border: 1px solid #e2e8f0;
    border-radius: 12px; padding: 20px 24px; background: #ffffff;
  }
  .section-title {
    font-size: 13pt; font-weight: 700; color: #0e7490;
    border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;
    margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .narrative { font-size: 10.5pt; color: #475569; line-height: 1.7; margin-bottom: 12px; }
  .stat-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 12px; margin-bottom: 16px;
  }
  .stat-grid-4 {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 12px; margin-bottom: 16px;
  }
  .stat-card {
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 10px; padding: 14px 12px; text-align: center;
  }
  .stat-label {
    font-size: 8pt; color: #64748b; text-transform: uppercase;
    letter-spacing: 0.5px; font-weight: 600;
  }
  .stat-value {
    font-size: 20pt; font-weight: 800; color: #0f172a;
    margin-top: 2px; line-height: 1.2;
  }
  .stat-value.na { color: #94a3b8; font-size: 14pt; font-style: italic; font-weight: 500; }
  .stat-sub { font-size: 8pt; color: #64748b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th {
    background: #f1f5f9; color: #475569; font-size: 8pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 12px;
    text-align: left; border-bottom: 2px solid #e2e8f0;
  }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 10pt; color: #334155; }
  tr:last-child td { border-bottom: none; }
  .coverage-available { color: #10b981; font-weight: 700; }
  .coverage-partial { color: #f59e0b; font-weight: 700; }
  .coverage-missing { color: #ef4444; font-weight: 700; }
  .health-container { display: flex; align-items: center; gap: 20px; margin-bottom: 14px; }
  .health-score {
    display: flex; align-items: center; justify-content: center;
    width: 72px; height: 72px; border-radius: 50%;
    font-size: 24pt; font-weight: 800; color: #ffffff; flex-shrink: 0;
  }
  .health-healthy { background: #10b981; }
  .health-watch { background: #0891b2; }
  .health-at-risk { background: #f97316; }
  .health-critical { background: #dc2626; }
  .priority-bar {
    height: 20px; border-radius: 6px; display: flex;
    overflow: hidden; margin-bottom: 12px;
  }
  .internal-banner {
    background: #fff7ed; border: 1px solid #fdba74; color: #c2410c;
    padding: 8px 16px; border-radius: 8px; font-size: 9pt;
    font-weight: 700; text-align: center; margin-bottom: 20px; letter-spacing: 1px;
  }
  .data-notice {
    background: #eff6ff; border: 1px solid #93c5fd; color: #1e40af;
    padding: 10px 16px; border-radius: 8px; font-size: 9pt;
    margin-bottom: 16px;
  }
  .trend-chart {
    display: flex; align-items: flex-end; gap: 4px; height: 120px;
    margin-bottom: 8px; padding: 0 4px;
  }
  .trend-bar {
    flex: 1; background: #0891b2; border-radius: 3px 3px 0 0;
    min-height: 2px; position: relative;
  }
  .trend-bar-label {
    font-size: 7pt; color: #64748b; text-align: center;
    margin-top: 4px; white-space: nowrap;
  }
  .trend-chart-container { margin-bottom: 16px; }
  .footer {
    margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0;
    color: #94a3b8; font-size: 8.5pt; text-align: center;
  }
  .footer p { margin-bottom: 2px; }
  .download-bar {
    position: fixed; top: 0; left: 0; right: 0; background: #0f172a;
    padding: 10px 24px; display: flex; align-items: center;
    justify-content: space-between; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .download-bar span { color: #94a3b8; font-size: 10pt; }
  .download-btn {
    background: #0891b2; color: #ffffff; border: none; padding: 8px 20px;
    border-radius: 6px; font-size: 10pt; font-weight: 600; cursor: pointer;
  }
  .download-btn:hover { background: #0e7490; }
  .spacer-for-bar { height: 52px; }
</style>
</head>
<body>

<div class="download-bar no-print">
  <span>${data.company.name} — Annual Service Report</span>
  <button class="download-btn" onclick="window.print()">&#128196; Download PDF</button>
</div>
<div class="spacer-for-bar no-print"></div>

<!-- COVER -->
<div class="cover">
  <div class="brand-name">Triple Cities Tech</div>
  <h2>Annual Service Report</h2>
  <h1>${esc(data.company.name)}</h1>
  <div class="meta">${data.period.start} to ${data.period.end}</div>
</div>

<div class="content">

${isInternal ? '<div class="internal-banner">&#9888; INTERNAL DOCUMENT — NOT FOR CUSTOMER DISTRIBUTION</div>' : ''}

<!-- DATA COVERAGE -->
<div class="section avoid-break">
  <div class="section-title">Data Source Coverage</div>
  <div class="narrative">This report aggregates data from multiple systems. The table below shows what data is available for the reporting period.</div>
  <table>
    <thead><tr><th>Data Source</th><th style="text-align:center">Status</th><th>Coverage</th><th>Notes</th></tr></thead>
    <tbody>
    ${data.dataSources.map(ds => {
      const statusClass = ds.available ? 'coverage-available' : ds.isPartial ? 'coverage-partial' : 'coverage-missing';
      const statusLabel = ds.available ? 'Available' : 'Not Available';
      const coverage = ds.coverageStart && ds.coverageEnd ? `${ds.coverageStart} to ${ds.coverageEnd}` : '—';
      return `<tr>
        <td>${ds.source}</td>
        <td style="text-align:center" class="${statusClass}">${statusLabel}</td>
        <td>${coverage}</td>
        <td style="font-size:9pt;color:#64748b">${ds.note || '—'}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>
</div>

<!-- EXECUTIVE SUMMARY -->
<div class="section avoid-break">
  <div class="section-title">1. Executive Summary</div>
  <div class="stat-grid">
    ${statCard('Total Tickets', data.executiveSummary.totalTickets)}
    ${statCard('RMM Alerts', data.dattoRmm.available ? data.dattoRmm.totalAlerts : '—')}
    ${statCard('Security Incidents', data.security.socIncidents.totalIncidents || '—')}
  </div>
  ${data.executiveSummary.topIssueCategories.length > 0 ? `
  <div class="narrative"><strong>Top Issue Categories:</strong> ${data.executiveSummary.topIssueCategories.join(', ')}</div>` : ''}
  ${data.executiveSummary.keyTrends.map(t => `<div class="narrative">${esc(t)}</div>`).join('')}
  ${data.executiveSummary.dataCoverageNotes.length > 0 ? `
  <div class="data-notice">
    <strong>Data Coverage Notes:</strong><br/>
    ${data.executiveSummary.dataCoverageNotes.map(n => `&#8226; ${esc(n)}`).join('<br/>')}
  </div>` : ''}
</div>

<!-- TICKETING ANALYSIS -->
<div class="section page-break">
  <div class="section-title">2. Ticketing Analysis</div>
  <div class="stat-grid">
    ${statCard('Tickets Created', data.ticketing.totalTickets)}
    ${statCard('Avg Response', data.ticketing.responseMetrics.avgFirstResponseMinutes !== null ? fmtMin(data.ticketing.responseMetrics.avgFirstResponseMinutes) : '—')}
    ${statCard('Avg Resolution', data.ticketing.responseMetrics.avgResolutionMinutes !== null ? fmtMin(data.ticketing.responseMetrics.avgResolutionMinutes) : '—')}
    ${statCard('First Touch Rate', data.ticketing.responseMetrics.firstTouchResolutionRate !== null ? `${data.ticketing.responseMetrics.firstTouchResolutionRate}%` : '—')}
    ${statCard('SLA Compliance', data.ticketing.responseMetrics.slaResponseCompliance !== null ? `${data.ticketing.responseMetrics.slaResponseCompliance}%` : '—')}
    ${statCard('Median Resolution', data.ticketing.responseMetrics.medianResolutionMinutes !== null ? fmtMin(data.ticketing.responseMetrics.medianResolutionMinutes) : '—')}
  </div>

  ${data.ticketing.ticketsByPriority.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Tickets by Priority</h3>
  <div class="priority-bar">
    ${data.ticketing.ticketsByPriority.map(p => {
      const colors: Record<string, string> = { Critical: '#dc2626', High: '#f97316', Medium: '#0891b2', Low: '#8b5cf6' };
      return `<div style="width:${p.percentage}%;background:${colors[p.priority] || '#64748b'};" title="${p.priority}: ${p.count}"></div>`;
    }).join('')}
  </div>
  <table>
    <thead><tr><th>Priority</th><th style="text-align:right">Count</th><th style="text-align:right">Share</th><th style="text-align:right">Avg Resolution</th></tr></thead>
    <tbody>
    ${data.ticketing.ticketsByPriority.map(p =>
      `<tr><td>${p.priority}</td><td style="text-align:right">${p.count}</td><td style="text-align:right">${p.percentage}%</td><td style="text-align:right">${p.avgResolutionMinutes !== null ? fmtMin(p.avgResolutionMinutes) : '<span style="color:#94a3b8">—</span>'}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.ticketing.ticketsByCategory.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Tickets by Category</h3>
  <table>
    <thead><tr><th>Category</th><th style="text-align:right">Tickets</th><th style="text-align:right">Share</th></tr></thead>
    <tbody>
    ${data.ticketing.ticketsByCategory.slice(0, 10).map(c =>
      `<tr><td>${esc(c.category)}</td><td style="text-align:right">${c.count}</td><td style="text-align:right">${c.percentage}%</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.ticketing.mostCommonIssues.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Most Common Issues</h3>
  <table>
    <thead><tr><th>Issue Type</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>
    ${data.ticketing.mostCommonIssues.map(i =>
      `<tr><td>${esc(i.issue)}</td><td style="text-align:right">${i.count}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.ticketing.monthlyTrends.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Monthly Ticket Trends</h3>
  ${renderTrendChart(data.ticketing.monthlyTrends.map(m => ({ label: m.label.split(' ')[0].substring(0, 3), value: m.ticketsCreated })), '#0891b2')}
  <table>
    <thead><tr><th>Month</th><th style="text-align:right">Created</th><th style="text-align:right">Closed</th><th style="text-align:right">Hours</th><th style="text-align:right">Avg Resolution</th></tr></thead>
    <tbody>
    ${data.ticketing.monthlyTrends.map(m =>
      `<tr><td>${m.label}</td><td style="text-align:right">${m.ticketsCreated}</td><td style="text-align:right">${m.ticketsClosed}</td><td style="text-align:right">${m.supportHours}h</td><td style="text-align:right">${m.avgResolutionMinutes !== null ? fmtMin(m.avgResolutionMinutes) : '—'}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.ticketing.workBreakdown.reactive + data.ticketing.workBreakdown.maintenance + data.ticketing.workBreakdown.project > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Work Breakdown</h3>
  <div class="stat-grid-4">
    ${statCard('Reactive', data.ticketing.workBreakdown.reactive)}
    ${statCard('Maintenance', data.ticketing.workBreakdown.maintenance)}
    ${statCard('Project', data.ticketing.workBreakdown.project)}
    ${statCard('Other', data.ticketing.workBreakdown.other)}
  </div>` : ''}
</div>

<!-- DATTO RMM -->
<div class="section page-break avoid-break">
  <div class="section-title">3. Endpoint Operations (Datto RMM)</div>
  ${!data.dattoRmm.available ? `
  <div class="data-notice">
    <strong>Data Not Available</strong><br/>
    ${esc(data.dattoRmm.note || 'Datto RMM data is not available for this report.')}
  </div>` : `
  <div class="stat-grid">
    ${statCard('Total Alerts', data.dattoRmm.totalAlerts)}
    ${statCard('Resolved', data.dattoRmm.alertsResolved)}
    ${statCard('Open', data.dattoRmm.alertsOpen)}
    ${statCard('Devices Managed', data.dattoRmm.devicesManaged)}
    ${statCard('Alert Types', data.dattoRmm.alertsByType.length)}
    ${statCard('Resolution Rate', data.dattoRmm.totalAlerts > 0 ? `${Math.round((data.dattoRmm.alertsResolved / data.dattoRmm.totalAlerts) * 100)}%` : '—')}
  </div>

  ${data.dattoRmm.alertsByType.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Alerts by Type</h3>
  <table>
    <thead><tr><th>Alert Type</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>
    ${data.dattoRmm.alertsByType.slice(0, 10).map(a =>
      `<tr><td>${esc(a.type)}</td><td style="text-align:right">${a.count}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.dattoRmm.alertsByPriority.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Alerts by Priority</h3>
  <table>
    <thead><tr><th>Priority</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>
    ${data.dattoRmm.alertsByPriority.map(a =>
      `<tr><td>${esc(a.priority)}</td><td style="text-align:right">${a.count}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.dattoRmm.monthlyAlertTrends.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Monthly Alert Trends</h3>
  ${renderTrendChart(data.dattoRmm.monthlyAlertTrends.map(m => ({ label: m.label.split(' ')[0].substring(0, 3), value: m.alerts })), '#10b981')}
  <table>
    <thead><tr><th>Month</th><th style="text-align:right">Alerts</th><th style="text-align:right">Resolved</th></tr></thead>
    <tbody>
    ${data.dattoRmm.monthlyAlertTrends.map(m =>
      `<tr><td>${m.label}</td><td style="text-align:right">${m.alerts}</td><td style="text-align:right">${m.resolved}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.dattoRmm.topAlertingSites.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Top Alerting Sites</h3>
  <table>
    <thead><tr><th>Site</th><th style="text-align:right">Alerts</th></tr></thead>
    <tbody>
    ${data.dattoRmm.topAlertingSites.map(s =>
      `<tr><td>${esc(s.siteName)}</td><td style="text-align:right">${s.alertCount}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.dattoRmm.note ? `<div class="data-notice">${esc(data.dattoRmm.note)}</div>` : ''}
  `}
</div>

<!-- DATTO EDR -->
<div class="section page-break avoid-break">
  <div class="section-title">4. Endpoint Detection &amp; Response (Datto EDR)</div>
  ${!data.dattoEdr.available ? `
  <div class="data-notice">
    <strong>Data Not Available</strong><br/>
    ${esc(data.dattoEdr.note || 'Datto EDR integration not configured.')}
  </div>` : `
  <div class="stat-grid">
    ${statCard('Security Events', data.dattoEdr.totalEvents)}
    ${statCard('Event Types', data.dattoEdr.eventsByType.length)}
    ${statCard('Severity Levels', data.dattoEdr.eventsBySeverity.length)}
  </div>

  ${data.dattoEdr.eventsBySeverity.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Events by Severity</h3>
  <table>
    <thead><tr><th>Severity</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>
    ${data.dattoEdr.eventsBySeverity.map(s =>
      '<tr><td>' + esc(s.severity) + '</td><td style="text-align:right">' + s.count + '</td></tr>'
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.dattoEdr.topThreats.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Top Threats</h3>
  <table>
    <thead><tr><th>Threat</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>
    ${data.dattoEdr.topThreats.slice(0, 10).map(t =>
      '<tr><td>' + esc(t.threat) + '</td><td style="text-align:right">' + t.count + '</td></tr>'
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.dattoEdr.monthlyTrends.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Monthly EDR Trends</h3>
  ${renderTrendChart(data.dattoEdr.monthlyTrends.map(m => ({ label: m.label.split(' ')[0].substring(0, 3), value: m.events })), '#dc2626')}
  ` : ''}
  `}
</div>

<!-- DNSFILTER -->
<div class="section avoid-break">
  <div class="section-title">5. DNS Security (DNSFilter)</div>
  ${!data.dnsFilter.available ? `
  <div class="data-notice">
    <strong>Data Not Available</strong><br/>
    ${esc(data.dnsFilter.note || 'DNSFilter integration not configured.')}
  </div>` : `
  <div class="stat-grid">
    ${statCard('Total Queries', data.dnsFilter.totalQueries.toLocaleString())}
    ${statCard('Blocked', data.dnsFilter.blockedQueries.toLocaleString())}
    ${statCard('Block Rate', data.dnsFilter.totalQueries > 0 ? (data.dnsFilter.blockedQueries / data.dnsFilter.totalQueries * 100).toFixed(2) + '%' : '—')}
  </div>

  ${data.dnsFilter.threatsByCategory.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Threats by Category</h3>
  <table>
    <thead><tr><th>Category</th><th style="text-align:right">Blocked</th></tr></thead>
    <tbody>
    ${data.dnsFilter.threatsByCategory.slice(0, 10).map(c =>
      '<tr><td>' + esc(c.category) + '</td><td style="text-align:right">' + c.count + '</td></tr>'
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.dnsFilter.topBlockedDomains.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Top Blocked Domains</h3>
  <table>
    <thead><tr><th>Domain</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>
    ${data.dnsFilter.topBlockedDomains.slice(0, 10).map(d =>
      '<tr><td>' + esc(d.domain) + '</td><td style="text-align:right">' + d.count + '</td></tr>'
    ).join('')}
    </tbody>
  </table>` : ''}
  `}
</div>

<!-- DATTO BCDR (BACKUPS) -->
<div class="section avoid-break">
  <div class="section-title">6. Backup &amp; Disaster Recovery (Datto BCDR)</div>
  ${!data.dattoBcdr.available ? `
  <div class="data-notice">
    <strong>Data Not Available</strong><br/>
    ${esc(data.dattoBcdr.note || 'Datto BCDR integration not configured.')}
  </div>` : `
  <div class="stat-grid">
    ${statCard('Total Devices', data.dattoBcdr.totalDevices)}
    ${statCard('Protected Systems', data.dattoBcdr.totalAgents)}
    ${(data.dattoBcdr.applianceCount ?? 0) > 0 ? statCard('Server Appliances', data.dattoBcdr.applianceCount) : ''}
    ${(data.dattoBcdr.endpointBackupCount ?? 0) > 0 ? statCard('PC/Laptop Backups', data.dattoBcdr.endpointBackupCount) : ''}
    ${(data.dattoBcdr.cloudDeviceCount ?? 0) > 0 ? statCard('Cloud Devices', data.dattoBcdr.cloudDeviceCount) : ''}
    ${data.dattoBcdr.totalAlerts === 0 ? statCard('Alert Status', 'All Clear') : ''}
  </div>

  ${data.dattoBcdr.deviceDetails.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Device Details</h3>
  <table>
    <thead><tr><th>Device</th><th>Type</th><th>Client</th><th style="text-align:right">Protected</th><th>Last Seen</th></tr></thead>
    <tbody>
    ${data.dattoBcdr.deviceDetails.map(d => {
      const typeLabel = d.deviceType === 'endpoint' ? 'PC Backup' : d.deviceType === 'cloud' ? 'Cloud' : 'Appliance';
      return '<tr><td>' + esc(d.name) + '</td><td>' + typeLabel + '</td><td>' + esc(d.clientCompanyName) + '</td><td style="text-align:right">' + d.agentCount + '</td><td>' + (d.lastSeen ? new Date(d.lastSeen).toLocaleDateString() : '—') + '</td></tr>';
    }).join('')}
    </tbody>
  </table>` : ''}

  ${data.dattoBcdr.note ? `<div class="data-notice">${esc(data.dattoBcdr.note)}</div>` : ''}
  `}
</div>

<!-- DATTO SAAS PROTECTION -->
<div class="section avoid-break">
  <div class="section-title">7. Cloud Backup (Datto SaaS Protection)</div>
  ${!data.dattoSaas?.available ? `
  <div class="data-notice">
    <strong>Data Not Available</strong><br/>
    ${esc(data.dattoSaas?.note || 'Datto SaaS Protection integration not configured.')}
  </div>` : `
  <div class="stat-grid">
    ${statCard('Protected Seats', data.dattoSaas.activeSeats)}
    ${statCard('Domains', data.dattoSaas.totalDomains)}
    ${statCard('Total Seats', data.dattoSaas.totalSeats)}
  </div>

  ${data.dattoSaas.seatsByType.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Protected Services</h3>
  <table>
    <thead><tr><th>Service Type</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>
    ${data.dattoSaas.seatsByType.map(s =>
      '<tr><td>' + esc(s.type) + '</td><td style="text-align:right">' + s.count + '</td></tr>'
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.dattoSaas.customerDetails.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Organization Details</h3>
  <table>
    <thead><tr><th>Organization</th><th>Domain</th><th>Platform</th><th style="text-align:right">Seats</th></tr></thead>
    <tbody>
    ${data.dattoSaas.customerDetails.map(c =>
      '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.domain) + '</td><td>' + esc(c.productType) + '</td><td style="text-align:right">' + c.seatCount + '</td></tr>'
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.dattoSaas.note ? `<div class="data-notice">${esc(data.dattoSaas.note)}</div>` : ''}
  `}
</div>

<!-- SECURITY OPERATIONS -->
<div class="section page-break avoid-break">
  <div class="section-title">8. Security Operations</div>

  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:0 0 8px;">Security Source Status</h3>
  <table>
    <thead><tr><th>Source</th><th style="text-align:center">Status</th><th>Notes</th></tr></thead>
    <tbody>
    ${data.security.sources.map(s => {
      const statusClass = s.available ? 'coverage-available' : 'coverage-missing';
      const label = s.available ? 'Active' : 'Not Connected';
      return `<tr><td>${s.name}</td><td style="text-align:center" class="${statusClass}">${label}</td><td style="font-size:9pt;color:#64748b">${s.note || '—'}</td></tr>`;
    }).join('')}
    </tbody>
  </table>

  ${data.security.socIncidents.available ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">SOC Incidents</h3>
  <div class="stat-grid">
    ${statCard('Total Incidents', data.security.socIncidents.totalIncidents)}
  </div>

  ${data.security.socIncidents.bySeverity.length > 0 ? `
  <table>
    <thead><tr><th>Severity</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>
    ${data.security.socIncidents.bySeverity.map(s =>
      `<tr><td>${esc(s.severity)}</td><td style="text-align:right">${s.count}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${data.security.socIncidents.monthlyTrends.length > 0 ? `
  <h3 style="font-size:11pt;font-weight:700;color:#334155;margin:16px 0 8px;">Monthly Security Trends</h3>
  <table>
    <thead><tr><th>Month</th><th style="text-align:right">Incidents</th></tr></thead>
    <tbody>
    ${data.security.socIncidents.monthlyTrends.map(m =>
      `<tr><td>${m.label}</td><td style="text-align:right">${m.incidents}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}
  ` : `
  <div class="data-notice">
    ${esc(data.security.note || 'Security incident data is not available for this company.')}
  </div>`}
</div>

<!-- EMAIL SECURITY -->
<div class="section avoid-break">
  <div class="section-title">9. Email Security (Inky)</div>
  <div class="data-notice">
    <strong>Integration Not Yet Connected</strong><br/>
    ${esc(data.emailSecurity.note)}
  </div>
</div>

<!-- HEALTH SNAPSHOT -->
<div class="section avoid-break">
  <div class="section-title">Customer Health Snapshot</div>
  ${data.healthSnapshot ? `
  <div class="health-container">
    <div class="health-score ${healthClass(data.healthSnapshot.tier)}">${Math.round(data.healthSnapshot.overallScore)}</div>
    <div>
      <div style="font-size:14pt;font-weight:700;color:#0f172a;">${data.healthSnapshot.tier}</div>
      ${data.healthSnapshot.trend ? `<div style="font-size:9pt;color:#64748b;">Trend: ${data.healthSnapshot.trend}</div>` : ''}
      ${data.healthSnapshot.previousScore !== null ? `<div style="font-size:9pt;color:#64748b;">Previous: ${Math.round(data.healthSnapshot.previousScore)}</div>` : ''}
    </div>
  </div>` : `
  <div style="text-align:center;padding:20px;color:#94a3b8;font-style:italic;">
    Health scoring will be available once sufficient ticket history has been collected.
  </div>`}
</div>

<div class="footer">
  <p>Generated by Triple Cities Tech &mdash; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <p>${isInternal ? 'INTERNAL DOCUMENT' : `Prepared for ${esc(data.company.name)}`}</p>
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
  return `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value${isNA && value === '—' ? ' na' : ''}">${value}</div>
  </div>`;
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
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

function renderTrendChart(
  items: Array<{ label: string; value: number }>,
  color: string,
): string {
  const max = Math.max(...items.map(i => i.value), 1);
  return `<div class="trend-chart-container">
    <div class="trend-chart">
      ${items.map(i => {
        const height = Math.max((i.value / max) * 100, 2);
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
          <div style="font-size:7pt;color:#475569;margin-bottom:2px">${i.value}</div>
          <div class="trend-bar" style="width:100%;height:${height}%;background:${color}"></div>
          <div class="trend-bar-label">${i.label}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}
