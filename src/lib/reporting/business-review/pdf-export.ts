/**
 * PDF export for business review reports.
 * Generates branded HTML suitable for printing/PDF conversion.
 * In serverless, we serve HTML with print-friendly styles that convert well to PDF via browser print.
 */

import {
  ReviewReportData,
  Recommendation,
  NarrativeSections,
  ReportVariant,
} from './types';

/**
 * Generate a branded HTML document optimized for PDF printing.
 */
export function generatePrintableHTML(
  data: ReviewReportData,
  recommendations: Recommendation[],
  narrative: NarrativeSections,
  variant: ReportVariant,
): string {
  const isInternal = variant === 'internal';
  const visibleRecs = isInternal ? recommendations : recommendations.filter(r => !r.internalOnly);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.company.name} — ${data.period.type === 'monthly' ? 'Monthly Business Review' : 'Quarterly Business Review'} — ${data.period.label}</title>
<style>
  @page { margin: 0.75in; size: letter; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-break { page-break-before: always; }
    .no-print { display: none !important; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    color: #1e293b;
    background: #ffffff;
    line-height: 1.6;
    font-size: 11pt;
  }
  .cover {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0e7490 100%);
    color: #ffffff;
    padding: 80px 60px;
    min-height: 300px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-radius: 0 0 24px 24px;
  }
  .cover h1 { font-size: 32pt; font-weight: 800; margin-bottom: 8px; }
  .cover h2 { font-size: 18pt; font-weight: 400; color: #06b6d4; margin-bottom: 24px; }
  .cover .meta { font-size: 11pt; color: #94a3b8; }
  .cover .brand { font-size: 12pt; color: #06b6d4; font-weight: 600; margin-top: 32px; letter-spacing: 1px; }
  .content { padding: 40px 60px; }
  .section { margin-bottom: 32px; }
  .section-title {
    font-size: 16pt;
    font-weight: 700;
    color: #0e7490;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 8px;
    margin-bottom: 16px;
  }
  .narrative { font-size: 11pt; color: #334155; line-height: 1.8; margin-bottom: 16px; }
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
    text-align: center;
  }
  .stat-label { font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-value { font-size: 22pt; font-weight: 800; color: #0f172a; margin-top: 4px; }
  .stat-sub { font-size: 9pt; color: #94a3b8; margin-top: 2px; }
  .change-up { color: #ef4444; }
  .change-down { color: #10b981; }
  .change-flat { color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th {
    background: #f1f5f9;
    color: #64748b;
    font-size: 9pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 12px;
    text-align: left;
    border-bottom: 2px solid #e2e8f0;
  }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 10pt; }
  .rec-card {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
  }
  .rec-card.high { border-color: #fecaca; background: #fef2f2; }
  .rec-card.medium { border-color: #bae6fd; background: #f0f9ff; }
  .rec-card.low { border-color: #e2e8f0; background: #f8fafc; }
  .rec-title { font-size: 11pt; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  .rec-desc { font-size: 10pt; color: #334155; margin-bottom: 8px; }
  .rec-evidence { font-size: 9pt; color: #64748b; font-style: italic; }
  .rec-badge {
    display: inline-block;
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 4px;
    margin-right: 8px;
  }
  .badge-high { background: #fecaca; color: #991b1b; }
  .badge-medium { background: #bae6fd; color: #075985; }
  .badge-low { background: #e2e8f0; color: #475569; }
  .health-score {
    display: inline-block;
    width: 80px;
    height: 80px;
    line-height: 80px;
    text-align: center;
    border-radius: 50%;
    font-size: 28pt;
    font-weight: 800;
    color: #ffffff;
  }
  .health-healthy { background: #10b981; }
  .health-watch { background: #06b6d4; }
  .health-at-risk { background: #f97316; }
  .health-critical { background: #ef4444; }
  .priority-bar {
    height: 24px;
    border-radius: 4px;
    display: flex;
    overflow: hidden;
    margin-bottom: 12px;
  }
  .internal-banner {
    background: #fef3c7;
    border: 1px solid #fbbf24;
    color: #92400e;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 10pt;
    font-weight: 600;
    text-align: center;
    margin-bottom: 24px;
  }
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    color: #94a3b8;
    font-size: 9pt;
    text-align: center;
  }
</style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <h2>${data.period.type === 'monthly' ? 'Monthly Business Review' : 'Quarterly Business Review'}</h2>
  <h1>${data.company.name}</h1>
  <div class="meta">${data.period.label} &mdash; ${data.period.start} to ${data.period.end}</div>
  <div class="brand">TRIPLE CITIES TECH</div>
</div>

<div class="content">

${isInternal ? '<div class="internal-banner">INTERNAL DOCUMENT — NOT FOR CUSTOMER DISTRIBUTION</div>' : ''}

<!-- EXECUTIVE SUMMARY -->
<div class="section">
  <div class="section-title">Executive Summary</div>
  <div class="narrative">${narrative.executiveSummary}</div>
</div>

<!-- SUPPORT ACTIVITY -->
<div class="section">
  <div class="section-title">Support Activity Overview</div>
  <div class="stat-grid">
    ${statCard('Tickets Created', data.supportActivity.ticketsCreated, changeLabel(data.comparison.ticketsCreatedChange))}
    ${statCard('Tickets Closed', data.supportActivity.ticketsClosed, changeLabel(data.comparison.ticketsClosedChange))}
    ${statCard('Support Hours', `${data.supportActivity.supportHoursConsumed}h`, changeLabel(data.comparison.supportHoursChange))}
    ${statCard('Reopened', data.supportActivity.ticketsReopened)}
    ${statCard('Net Change', data.supportActivity.netTicketChange > 0 ? `+${data.supportActivity.netTicketChange}` : `${data.supportActivity.netTicketChange}`)}
    ${statCard('Billable Hours', `${data.supportActivity.billableHoursConsumed}h`)}
  </div>
  <div class="narrative">${narrative.supportActivityNarrative}</div>
</div>

<!-- SERVICE PERFORMANCE -->
<div class="section page-break">
  <div class="section-title">Service Performance</div>
  <div class="stat-grid">
    ${statCard('Avg Response', data.servicePerformance.avgFirstResponseMinutes !== null ? fmtMin(data.servicePerformance.avgFirstResponseMinutes) : 'N/A')}
    ${statCard('Avg Resolution', data.servicePerformance.avgResolutionMinutes !== null ? fmtMin(data.servicePerformance.avgResolutionMinutes) : 'N/A', changeLabel(data.comparison.avgResolutionChange))}
    ${statCard('FTR Rate', data.servicePerformance.firstTouchResolutionRate !== null ? `${data.servicePerformance.firstTouchResolutionRate}%` : 'N/A')}
    ${statCard('Response SLA', data.servicePerformance.slaResponseCompliance !== null ? `${data.servicePerformance.slaResponseCompliance}%` : 'N/A')}
    ${statCard('Resolution SLA', data.servicePerformance.slaResolutionCompliance !== null ? `${data.servicePerformance.slaResolutionCompliance}%` : 'N/A')}
    ${statCard('Reopen Rate', data.servicePerformance.reopenRate !== null ? `${data.servicePerformance.reopenRate}%` : 'N/A')}
  </div>
  <div class="narrative">${narrative.performanceNarrative}</div>
</div>

<!-- PRIORITY BREAKDOWN -->
${data.priorityBreakdown.length > 0 ? `
<div class="section">
  <div class="section-title">Priority Breakdown</div>
  <div class="priority-bar">
    ${data.priorityBreakdown.map(p => {
      const colors: Record<string, string> = { Critical: '#ef4444', High: '#f97316', Medium: '#06b6d4', Low: '#8b5cf6' };
      return `<div style="width: ${p.percentage}%; background: ${colors[p.priority] || '#64748b'};" title="${p.priority}: ${p.count} (${p.percentage}%)"></div>`;
    }).join('')}
  </div>
  <table>
    <thead><tr><th>Priority</th><th style="text-align:right">Count</th><th style="text-align:right">%</th><th style="text-align:right">Avg Resolution</th></tr></thead>
    <tbody>
    ${data.priorityBreakdown.map(p =>
      `<tr><td>${p.priority}</td><td style="text-align:right">${p.count}</td><td style="text-align:right">${p.percentage}%</td><td style="text-align:right">${p.avgResolutionMinutes !== null ? fmtMin(p.avgResolutionMinutes) : '-'}</td></tr>`
    ).join('')}
    </tbody>
  </table>
</div>` : ''}

<!-- TOP THEMES -->
${data.topThemes.length > 0 ? `
<div class="section">
  <div class="section-title">Top Support Themes</div>
  <table>
    <thead><tr><th>Category</th><th style="text-align:right">Tickets</th><th style="text-align:right">%</th><th style="text-align:center">Trend</th></tr></thead>
    <tbody>
    ${data.topThemes.map(t => {
      const arrow = t.trend === 'up' ? '&#9650;' : t.trend === 'down' ? '&#9660;' : '&#9654;';
      const color = t.trend === 'up' ? 'change-up' : t.trend === 'down' ? 'change-down' : 'change-flat';
      return `<tr><td>${t.category}</td><td style="text-align:right">${t.count}</td><td style="text-align:right">${t.percentage}%</td><td style="text-align:center" class="${color}">${arrow}</td></tr>`;
    }).join('')}
    </tbody>
  </table>
  <div class="narrative">${narrative.themesNarrative}</div>
</div>` : ''}

<!-- HEALTH SNAPSHOT -->
<div class="section page-break">
  <div class="section-title">Customer Health Snapshot</div>
  ${data.healthSnapshot ? `
  <div style="display: flex; align-items: center; gap: 24px; margin-bottom: 16px;">
    <div class="health-score ${healthClass(data.healthSnapshot.tier)}">${Math.round(data.healthSnapshot.overallScore)}</div>
    <div>
      <div style="font-size: 16pt; font-weight: 700; color: #0f172a;">${data.healthSnapshot.tier}</div>
      ${data.healthSnapshot.trend ? `<div style="font-size: 10pt; color: #64748b;">Trend: ${data.healthSnapshot.trend}</div>` : ''}
      ${data.healthSnapshot.previousScore !== null ? `<div style="font-size: 10pt; color: #64748b;">Previous: ${Math.round(data.healthSnapshot.previousScore)}</div>` : ''}
    </div>
  </div>` : ''}
  <div class="narrative">${narrative.healthNarrative}</div>
</div>

<!-- BACKLOG -->
${data.backlog.total > 0 ? `
<div class="section">
  <div class="section-title">Open Ticket Backlog</div>
  <div class="stat-grid">
    ${statCard('Total Open', data.backlog.total)}
    ${statCard('Urgent', data.backlog.urgent)}
    ${statCard('High', data.backlog.high)}
    ${statCard('>7 Days Old', data.backlog.agingOver7Days)}
    ${statCard('>30 Days Old', data.backlog.agingOver30Days)}
  </div>
</div>` : ''}

<!-- RECOMMENDATIONS -->
${visibleRecs.length > 0 ? `
<div class="section page-break">
  <div class="section-title">Strategic Recommendations</div>
  <div class="narrative">${narrative.recommendationsNarrative.split('\\n')[0]}</div>
  ${visibleRecs.map(r => `
  <div class="rec-card ${r.priority}">
    <div>
      <span class="rec-badge badge-${r.priority}">${r.priority}</span>
      <span class="rec-badge" style="background: #e2e8f0; color: #475569;">${r.category}</span>
    </div>
    <div class="rec-title" style="margin-top: 8px;">${r.title}</div>
    <div class="rec-desc">${r.description}</div>
    <div class="rec-evidence">Evidence: ${r.evidence}</div>
  </div>`).join('')}
</div>` : ''}

<!-- NOTABLE EVENTS -->
${data.notableEvents.length > 0 ? `
<div class="section">
  <div class="section-title">Notable Events</div>
  <table>
    <thead><tr><th>Date</th><th>Event</th><th style="text-align:center">Severity</th></tr></thead>
    <tbody>
    ${data.notableEvents.map(e =>
      `<tr><td>${e.date}</td><td>${e.description}</td><td style="text-align:center">${e.severity}</td></tr>`
    ).join('')}
    </tbody>
  </table>
</div>` : ''}

${isInternal && narrative.internalNotes ? `
<div class="section page-break">
  <div class="section-title" style="color: #92400e;">Internal Notes</div>
  <div class="internal-banner">FOR INTERNAL USE ONLY</div>
  <div class="narrative" style="white-space: pre-line;">${narrative.internalNotes}</div>
</div>` : ''}

<div class="footer">
  <p>Generated by Triple Cities Tech Reporting System &mdash; ${new Date().toLocaleDateString()}</p>
  <p>${isInternal ? 'INTERNAL DOCUMENT' : `Prepared for ${data.company.name}`}</p>
</div>

</div>
</body>
</html>`;
}

// ============================================
// TEMPLATE HELPERS
// ============================================

function statCard(label: string, value: string | number, sub?: string): string {
  return `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}

function changeLabel(change: number | null): string | undefined {
  if (change === null) return undefined;
  const cls = change > 0 ? 'change-up' : change < 0 ? 'change-down' : 'change-flat';
  const arrow = change > 0 ? '&#9650;' : change < 0 ? '&#9660;' : '&#9654;';
  return `<span class="${cls}">${arrow} ${Math.abs(change)}% vs prior</span>`;
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
