/**
 * Connector + tool label registry — turns raw slugs like `datto_edr`
 * into human-readable display names like `Datto EDR`.
 *
 * Source of truth is the tool-definitions registry (DEFAULT_TOOLS).
 * Connectors share most of the same identifiers (microsoft_graph,
 * datto_rmm, etc.) so we look up the same way. For anything the
 * registry doesn't know about (custom toolIds, new connector types),
 * fall back to title-casing the slug so the UI never shows raw
 * snake_case to the operator.
 */

import { DEFAULT_TOOLS } from './registry/tool-definitions'

const SLUG_TO_LABEL: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const tool of DEFAULT_TOOLS) {
    map[tool.toolId] = tool.name
  }
  // Connectors that don't have a 1:1 tool entry.
  map['saas_alerts'] = map['saas_alerts'] || 'SaaS Alerts'
  map['huntress'] = 'Huntress'
  map['bullphish'] = 'BullPhish ID' // legacy slug variant — registry uses bullphish_id
  return map
})()

/**
 * Resolve any tool / connector slug to a display label. Unknown slugs
 * fall back to title-cased words: `some_new_thing` → `Some New Thing`.
 */
export function toolLabel(slug: string | null | undefined): string {
  if (!slug) return ''
  const exact = SLUG_TO_LABEL[slug]
  if (exact) return exact
  return slug
    .split(/[_-]+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

/** Returns the registered vendor for a slug, or '' if unknown. */
export function toolVendor(slug: string | null | undefined): string {
  if (!slug) return ''
  const tool = DEFAULT_TOOLS.find((t) => t.toolId === slug)
  return tool?.vendor ?? ''
}

// ============================================================================
// Framework labels
// ============================================================================

const FRAMEWORK_LABELS: Record<string, string> = {
  'cis-v8': 'CIS v8',
  'cis-v8-ig1': 'CIS v8 — IG1',
  'cis-v8-ig2': 'CIS v8 — IG2',
  'cis-v8-ig3': 'CIS v8 — IG3',
  'cmmc-l1': 'CMMC Level 1',
  'cmmc-l2': 'CMMC Level 2',
  'nist-800-171': 'NIST 800-171',
  'hipaa': 'HIPAA',
  'pci': 'PCI DSS',
  'pci-dss': 'PCI DSS',
}

/** Resolve a framework ID to a human-readable label. Falls back to the raw ID. */
export function frameworkLabel(id: string | null | undefined): string {
  if (!id) return ''
  return FRAMEWORK_LABELS[id] ?? id
}
