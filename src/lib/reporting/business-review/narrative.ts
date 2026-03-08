/**
 * Template-based narrative generator for business reviews.
 * All narratives are grounded in actual metrics — no fabricated claims.
 *
 * Customer-facing narratives lead with successes and frame areas for improvement
 * as collaborative next steps. Internal narratives are candid and data-driven.
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
    executiveSummary: buildExecutiveSummary(data, recommendations, variant),
    supportActivityNarrative: buildSupportActivityNarrative(data, variant),
    performanceNarrative: buildPerformanceNarrative(data, variant),
    themesNarrative: buildThemesNarrative(data),
    healthNarrative: buildHealthNarrative(data, variant),
    recommendationsNarrative: buildRecommendationsNarrative(recommendations, variant),
    ...(variant === 'internal' ? { internalNotes: buildInternalNotes(data, recommendations) } : {}),
  };
}

// ============================================
// EXECUTIVE SUMMARY
// ============================================

function buildExecutiveSummary(data: ReviewReportData, recs: Recommendation[], variant: ReportVariant): string {
  const { supportActivity: sa, servicePerformance: sp, comparison: comp, period } = data;
  const parts: string[] = [];
  const isCustomer = variant === 'customer';

  // Opening — lead with what we accomplished
  if (isCustomer) {
    parts.push(`During ${period.label}, our team managed ${sa.ticketsCreated} support ${sa.ticketsCreated === 1 ? 'request' : 'requests'} for ${data.company.name} and resolved ${sa.ticketsClosed}, investing ${sa.supportHoursConsumed} hours of dedicated support time.`);
  } else {
    parts.push(`During ${period.label}, ${data.company.name} submitted ${sa.ticketsCreated} support tickets and consumed ${sa.supportHoursConsumed} hours of support time.`);
  }

  // Volume trend — frame decrease as success
  if (comp.ticketsCreatedChange !== null) {
    if (comp.ticketsCreatedChange < -10) {
      const decrease = Math.abs(comp.ticketsCreatedChange);
      if (isCustomer) {
        parts.push(`Support requests decreased ${decrease}% compared to ${comp.previousPeriod.label}, reflecting the positive impact of our ongoing infrastructure improvements and proactive maintenance.`);
      } else {
        parts.push(`Ticket volume decreased ${decrease}% compared to ${comp.previousPeriod.label}, reflecting improved stability.`);
      }
    } else if (comp.ticketsCreatedChange > 10) {
      if (isCustomer) {
        parts.push(`We saw a ${comp.ticketsCreatedChange}% increase in support requests compared to ${comp.previousPeriod.label}, and our team scaled up to ensure every issue received prompt attention.`);
      } else {
        parts.push(`Ticket volume increased ${comp.ticketsCreatedChange}% compared to ${comp.previousPeriod.label}, indicating growing support demand.`);
      }
    } else {
      parts.push(`Support volume remained consistent with ${comp.previousPeriod.label}.`);
    }
  }

  // Cross-period resolutions
  if (sa.crossPeriodResolutions > 0 && isCustomer) {
    parts.push(`Notably, we also completed ${sa.crossPeriodResolutions} outstanding ${sa.crossPeriodResolutions === 1 ? 'request' : 'requests'} carried over from the previous period.`);
  }

  // Performance — lead with strengths
  if (sp.slaResponseCompliance !== null && sp.slaResolutionCompliance !== null) {
    const avgSla = (sp.slaResponseCompliance + sp.slaResolutionCompliance) / 2;
    if (avgSla >= 90) {
      parts.push(isCustomer
        ? `Our service level performance was excellent, maintaining ${Math.round(avgSla)}% SLA compliance.`
        : `Service level performance was strong, with ${Math.round(avgSla)}% SLA compliance.`);
    } else if (avgSla >= 70) {
      parts.push(isCustomer
        ? `Our SLA compliance was ${Math.round(avgSla)}%, and we have identified specific steps to drive this higher.`
        : `SLA compliance was ${Math.round(avgSla)}%, with opportunities for improvement.`);
    } else {
      parts.push(isCustomer
        ? `SLA compliance was ${Math.round(avgSla)}% this period. We are actively implementing process improvements to strengthen our response and resolution times for your team.`
        : `SLA compliance of ${Math.round(avgSla)}% fell below target levels and warrants immediate attention.`);
    }
  }

  // FTR success
  if (sp.firstTouchResolutionRate !== null && sp.firstTouchResolutionRate > 0 && isCustomer) {
    parts.push(`${sp.firstTouchResolutionRate}% of your requests were resolved on first contact without escalation.`);
  }

  // Reopen success
  if (sp.reopenRate !== null && sp.reopenRate === 0 && sa.ticketsClosed > 0 && isCustomer) {
    parts.push(`All resolved tickets remained closed with no reopens, reflecting thorough resolution quality.`);
  }

  // Health
  if (data.healthSnapshot) {
    if (isCustomer) {
      if (data.healthSnapshot.tier === 'Healthy') {
        parts.push(`Your overall account health score is ${data.healthSnapshot.overallScore}, rated as "${data.healthSnapshot.tier}" — a strong indicator of a well-managed IT environment.`);
      } else {
        parts.push(`Your overall account health score is ${data.healthSnapshot.overallScore} out of 100, and we're focused on continuing to improve this.`);
      }
    } else {
      parts.push(`The overall customer health score is ${data.healthSnapshot.overallScore}, rated as "${data.healthSnapshot.tier}".`);
    }
  }

  // Recommendations — customer-friendly framing
  const customerRecs = recs.filter(r => !r.internalOnly);
  if (customerRecs.length > 0 && isCustomer) {
    parts.push(`We've identified ${customerRecs.length} ${customerRecs.length === 1 ? 'opportunity' : 'opportunities'} to further strengthen your IT environment, detailed in this review.`);
  } else {
    const highPriority = recs.filter(r => r.priority === 'high' && !r.internalOnly);
    if (highPriority.length > 0) {
      parts.push(`${highPriority.length} high-priority recommendation${highPriority.length > 1 ? 's are' : ' is'} included in this review.`);
    }
  }

  return parts.join(' ');
}

// ============================================
// SUPPORT ACTIVITY NARRATIVE
// ============================================

function buildSupportActivityNarrative(data: ReviewReportData, variant: ReportVariant): string {
  const { supportActivity: sa, comparison: comp, period } = data;
  const parts: string[] = [];
  const isCustomer = variant === 'customer';

  if (isCustomer) {
    parts.push(`Our team handled ${sa.ticketsCreated} support ${sa.ticketsCreated === 1 ? 'request' : 'requests'} during ${period.label}, successfully resolving ${sa.ticketsClosed}.`);
  } else {
    parts.push(`${data.company.name} generated ${sa.ticketsCreated} support tickets during ${period.label}, with ${sa.ticketsClosed} resolved.`);
  }

  // Net change explanation — handle cross-period properly
  if (sa.netTicketChange > 0) {
    if (isCustomer) {
      parts.push(`We're continuing to work through your queue — ${sa.netTicketChange} ${sa.netTicketChange === 1 ? 'request is' : 'requests are'} still in progress and being actively addressed.`);
    } else {
      parts.push(`The net increase of ${sa.netTicketChange} tickets indicates that incoming volume exceeded resolution capacity.`);
    }
  } else if (sa.netTicketChange < 0) {
    const extra = Math.abs(sa.netTicketChange);
    if (sa.crossPeriodResolutions > 0) {
      if (isCustomer) {
        parts.push(`We resolved ${extra} more ${extra === 1 ? 'request' : 'requests'} than were submitted this period, including ${sa.crossPeriodResolutions} carried over from prior ${sa.crossPeriodResolutions === 1 ? 'period' : 'periods'} — actively reducing your backlog.`);
      } else {
        parts.push(`The team resolved ${extra} more tickets than were created (${sa.crossPeriodResolutions} were carry-overs from prior periods), reducing the overall backlog.`);
      }
    } else {
      if (isCustomer) {
        parts.push(`We resolved ${extra} more ${extra === 1 ? 'request' : 'requests'} than were submitted, actively reducing your backlog.`);
      } else {
        parts.push(`The team resolved ${extra} more tickets than were created, reducing the overall backlog.`);
      }
    }
  } else {
    if (isCustomer) {
      parts.push(`Every request submitted was resolved during the period, keeping your support queue clear.`);
    } else {
      parts.push(`Ticket creation and resolution rates were balanced.`);
    }
  }

  parts.push(`Total support time invested was ${sa.supportHoursConsumed} hours (${sa.billableHoursConsumed} billable).`);

  if (sa.ticketsReopened > 0) {
    parts.push(`${sa.ticketsReopened} ticket${sa.ticketsReopened > 1 ? 's were' : ' was'} reopened after initial closure.`);
  } else if (sa.ticketsClosed > 0 && isCustomer) {
    parts.push(`No tickets required reopening, demonstrating effective first-time resolution.`);
  }

  if (comp.supportHoursChange !== null && Math.abs(comp.supportHoursChange) > 15) {
    const direction = comp.supportHoursChange > 0 ? 'increased' : 'decreased';
    if (isCustomer && comp.supportHoursChange < -15) {
      parts.push(`Support hours decreased ${Math.abs(comp.supportHoursChange)}% compared to ${comp.previousPeriod.label}, indicating a more stable environment.`);
    } else {
      parts.push(`Support hours ${direction} ${Math.abs(comp.supportHoursChange)}% compared to ${comp.previousPeriod.label}.`);
    }
  }

  return parts.join(' ');
}

// ============================================
// PERFORMANCE NARRATIVE
// ============================================

function buildPerformanceNarrative(data: ReviewReportData, variant: ReportVariant): string {
  const sp = data.servicePerformance;
  const parts: string[] = [];
  const isCustomer = variant === 'customer';

  if (sp.avgFirstResponseMinutes !== null) {
    if (isCustomer && sp.avgFirstResponseMinutes <= 30) {
      parts.push(`Our team's average first response time was ${formatMinutes(sp.avgFirstResponseMinutes)}${sp.medianFirstResponseMinutes !== null ? ` (median: ${formatMinutes(sp.medianFirstResponseMinutes)})` : ''}, ensuring your issues received rapid initial attention.`);
    } else {
      parts.push(`Average first response time was ${formatMinutes(sp.avgFirstResponseMinutes)}${sp.medianFirstResponseMinutes !== null ? ` (median: ${formatMinutes(sp.medianFirstResponseMinutes)})` : ''}.`);
    }
  }

  if (sp.avgResolutionMinutes !== null) {
    parts.push(`Average time to resolution was ${formatMinutes(sp.avgResolutionMinutes)}${sp.medianResolutionMinutes !== null ? ` (median: ${formatMinutes(sp.medianResolutionMinutes)})` : ''}.`);
  }

  if (sp.firstTouchResolutionRate !== null) {
    if (isCustomer && sp.firstTouchResolutionRate >= 30) {
      parts.push(`${sp.firstTouchResolutionRate}% of your requests were resolved on first contact, minimizing disruption to your team.`);
    } else if (sp.firstTouchResolutionRate > 0) {
      parts.push(`${sp.firstTouchResolutionRate}% of tickets were resolved on first contact.`);
    }
  }

  if (sp.slaResponseCompliance !== null) {
    if (isCustomer && sp.slaResponseCompliance >= 90) {
      parts.push(`Response SLA compliance: ${sp.slaResponseCompliance}% — meeting our commitment to rapid response.`);
    } else {
      parts.push(`Response SLA compliance: ${sp.slaResponseCompliance}%.`);
    }
  }
  if (sp.slaResolutionCompliance !== null) {
    if (isCustomer && sp.slaResolutionCompliance >= 90) {
      parts.push(`Resolution SLA compliance: ${sp.slaResolutionCompliance}% — meeting our resolution targets.`);
    } else {
      parts.push(`Resolution SLA compliance: ${sp.slaResolutionCompliance}%.`);
    }
  }

  if (sp.reopenRate !== null) {
    if (sp.reopenRate === 0 && data.supportActivity.ticketsClosed > 0 && isCustomer) {
      parts.push(`Zero tickets were reopened this period, reflecting thorough resolution practices.`);
    } else if (sp.reopenRate > 5) {
      if (isCustomer) {
        parts.push(`The reopen rate of ${sp.reopenRate}% is something we are actively working to improve through enhanced verification steps before ticket closure.`);
      } else {
        parts.push(`The ${sp.reopenRate}% reopen rate suggests some tickets may need more thorough initial resolution.`);
      }
    }
  }

  if (data.comparison.avgResolutionChange !== null && Math.abs(data.comparison.avgResolutionChange) > 15) {
    if (data.comparison.avgResolutionChange > 0) {
      if (isCustomer) {
        parts.push(`Resolution times were ${data.comparison.avgResolutionChange}% longer than the prior period, which can reflect more complex issues being addressed. We are reviewing our processes to improve this.`);
      } else {
        parts.push(`Resolution times increased ${data.comparison.avgResolutionChange}% from the prior period.`);
      }
    } else {
      if (isCustomer) {
        parts.push(`Resolution times improved ${Math.abs(data.comparison.avgResolutionChange)}% compared to the prior period, getting your issues resolved faster.`);
      } else {
        parts.push(`Resolution times improved ${Math.abs(data.comparison.avgResolutionChange)}% from the prior period.`);
      }
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

  parts.push(`The most common support category was "${top.category}" with ${top.count} ${top.count === 1 ? 'ticket' : 'tickets'} (${top.percentage}% of total).`);

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

function buildHealthNarrative(data: ReviewReportData, variant: ReportVariant): string {
  if (!data.healthSnapshot) {
    return 'Customer health scoring is not yet available for this account. Health scores will be computed when sufficient historical data is available.';
  }

  const h = data.healthSnapshot;
  const parts: string[] = [];
  const isCustomer = variant === 'customer';

  if (isCustomer) {
    if (h.tier === 'Healthy') {
      parts.push(`${data.company.name}'s overall account health score is ${h.overallScore} out of 100, rated as "${h.tier}" — indicating a well-managed and stable IT environment.`);
    } else if (h.tier === 'Watch') {
      parts.push(`${data.company.name}'s overall account health score is ${h.overallScore} out of 100. We're actively monitoring a few areas to keep your environment performing at its best.`);
    } else {
      parts.push(`${data.company.name}'s overall account health score is ${h.overallScore} out of 100. Our team has identified specific focus areas to improve this score, and we're committed to driving it higher.`);
    }
  } else {
    parts.push(`${data.company.name}'s overall health score is ${h.overallScore} out of 100, rated as "${h.tier}".`);
  }

  if (h.previousScore !== null) {
    const diff = h.overallScore - h.previousScore;
    if (diff > 3) {
      parts.push(isCustomer
        ? `This represents a ${Math.round(diff)}-point improvement from the previous assessment, reflecting the positive impact of our joint efforts.`
        : `This represents a positive change of ${Math.round(diff)} points from the previous assessment.`);
    } else if (diff < -3) {
      parts.push(isCustomer
        ? `The score shifted ${Math.abs(Math.round(diff))} points from the previous assessment, and we have a plan to address the contributing factors.`
        : `This represents a negative change of ${Math.abs(Math.round(diff))} points from the previous assessment.`);
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
      if (isCustomer) {
        parts.push(`Area of focus: ${factorLabels[weakest[0]] || weakest[0]} (${Math.round(weakest[1])}/100) — we're working on targeted improvements here.`);
      } else {
        parts.push(`Area needing attention: ${factorLabels[weakest[0]] || weakest[0]} (${Math.round(weakest[1])}/100).`);
      }
    }
  }

  return parts.join(' ');
}

// ============================================
// RECOMMENDATIONS NARRATIVE
// ============================================

function buildRecommendationsNarrative(recs: Recommendation[], variant: ReportVariant): string {
  const customerRecs = recs.filter(r => !r.internalOnly);
  const isCustomer = variant === 'customer';

  if (customerRecs.length === 0) {
    return isCustomer
      ? 'Your IT environment is performing well across all key metrics. We will continue to monitor and proactively maintain your systems.'
      : 'No specific recommendations at this time. Overall service metrics are within acceptable ranges.';
  }

  const parts: string[] = [];
  if (isCustomer) {
    parts.push(`Based on our analysis, we've identified ${customerRecs.length} ${customerRecs.length === 1 ? 'opportunity' : 'opportunities'} to further strengthen your IT environment:`);
  } else {
    parts.push(`Based on the data reviewed, we have ${customerRecs.length} recommendation${customerRecs.length > 1 ? 's' : ''} for consideration:`);
  }

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
  if (data.supportActivity.crossPeriodResolutions > 0) {
    parts.push(`- Emphasize ${data.supportActivity.crossPeriodResolutions} carry-over tickets resolved from prior periods`);
  }
  if (data.servicePerformance.slaResponseCompliance !== null && data.servicePerformance.slaResponseCompliance >= 90) {
    parts.push('- Emphasize strong SLA performance');
  }
  if (data.servicePerformance.firstTouchResolutionRate !== null && data.servicePerformance.firstTouchResolutionRate >= 30) {
    parts.push('- Note high first-touch resolution rate');
  }
  if (data.servicePerformance.reopenRate !== null && data.servicePerformance.reopenRate === 0 && data.supportActivity.ticketsClosed > 0) {
    parts.push('- Highlight zero reopen rate — every ticket resolved right the first time');
  }
  if (data.topThemes.length > 0 && data.topThemes[0].trend === 'down') {
    parts.push(`- Positive trend: "${data.topThemes[0].category}" tickets declining`);
  }
  if (data.comparison.ticketsCreatedChange !== null && data.comparison.ticketsCreatedChange < -20) {
    parts.push(`- Volume decrease of ${Math.abs(data.comparison.ticketsCreatedChange)}% — credit proactive maintenance`);
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
