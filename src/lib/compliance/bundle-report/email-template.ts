/**
 * Bundle email — plaintext + HTML body.
 *
 * The HTML body reuses the full report template (which is already
 * email-compatible — inline-styled, table-free, no JS). The plaintext
 * body is a compact summary suitable for clients that suppress HTML.
 */

import type { BundleReportData } from './types'
import { describeBlastRadius } from './types'
import { renderBundleReportHtml } from './html-template'

export interface BundleEmail {
  subject: string
  html: string
  text: string
}

export function renderBundleEmail(data: BundleReportData): BundleEmail {
  const subject = `${data.bundleTitle} — Security updates for your review (${data.items.length} change${data.items.length === 1 ? '' : 's'})`
  return {
    subject,
    html: renderBundleReportHtml(data),
    text: renderBundleEmailText(data),
  }
}

function renderBundleEmailText(data: BundleReportData): string {
  const lines: string[] = []
  const greeting = data.customerContact.name ? `Hi ${firstName(data.customerContact.name)},` : 'Hi there,'

  lines.push(greeting)
  lines.push('')
  if (data.customerFacingNotes) {
    lines.push(data.customerFacingNotes)
  } else {
    lines.push(
      `We've reviewed your environment and identified ${data.items.length} security improvement${
        data.items.length === 1 ? '' : 's'
      } we'd like to make on your behalf. Each one is described below in plain language with a recommended rollout date.`
    )
  }
  lines.push('')
  lines.push('Please reply with yes / no / later for each change, and any preferred dates.')
  lines.push('')

  const sorted = data.items.slice().sort((a, b) => a.displayOrder - b.displayOrder)
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]
    lines.push('────────────────────────────────────────────────────')
    lines.push(`Change ${i + 1} of ${sorted.length} — ${item.actionName}`)
    lines.push('────────────────────────────────────────────────────')
    lines.push('')
    lines.push('What it does')
    lines.push(`  ${item.customerImpactSummary}`)
    lines.push('')
    lines.push('How it affects your team')
    lines.push(`  • Who it affects: ${describeBlastRadius(item.impact)}`)
    lines.push(
      `  • Time impact: ${
        item.impact.estimatedDisruptionMinutes > 0
          ? `${item.impact.estimatedDisruptionMinutes} minute${item.impact.estimatedDisruptionMinutes === 1 ? '' : 's'} per person`
          : 'No noticeable disruption'
      }`
    )
    lines.push(`  • Sign-in interruption: ${item.impact.sessionDisruptive ? 'Yes' : 'No'}`)
    lines.push(`  • Action by your team: ${item.impact.requiresEndUserAction ? 'Yes' : 'None required'}`)
    const proposed = formatDate(item.proposedDate ?? item.agreedDeploymentDate)
    if (proposed) lines.push(`  • Suggested rollout: ${proposed}`)
    if (item.frameworkLabels.length > 0) {
      lines.push(`  • Required for: ${item.frameworkLabels.join(', ')}`)
    }
    lines.push('')
  }

  lines.push('────────────────────────────────────────────────────')
  lines.push('How to respond')
  lines.push('────────────────────────────────────────────────────')
  lines.push('Reply to this email with one of:')
  lines.push('  • "Approve all" — proceed with the suggested dates')
  lines.push('  • Per-change responses, e.g. "Change 1: yes, March 18. Change 2: defer."')
  lines.push('  • Or schedule a 15-minute call to discuss.')
  lines.push('')
  lines.push(`Thank you,`)
  lines.push(`${data.staffSender.name}`)
  lines.push(`Triple Cities Tech · ${data.staffSender.email}`)
  lines.push('')
  lines.push(`Bundle reference: ${data.bundleId}`)
  return lines.join('\n')
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
