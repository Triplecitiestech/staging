/**
 * Standalone, self-contained branded HTML for exported campaign assets
 * (email / blog / landing). Markdown body → HTML, wrapped in a TCT-branded
 * (dark + cyan) document with inline <style>. No external assets, so the file
 * works on its own when re-uploaded.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(s: string): string {
  let t = esc(s)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
  return t
}

export function mdToHtml(md: string): string {
  const blocks = (md || '').replace(/\r\n/g, '\n').split(/\n{2,}/)
  const out: string[] = []
  for (const block of blocks) {
    const b = block.trim()
    if (!b) continue
    const lines = b.split('\n')
    if (/^###\s+/.test(b)) {
      out.push(`<h3>${inline(b.replace(/^###\s+/, ''))}</h3>`)
    } else if (/^##\s+/.test(b)) {
      out.push(`<h2>${inline(b.replace(/^##\s+/, ''))}</h2>`)
    } else if (/^#\s+/.test(b)) {
      out.push(`<h1>${inline(b.replace(/^#\s+/, ''))}</h1>`)
    } else if (lines.every((l) => /^\s*-\s+/.test(l))) {
      out.push('<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('') + '</ul>')
    } else if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
      out.push('<ol>' + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('') + '</ol>')
    } else if (/^>\s+/.test(b)) {
      out.push(`<blockquote>${inline(b.replace(/^>\s+/, ''))}</blockquote>`)
    } else {
      out.push(`<p>${lines.map(inline).join('<br/>')}</p>`)
    }
  }
  return out.join('\n')
}

export function renderBrandedHtml(opts: { title: string; deck?: string; body: string; kind?: string }): string {
  const bodyHtml = mdToHtml(opts.body)
  const kind = opts.kind || 'Content'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)} — Triple Cities Tech</title>
<style>
  body { margin:0; background:#0a0e14; color:#cbd5e1; font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; line-height:1.6; }
  .wrap { max-width:720px; margin:0 auto; padding:48px 24px; }
  .eyebrow { color:#22d3ee; font-weight:700; text-transform:uppercase; letter-spacing:2px; font-size:13px; margin-bottom:12px; }
  h1 { color:#ffffff; font-size:34px; line-height:1.12; margin:0 0 14px; }
  .deck { color:#e2e8f0; font-size:18px; margin:0 0 28px; }
  h2 { color:#ffffff; font-size:24px; margin:34px 0 10px; }
  h3 { color:#ffffff; font-size:19px; margin:24px 0 8px; }
  p { margin:0 0 16px; }
  a { color:#22d3ee; }
  ul, ol { padding-left:22px; margin:0 0 16px; }
  li { margin:6px 0; }
  strong { color:#ffffff; }
  blockquote { border-left:3px solid #22d3ee; margin:20px 0; padding:8px 18px; color:#e2e8f0; background:rgba(34,211,238,.06); }
  .footer { margin-top:44px; border-top:1px solid rgba(255,255,255,.1); padding-top:16px; color:#64748b; font-size:13px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">${esc(kind)} · Triple Cities Tech</div>
  <h1>${esc(opts.title)}</h1>
  ${opts.deck ? `<p class="deck">${esc(opts.deck)}</p>` : ''}
  ${bodyHtml}
  <div class="footer">Triple Cities Tech · triplecitiestech.com</div>
</div>
</body>
</html>`
}
