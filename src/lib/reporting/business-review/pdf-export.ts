/**
 * PDF export for business review reports.
 * Generates branded HTML suitable for printing/PDF conversion.
 * Uses clean professional styling optimized for print.
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
  const reportTitle = data.period.type === 'monthly' ? 'Monthly Business Review' : 'Quarterly Business Review';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.company.name} — ${reportTitle} — ${data.period.label}</title>
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

  /* ---- COVER ---- */
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
    font-size: 11pt;
    color: #06b6d4;
    font-weight: 700;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .cover h1 { font-size: 28pt; font-weight: 800; margin-bottom: 4px; line-height: 1.2; }
  .cover h2 { font-size: 15pt; font-weight: 400; color: #67e8f9; margin-bottom: 20px; }
  .cover .meta { font-size: 10pt; color: #94a3b8; }

  /* ---- CONTENT ---- */
  .content { padding: 0 8px; }

  /* ---- SECTIONS ---- */
  .section {
    margin-bottom: 24px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px 24px;
    background: #ffffff;
  }
  .section-title {
    font-size: 13pt;
    font-weight: 700;
    color: #0e7490;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 6px;
    margin-bottom: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .narrative {
    font-size: 10.5pt;
    color: #475569;
    line-height: 1.7;
    margin-bottom: 12px;
  }

  /* ---- STAT GRID ---- */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  .stat-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 12px;
    text-align: center;
  }
  .stat-label {
    font-size: 8pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }
  .stat-value {
    font-size: 20pt;
    font-weight: 800;
    color: #0f172a;
    margin-top: 2px;
    line-height: 1.2;
  }
  .stat-value.na {
    color: #94a3b8;
    font-size: 14pt;
    font-style: italic;
    font-weight: 500;
  }
  .stat-sub { font-size: 8pt; color: #64748b; margin-top: 2px; }
  .change-up { color: #dc2626; }
  .change-down { color: #16a34a; }
  .change-flat { color: #94a3b8; }

  /* ---- TABLES ---- */
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th {
    background: #f1f5f9;
    color: #475569;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 12px;
    text-align: left;
    border-bottom: 2px solid #e2e8f0;
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 10pt;
    color: #334155;
  }
  tr:last-child td { border-bottom: none; }

  /* ---- RECOMMENDATIONS ---- */
  .rec-card {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 10px;
    background: #ffffff;
  }
  .rec-card.high { border-left: 4px solid #dc2626; background: #fef2f2; }
  .rec-card.medium { border-left: 4px solid #0891b2; background: #f0fdfa; }
  .rec-card.low { border-left: 4px solid #94a3b8; background: #f8fafc; }
  .rec-title { font-size: 10.5pt; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
  .rec-desc { font-size: 10pt; color: #475569; margin-bottom: 6px; }
  .rec-evidence { font-size: 9pt; color: #64748b; font-style: italic; }
  .rec-badge {
    display: inline-block;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 8px;
    border-radius: 4px;
    margin-right: 6px;
  }
  .badge-high { background: #fecaca; color: #991b1b; }
  .badge-medium { background: #a5f3fc; color: #155e75; }
  .badge-low { background: #e2e8f0; color: #475569; }

  /* ---- HEALTH SCORE ---- */
  .health-container { display: flex; align-items: center; gap: 20px; margin-bottom: 14px; }
  .health-score {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    font-size: 24pt;
    font-weight: 800;
    color: #ffffff;
    flex-shrink: 0;
  }
  .health-healthy { background: #10b981; }
  .health-watch { background: #0891b2; }
  .health-at-risk { background: #f97316; }
  .health-critical { background: #dc2626; }

  /* ---- PRIORITY BAR ---- */
  .priority-bar {
    height: 20px;
    border-radius: 6px;
    display: flex;
    overflow: hidden;
    margin-bottom: 12px;
  }

  /* ---- BANNERS ---- */
  .internal-banner {
    background: #fff7ed;
    border: 1px solid #fdba74;
    color: #c2410c;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 9pt;
    font-weight: 700;
    text-align: center;
    margin-bottom: 20px;
    letter-spacing: 1px;
  }

  /* ---- FOOTER ---- */
  .footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    color: #94a3b8;
    font-size: 8.5pt;
    text-align: center;
  }
  .footer p { margin-bottom: 2px; }

  /* ---- DOWNLOAD BUTTON (hidden in print) ---- */
  .download-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #0f172a;
    padding: 10px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .download-bar span { color: #94a3b8; font-size: 10pt; }
  .download-btn {
    background: #0891b2;
    color: #ffffff;
    border: none;
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 10pt;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
  }
  .download-btn:hover { background: #0e7490; }
  .spacer-for-bar { height: 52px; }
</style>
</head>
<body>

<!-- DOWNLOAD BAR (visible on screen, hidden on print) -->
<div class="download-bar no-print">
  <span>${data.company.name} — ${reportTitle} — ${data.period.label}</span>
  <button class="download-btn" onclick="window.print()">&#128196; Download PDF</button>
</div>
<div class="spacer-for-bar no-print"></div>

<!-- COVER -->
<div class="cover">
  <div class="brand-name">Triple Cities Tech</div>
  <h2>${reportTitle}</h2>
  <h1>${data.company.name}</h1>
  <div class="meta">${data.period.label} &mdash; ${data.period.start} to ${data.period.end}</div>
</div>

<div class="content">

${isInternal ? '<div class="internal-banner">&#9888; INTERNAL DOCUMENT — NOT FOR CUSTOMER DISTRIBUTION</div>' : ''}

<!-- EXECUTIVE SUMMARY -->
<div class="section avoid-break">
  <div class="section-title">Executive Summary</div>
  <div class="narrative">${narrative.executiveSummary}</div>
</div>

<!-- SUPPORT ACTIVITY -->
<div class="section avoid-break">
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
<div class="section page-break avoid-break">
  <div class="section-title">Service Performance</div>
  <div class="stat-grid">
    ${perfCard('Avg First Response', data.servicePerformance.avgFirstResponseMinutes, 'time')}
    ${perfCard('Avg Resolution', data.servicePerformance.avgResolutionMinutes, 'time', changeLabel(data.comparison.avgResolutionChange))}
    ${perfCard('First-Touch Resolution', data.servicePerformance.firstTouchResolutionRate, 'pct')}
    ${perfCard('Response SLA', data.servicePerformance.slaResponseCompliance, 'pct')}
    ${perfCard('Resolution SLA', data.servicePerformance.slaResolutionCompliance, 'pct')}
    ${perfCard('Reopen Rate', data.servicePerformance.reopenRate, 'pct')}
  </div>
  <div class="narrative">${narrative.performanceNarrative}</div>
</div>

<!-- PRIORITY BREAKDOWN -->
${data.priorityBreakdown.length > 0 ? `
<div class="section avoid-break">
  <div class="section-title">Priority Breakdown</div>
  <div class="priority-bar">
    ${data.priorityBreakdown.map(p => {
      const colors: Record<string, string> = { Critical: '#dc2626', High: '#f97316', Medium: '#0891b2', Low: '#8b5cf6' };
      return `<div style="width: ${p.percentage}%; background: ${colors[p.priority] || '#64748b'};" title="${p.priority}: ${p.count} (${p.percentage}%)"></div>`;
    }).join('')}
  </div>
  <table>
    <thead><tr><th>Priority</th><th style="text-align:right">Count</th><th style="text-align:right">Share</th><th style="text-align:right">Avg Resolution</th></tr></thead>
    <tbody>
    ${data.priorityBreakdown.map(p =>
      `<tr><td>${p.priority}</td><td style="text-align:right">${p.count}</td><td style="text-align:right">${p.percentage}%</td><td style="text-align:right">${p.avgResolutionMinutes !== null ? fmtMin(p.avgResolutionMinutes) : '<span style="color:#94a3b8">Pending</span>'}</td></tr>`
    ).join('')}
    </tbody>
  </table>
</div>` : ''}

<!-- TOP THEMES -->
${data.topThemes.length > 0 ? `
<div class="section avoid-break">
  <div class="section-title">Top Support Themes</div>
  <table>
    <thead><tr><th>Category</th><th style="text-align:right">Tickets</th><th style="text-align:right">Share</th><th style="text-align:center">Trend</th></tr></thead>
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
<div class="section page-break avoid-break">
  <div class="section-title">Customer Health Snapshot</div>
  ${data.healthSnapshot ? `
  <div class="health-container">
    <div class="health-score ${healthClass(data.healthSnapshot.tier)}">${Math.round(data.healthSnapshot.overallScore)}</div>
    <div>
      <div style="font-size: 14pt; font-weight: 700; color: #0f172a;">${data.healthSnapshot.tier}</div>
      ${data.healthSnapshot.trend ? `<div style="font-size: 9pt; color: #64748b;">Trend: ${data.healthSnapshot.trend}</div>` : ''}
      ${data.healthSnapshot.previousScore !== null ? `<div style="font-size: 9pt; color: #64748b;">Previous: ${Math.round(data.healthSnapshot.previousScore)}</div>` : ''}
    </div>
  </div>` : `
  <div style="text-align: center; padding: 20px; color: #94a3b8; font-style: italic;">
    Health scoring will be available once sufficient ticket history has been collected.
  </div>`}
  <div class="narrative">${narrative.healthNarrative}</div>
</div>

<!-- BACKLOG -->
${data.backlog.total > 0 ? `
<div class="section avoid-break">
  <div class="section-title">Open Ticket Backlog</div>
  <div class="stat-grid">
    ${statCard('Total Open', data.backlog.total)}
    ${statCard('Urgent', data.backlog.urgent)}
    ${statCard('High', data.backlog.high)}
  </div>
  <div class="stat-grid" style="grid-template-columns: repeat(2, 1fr);">
    ${statCard('Over 7 Days', data.backlog.agingOver7Days)}
    ${statCard('Over 30 Days', data.backlog.agingOver30Days)}
  </div>
</div>` : ''}

<!-- RECOMMENDATIONS -->
${visibleRecs.length > 0 ? `
<div class="section page-break">
  <div class="section-title">Strategic Recommendations</div>
  <div class="narrative">${narrative.recommendationsNarrative.split('\\n')[0]}</div>
  ${visibleRecs.map(r => `
  <div class="rec-card ${r.priority} avoid-break">
    <div style="margin-bottom: 6px;">
      <span class="rec-badge badge-${r.priority}">${r.priority}</span>
      <span class="rec-badge" style="background: #f1f5f9; color: #475569;">${r.category}</span>
    </div>
    <div class="rec-title">${r.title}</div>
    <div class="rec-desc">${r.description}</div>
    <div class="rec-evidence">Evidence: ${r.evidence}</div>
  </div>`).join('')}
</div>` : ''}

<!-- NOTABLE EVENTS -->
${data.notableEvents.length > 0 ? `
<div class="section avoid-break">
  <div class="section-title">Notable Events</div>
  <table>
    <thead><tr><th>Date</th><th>Event</th><th style="text-align:center">Severity</th></tr></thead>
    <tbody>
    ${data.notableEvents.map(e =>
      `<tr><td style="white-space:nowrap">${e.date}</td><td>${e.description}</td><td style="text-align:center">${e.severity}</td></tr>`
    ).join('')}
    </tbody>
  </table>
</div>` : ''}

${isInternal && narrative.internalNotes ? `
<div class="section page-break avoid-break">
  <div class="section-title" style="color: #c2410c;">Internal Notes</div>
  <div class="internal-banner">FOR INTERNAL USE ONLY</div>
  <div class="narrative" style="white-space: pre-line;">${narrative.internalNotes}</div>
</div>` : ''}

<div class="footer">
  <p>Generated by Triple Cities Tech &mdash; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
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

/**
 * Performance card — handles null values gracefully.
 * Instead of showing "N/A", shows a contextual message or styled placeholder.
 */
function perfCard(
  label: string,
  value: number | null,
  format: 'time' | 'pct',
  sub?: string,
): string {
  if (value === null) {
    return `<div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value na">—</div>
      <div class="stat-sub">Insufficient data</div>
    </div>`;
  }
  const formatted = format === 'time' ? fmtMin(value) : `${value}%`;
  return `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${formatted}</div>
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
