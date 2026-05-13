/**
 * Customer-facing HTML report.
 *
 * Renders a Change Bundle as a single HTML document suitable for:
 *   - Browser preview (staff review before sending)
 *   - In-line email body (the email-template.ts wraps this)
 *   - Customer print-to-PDF via browser
 *
 * Same HTML-as-PDF pattern as src/lib/reporting/business-review/pdf-export.ts.
 *
 * No forbidden colors (yellow / amber / orange / gold / brown / mustard);
 * uses slate / cyan / emerald / violet per docs/UI_STANDARDS.md.
 */

import type { BundleReportData, BundleReportItem } from './types'
import { describeBlastRadius } from './types'

export function renderBundleReportHtml(data: BundleReportData): string {
  const itemBlocks = data.items
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((item, idx) => renderItem(item, idx + 1, data.items.length))
    .join('\n')

  const greeting = data.customerContact.name ? `Hi ${escapeHtml(firstName(data.customerContact.name))},` : 'Hi there,'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.bundleTitle)} — Triple Cities Tech</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f8fafc;
    color: #0f172a;
    margin: 0;
    padding: 0;
    line-height: 1.55;
  }
  .container { max-width: 760px; margin: 0 auto; padding: 32px 24px; }
  header {
    border-bottom: 2px solid #0e7490;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  header .brand { font-weight: 700; color: #0e7490; letter-spacing: 0.04em; text-transform: uppercase; font-size: 12px; }
  h1 { font-size: 24px; margin: 8px 0 4px; }
  .meta { color: #475569; font-size: 14px; }
  .intro { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 28px; }
  .intro p { margin: 0 0 12px; }
  .intro p:last-child { margin-bottom: 0; }
  .change {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
    page-break-inside: avoid;
  }
  .change h2 { font-size: 18px; margin: 0 0 4px; }
  .change .change-meta {
    color: #64748b; font-size: 12px; text-transform: uppercase;
    letter-spacing: 0.06em; margin-bottom: 12px;
  }
  .impact-summary {
    background: #f1f5f9; border-left: 4px solid #06b6d4;
    padding: 14px 16px; border-radius: 0 6px 6px 0; margin: 12px 0;
  }
  .impact-summary p { margin: 0; }
  dl.facts { margin: 12px 0 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; }
  dl.facts dt { color: #475569; font-size: 13px; }
  dl.facts dd { margin: 0; font-size: 14px; color: #0f172a; }
  .framework-tags { margin-top: 12px; }
  .framework-tag {
    display: inline-block; background: #ecfeff; color: #0e7490;
    border: 1px solid #a5f3fc; border-radius: 999px;
    font-size: 11px; padding: 2px 10px; margin: 2px 4px 0 0;
  }
  .decision-pill {
    display: inline-block; padding: 4px 12px; border-radius: 999px;
    font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .decision-pill.approved { background: #ecfdf5; color: #047857; }
  .decision-pill.declined { background: #fee2e2; color: #b91c1c; }
  .decision-pill.deferred { background: #ede9fe; color: #6d28d9; }
  .response-block { margin-top: 32px; padding: 20px;
    background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 12px; }
  .response-block h3 { margin: 0 0 8px; font-size: 16px; color: #0e7490; }
  .response-block ul { margin: 8px 0 0 20px; padding: 0; }
  .response-block li { margin: 4px 0; }
  footer {
    margin-top: 40px; padding-top: 20px;
    border-top: 1px solid #e2e8f0;
    color: #64748b; font-size: 13px;
  }
  footer .sender { color: #0f172a; font-weight: 500; }
  @media print {
    body { background: #fff; }
    .container { padding: 0; max-width: none; }
    .change, .intro, .response-block { box-shadow: none; }
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="brand">Triple Cities Tech</div>
    <h1>${escapeHtml(data.bundleTitle)}</h1>
    <div class="meta">For ${escapeHtml(data.companyName)} · ${data.items.length} proposed change${data.items.length === 1 ? '' : 's'}</div>
  </header>

  <section class="intro">
    <p>${greeting}</p>
    ${
      data.customerFacingNotes
        ? `<p>${escapeHtml(data.customerFacingNotes)}</p>`
        : `<p>We've reviewed your environment and identified ${data.items.length} security improvement${data.items.length === 1 ? '' : 's'} we'd like to make on your behalf. Each one is described below in plain language, with a recommended rollout date.</p>`
    }
    <p>Please reply with <strong>yes / no / later</strong> for each change, and any preferred dates. We'll handle the rest.</p>
  </section>

  ${itemBlocks}

  <section class="response-block">
    <h3>How to respond</h3>
    <p>Reply to this email with one of:</p>
    <ul>
      <li><strong>"Approve all"</strong> — proceed with all changes on the suggested dates.</li>
      <li>Per-change responses, e.g. <em>"Change 1: yes, March 18. Change 2: defer. Change 3: no."</em></li>
      <li>Or schedule a 15-minute call to discuss.</li>
    </ul>
  </section>

  <footer>
    <div>Thank you,</div>
    <div class="sender">${escapeHtml(data.staffSender.name)}</div>
    <div>Triple Cities Tech · <a href="mailto:${escapeHtml(data.staffSender.email)}">${escapeHtml(data.staffSender.email)}</a></div>
    <div style="margin-top: 12px; font-size: 12px;">Bundle reference: ${escapeHtml(data.bundleId)}</div>
  </footer>
</div>
</body>
</html>`
}

function renderItem(item: BundleReportItem, index: number, total: number): string {
  const proposed = formatDate(item.proposedDate ?? item.agreedDeploymentDate)
  const decisionPill = item.customerDecision
    ? `<span class="decision-pill ${item.customerDecision}">${item.customerDecision}</span>`
    : ''
  const frameworkTags = item.frameworkLabels
    .map((label) => `<span class="framework-tag">${escapeHtml(label)}</span>`)
    .join('')
  const disruption =
    item.impact.estimatedDisruptionMinutes > 0
      ? `${item.impact.estimatedDisruptionMinutes} minute${item.impact.estimatedDisruptionMinutes === 1 ? '' : 's'} per person`
      : 'No noticeable disruption'

  return `<article class="change">
    <div class="change-meta">Change ${index} of ${total} ${decisionPill}</div>
    <h2>${escapeHtml(item.actionName)}</h2>

    <div class="impact-summary"><p>${escapeHtml(item.customerImpactSummary)}</p></div>

    <dl class="facts">
      <dt>Who it affects</dt><dd>${escapeHtml(describeBlastRadius(item.impact))}</dd>
      <dt>Time impact</dt><dd>${escapeHtml(disruption)}</dd>
      <dt>Sign-in interruption</dt><dd>${item.impact.sessionDisruptive ? 'Yes — users may be signed out briefly' : 'No'}</dd>
      <dt>Action by your team</dt><dd>${item.impact.requiresEndUserAction ? 'Yes — each affected user will need to take a small action' : 'None required'}</dd>
      <dt>Suggested rollout</dt><dd>${proposed ?? '<em>To be confirmed</em>'}</dd>
    </dl>

    ${
      frameworkTags
        ? `<div class="framework-tags"><div style="color:#475569;font-size:12px;margin-bottom:4px;">Required for:</div>${frameworkTags}</div>`
        : ''
    }

    ${
      item.customerNote
        ? `<div style="margin-top:12px;padding:10px 12px;background:#fafafa;border-left:3px solid #94a3b8;font-size:13px;color:#334155;"><strong>Your reply:</strong> ${escapeHtml(item.customerNote)}</div>`
        : ''
    }
  </article>`
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full
}

function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
