/**
 * Policy Generation System — Document Export
 *
 * Converts generated Markdown policies to downloadable formats.
 * Phase 1: HTML export (renders nicely, printable, convertible to PDF via browser)
 * Phase 2 stub: DOCX via external library, storage provider interfaces
 */

import type { PolicyDocumentMetadata, DocumentStorageProvider } from './types'

// ---------------------------------------------------------------------------
// Markdown → HTML conversion (lightweight, no external deps)
// ---------------------------------------------------------------------------

/**
 * Convert a Markdown policy document to a styled HTML page.
 * Uses inline CSS for maximum portability (email, print, save-as).
 */
export function renderPolicyHtml(
  markdownContent: string,
  metadata: PolicyDocumentMetadata
): string {
  const bodyHtml = markdownToHtml(markdownContent)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(metadata.policyTitle)} — ${escapeHtml(metadata.companyName)}</title>
<style>
  @page { margin: 1in; }
  body {
    font-family: 'Segoe UI', Calibri, Arial, sans-serif;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 1in;
    color: #1a1a1a;
    line-height: 1.6;
    font-size: 11pt;
  }
  .policy-header {
    border-bottom: 3px solid #1e3a5f;
    padding-bottom: 16px;
    margin-bottom: 32px;
  }
  .policy-header h1 {
    color: #1e3a5f;
    font-size: 22pt;
    margin: 0 0 8px 0;
  }
  .policy-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 24px;
    font-size: 9.5pt;
    color: #555;
    margin-top: 12px;
  }
  .policy-meta dt { font-weight: 600; }
  .policy-meta dd { margin: 0; }
  h2 { color: #1e3a5f; font-size: 14pt; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  h3 { color: #2c5282; font-size: 12pt; margin-top: 20px; }
  h4 { font-size: 11pt; margin-top: 16px; }
  ul, ol { margin: 8px 0; padding-left: 24px; }
  li { margin: 4px 0; }
  strong { color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 10pt; }
  th { background: #f0f4f8; font-weight: 600; }
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #ccc;
    font-size: 9pt;
    color: #888;
    text-align: center;
  }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>

<div class="policy-header">
  <h1>${escapeHtml(metadata.policyTitle)}</h1>
  <dl class="policy-meta">
    <dt>Company</dt><dd>${escapeHtml(metadata.companyName)}</dd>
    <dt>Effective Date</dt><dd>${escapeHtml(metadata.effectiveDate)}</dd>
    <dt>Version</dt><dd>${escapeHtml(metadata.version)}</dd>
    <dt>Next Review</dt><dd>${escapeHtml(metadata.reviewDate)}</dd>
    <dt>Policy Owner</dt><dd>${escapeHtml(metadata.owner)}</dd>
    <dt>Approved By</dt><dd>${escapeHtml(metadata.approvedBy)}</dd>
  </dl>
</div>

${bodyHtml}

<div class="footer">
  ${escapeHtml(metadata.companyName)} — ${escapeHtml(metadata.policyTitle)} — Version ${escapeHtml(metadata.version)}
  <br>Generated on ${new Date().toISOString().split('T')[0]}. This document is confidential.
</div>

</body>
</html>`
}

// ---------------------------------------------------------------------------
// Lightweight Markdown → HTML (no external dependencies)
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  let html = md
    // Escape HTML entities in content (but preserve our markdown)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '') // Skip h1 — it's in the header

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>')

  // Convert lists — process blocks of consecutive list items
  html = processLists(html)

  // Paragraphs — wrap non-tag lines
  html = html
    .split('\n\n')
    .map((block) => {
      block = block.trim()
      if (!block) return ''
      // Don't wrap blocks that are already HTML elements
      if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<ol')
        || block.startsWith('<li') || block.startsWith('<hr') || block.startsWith('<table')
        || block.startsWith('<div') || block.startsWith('<p')) {
        return block
      }
      return `<p>${block.replace(/\n/g, '<br>')}</p>`
    })
    .join('\n\n')

  return html
}

function processLists(html: string): string {
  const lines = html.split('\n')
  const result: string[] = []
  let inUl = false
  let inOl = false

  for (const line of lines) {
    const ulMatch = line.match(/^(\s*)[-*] (.+)$/)
    const olMatch = line.match(/^(\s*)\d+\. (.+)$/)

    if (ulMatch) {
      if (!inUl) { result.push('<ul>'); inUl = true }
      if (inOl) { result.push('</ol>'); inOl = false }
      result.push(`<li>${ulMatch[2]}</li>`)
    } else if (olMatch) {
      if (!inOl) { result.push('<ol>'); inOl = true }
      if (inUl) { result.push('</ul>'); inUl = false }
      result.push(`<li>${olMatch[2]}</li>`)
    } else {
      if (inUl) { result.push('</ul>'); inUl = false }
      if (inOl) { result.push('</ol>'); inOl = false }
      result.push(line)
    }
  }
  if (inUl) result.push('</ul>')
  if (inOl) result.push('</ol>')

  return result.join('\n')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Future: Document Storage Provider stubs
// ---------------------------------------------------------------------------

/**
 * SharePoint Policy Publisher — stub for future integration.
 * Will use Microsoft Graph API to upload policies to a company's SharePoint.
 */
export class SharePointPolicyPublisher implements DocumentStorageProvider {
  name = 'SharePoint'

  async publish(
    _companyId: string,
    _policySlug: string,
    _content: string,
    _metadata: PolicyDocumentMetadata
  ): Promise<{ url: string }> {
    // Phase 2: Use Graph API to upload to SharePoint document library
    // Target: /sites/{siteName}/Shared Documents/Policies/{policyTitle}.html
    throw new Error('SharePoint publishing is not yet implemented — coming in Phase 2')
  }

  async exists(_companyId: string, _policySlug: string): Promise<boolean> {
    return false
  }
}

/**
 * IT Glue Policy Publisher — stub for future integration.
 * Will use IT Glue API to upload policies under a "Policies" folder.
 */
export class ITGluePolicyPublisher implements DocumentStorageProvider {
  name = 'IT Glue'

  async publish(
    _companyId: string,
    _policySlug: string,
    _content: string,
    _metadata: PolicyDocumentMetadata
  ): Promise<{ url: string }> {
    // Phase 2: Use IT Glue API to create/update document
    // Target: Organizations/{orgId}/Documents/Policies/{policyTitle}
    throw new Error('IT Glue publishing is not yet implemented — coming in Phase 2')
  }

  async exists(_companyId: string, _policySlug: string): Promise<boolean> {
    return false
  }
}
