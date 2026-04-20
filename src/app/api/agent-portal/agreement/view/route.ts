import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAgentApi } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function textToParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
}

// Returns a printable HTML view of the signed text agreement. The agent's
// browser can print this to PDF (File → Print → Save as PDF), so we don't
// need a server-side PDF library.
export async function GET() {
  const agent = await requireAgentApi()
  if (agent instanceof NextResponse) return agent

  const agreement = await prisma.agentAgreement.findUnique({
    where: { agentId: agent.id },
    select: {
      contentText: true,
      signedName: true,
      signedAt: true,
      signedIp: true,
    },
  })
  if (!agreement || !agreement.contentText) {
    return NextResponse.json({ error: 'No text agreement on file.' }, { status: 404 })
  }

  const title = `TCT Referral Agent Agreement — ${agent.firstName} ${agent.lastName}`
  const signedBlock = agreement.signedAt && agreement.signedName
    ? `
        <div class="signature-block">
          <h2>Electronic Signature</h2>
          <table class="sig-table">
            <tr><th>Signed by</th><td>${escapeHtml(agreement.signedName)}</td></tr>
            <tr><th>Agent name on file</th><td>${escapeHtml(agent.firstName)} ${escapeHtml(agent.lastName)}</td></tr>
            <tr><th>Agent email</th><td>${escapeHtml(agent.email)}</td></tr>
            <tr><th>Signed on</th><td>${agreement.signedAt.toISOString()} (UTC)</td></tr>
            ${agreement.signedIp ? `<tr><th>IP address</th><td>${escapeHtml(agreement.signedIp)}</td></tr>` : ''}
          </table>
          <p class="legend">
            The individual named above electronically executed this agreement by typing their full legal
            name and affirmatively accepting the terms above. This record is retained by Triple Cities Tech
            as evidence of execution.
          </p>
        </div>
      `
    : `
        <div class="signature-block unsigned">
          <h2>Signature</h2>
          <p>This agreement has not yet been signed.</p>
        </div>
      `

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; color: #0f172a; background: #fff; margin: 0; padding: 2.5rem; line-height: 1.55; }
    .page { max-width: 780px; margin: 0 auto; }
    header.doc-head { border-bottom: 2px solid #0f172a; padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: baseline; }
    header.doc-head h1 { margin: 0; font-size: 1.25rem; }
    header.doc-head .brand { font-size: 0.85rem; color: #475569; letter-spacing: 0.04em; text-transform: uppercase; }
    .content p { margin: 0 0 0.9em 0; }
    .signature-block { margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid #cbd5e1; page-break-inside: avoid; }
    .signature-block h2 { font-size: 1rem; margin: 0 0 0.75rem 0; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
    .sig-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .sig-table th { text-align: left; font-weight: 600; color: #334155; padding: 0.35rem 0.75rem 0.35rem 0; width: 11rem; vertical-align: top; }
    .sig-table td { padding: 0.35rem 0; color: #0f172a; }
    .legend { font-size: 0.75rem; color: #64748b; margin-top: 1rem; }
    .unsigned { color: #7c2d12; }
    .toolbar { display: flex; gap: 0.5rem; justify-content: flex-end; margin-bottom: 1.25rem; }
    .toolbar button, .toolbar a { appearance: none; font: inherit; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; padding: 0.45rem 0.9rem; border-radius: 6px; cursor: pointer; text-decoration: none; font-size: 0.85rem; }
    .toolbar button:hover, .toolbar a:hover { background: #e2e8f0; }
    @media print {
      body { padding: 0; }
      .toolbar { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="toolbar">
      <button type="button" onclick="window.print()">Print / Save as PDF</button>
      <a href="/agents/agreement">Back to portal</a>
    </div>
    <header class="doc-head">
      <h1>Referral Agent Agreement</h1>
      <div class="brand">Triple Cities Tech</div>
    </header>
    <div class="content">
${textToParagraphs(agreement.contentText)}
    </div>
${signedBlock}
  </div>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
