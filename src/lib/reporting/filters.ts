/**
 * Shared filter model and date presets for reporting APIs.
 * All reporting endpoints use ReportFilters for consistent filtering.
 */

import { DateRange } from './types';

// ============================================
// DATE PRESETS
// ============================================

export type DatePreset =
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'month_to_date'
  | 'quarter_to_date'
  | 'last_month'
  | 'last_quarter'
  | 'year_to_date'
  | 'custom';

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  last_7_days: 'Last 7 Days',
  last_30_days: 'Last 30 Days',
  last_90_days: 'Last 90 Days',
  month_to_date: 'Month to Date',
  quarter_to_date: 'Quarter to Date',
  last_month: 'Last Month',
  last_quarter: 'Last Quarter',
  year_to_date: 'Year to Date',
  custom: 'Custom Range',
};

/**
 * Resolve a date preset to an actual DateRange.
 * All dates are computed relative to 'now' (start of today UTC).
 */
export function resolvePreset(preset: DatePreset, customFrom?: string, customTo?: string): DateRange {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  switch (preset) {
    case 'last_7_days':
      return { from: daysAgo(today, 7), to: today };
    case 'last_30_days':
      return { from: daysAgo(today, 30), to: today };
    case 'last_90_days':
      return { from: daysAgo(today, 90), to: today };
    case 'month_to_date':
      return { from: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), to: today };
    case 'quarter_to_date': {
      const qMonth = Math.floor(today.getUTCMonth() / 3) * 3;
      return { from: new Date(Date.UTC(today.getUTCFullYear(), qMonth, 1)), to: today };
    }
    case 'last_month': {
      const firstOfThisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const firstOfLastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      return { from: firstOfLastMonth, to: daysAgo(firstOfThisMonth, 1) };
    }
    case 'last_quarter': {
      const currentQStart = Math.floor(today.getUTCMonth() / 3) * 3;
      const lastQStart = currentQStart - 3;
      const year = lastQStart < 0 ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
      const month = ((lastQStart % 12) + 12) % 12;
      return {
        from: new Date(Date.UTC(year, month, 1)),
        to: daysAgo(new Date(Date.UTC(today.getUTCFullYear(), currentQStart, 1)), 1),
      };
    }
    case 'year_to_date':
      return { from: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), to: today };
    case 'custom':
      if (customFrom && customTo) {
        return { from: new Date(customFrom), to: new Date(customTo) };
      }
      // Fall back to last 30 days if custom range not provided
      return { from: daysAgo(today, 30), to: today };
    default:
      return { from: daysAgo(today, 30), to: today };
  }
}

function daysAgo(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

// ============================================
// REPORT FILTERS
// ============================================

export interface ReportFilters {
  dateRange: DateRange;
  preset: DatePreset;
  companyId?: string;
  resourceId?: number;
  priority?: number;
  queue?: string;
  groupBy?: 'day' | 'week' | 'month';
  includeComparison?: boolean;
  includeTrend?: boolean;
  includeBreakdown?: boolean;
  limit?: number;
}

/**
 * Parse query parameters from a request URL into ReportFilters.
 */
export function parseFiltersFromParams(params: URLSearchParams): ReportFilters {
  const preset = (params.get('preset') as DatePreset) || 'last_30_days';
  const customFrom = params.get('from') || undefined;
  const customTo = params.get('to') || undefined;
  const dateRange = resolvePreset(preset, customFrom, customTo);

  return {
    dateRange,
    preset,
    companyId: params.get('companyId') || undefined,
    resourceId: params.get('resourceId') ? parseInt(params.get('resourceId')!, 10) : undefined,
    priority: params.get('priority') ? parseInt(params.get('priority')!, 10) : undefined,
    queue: params.get('queue') || undefined,
    groupBy: (params.get('groupBy') as 'day' | 'week' | 'month') || undefined,
    includeComparison: params.get('compare') === 'true',
    includeTrend: params.get('trend') === 'true',
    includeBreakdown: params.get('breakdown') === 'true',
    limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : undefined,
  };
}

// ============================================
// COMPARISON PERIOD
// ============================================

/**
 * Compute the comparison period (same length, immediately preceding).
 */
export function getComparisonRange(range: DateRange): DateRange {
  const durationMs = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - durationMs),
    to: new Date(range.from.getTime()),
  };
}

// ============================================
// TREND BUCKETING
// ============================================

export interface TrendBucket {
  date: string; // ISO date string (YYYY-MM-DD or YYYY-Www or YYYY-MM)
  label: string;
}

/**
 * Generate date buckets for trend data based on groupBy.
 */
export function generateTrendBuckets(range: DateRange, groupBy: 'day' | 'week' | 'month' = 'day'): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  const current = new Date(range.from);

  if (groupBy === 'day') {
    while (current <= range.to) {
      const iso = current.toISOString().split('T')[0];
      buckets.push({
        date: iso,
        label: `${current.getUTCMonth() + 1}/${current.getUTCDate()}`,
      });
      current.setUTCDate(current.getUTCDate() + 1);
    }
  } else if (groupBy === 'week') {
    // Start from the beginning of the week containing range.from
    const startDay = current.getUTCDay();
    current.setUTCDate(current.getUTCDate() - startDay);
    while (current <= range.to) {
      const weekEnd = new Date(current);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const iso = current.toISOString().split('T')[0];
      buckets.push({
        date: iso,
        label: `${current.getUTCMonth() + 1}/${current.getUTCDate()}`,
      });
      current.setUTCDate(current.getUTCDate() + 7);
    }
  } else if (groupBy === 'month') {
    current.setUTCDate(1);
    while (current <= range.to) {
      const iso = current.toISOString().split('T')[0];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      buckets.push({
        date: iso,
        label: `${monthNames[current.getUTCMonth()]} ${current.getUTCFullYear()}`,
      });
      current.setUTCMonth(current.getUTCMonth() + 1);
    }
  }

  return buckets;
}

/**
 * Assign a date to its trend bucket key based on groupBy.
 */
export function dateToBucketKey(date: Date, groupBy: 'day' | 'week' | 'month'): string {
  if (groupBy === 'day') {
    return date.toISOString().split('T')[0];
  } else if (groupBy === 'week') {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().split('T')[0];
  } else {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().split('T')[0];
  }
}
