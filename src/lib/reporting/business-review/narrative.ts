/**
 * Template-based narrative generator for business reviews.
 * All narratives are grounded in actual metrics — no fabricated claims.
 */

import {
  ReviewReportData,
  Recommendation,
  NarrativeSections,
  ReportVariant,
} from './types';

export function generateNarrative(
  data: ReviewReportData,
  recommendations: Recommendation[],
  variant: ReportVariant,
): NarrativeSections {
  return {
    executiveSummary: buildExecutiveSummary(data, recommendations),
    supportActivityNarrative: buildSupportActivityNarrative(data),
    performanceNarrative: buildPerformanceNarrative(data),
    themesNarrative: buildThemesNarrative(data),
    healthNarrative: buildHealthNarrative(data),
    recommendationsNarrative: buildRecommendationsNarrative(recommendations),
    ...(variant === 'internal' ? { internalNotes: buildInternalNotes(data, recommendations) } : {}),
  };
}

// ============================================
// EXECUTIVE SUMMARY
// ============================================

function buildExecutiveSummary(data: ReviewReportData, recs: Recommendation[]): string {
  const { supportActivity: sa, servicePerformance: sp, comparison: comp, period } = data;
  const parts: string[] = [];

  // Opening
  parts.push(`During ${period.label}, ${data.company.name} submitted ${sa.ticketsCreated} support tickets and consumed ${sa.supportHoursConsumed} hours of support time.`);

  // Volume trend
  if (comp.ticketsCreatedChange !== null) {
    if (comp.ticketsCreatedChange > 10) {
      parts.push(`Ticket volume increased ${comp.ticketsCreatedChange}% compared to ${comp.previousPeriod.label}, indicating growing support demand.`);
    } else if (comp.ticketsCreatedChange < -10) {
      parts.push(`Ticket volume decreased ${Math.abs(comp.ticketsCreatedChange)}% compared to ${comp.previousPeriod.label}, reflecting improved stability.`);
    } else {
      parts.push(`Ticket volume remained consistent with ${comp.previousPeriod.label}.`);
    }
  }

  // Performance headline
  if (sp.slaResponseCompliance !== null && sp.slaResolutionCompliance !== null) {
    const avgSla = (sp.slaResponseCompliance + sp.slaResolutionCompliance) / 2;
    if (avgSla >= 90) {
      parts.push(`Service level performance was strong, with ${Math.round(avgSla)}% SLA compliance.`);
    } else if (avgSla >= 70) {
      parts.push(`SLA compliance was ${Math.round(avgSla)}%, with opportunities for improvement.`);
    } else {
      parts.push(`SLA compliance of ${Math.round(avgSla)}% fell below target levels and warrants immediate attention.`);
    }
  }

  // Health
  if (data.healthSnapshot) {
    parts.push(`The overall customer health score is ${data.healthSnapshot.overallScore}, rated as "${data.healthSnapshot.tier}".`);
  }

  // Recommendations summary
  const highPriority = recs.filter(r => r.priority === 'high' && !r.internalOnly);
  if (highPriority.length > 0) {
    parts.push(`${highPriority.length} high-priority recommendation${highPriority.length > 1 ? 's are' : ' is'} included in this review.`);
  }

  return parts.join(' ');
}

// ============================================
// SUPPORT ACTIVITY NARRATIVE
// ============================================

function buildSupportActivityNarrative(data: ReviewReportData): string {
  const { supportActivity: sa, comparison: comp, period } = data;
  const parts: string[] = [];

  parts.push(`${data.company.name} generated ${sa.ticketsCreated} support tickets during ${period.label}, with ${sa.ticketsClosed} resolved.`);

  if (sa.netTicketChange > 0) {
    parts.push(`The net increase of ${sa.netTicketChange} tickets indicates that incoming volume exceeded resolution capacity.`);
  } else if (sa.netTicketChange < 0) {
    parts.push(`The team resolved ${Math.abs(sa.netTicketChange)} more tickets than were created, reducing the overall backlog.`);
  } else {
    parts.push(`Ticket creation and resolution rates were balanced.`);
  }

  parts.push(`Total support time consumed was ${sa.supportHoursConsumed} hours (${sa.billableHoursConsumed} billable).`);

  if (sa.ticketsReopened > 0) {
    parts.push(`${sa.ticketsReopened} ticket${sa.ticketsReopened > 1 ? 's were' : ' was'} reopened after initial closure.`);
  }

  if (comp.supportHoursChange !== null && Math.abs(comp.supportHoursChange) > 15) {
    const direction = comp.supportHoursChange > 0 ? 'increased' : 'decreased';
    parts.push(`Support hours ${direction} ${Math.abs(comp.supportHoursChange)}% compared to ${comp.previousPeriod.label}.`);
  }

  return parts.join(' ');
}

