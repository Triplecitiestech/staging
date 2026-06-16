/**
 * Reusable HTML render primitives + the report shell for the presentation TBR.
 *
 * These are the "reusable report components": sections (sections.ts) compose
 * tiles/tables/banners from here, and {@link renderTbrReportHtml} wraps the
 * already-rendered sections in the themed page. Nothing here imports section
 * logic, so sections can freely import these primitives.
 */

import type { CountShare, SectionState, StatTile, TbrReport } from './types';
import { baseCss, defaultTheme, toneColor, type TbrTheme } from './theme';

/** HTML-escape untrusted/text content. */
export function esc(s: string | number | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a number with thousands separators; compact for large values. */
export function fmtNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-US');
}

export function statTile(theme: TbrTheme, tile: StatTile): string {
  const color = toneColor(theme, tile.tone);
  return `<div class="tile">
    <div class="v" style="color:${color}">${esc(tile.value)}</div>
    <div class="l">${esc(tile.label)}</div>
    ${tile.sub ? `<div class="s">${esc(tile.sub)}</div>` : ''}
  </div>`;
}

export function tileGrid(theme: TbrTheme, tiles: StatTile[], cols: 2 | 3 | 4 = 3): string {
  const cls = cols === 2 ? ' cols-2' : cols === 4 ? ' cols-4' : '';
  return `<div class="tiles${cls}">${tiles.map((t) => statTile(theme, t)).join('')}</div>`;
}

export interface TableColumn {
  header: string;
  /** Right-align + monospace for numeric columns. */
  num?: boolean;
}

export function dataTable(columns: TableColumn[], rows: string[][]): string {
  const head = columns
    .map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.header)}</th>`)
    .join('');
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map((cell, i) => `<td${columns[i]?.num ? ' class="num"' : ''}>${cell}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** A count + share table with an inline proportion bar (priority/category lists). */
export function shareTable(label: string, rows: CountShare[]): string {
  if (rows.length === 0) return '';
  const body = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.label)}</td><td class="num">${fmtNum(r.count)}</td>` +
        `<td class="num">${r.share}%</td>` +
        `<td><div class="bar"><span style="width:${Math.min(100, Math.max(2, r.share))}%"></span></div></td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>${esc(label)}</th><th class="num">Count</th><th class="num">Share</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Banner shown for any non-`success` section state. Returns '' for success so
 * callers can simply prepend it to their content.
 */
export function stateBanner(state: SectionState<unknown>): string {
  const note = state.note ? esc(state.note) : '';
  switch (state.status) {
    case 'empty':
      return `<div class="banner empty"><span class="dot"></span><div><b>No data for this period.</b> ${note}</div></div>`;
    case 'error':
      return `<div class="banner error"><span class="dot"></span><div><b>Couldn't load ${esc(state.source)}.</b> ${note}</div></div>`;
    case 'manual':
      return `<div class="banner manual"><span class="dot"></span><div><b>Manual input needed.</b> ${note || `No automated integration for ${esc(state.source)} yet — enter these figures by hand.`}</div></div>`;
    case 'pending':
      return `<div class="banner pending"><span class="dot"></span><div><b>Integration available — wiring in progress.</b> ${note}</div></div>`;
    default:
      return '';
  }
}

/** Ghosted preview of the metrics a not-yet-wired section will show. */
export function ghostMetrics(labels: string[]): string {
  if (labels.length === 0) return '';
  return `<div class="ghost">${labels.map((l) => `<span class="g">${esc(l)}</span>`).join('')}</div>`;
}

/** Standard slide wrapper: eyebrow + title + source line + body. */
export function slide(opts: {
  eyebrow: string;
  title: string;
  source: string;
  body: string;
  label?: string;
}): string {
  return `<section class="slide" data-label="${esc(opts.label ?? opts.title)}">
    <div class="eyebrow"><span class="rule"></span>${esc(opts.eyebrow)}</div>
    <h2 class="stitle">${esc(opts.title)}</h2>
    <p class="ssource">Source · ${esc(opts.source)}</p>
    ${opts.body}
  </section>`;
}

/** Wrap rendered sections in the themed page (cover + slides + footnote). */
export function renderTbrReportHtml(report: TbrReport, theme: TbrTheme = defaultTheme): string {
  const m = report.meta;
  const kind = m.reportType === 'monthly_summary' ? 'Monthly Customer Summary' : 'Technology Business Review';
  const cover = `<section class="slide cover" data-label="Cover">
    <div class="brandmark">Triple Cities Tech · ${esc(kind)}</div>
    <h1>${esc(m.company.name)}</h1>
    <div class="meta">${esc(m.periodStart)} → ${esc(m.periodEnd)} · ${m.years}-year window${
      m.company.classification ? ` · ${esc(m.company.classification)}` : ''
    } · generated ${esc(m.generatedAt.split('T')[0])}</div>
  </section>`;

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(kind)} — ${esc(m.company.name)}</title>
<style>${baseCss(theme)}</style>
</head><body>
<div class="deck">
${cover}
${report.sections.map((s) => s.html).join('\n')}
<div class="footnote">Generated by Triple Cities Tech · ${esc(m.generatedAt)} · data scoped to ${esc(m.company.name)}</div>
</div>
</body></html>`;
}
