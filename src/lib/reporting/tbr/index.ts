/**
 * Presentation-style TBR / Monthly Summary — report generator (entry point).
 *
 * Orchestrates: resolve customer → build context → run every section in
 * parallel (each degrades independently) → assemble the normalized
 * {@link TbrReport} → render HTML via the themed template.
 *
 * Reuses the platform's existing integration clients and the Autotask company
 * resolver pattern; persistence (when added) reuses the BusinessReview model
 * with reportType 'tbr' / 'monthly_summary' — no schema change required.
 */

import { sectionsForReportType } from './sections';
import { defaultTheme, type TbrTheme } from './theme';
import { renderTbrReportHtml } from './template';
import type { CoverageEntry, TbrCompany, TbrContext, TbrReport, TbrReportType } from './types';

export interface GenerateTbrOptions {
  company: TbrCompany;
  reportType?: TbrReportType;
  /** Lookback window in years (clamped 1–10). */
  years?: number;
  includeDatto?: boolean;
  /** Explicit period override; otherwise computed from `years`. */
  periodStart?: Date;
  periodEnd?: Date;
}

/** Build the normalized report (sections rendered to HTML, plus coverage). */
export async function generateTbrReport(opts: GenerateTbrOptions): Promise<TbrReport> {
  const reportType: TbrReportType = opts.reportType ?? 'tbr';
  const years = Math.min(10, Math.max(1, opts.years ?? (reportType === 'monthly_summary' ? 1 : 3)));
  const periodEnd = opts.periodEnd ?? new Date();
  const periodStart = opts.periodStart ?? (() => {
    const d = new Date(periodEnd);
    d.setFullYear(d.getFullYear() - years);
    return d;
  })();

  const ctx: TbrContext = {
    company: opts.company,
    reportType,
    periodStart,
    periodEnd,
    years,
    includeDatto: opts.includeDatto ?? true,
    cache: new Map<string, Promise<unknown>>(),
  };

  const sections = sectionsForReportType();
  const rendered = await Promise.all(sections.map((s) => s.run(ctx, defaultTheme)));

  const coverage: CoverageEntry[] = rendered.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    source: r.source,
    note: r.note,
  }));

  return {
    meta: {
      company: opts.company,
      reportType,
      periodStart: periodStart.toISOString().split('T')[0],
      periodEnd: periodEnd.toISOString().split('T')[0],
      years,
      generatedAt: new Date().toISOString(),
    },
    sections: rendered,
    coverage,
  };
}

/** Render a built report to a full standalone HTML document. */
export function renderTbrReport(report: TbrReport, theme: TbrTheme = defaultTheme): string {
  return renderTbrReportHtml(report, theme);
}

export type { TbrReport, TbrReportType, TbrCompany } from './types';
export { defaultTheme } from './theme';