// ============================================
// PERFORMANCE NARRATIVE
// ============================================

function buildPerformanceNarrative(data: ReviewReportData): string {
  const sp = data.servicePerformance;
  const parts: string[] = [];

  if (sp.avgFirstResponseMinutes !== null) {
    parts.push(`Average first response time was ${formatMinutes(sp.avgFirstResponseMinutes)}${sp.medianFirstResponseMinutes !== null ? ` (median: ${formatMinutes(sp.medianFirstResponseMinutes)})` : ''}.`);
  }

  if (sp.avgResolutionMinutes !== null) {
    parts.push(`Average time to resolution was ${formatMinutes(sp.avgResolutionMinutes)}${sp.medianResolutionMinutes !== null ? ` (median: ${formatMinutes(sp.medianResolutionMinutes)})` : ''}.`);
  }

  if (sp.firstTouchResolutionRate !== null) {
    parts.push(`${sp.firstTouchResolutionRate}% of tickets were resolved on first contact.`);
  }

  if (sp.slaResponseCompliance !== null) {
    parts.push(`Response SLA compliance: ${sp.slaResponseCompliance}%.`);
  }
  if (sp.slaResolutionCompliance !== null) {
    parts.push(`Resolution SLA compliance: ${sp.slaResolutionCompliance}%.`);
  }

  if (sp.reopenRate !== null && sp.reopenRate > 5) {
    parts.push(`The ${sp.reopenRate}% reopen rate suggests some tickets may need more thorough initial resolution.`);
  }

  if (data.comparison.avgResolutionChange !== null && Math.abs(data.comparison.avgResolutionChange) > 15) {
    if (data.comparison.avgResolutionChange > 0) {
      parts.push(`Resolution times increased ${data.comparison.avgResolutionChange}% from the prior period.`);
    } else {
      parts.push(`Resolution times improved ${Math.abs(data.comparison.avgResolutionChange)}% from the prior period.`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : 'Insufficient performance data for this period.';
}

// ============================================
// THEMES NARRATIVE
// ============================================

function buildThemesNarrative(data: ReviewReportData): string {
  if (data.topThemes.length === 0) {
    return 'No distinct support themes were identified for this period.';
  }

  const parts: string[] = [];
  const top = data.topThemes[0];

  parts.push(`The most common support category was "${top.category}" with ${top.count} tickets (${top.percentage}% of total).`);

  if (data.topThemes.length > 1) {
    const others = data.topThemes.slice(1, 4).map(t => `"${t.category}" (${t.count})`).join(', ');
    parts.push(`Other notable categories include ${others}.`);
  }

  const rising = data.topThemes.filter(t => t.trend === 'up');
  if (rising.length > 0) {
    parts.push(`Categories trending upward: ${rising.map(t => `"${t.category}"`).join(', ')}.`);
  }

  const declining = data.topThemes.filter(t => t.trend === 'down');
  if (declining.length > 0) {
    parts.push(`Categories trending downward: ${declining.map(t => `"${t.category}"`).join(', ')}.`);
  }

  return parts.join(' ');
}

// ============================================
// HEALTH NARRATIVE
// ============================================

function buildHealthNarrative(data: ReviewReportData): string {
  if (!data.healthSnapshot) {
    return 'Customer health scoring is not yet available for this account. Health scores will be computed when sufficient historical data is available.';
  }

  const h = data.healthSnapshot;
  const parts: string[] = [];

  parts.push(`${data.company.name}'s overall health score is ${h.overallScore} out of 100, rated as "${h.tier}".`);

  if (h.previousScore !== null) {
    const diff = h.overallScore - h.previousScore;
    if (Math.abs(diff) > 3) {
      parts.push(`This represents a ${diff > 0 ? 'positive' : 'negative'} change of ${Math.abs(Math.round(diff))} points from the previous assessment.`);
    } else {
      parts.push(`The score has remained stable compared to the previous assessment.`);
    }
  }

  // Highlight strongest and weakest factors
  const factors = Object.entries(h.factors).sort((a, b) => b[1] - a[1]);
  if (factors.length > 0) {
    const strongest = factors[0];
    const weakest = factors[factors.length - 1];
    const factorLabels: Record<string, string> = {
      ticketVolumeTrend: 'ticket volume stability',
      reopenRate: 'reopen rate',
      priorityMix: 'priority mix',
      supportHoursTrend: 'support hours trend',
      avgResolutionTime: 'resolution time',
      agingTickets: 'aging ticket management',
      slaCompliance: 'SLA compliance',
    };

    parts.push(`Strongest area: ${factorLabels[strongest[0]] || strongest[0]} (${Math.round(strongest[1])}/100).`);
    if (weakest[1] < 60) {
      parts.push(`Area needing attention: ${factorLabels[weakest[0]] || weakest[0]} (${Math.round(weakest[1])}/100).`);
    }
  }

  return parts.join(' ');
}

// ============================================
// RECOMMENDATIONS NARRATIVE
// ============================================

function buildRecommendationsNarrative(recs: Recommendation[]): string {
  const customerRecs = recs.filter(r => !r.internalOnly);
  if (customerRecs.length === 0) {
    return 'No specific recommendations at this time. Overall service metrics are within acceptable ranges.';
  }

  const parts: string[] = [];
  parts.push(`Based on the data reviewed, we have ${customerRecs.length} recommendation${customerRecs.length > 1 ? 's' : ''} for consideration:`);

  for (const rec of customerRecs) {
    parts.push(`\n${rec.title}: ${rec.description}`);
  }

  return parts.join('');
}

// ============================================
// INTERNAL NOTES (staff-only)
// ============================================

function buildInternalNotes(data: ReviewReportData, recs: Recommendation[]): string {
  const parts: string[] = [];

  parts.push('=== INTERNAL PREPARATION NOTES ===\n');

  // Account risk assessment
  if (data.healthSnapshot) {
    if (data.healthSnapshot.tier === 'At Risk' || data.healthSnapshot.tier === 'Critical') {
      parts.push(`RISK: Customer health is ${data.healthSnapshot.tier} (${data.healthSnapshot.overallScore}/100). Approach this meeting with sensitivity and a clear action plan.\n`);
    }
  }

  // Volume context
  if (data.comparison.ticketsCreatedChange !== null && data.comparison.ticketsCreatedChange > 30) {
    parts.push(`TALKING POINT: Volume increased ${data.comparison.ticketsCreatedChange}%. Be prepared to explain what drove the increase.\n`);
  }

  // Internal recommendations
  const internalRecs = recs.filter(r => r.internalOnly);
  if (internalRecs.length > 0) {
    parts.push('INTERNAL ACTION ITEMS:');
    for (const rec of internalRecs) {
      parts.push(`- ${rec.title}: ${rec.description}`);
    }
    parts.push('');
  }

  // Suggested talking points
  parts.push('SUGGESTED TALKING POINTS:');
  if (data.supportActivity.ticketsClosed > data.supportActivity.ticketsCreated) {
    parts.push('- Highlight backlog reduction progress');
  }
  if (data.servicePerformance.slaResponseCompliance !== null && data.servicePerformance.slaResponseCompliance >= 90) {
    parts.push('- Emphasize strong SLA performance');
  }
  if (data.servicePerformance.firstTouchResolutionRate !== null && data.servicePerformance.firstTouchResolutionRate >= 30) {
    parts.push('- Note high first-touch resolution rate');
  }
  if (data.topThemes.length > 0 && data.topThemes[0].trend === 'down') {
    parts.push(`- Positive trend: "${data.topThemes[0].category}" tickets declining`);
  }

  return parts.join('\n');
}

// ============================================
// HELPERS
// ============================================

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} minutes`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hours`;
  return `${(minutes / 1440).toFixed(1)} days`;
}
