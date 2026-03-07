/**
 * Advanced analytics: anomaly detection, operational insights, and predictive trends.
 * Phase 6 of the reporting system.
 */

import { prisma } from '@/lib/prisma';
import { DateRange, PRIORITY_LABELS } from './types';

// ============================================
// TYPES
// ============================================

export interface AnomalyAlert {
  type: 'spike' | 'drop' | 'threshold' | 'trend';
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  message: string;
  value: number;
  baseline: number;
  deviationPercent: number;
  detectedAt: string;
  context?: string;
}

export interface OperationalInsight {
  id: string;
  category: 'performance' | 'workload' | 'quality' | 'capacity' | 'customer';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  metric?: string;
  value?: number;
  recommendation?: string;
}

export interface PredictiveTrend {
  metric: string;
  label: string;
  currentValue: number;
  projectedValue: number;
  projectedChangePercent: number;
  confidence: 'low' | 'medium' | 'high';
  direction: 'up' | 'down' | 'flat';
  dataPoints: number;
}

// ============================================
// ANOMALY DETECTION
// ============================================

/**
 * Detect anomalies in recent metrics using simple statistical methods.
 * Uses a rolling baseline comparison (current vs moving average).
 */
export async function detectAnomalies(lookbackDays: number = 7): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const now = new Date();
  const recentFrom = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const baselineFrom = new Date(recentFrom.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Ticket volume anomalies
  const recentCompanyMetrics = await prisma.companyMetricsDaily.findMany({
    where: { date: { gte: recentFrom, lte: now } },
  });
  const baselineCompanyMetrics = await prisma.companyMetricsDaily.findMany({
    where: { date: { gte: baselineFrom, lt: recentFrom } },
  });

  // Total ticket volume
  const recentTickets = recentCompanyMetrics.reduce((s, r) => s + r.ticketsCreated, 0);
  const baselineTickets = baselineCompanyMetrics.reduce((s, r) => s + r.ticketsCreated, 0);
  const baselineDays = Math.max(1, Math.ceil((recentFrom.getTime() - baselineFrom.getTime()) / (24 * 60 * 60 * 1000)));
  const baselineAvgDaily = baselineTickets / baselineDays;
  const recentAvgDaily = recentTickets / lookbackDays;

  if (baselineAvgDaily > 0) {
    const deviation = ((recentAvgDaily - baselineAvgDaily) / baselineAvgDaily) * 100;
    if (Math.abs(deviation) > 50) {
      alerts.push({
        type: deviation > 0 ? 'spike' : 'drop',
        severity: Math.abs(deviation) > 100 ? 'critical' : 'warning',
        metric: 'ticket_volume',
        message: `Ticket volume ${deviation > 0 ? 'spike' : 'drop'}: ${Math.round(Math.abs(deviation))}% ${deviation > 0 ? 'above' : 'below'} 30-day baseline`,
        value: Math.round(recentAvgDaily * 10) / 10,
        baseline: Math.round(baselineAvgDaily * 10) / 10,
        deviationPercent: Math.round(deviation * 10) / 10,
        detectedAt: now.toISOString(),
      });
    }
  }

  // Resolution time anomalies
  const recentRes = recentCompanyMetrics
    .map(r => r.avgResolutionMinutes)
    .filter((v): v is number => v !== null);
  const baselineRes = baselineCompanyMetrics
    .map(r => r.avgResolutionMinutes)
    .filter((v): v is number => v !== null);

  if (recentRes.length > 0 && baselineRes.length > 0) {
    const recentAvgRes = recentRes.reduce((a, b) => a + b, 0) / recentRes.length;
    const baselineAvgRes = baselineRes.reduce((a, b) => a + b, 0) / baselineRes.length;
    const resDeviation = ((recentAvgRes - baselineAvgRes) / baselineAvgRes) * 100;

    if (resDeviation > 30) {
      alerts.push({
        type: 'spike',
        severity: resDeviation > 75 ? 'critical' : 'warning',
        metric: 'resolution_time',
        message: `Resolution times increased ${Math.round(resDeviation)}% above baseline`,
        value: Math.round(recentAvgRes),
        baseline: Math.round(baselineAvgRes),
        deviationPercent: Math.round(resDeviation * 10) / 10,
        detectedAt: now.toISOString(),
      });
    }
  }

  // SLA compliance anomalies
  const recentSla = recentCompanyMetrics
    .flatMap(r => [r.slaResponseCompliance, r.slaResolutionCompliance])
    .filter((v): v is number => v !== null);

  if (recentSla.length > 0) {
    const avgSla = recentSla.reduce((a, b) => a + b, 0) / recentSla.length;
    if (avgSla < 70) {
      alerts.push({
        type: 'threshold',
        severity: avgSla < 50 ? 'critical' : 'warning',
        metric: 'sla_compliance',
        message: `SLA compliance at ${Math.round(avgSla)}% — below acceptable threshold`,
        value: Math.round(avgSla * 10) / 10,
        baseline: 90,
        deviationPercent: Math.round(((avgSla - 90) / 90) * 1000) / 10,
        detectedAt: now.toISOString(),
      });
    }
  }

  // Per-company anomalies: unusually high ticket creation
  const companyTickets = new Map<string, number>();
  for (const row of recentCompanyMetrics) {
    companyTickets.set(row.companyId, (companyTickets.get(row.companyId) || 0) + row.ticketsCreated);
  }

  const baselineCompanyTickets = new Map<string, number>();
  for (const row of baselineCompanyMetrics) {
    baselineCompanyTickets.set(row.companyId, (baselineCompanyTickets.get(row.companyId) || 0) + row.ticketsCreated);
  }

  for (const [companyId, recentCount] of Array.from(companyTickets.entries())) {
    const baselineCount = baselineCompanyTickets.get(companyId) || 0;
    const normalizedBaseline = (baselineCount / baselineDays) * lookbackDays;

    if (normalizedBaseline > 2 && recentCount > normalizedBaseline * 2) {
      const companies = await prisma.company.findMany({
        where: { id: companyId },
        select: { displayName: true },
      });
      const name = companies[0]?.displayName || companyId;

      alerts.push({
        type: 'spike',
        severity: 'warning',
        metric: 'company_ticket_volume',
        message: `${name}: ticket volume ${Math.round(((recentCount - normalizedBaseline) / normalizedBaseline) * 100)}% above normal`,
        value: recentCount,
        baseline: Math.round(normalizedBaseline),
        deviationPercent: Math.round(((recentCount - normalizedBaseline) / normalizedBaseline) * 1000) / 10,
        detectedAt: now.toISOString(),
        context: companyId,
      });
    }
  }

  return alerts.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });
}

