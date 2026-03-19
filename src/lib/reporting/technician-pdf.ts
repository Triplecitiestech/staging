/**
 * PDF export for technician performance reports.
 * Generates branded HTML optimized for print/PDF conversion.
 * Follows the same pattern as business-review/pdf-export.ts.
 */

import type { TechnicianSummary, ComparisonData } from './types';

interface TechPdfData {
  summary: TechnicianSummary[];
  period: { from: string; to: string };
  comparison?: {
    ticketsClosed: ComparisonData;
    hoursLogged: ComparisonData;
    avgResolution: ComparisonData;
  };
  techComparison?: Array<{
    resourceId: number;
    name: string;
    ticketsClosed: ComparisonData;
    hoursLogged: ComparisonData;
    avgResolution: ComparisonData;
    firstTouchResolutionRate: ComparisonData;
    avgFirstResponse: ComparisonData;
  }>;
  benchmarks?: Array<{
    metricKey: string;
    actual: number;
    target: number;
    unit: string;
    meetingTarget: boolean;
    percentOfTarget: number;
  }>;
  generatedAt: string;
  selectedTechnician?: string;
}

/**
 * Generate a branded HTML document for technician performance, optimized for PDF printing.
 */
export function generateTechnicianPrintableHTML(data: TechPdfData): string {
  const totalClosed = data.summary.reduce((s, t) => s + t.ticketsClosed, 0);
  const totalHours = Math.round(data.summary.reduce((s, t) => s + t.hoursLogged, 0) * 10) / 10;
  const totalBillable = Math.round(data.summary.reduce((s, t) => s + t.billableHoursLogged, 0) * 10) / 10;
  const totalOpen = data.summary.reduce((s, t) => s + t.openTicketCount, 0);
  const utilizationRate = totalHours > 0 ? Math.round((totalBillable / totalHours) * 100) : 0;

  const techsWithFTR = data.summary.filter(t => t.firstTouchResolutionRate !== null);
  const teamFTR = techsWithFTR.length > 0
    ? Math.round(techsWithFTR.reduce((s, t) => s + (t.firstTouchResolutionRate ?? 0), 0) / techsWithFTR.length * 10) / 10
    : null;
  const techsWithFRT = data.summary.filter(t => t.avgFirstResponseMinutes !== null);
  const teamFRT = techsWithFRT.length > 0
    ? Math.round(techsWithFRT.reduce((s, t) => s + (t.avgFirstResponseMinutes ?? 0), 0) / techsWithFRT.length)
    : null;

  const title = data.selectedTechnician
    ? `${data.selectedTechnician} — Performance Report`
    : 'Technician Performance Report';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — ${data.period.from} to ${data.period.to}</title>
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

  /* ---- STAT GRID ---- */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  .stat-grid-3 {
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
  .stat-sub { font-size: 8pt; color: #64748b; margin-top: 2px; }
  .change-up { color: #16a34a; }
  .change-down { color: #dc2626; }

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
  .text-right { text-align: right; }

  /* ---- BENCHMARK ---- */
  .benchmark-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  .benchmark-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 12px;
  }
  .benchmark-label { font-size: 8pt; color: #64748b; text-transform: uppercase; font-weight: 600; }
  .benchmark-value { font-size: 16pt; font-weight: 800; color: #0f172a; margin-top: 2px; }
  .benchmark-target { font-size: 8pt; color: #94a3b8; margin-top: 2px; }
  .benchmark-bar { height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 6px; overflow: hidden; }
  .benchmark-fill { height: 100%; border-radius: 3px; }
  .fill-green { background: #10b981; }
  .fill-cyan { background: #06b6d4; }
  .fill-rose { background: #f43f5e; }
  .badge-on-target { display: inline-block; font-size: 7pt; background: #d1fae5; color: #065f46; padding: 1px 6px; border-radius: 4px; font-weight: 700; }
  .badge-below-target { display: inline-block; font-size: 7pt; background: #ffe4e6; color: #9f1239; padding: 1px 6px; border-radius: 4px; font-weight: 700; }

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

  /* ---- DOWNLOAD BAR (hidden in print) ---- */
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
  <span>${title} &mdash; ${data.period.from} to ${data.period.to}</span>
  <button class="download-btn" onclick="window.print()">&#128196; Download PDF</button>
</div>
<div class="spacer-for-bar no-print"></div>

<!-- COVER -->
<div class="cover">
  <div class="brand-name">Triple Cities Tech</div>
  <h2>Technician Performance Report</h2>
  <h1>${data.selectedTechnician || 'All Technicians'}</h1>
  <div class="meta">${data.period.from} to ${data.period.to}</div>
</div>

<div class="content">

<!-- SUMMARY METRICS -->
<div class="section avoid-break">
  <div class="section-title">Performance Summary</div>
  <div class="stat-grid">
    ${statCard('Tickets Closed', totalClosed, compSub(data.comparison?.ticketsClosed))}
    ${statCard('Hours Logged', `${totalHours}h`, compSub(data.comparison?.hoursLogged, 'h'))}
    ${statCard('Active Technicians', data.summary.length)}
    ${statCard('Avg Resolution', data.comparison?.avgResolution ? fmtMin(data.comparison.avgResolution.current) : 'N/A', compSub(data.comparison?.avgResolution, '', true))}
  </div>
  <div class="stat-grid">
    ${statCard('First Touch Resolution', teamFTR !== null ? `${teamFTR}%` : 'N/A')}
    ${statCard('Avg First Response', teamFRT !== null ? fmtMin(teamFRT) : 'N/A')}
    ${statCard('Billable Utilization', `${utilizationRate}%`, `${totalBillable}h of ${totalHours}h`)}
    ${statCard('Open Backlog', totalOpen)}
  </div>
</div>

<!-- TECHNICIAN TABLE -->
<div class="section${data.summary.length > 15 ? ' page-break' : ''} avoid-break">
  <div class="section-title">Individual Technician Metrics</div>
  <table>
    <thead>
      <tr>
        <th>Technician</th>
        <th class="text-right">Closed</th>
        <th class="text-right">Hours</th>
        <th class="text-right">Billable</th>
        <th class="text-right">Avg First Response</th>
        <th class="text-right">Avg Resolution</th>
        <th class="text-right">FTR Rate</th>
        <th class="text-right">Open</th>
      </tr>
    </thead>
    <tbody>
      ${data.summary.map(tech => `
      <tr>
        <td><strong>${esc(tech.firstName)} ${esc(tech.lastName)}</strong><br><span style="font-size: 8pt; color: #94a3b8;">${esc(tech.email)}</span></td>
        <td class="text-right">${tech.ticketsClosed}</td>
        <td class="text-right">${tech.hoursLogged}h</td>
        <td class="text-right">${tech.billableHoursLogged}h</td>
        <td class="text-right">${tech.avgFirstResponseMinutes !== null ? fmtMin(tech.avgFirstResponseMinutes) : '-'}</td>
        <td class="text-right">${tech.avgResolutionMinutes !== null ? fmtMin(tech.avgResolutionMinutes) : '-'}</td>
        <td class="text-right">${tech.firstTouchResolutionRate !== null ? `${tech.firstTouchResolutionRate}%` : '-'}</td>
        <td class="text-right">${tech.openTicketCount}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>

${data.techComparison && data.techComparison.length > 0 ? `
<!-- COMPARISON -->
<div class="section page-break avoid-break">
  <div class="section-title">Current vs Previous Period</div>
  <table>
    <thead>
      <tr>
        <th>Technician</th>
        <th class="text-right">Tickets (Now)</th>
        <th class="text-right">Tickets (Prev)</th>
        <th class="text-right">Hours (Now)</th>
        <th class="text-right">Hours (Prev)</th>
        <th class="text-right">Change</th>
      </tr>
    </thead>
    <tbody>
      ${data.techComparison.map(tc => {
        const ticketChange = tc.ticketsClosed.changePercent;
        const changeClass = ticketChange !== null && ticketChange > 0 ? 'change-up' : ticketChange !== null && ticketChange < 0 ? 'change-down' : '';
        return `
      <tr>
        <td><strong>${esc(tc.name)}</strong></td>
        <td class="text-right">${tc.ticketsClosed.current}</td>
        <td class="text-right" style="color: #94a3b8;">${tc.ticketsClosed.previous}</td>
        <td class="text-right">${tc.hoursLogged.current}h</td>
        <td class="text-right" style="color: #94a3b8;">${tc.hoursLogged.previous}h</td>
        <td class="text-right ${changeClass}">${ticketChange !== null ? `${ticketChange > 0 ? '+' : ''}${ticketChange}%` : '-'}</td>
      </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>` : ''}

${data.benchmarks && data.benchmarks.length > 0 ? `
<!-- BENCHMARKS -->
<div class="section avoid-break">
  <div class="section-title">Performance Benchmarks</div>
  <div class="benchmark-grid">
    ${data.benchmarks.map(b => {
      const pct = Math.min(b.percentOfTarget, 100);
      const fillClass = b.meetingTarget ? 'fill-green' : pct >= 75 ? 'fill-cyan' : 'fill-rose';
      return `
    <div class="benchmark-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div class="benchmark-label">${b.metricKey.replace(/_/g, ' ')}</div>
        <span class="${b.meetingTarget ? 'badge-on-target' : 'badge-below-target'}">${b.meetingTarget ? 'ON TARGET' : 'BELOW TARGET'}</span>
      </div>
      <div class="benchmark-value">${b.actual}${b.unit}</div>
      <div class="benchmark-target">Target: ${b.target}${b.unit}</div>
      <div class="benchmark-bar"><div class="benchmark-fill ${fillClass}" style="width: ${pct}%;"></div></div>
    </div>`;
    }).join('')}
  </div>
</div>` : ''}

<div class="footer">
  <p>Generated by Triple Cities Tech &mdash; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <p>Technician Performance Report &mdash; ${data.period.from} to ${data.period.to}</p>
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

function compSub(comp: ComparisonData | undefined, unit: string = '', invert: boolean = false): string | undefined {
  if (!comp || comp.changePercent === null) return undefined;
  const pct = comp.changePercent;
  const isPositive = pct > 0;
  const cls = invert
    ? (isPositive ? 'change-down' : 'change-up')
    : (isPositive ? 'change-up' : 'change-down');
  const arrow = isPositive ? '&#9650;' : '&#9660;';
  return `<span class="${cls}">${arrow} ${Math.abs(pct)}% vs prior (was ${comp.previous}${unit})</span>`;
}

function fmtMin(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
