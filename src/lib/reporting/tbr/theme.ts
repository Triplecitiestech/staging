/**
 * Design tokens + base stylesheet for the presentation-style TBR.
 *
 * Lifted from the attached 2026 TBR deck (cyan-on-black executive style). Every
 * colour is within TCT's allowed palette — no yellow/amber/gold/orange. Themes
 * are plain objects so additional brands/styles are new theme values, not
 * forked templates (see template.ts).
 */

export interface TbrTheme {
  /** Page background. */
  bg: string;
  /** Slide panel gradient (CSS value). */
  panel: string;
  /** Primary accent on dark (cyan-400). */
  accent: string;
  /** Lighter accent for hovers/highlights (cyan-300). */
  accentSoft: string;
  /** TCT shield blue. */
  brand: string;
  text: string;
  textDim: string;
  /** Hairline borders on dark. */
  line: string;
  good: string;
  warn: string;
  danger: string;
  fontSans: string;
  fontMono: string;
}

export const defaultTheme: TbrTheme = {
  bg: '#000000',
  panel: 'linear-gradient(135deg,#000 0%,#0B1220 55%,#0E4A57 100%)',
  accent: '#22D3EE',
  accentSoft: '#67E8F9',
  brand: '#1F8FB3',
  text: '#FFFFFF',
  textDim: '#9CA3AF',
  line: 'rgba(255,255,255,0.10)',
  good: '#34D399',
  warn: '#67E8F9',
  danger: '#FB7185',
  fontSans: "'Inter',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  fontMono: 'ui-monospace,SFMono-Regular,Menlo,monospace',
};

/** Map a {@link import('./types').Tone} to a colour for tiles/values. */
export function toneColor(theme: TbrTheme, tone?: string): string {
  switch (tone) {
    case 'good': return theme.good;
    case 'danger': return theme.danger;
    case 'warn': return theme.warn;
    case 'accent': return theme.accent;
    default: return theme.text;
  }
}

/** The full stylesheet, parameterized by theme. */
export function baseCss(theme: TbrTheme): string {
  return `
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{background:${theme.bg};color:${theme.text};font-family:${theme.fontSans};line-height:1.5;-webkit-font-smoothing:antialiased}
  .deck{max-width:1120px;margin:0 auto;padding:24px}
  .slide{position:relative;background:${theme.panel};border:1px solid ${theme.line};border-radius:20px;padding:48px 56px;margin:0 0 24px;overflow:hidden}
  .slide::after{content:"";position:absolute;inset:0;background:radial-gradient(900px 380px at 88% -10%, rgba(34,211,238,0.10), transparent 60%);pointer-events:none}
  .slide > *{position:relative;z-index:1}
  .eyebrow{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${theme.accent}}
  .eyebrow .rule{display:inline-block;width:28px;height:2px;background:${theme.accent};vertical-align:middle;margin-right:10px;opacity:.8}
  .stitle{font-size:40px;font-weight:800;letter-spacing:-.01em;margin:10px 0 4px}
  .ssource{font-size:13px;color:${theme.textDim};margin:0 0 22px}
  .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:8px 0 4px}
  .tiles.cols-2{grid-template-columns:repeat(2,1fr)}
  .tiles.cols-4{grid-template-columns:repeat(4,1fr)}
  .tile{background:rgba(255,255,255,0.03);border:1px solid ${theme.line};border-radius:14px;padding:18px 18px 16px}
  .tile .v{font-family:${theme.fontMono};font-size:42px;font-weight:800;line-height:1.05;letter-spacing:-.02em}
  .tile .l{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${theme.text};margin-top:8px;opacity:.92}
  .tile .s{font-size:12px;color:${theme.textDim};margin-top:3px}
  table{width:100%;border-collapse:collapse;margin:18px 0 2px;font-size:14px}
  th,td{text-align:left;padding:11px 14px;border-bottom:1px solid ${theme.line}}
  th{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${theme.textDim}}
  td.num,th.num{text-align:right;font-family:${theme.fontMono}}
  .bar{height:6px;border-radius:99px;background:rgba(255,255,255,0.08);overflow:hidden;min-width:60px}
  .bar > span{display:block;height:100%;background:${theme.accent}}
  .banner{display:flex;gap:12px;align-items:flex-start;border-radius:12px;padding:14px 16px;font-size:14px;margin:6px 0}
  .banner .dot{flex:0 0 auto;width:9px;height:9px;border-radius:99px;margin-top:5px}
  .banner.empty{background:rgba(255,255,255,0.04);border:1px solid ${theme.line};color:${theme.textDim}}
  .banner.empty .dot{background:${theme.textDim}}
  .banner.error{background:rgba(251,113,133,0.08);border:1px solid rgba(251,113,133,0.4);color:#fecdd3}
  .banner.error .dot{background:${theme.danger}}
  .banner.manual{background:rgba(34,211,238,0.07);border:1px solid rgba(34,211,238,0.35);color:${theme.accentSoft}}
  .banner.manual .dot{background:${theme.accent}}
  .banner.pending{background:rgba(34,211,238,0.05);border:1px dashed rgba(34,211,238,0.4);color:${theme.accentSoft}}
  .banner.pending .dot{background:${theme.accent}}
  .banner b{color:${theme.text}}
  .ghost{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .ghost .g{font-size:12px;color:${theme.textDim};border:1px dashed ${theme.line};border-radius:8px;padding:5px 10px}
  .cover{text-align:left;padding:72px 56px}
  .cover .brandmark{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${theme.accent}}
  .cover h1{font-size:64px;font-weight:800;letter-spacing:-.02em;margin:18px 0 10px;line-height:1.02}
  .cover .meta{font-size:15px;color:${theme.textDim}}
  .footnote{font-size:12px;color:${theme.textDim};text-align:center;padding:8px 0 24px}
  @media (max-width:760px){
    .slide{padding:32px 22px}
    .cover{padding:48px 22px}
    .cover h1{font-size:40px}
    .stitle{font-size:28px}
    .tiles,.tiles.cols-2,.tiles.cols-4{grid-template-columns:1fr 1fr}
    .tile .v{font-size:34px}
  }
  @media print{
    body{background:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .slide{break-inside:avoid;page-break-inside:avoid}
  }
  `;
}
