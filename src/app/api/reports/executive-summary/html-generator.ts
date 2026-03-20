/**
 * HTML generator for the Annual Executive Summary report.
 * Produces a branded, print-ready document that can be shared as PDF.
 */

import { ExecutiveSummaryData } from './route';

export function generateExecutiveSummaryHTML(data: ExecutiveSummaryData): string {
  const { company, period, ticketSummary: ts, alertSummary: as_, healthScore } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${company.name} — Annual Executive Summary</title>
<style>
  @page { margin: 0.5in 0.6in; size: letter; }
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
    font-size: 10pt;
  }

  /* DOWNLOAD BAR */
  .download-bar {
    position: fixed; top: 0; left: 0; right: 0;
    background: #0f172a; padding: 10px 24px;
    display: flex; align-items: center; justify-content: space-between;
    z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .download-bar span { color: #94a3b8; font-size: 10pt; }
  .download-btn {
    background: #0891b2; color: #fff; border: none;
    padding: 8px 20px; border-radius: 6px;
    font-size: 10pt; font-weight: 600; cursor: pointer;
  }
  .download-btn:hover { background: #0e7490; }
  .spacer-for-bar { height: 52px; }

  /* COVER */
  .cover {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0e7490 100%);
    color: #fff; padding: 48px 56px; border-radius: 0 0 16px 16px; margin-bottom: 28px;
  }
  .cover .brand { font-size: 10pt; color: #06b6d4; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 16px; }
  .cover h1 { font-size: 26pt; font-weight: 800; line-height: 1.2; margin-bottom: 4px; }
  .cover h2 { font-size: 14pt; font-weight: 400; color: #67e8f9; margin-bottom: 16px; }
  .cover .meta { font-size: 9.5pt; color: #94a3b8; }

  .content { padding: 0 8px; }

  /* SECTIONS */
  .section { margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 22px; }
  .section-title {
    font-size: 12pt; font-weight: 700; color: #0e7490;
    border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;
    margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .sub-title { font-size: 10pt; font-weight: 700; color: #334155; margin: 12px 0 6px; }

  /* STAT GRID */
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
  .stat-grid-3 { grid-template-columns: repeat(3, 1fr); }
  .stat-card {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
    padding: 12px 10px; text-align: center;
  }
  .stat-label { font-size: 7.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .stat-value { font-size: 18pt; font-weight: 800; color: #0f172a; margin-top: 2px; line-height: 1.2; }
  .stat-sub { font-size: 7.5pt; color: #64748b; margin-top: 2px; }

  /* TABLES */
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th {
    background: #f1f5f9; color: #475569; font-size: 7.5pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px;
    padding: 7px 10px; text-align: left; border-bottom: 2px solid #e2e8f0;
  }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; font-size: 9.5pt; color: #334155; }
  tr:last-child td { border-bottom: none; }

  /* PRIORITY BAR */
  .priority-bar { height: 18px; border-radius: 6px; display: flex; overflow: hidden; margin-bottom: 10px; }

  /* HEALTH */
  .health-container { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
  .health-circle {
    width: 64px; height: 64px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 20pt; font-weight: 800; color: #fff; flex-shrink: 0;
  }
  .health-healthy { background: #10b981; }
  .health-watch { background: #0891b2; }
  .health-at-risk { background: #f97316; }
  .health-critical { background: #dc2626; }

  /* ALERT SEVERITY */
  .sev-critical { color: #dc2626; font-weight: 700; }
  .sev-high { color: #f97316; font-weight: 700; }
  .sev-moderate { color: #0891b2; font-weight: 600; }
  .sev-low { color: #8b5cf6; }
  .sev-information { color: #64748b; }

  /* MONTHLY CHART (CSS bar chart) */
  .bar-chart { display: flex; align-items: flex-end; gap: 4px; height: 120px; margin: 10px 0; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .bar { width: 100%; border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.3s; }
  .bar-created { background: #0891b2; }
  .bar-closed { background: #10b981; }
  .bar-label { font-size: 6.5pt; color: #64748b; margin-top: 4px; writing-mode: vertical-rl; text-orientation: mixed; }
  .bar-value { font-size: 6.5pt; color: #334155; font-weight: 600; margin-bottom: 2px; }
  .chart-legend { display: flex; gap: 16px; font-size: 8pt; color: #64748b; margin-bottom: 8px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; margin-right: 4px; vertical-align: middle; }

  /* FOOTER */
  .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 8pt; text-align: center; }
</style>
</head>
<body>

<div class="download-bar no-print">
  <span>${company.name} — Annual Executive Summary — ${period.start} to ${period.end}</span>
  <button class="download-btn" onclick="window.print()">&#128196; Download PDF</button>
</div>
<div class="spacer-for-bar no-print"></div>

<!-- COVER -->
<div class="cover">
  <div class="brand">Triple Cities Tech</div>
  <h2>Annual Executive Summary</h2>
  <h1>${company.name}</h1>
  <div class="meta">${period.start} to ${period.end} (${period.days} days)${healthScore ? ` &mdash; Health: ${healthScore.tier} (${healthScore.score}/100)` : ''}</div>
</div>

<div class="content">

<!-- OVERVIEW STATS -->
<div class="section avoid-break">
  <div class="section-title">Support Overview</div>
  <div class="stat-grid">
    ${statCard('Tickets Created', ts.totalCreated)}
    ${statCard('Tickets Closed', ts.totalClosed)}
    ${statCard('Currently Open', ts.totalOpen)}
    ${statCard('Support Hours', `${ts.totalHours}h`)}
  </div>
  <div class="stat-grid">
    ${statCard('Billable Hours', `${ts.totalBillableHours}h`)}
    ${statCard('Avg Resolution', ts.avgResolutionMinutes !== null ? fmtMin(ts.avgResolutionMinutes) : '—')}
    ${statCard('Avg First Response', ts.avgFirstResponseMinutes !== null ? fmtMin(ts.avgFirstResponseMinutes) : '—')}
    ${statCard('Close Rate', ts.totalCreated > 0 ? `${Math.round((ts.totalClosed / ts.totalCreated) * 100)}%` : '—')}
  </div>
</div>

<!-- MONTHLY TREND -->
<div class="section avoid-break">
  <div class="section-title">Monthly Ticket Trend</div>
  <div class="chart-legend">
    <span><span class="legend-dot" style="background:#0891b2;"></span> Created</span>
    <span><span class="legend-dot" style="background:#10b981;"></span> Closed</span>
  </div>
  ${renderMonthlyChart(ts.monthlyTrend)}
  <table>
    <thead><tr><th>Month</th><th style="text-align:right">Created</th><th style="text-align:right">Closed</th><th style="text-align:right">Hours</th></tr></thead>
    <tbody>
    ${ts.monthlyTrend.map(m =>
      `<tr><td>${m.month}</td><td style="text-align:right">${m.created}</td><td style="text-align:right">${m.closed}</td><td style="text-align:right">${m.hours}h</td></tr>`
    ).join('')}
    </tbody>
  </table>
</div>

<!-- PRIORITY BREAKDOWN -->
${ts.byPriority.length > 0 ? `
<div class="section page-break avoid-break">
  <div class="section-title">Priority Breakdown</div>
  <div class="priority-bar">
    ${ts.byPriority.map(p => {
      const colors: Record<string, string> = { Critical: '#dc2626', Urgent: '#dc2626', High: '#f97316', Medium: '#0891b2', Low: '#8b5cf6' };
      return `<div style="width:${p.percentage}%;background:${colors[p.label] || '#64748b'};" title="${p.label}: ${p.count} (${p.percentage}%)"></div>`;
    }).join('')}
  </div>
  <table>
    <thead><tr><th>Priority</th><th style="text-align:right">Count</th><th style="text-align:right">Share</th></tr></thead>
    <tbody>
    ${ts.byPriority.map(p =>
      `<tr><td>${p.label}</td><td style="text-align:right">${p.count}</td><td style="text-align:right">${p.percentage}%</td></tr>`
    ).join('')}
    </tbody>
  </table>
</div>` : ''}

<!-- QUEUE BREAKDOWN -->
${ts.byQueue.length > 0 ? `
<div class="section avoid-break">
  <div class="section-title">Tickets by Queue / Category</div>
  <table>
    <thead><tr><th>Queue</th><th style="text-align:right">Count</th><th style="text-align:right">Share</th></tr></thead>
    <tbody>
    ${ts.byQueue.map(q =>
      `<tr><td>${q.label}</td><td style="text-align:right">${q.count}</td><td style="text-align:right">${q.percentage}%</td></tr>`
    ).join('')}
    </tbody>
  </table>
</div>` : ''}

<!-- STATUS BREAKDOWN -->
${ts.byStatus.length > 0 ? `
<div class="section avoid-break">
  <div class="section-title">Current Ticket Status Distribution</div>
  <table>
    <thead><tr><th>Status</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>
    ${ts.byStatus.map(s =>
      `<tr><td>${s.label}</td><td style="text-align:right">${s.count}</td></tr>`
    ).join('')}
    </tbody>
  </table>
</div>` : ''}

${healthScore ? `
<!-- HEALTH SCORE -->
<div class="section avoid-break">
  <div class="section-title">Customer Health Score</div>
  <div class="health-container">
    <div class="health-circle ${healthClass(healthScore.tier)}">${Math.round(healthScore.score)}</div>
    <div>
      <div style="font-size:14pt;font-weight:700;color:#0f172a;">${healthScore.tier}</div>
      <div style="font-size:9pt;color:#64748b;">Score: ${healthScore.score} / 100</div>
    </div>
  </div>
</div>` : ''}

${as_ ? renderAlertSection(as_) : `
<div class="section avoid-break">
  <div class="section-title">Datto RMM Alerts</div>
  <div style="text-align:center;padding:16px;color:#94a3b8;font-style:italic;">
    Datto RMM is not configured or no alerts matched this company.
  </div>
</div>`}

<div class="footer">
  <p>Generated by Triple Cities Tech &mdash; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <p>Prepared for ${company.name} &mdash; Confidential</p>
</div>

</div>
</body>
</html>`;
}

// ============================================
// TEMPLATE HELPERS
// ============================================

function statCard(label: string, value: string | number): string {
  return `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
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

function renderMonthlyChart(trend: Array<{ month: string; created: number; closed: number }>): string {
  if (trend.length === 0) return '<div style="color:#94a3b8;text-align:center;">No data</div>';

  const maxVal = Math.max(...trend.map(m => Math.max(m.created, m.closed)), 1);

  return `<div class="bar-chart">
    ${trend.map(m => {
      const createdH = Math.max((m.created / maxVal) * 100, 2);
      const closedH = Math.max((m.closed / maxVal) * 100, 2);
      const label = m.month.split('-')[1]; // just month number
      return `<div class="bar-col">
        <div style="display:flex;gap:2px;align-items:flex-end;width:100%;height:100%;">
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
            <div class="bar-value">${m.created || ''}</div>
            <div class="bar bar-created" style="height:${createdH}%;"></div>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
            <div class="bar-value">${m.closed || ''}</div>
            <div class="bar bar-closed" style="height:${closedH}%;"></div>
          </div>
        </div>
        <div class="bar-label">${label}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderAlertSection(as_: NonNullable<import('./route').ExecutiveSummaryData['alertSummary']>): string {
  const sevOrder = ['critical', 'high', 'moderate', 'low', 'information'];
  const sevEntries = Object.entries(as_.bySeverity)
    .sort(([a], [b]) => {
      const ai = sevOrder.indexOf(a.toLowerCase());
      const bi = sevOrder.indexOf(b.toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  return `
<!-- DATTO RMM ALERTS -->
<div class="section page-break avoid-break">
  <div class="section-title">Datto RMM Alerts</div>
  <div class="stat-grid stat-grid-3">
    ${statCard('Total Alerts', as_.total)}
    ${statCard('Currently Open', as_.openAlerts)}
    ${statCard('Resolved', as_.total - as_.openAlerts)}
  </div>

  ${sevEntries.length > 0 ? `
  <div class="sub-title">By Severity</div>
  <table>
    <thead><tr><th>Severity</th><th style="text-align:right">Count</th><th style="text-align:right">Share</th></tr></thead>
    <tbody>
    ${sevEntries.map(([sev, count]) =>
      `<tr><td><span class="sev-${sev.toLowerCase()}">${sev}</span></td><td style="text-align:right">${count}</td><td style="text-align:right">${as_.total > 0 ? Math.round((count / as_.total) * 100) : 0}%</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${Object.keys(as_.byType).length > 0 ? `
  <div class="sub-title">By Alert Type</div>
  <table>
    <thead><tr><th>Type</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>
    ${Object.entries(as_.byType).sort(([,a],[,b]) => b - a).slice(0, 10).map(([type, count]) =>
      `<tr><td>${escHtml(type)}</td><td style="text-align:right">${count}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${as_.byDevice.length > 0 ? `
  <div class="sub-title">Top Devices by Alert Volume</div>
  <table>
    <thead><tr><th>Device</th><th style="text-align:right">Alerts</th></tr></thead>
    <tbody>
    ${as_.byDevice.slice(0, 10).map(d =>
      `<tr><td>${escHtml(d.hostname)}</td><td style="text-align:right">${d.count}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${as_.topAlertMessages.length > 0 ? `
  <div class="sub-title">Most Common Alert Messages</div>
  <table>
    <thead><tr><th>Message</th><th style="text-align:right">Occurrences</th></tr></thead>
    <tbody>
    ${as_.topAlertMessages.map(m =>
      `<tr><td style="font-size:8.5pt;">${escHtml(m.message)}</td><td style="text-align:right">${m.count}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}

  ${as_.monthlyTrend.length > 0 ? `
  <div class="sub-title">Monthly Alert Trend</div>
  <table>
    <thead><tr><th>Month</th><th style="text-align:right">Alerts</th></tr></thead>
    <tbody>
    ${as_.monthlyTrend.map(m =>
      `<tr><td>${m.month}</td><td style="text-align:right">${m.count}</td></tr>`
    ).join('')}
    </tbody>
  </table>` : ''}
</div>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
