/**
 * Rules-based recommendation engine for business reviews.
 * Each rule evaluates metrics and produces zero or one recommendation.
 *
 * Customer-facing recommendations are framed as collaborative opportunities
 * and proactive next steps, not problems or criticisms.
 * Internal-only recommendations are candid and action-oriented.
 */

import { ReviewReportData, Recommendation, ReportVariant } from './types';

type RecommendationRule = (data: ReviewReportData, variant: ReportVariant) => Recommendation | null;

/**
 * Generate recommendations for a business review.
 * Filters by variant: internal-only recs excluded from customer view.
 */
export function generateRecommendations(
  data: ReviewReportData,
  variant: ReportVariant,
): Recommendation[] {
  const allRecs = RULES.map(rule => rule(data, variant)).filter(nonNull);

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  allRecs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Filter out internal-only for customer variant
  if (variant === 'customer') {
    return allRecs.filter(r => !r.internalOnly);
  }

  return allRecs;
}

function nonNull<T>(v: T | null): v is T {
  return v !== null;
}

// ============================================
// RECOMMENDATION RULES
// ============================================

const RULES: RecommendationRule[] = [
  // High reopen rate → quality improvement opportunity
  (data, variant) => {
    const rate = data.servicePerformance.reopenRate;
    if (rate === null || rate <= 8) return null;
    const isCustomer = variant === 'customer';
    return {
      id: 'high-reopen-rate',
      category: 'quality',
      priority: rate > 15 ? 'high' : 'medium',
      title: isCustomer ? 'Enhancing Resolution Quality' : 'Reduce Ticket Reopen Rate',
      description: isCustomer
        ? `We've identified an opportunity to improve first-time resolution quality. We're implementing enhanced verification steps before closing tickets and improving our resolution documentation to ensure issues stay resolved.`
        : `The reopen rate of ${rate}% indicates tickets are being closed before issues are fully resolved. Implementing a verification step before closure and improving resolution documentation can help reduce this.`,
      evidence: `Reopen rate: ${rate}%. ${data.supportActivity.ticketsReopened} tickets were reopened during this period.`,
      internalOnly: false,
    };
  },

  // Rising ticket volume → proactive environment review
  (data, variant) => {
    const change = data.comparison.ticketsCreatedChange;
    if (change === null || change <= 25) return null;
    const isCustomer = variant === 'customer';
    return {
      id: 'rising-ticket-volume',
      category: 'strategic',
      priority: change > 50 ? 'high' : 'medium',
      title: isCustomer ? 'Proactive Environment Review' : 'Investigate Rising Support Demand',
      description: isCustomer
        ? `We've seen a ${change}% increase in support requests this period. To get ahead of this trend, we recommend a proactive review of your environment to identify and address root causes — reducing future disruptions and support needs.`
        : `Ticket volume increased ${change}% compared to the previous period. This may indicate underlying infrastructure issues, new user onboarding challenges, or aging systems requiring attention. A root cause analysis is recommended.`,
      evidence: `${data.supportActivity.ticketsCreated} tickets this period (${change}% increase vs prior).`,
      internalOnly: false,
    };
  },

  // Slow response times → improving responsiveness
  (data, variant) => {
    const frt = data.servicePerformance.avgFirstResponseMinutes;
    if (frt === null || frt <= 120) return null;
    const isCustomer = variant === 'customer';
    return {
      id: 'slow-response-times',
      category: 'process',
      priority: frt > 480 ? 'high' : 'medium',
      title: isCustomer ? 'Accelerating Response Times' : 'Improve Initial Response Times',
      description: isCustomer
        ? `We're working to improve our initial response times for your team. We're optimizing our triage workflows and alert routing to ensure your requests receive even faster initial attention.`
        : `Average first response time is ${formatMinutes(frt)}, which may impact issue resolution speed. Reviewing triage workflows, alert routing, and technician availability can help improve responsiveness.`,
      evidence: `Avg first response: ${formatMinutes(frt)}. Median: ${data.servicePerformance.medianFirstResponseMinutes !== null ? formatMinutes(data.servicePerformance.medianFirstResponseMinutes) : 'N/A'}.`,
      internalOnly: false,
    };
  },

  // SLA gaps → strengthening service delivery
  (data, variant) => {
    const respSla = data.servicePerformance.slaResponseCompliance;
    const resSla = data.servicePerformance.slaResolutionCompliance;
    const worstSla = Math.min(respSla ?? 100, resSla ?? 100);
    if (worstSla >= 85) return null;
    const isCustomer = variant === 'customer';
    return {
      id: 'sla-non-compliance',
      category: 'capacity',
      priority: worstSla < 70 ? 'high' : 'medium',
      title: isCustomer ? 'Strengthening Service Level Performance' : 'Address SLA Performance Gaps',
      description: isCustomer
        ? `We're implementing targeted improvements to strengthen our SLA performance for your account. This includes optimizing our escalation procedures and capacity allocation to ensure we consistently meet our service commitments.`
        : `SLA compliance has dropped to ${worstSla}%. This may require adjusting capacity allocation, reviewing escalation procedures, or refining ticket prioritization to ensure service level commitments are met.`,
      evidence: `Response SLA: ${respSla !== null ? `${respSla}%` : 'N/A'}. Resolution SLA: ${resSla !== null ? `${resSla}%` : 'N/A'}.`,
      internalOnly: false,
    };
  },

  // High-priority concentration → proactive remediation
  (data, variant) => {
    const urgentHigh = data.priorityBreakdown
      .filter(p => p.priorityValue <= 2)
      .reduce((s, p) => s + p.count, 0);
    const total = data.priorityBreakdown.reduce((s, p) => s + p.count, 0);
    if (total === 0) return null;
    const pct = (urgentHigh / total) * 100;
    if (pct <= 30) return null;
    const isCustomer = variant === 'customer';
    return {
      id: 'high-priority-concentration',
      category: 'strategic',
      priority: pct > 50 ? 'high' : 'medium',
      title: isCustomer ? 'Proactive High-Priority Issue Prevention' : 'Reduce High-Priority Incident Volume',
      description: isCustomer
        ? `${Math.round(pct)}% of your support requests this period were Critical or High priority. We recommend a targeted root-cause review to proactively prevent these types of issues, reducing disruption to your team and improving overall system stability.`
        : `${Math.round(pct)}% of tickets are Critical or High priority, suggesting systemic issues that could benefit from proactive remediation. Identifying and addressing the root causes of recurring critical issues will improve overall service stability.`,
      evidence: `${urgentHigh} of ${total} tickets (${Math.round(pct)}%) were Critical or High priority.`,
      internalOnly: false,
    };
  },

  // Dominant issue category → targeted improvement
  (data, variant) => {
    if (data.topThemes.length === 0) return null;
    const topTheme = data.topThemes[0];
    if (topTheme.percentage < 30) return null;
    const isCustomer = variant === 'customer';
    return {
      id: 'dominant-issue-category',
      category: 'strategic',
      priority: topTheme.percentage > 50 ? 'high' : 'medium',
      title: isCustomer
        ? `Targeted "${topTheme.category}" Improvement Plan`
        : `Address Recurring "${topTheme.category}" Issues`,
      description: isCustomer
        ? `"${topTheme.category}" represents ${topTheme.percentage}% of your support requests. We'd like to work with your team on a targeted improvement plan for this area, which could meaningfully reduce your overall support needs and improve day-to-day operations.`
        : `"${topTheme.category}" accounts for ${topTheme.percentage}% of all support tickets. A targeted improvement plan for this area could significantly reduce overall support demand.`,
      evidence: `${topTheme.count} tickets (${topTheme.percentage}%) in "${topTheme.category}" category.${topTheme.trend === 'up' ? ' Trending upward vs previous period.' : ''}`,
      internalOnly: false,
    };
  },

  // Growing backlog → accelerating resolution
  (data) => {
    if (data.backlog.total < 5) return null;
    if (data.supportActivity.netTicketChange <= 0) return null;
    return {
      id: 'growing-backlog',
      category: 'capacity',
      priority: data.backlog.total > 20 ? 'high' : 'medium',
      title: 'Accelerating Backlog Resolution',
      description: `We're prioritizing your open ticket backlog of ${data.backlog.total} items. Our team is allocating additional focus to work through these, starting with the ${data.backlog.urgent + data.backlog.high} urgent and high-priority items.`,
      evidence: `Backlog: ${data.backlog.total} total (${data.backlog.urgent} urgent, ${data.backlog.high} high). Net ticket change: +${data.supportActivity.netTicketChange}.`,
      internalOnly: false,
    };
  },

  // Aging tickets → proactive review
  (data, variant) => {
    if (data.backlog.agingOver30Days < 3) return null;
    const isCustomer = variant === 'customer';
    return {
      id: 'aging-tickets',
      category: 'process',
      priority: data.backlog.agingOver30Days > 10 ? 'high' : 'medium',
      title: isCustomer ? 'Open Ticket Review & Cleanup' : 'Review Aging Open Tickets',
      description: isCustomer
        ? `We've identified ${data.backlog.agingOver30Days} open requests older than 30 days. We'd like to schedule a brief review with your team to close out any that are no longer relevant and ensure the remaining items are on track.`
        : `${data.backlog.agingOver30Days} open tickets are older than 30 days. A review of these aging tickets is recommended to ensure they are still relevant and to close or escalate appropriately.`,
      evidence: `${data.backlog.agingOver7Days} tickets >7 days old. ${data.backlog.agingOver30Days} tickets >30 days old.`,
      internalOnly: false,
    };
  },

  // Low first-touch resolution → knowledge improvement
  (data, variant) => {
    const ftr = data.servicePerformance.firstTouchResolutionRate;
    if (ftr === null || ftr >= 20) return null;
    const isCustomer = variant === 'customer';
    return {
      id: 'low-first-touch',
      category: 'process',
      priority: 'medium',
      title: isCustomer ? 'Faster Issue Resolution Initiative' : 'Improve First-Touch Resolution Rate',
      description: isCustomer
        ? `We're investing in expanded knowledge base documentation and technician training specific to your environment to resolve more of your issues on first contact, reducing wait times and escalation delays.`
        : `Only ${ftr}% of tickets are resolved on first contact. Improving knowledge base documentation, L1 training, and diagnostic tools can help technicians resolve more issues without escalation.`,
      evidence: `First-touch resolution rate: ${ftr}%.`,
      internalOnly: false,
    };
  },

  // Declining health score → proactive engagement (internal only)
  (data) => {
    if (!data.healthSnapshot) return null;
    if (data.healthSnapshot.trend !== 'declining') return null;
    return {
      id: 'declining-health-internal',
      category: 'strategic',
      priority: data.healthSnapshot.overallScore < 50 ? 'high' : 'medium',
      title: 'Customer Health Declining — Proactive Engagement Needed',
      description: `Health score has declined from ${data.healthSnapshot.previousScore ?? 'N/A'} to ${data.healthSnapshot.overallScore}. This customer may be experiencing growing dissatisfaction. Schedule a proactive check-in and address the primary score drivers before the next review.`,
      evidence: `Health score: ${data.healthSnapshot.overallScore} (${data.healthSnapshot.tier}). Trend: declining.`,
      internalOnly: true,
    };
  },

  // High support hours consumption → potential upsell (internal only)
  (data) => {
    const hours = data.supportActivity.supportHoursConsumed;
    const change = data.comparison.supportHoursChange;
    if (hours < 20 || change === null || change <= 30) return null;
    return {
      id: 'rising-support-hours',
      category: 'strategic',
      priority: 'medium',
      title: 'Review Support Agreement Capacity',
      description: `Support hours consumed increased ${change}% to ${hours}h. If this trend continues, consider discussing adjusted support capacity or managed services scope with the customer.`,
      evidence: `${hours}h support consumed (${change}% increase from previous period).`,
      internalOnly: true,
    };
  },

  // Notable spikes → investigate (internal only)
  (data) => {
    const criticalEvents = data.notableEvents.filter(e => e.severity === 'critical');
    if (criticalEvents.length === 0) return null;
    return {
      id: 'support-spikes',
      category: 'process',
      priority: 'medium',
      title: 'Investigate Support Spikes',
      description: `${criticalEvents.length} significant support spike(s) detected. Review these events before the customer meeting to prepare explanations and any remediation plans.`,
      evidence: criticalEvents.map(e => `${e.date}: ${e.description}`).join('. '),
      internalOnly: true,
    };
  },
];

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} minutes`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hours`;
  return `${(minutes / 1440).toFixed(1)} days`;
}