// ============================================
// OPERATIONAL INSIGHTS
// ============================================

/**
 * Generate operational insights based on current data patterns.
 */
export async function generateInsights(range?: DateRange): Promise<OperationalInsight[]> {
  const insights: OperationalInsight[] = [];
  const now = new Date();
  const { from, to } = range || {
    from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    to: now,
  };

  const companyMetrics = await prisma.companyMetricsDaily.findMany({
    where: { date: { gte: from, lte: to } },
  });

  const techMetrics = await prisma.technicianMetricsDaily.findMany({
    where: { date: { gte: from, lte: to } },
  });

  // Workload balance insight
  const techHours = new Map<number, number>();
  for (const row of techMetrics) {
    techHours.set(row.resourceId, (techHours.get(row.resourceId) || 0) + row.hoursLogged);
  }

  const hourValues = Array.from(techHours.values());
  if (hourValues.length >= 2) {
    const max = Math.max(...hourValues);
    const min = Math.min(...hourValues);
    const avg = hourValues.reduce((a, b) => a + b, 0) / hourValues.length;

    if (max > avg * 2 && min < avg * 0.5) {
      insights.push({
        id: 'workload-imbalance',
        category: 'workload',
        title: 'Workload Imbalance Detected',
        description: `Top tech logged ${Math.round(max)}h while lowest logged ${Math.round(min)}h. Average is ${Math.round(avg)}h.`,
        severity: max > avg * 3 ? 'critical' : 'warning',
        recommendation: 'Consider redistributing tickets to balance technician workloads.',
      });
    }
  }

  // Backlog growth insight
  const latestBacklogs = await prisma.companyMetricsDaily.findMany({
    orderBy: { date: 'desc' },
    distinct: ['companyId'],
    select: { companyId: true, backlogCount: true },
  });

  const totalBacklog = latestBacklogs.reduce((s, r) => s + r.backlogCount, 0);
  const avgDailyClosed = companyMetrics.reduce((s, r) => s + r.ticketsClosed, 0);
  const periodDays = Math.max(1, (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  const avgClosedPerDay = avgDailyClosed / periodDays;

  if (totalBacklog > 0 && avgClosedPerDay > 0) {
    const daysToClean = totalBacklog / avgClosedPerDay;
    if (daysToClean > 10) {
      insights.push({
        id: 'backlog-growth',
        category: 'capacity',
        title: 'Growing Backlog',
        description: `Current backlog of ${totalBacklog} tickets would take ~${Math.round(daysToClean)} days to clear at current resolution rate.`,
        severity: daysToClean > 30 ? 'critical' : 'warning',
        metric: 'backlog',
        value: totalBacklog,
        recommendation: 'Consider adding capacity or prioritizing backlog reduction.',
      });
    }
  }

  // High reopen rate insight
  const reopenData = companyMetrics
    .map(r => r.reopenRate)
    .filter((v): v is number => v !== null);

  if (reopenData.length > 0) {
    const avgReopen = reopenData.reduce((a, b) => a + b, 0) / reopenData.length;
    if (avgReopen > 10) {
      insights.push({
        id: 'high-reopen-rate',
        category: 'quality',
        title: 'High Reopen Rate',
        description: `Average reopen rate is ${Math.round(avgReopen * 10) / 10}% — indicates incomplete initial resolutions.`,
        severity: avgReopen > 20 ? 'critical' : 'warning',
        metric: 'reopen_rate',
        value: Math.round(avgReopen * 10) / 10,
        recommendation: 'Review resolution procedures and consider requiring verification before closing tickets.',
      });
    }
  }

  // Priority mix insight
  const lifecycles = await prisma.ticketLifecycle.findMany({
    where: { createDate: { gte: from, lte: to } },
    select: { priority: true },
  });

  if (lifecycles.length > 0) {
    const urgentHigh = lifecycles.filter(l => l.priority <= 2).length;
    const urgentPercent = (urgentHigh / lifecycles.length) * 100;

    if (urgentPercent > 40) {
      insights.push({
        id: 'priority-escalation',
        category: 'quality',
        title: 'High Priority Escalation',
        description: `${Math.round(urgentPercent)}% of tickets are ${PRIORITY_LABELS[1]} or ${PRIORITY_LABELS[2]} priority. This may indicate systemic issues.`,
        severity: urgentPercent > 60 ? 'critical' : 'warning',
        metric: 'priority_mix',
        value: Math.round(urgentPercent),
        recommendation: 'Investigate root causes of recurring high-priority issues.',
      });
    }
  }

  // Health score declining companies
  const healthScores = await prisma.customerHealthScore.findMany({
    orderBy: { computedAt: 'desc' },
    distinct: ['companyId'],
  });

  const declining = healthScores.filter(s => s.trend === 'declining');
  if (declining.length > 0) {
    const companyIds = declining.map(s => s.companyId);
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { displayName: true },
    });
    const names = companies.map(c => c.displayName).slice(0, 3).join(', ');

    insights.push({
      id: 'declining-health',
      category: 'customer',
      title: `${declining.length} Customer${declining.length > 1 ? 's' : ''} with Declining Health`,
      description: `${names}${declining.length > 3 ? ` and ${declining.length - 3} more` : ''} show declining health scores.`,
      severity: declining.length > 3 ? 'critical' : 'warning',
      recommendation: 'Proactively reach out to declining customers to address concerns.',
    });
  }

  return insights;
}

// ============================================
// PREDICTIVE TRENDS
// ============================================

/**
 * Project metric trends based on historical patterns using simple linear regression.
 */
export async function predictTrends(forecastDays: number = 30): Promise<PredictiveTrend[]> {
  const predictions: PredictiveTrend[] = [];
  const now = new Date();
  const historyFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const companyMetrics = await prisma.companyMetricsDaily.findMany({
    where: { date: { gte: historyFrom, lte: now } },
    orderBy: { date: 'asc' },
  });

  if (companyMetrics.length < 7) return predictions;

  // Aggregate by day
  const dailyData = new Map<string, {
    tickets: number;
    resolution: number[];
    hours: number;
  }>();

  for (const row of companyMetrics) {
    const key = row.date.toISOString().split('T')[0];
    const existing = dailyData.get(key) || { tickets: 0, resolution: [], hours: 0 };
    existing.tickets += row.ticketsCreated;
    if (row.avgResolutionMinutes !== null) {
      existing.resolution.push(row.avgResolutionMinutes);
    }
    existing.hours += row.supportHoursConsumed;
    dailyData.set(key, existing);
  }

  const sortedDays = Array.from(dailyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Ticket volume trend
  const ticketSeries = sortedDays.map((d, i) => ({ x: i, y: d[1].tickets }));
  const ticketRegression = linearRegression(ticketSeries);
  if (ticketRegression.n >= 14) {
    const currentAvg = ticketSeries.slice(-7).reduce((s, p) => s + p.y, 0) / 7;
    const projected = ticketRegression.slope * (ticketRegression.n + forecastDays) + ticketRegression.intercept;
    const projectedAvg = Math.max(0, projected);

    predictions.push({
      metric: 'daily_ticket_volume',
      label: 'Daily Ticket Volume',
      currentValue: Math.round(currentAvg * 10) / 10,
      projectedValue: Math.round(projectedAvg * 10) / 10,
      projectedChangePercent: currentAvg > 0
        ? Math.round(((projectedAvg - currentAvg) / currentAvg) * 1000) / 10
        : 0,
      confidence: ticketRegression.r2 > 0.5 ? 'high' : ticketRegression.r2 > 0.2 ? 'medium' : 'low',
      direction: ticketRegression.slope > 0.1 ? 'up' : ticketRegression.slope < -0.1 ? 'down' : 'flat',
      dataPoints: ticketRegression.n,
    });
  }

  // Resolution time trend
  const resSeries = sortedDays
    .filter(d => d[1].resolution.length > 0)
    .map((d, i) => ({
      x: i,
      y: d[1].resolution.reduce((a, b) => a + b, 0) / d[1].resolution.length,
    }));

  const resRegression = linearRegression(resSeries);
  if (resRegression.n >= 14) {
    const currentAvg = resSeries.slice(-7).reduce((s, p) => s + p.y, 0) / Math.min(7, resSeries.length);
    const projected = resRegression.slope * (resRegression.n + forecastDays) + resRegression.intercept;
    const projectedAvg = Math.max(0, projected);

    predictions.push({
      metric: 'avg_resolution_time',
      label: 'Avg Resolution Time (min)',
      currentValue: Math.round(currentAvg),
      projectedValue: Math.round(projectedAvg),
      projectedChangePercent: currentAvg > 0
        ? Math.round(((projectedAvg - currentAvg) / currentAvg) * 1000) / 10
        : 0,
      confidence: resRegression.r2 > 0.5 ? 'high' : resRegression.r2 > 0.2 ? 'medium' : 'low',
      direction: resRegression.slope > 0.5 ? 'up' : resRegression.slope < -0.5 ? 'down' : 'flat',
      dataPoints: resRegression.n,
    });
  }

  // Support hours trend
  const hoursSeries = sortedDays.map((d, i) => ({ x: i, y: d[1].hours }));
  const hoursRegression = linearRegression(hoursSeries);
  if (hoursRegression.n >= 14) {
    const currentAvg = hoursSeries.slice(-7).reduce((s, p) => s + p.y, 0) / 7;
    const projected = hoursRegression.slope * (hoursRegression.n + forecastDays) + hoursRegression.intercept;
    const projectedAvg = Math.max(0, projected);

    predictions.push({
      metric: 'daily_support_hours',
      label: 'Daily Support Hours',
      currentValue: Math.round(currentAvg * 10) / 10,
      projectedValue: Math.round(projectedAvg * 10) / 10,
      projectedChangePercent: currentAvg > 0
        ? Math.round(((projectedAvg - currentAvg) / currentAvg) * 1000) / 10
        : 0,
      confidence: hoursRegression.r2 > 0.5 ? 'high' : hoursRegression.r2 > 0.2 ? 'medium' : 'low',
      direction: hoursRegression.slope > 0.05 ? 'up' : hoursRegression.slope < -0.05 ? 'down' : 'flat',
      dataPoints: hoursRegression.n,
    });
  }

  return predictions;
}

// ============================================
// LINEAR REGRESSION HELPER
// ============================================

interface RegressionResult {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
}

function linearRegression(points: Array<{ x: number; y: number }>): RegressionResult {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0, n };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0, n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - yMean) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2: Math.max(0, r2), n };
}
