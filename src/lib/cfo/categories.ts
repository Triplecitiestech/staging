/**
 * Destination categorization. Ported from the standalone tool's categories.mjs,
 * but file persistence is removed — the stored category map is passed in (it
 * lives in Postgres via the cfo store). buildCategoryMap merges any stored
 * overrides with auto-derived defaults for newly-seen destinations.
 */

import type { Transfer, CategoryMap } from './types'

function normalizeCounterpartyName(name?: string | null): string | null {
  if (!name) return null
  return name
    .replace(/\s*\|\s*\d+\s*$/, '')
    .replace(/\s+\d+\s*$/, '')
    .trim()
}

export function categoryKeyFor(transfer: Transfer): string | null {
  // Pod destinations (have ID): use raw name (stable, no junk suffix)
  if (transfer.destination?.id) return transfer.destination.name ?? null
  // Null-ID external counterparties: normalize away trailing reference codes
  return normalizeCounterpartyName(transfer.destination?.name)
}

export const ALLOWED_CATEGORIES = [
  'credit-card', 'payroll', 'loan', 'tax', 'insurance',
  'vendor', 'personal', 'transfer-out', 'other',
] as const

export interface CategorySummary {
  map: CategoryMap
  added: number
  totalDestinations: number
  untagged: string[]
}

/**
 * Merge a stored category map with auto-derived defaults for destinations seen
 * in the lookback window. Pure — returns the merged map and stats; persistence
 * is the caller's responsibility.
 */
export function buildCategoryMap(allTransfers: Transfer[], stored: CategoryMap, lookbackDays = 90): CategorySummary {
  const cutoff = Date.now() - lookbackDays * 86400000
  const inWindow = allTransfers.filter(
    (t) => t.status === 'COMPLETE' && new Date(t.createdAt).getTime() >= cutoff
  )

  const merged: CategoryMap = { ...stored }
  let added = 0
  const seen = new Set<string>()
  for (const t of inWindow) {
    const key = categoryKeyFor(t)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (!(key in merged)) {
      merged[key] = t.direction === 'INTERNAL' ? 'transfer-out' : ''
      added += 1
    }
  }

  return {
    map: merged,
    added,
    totalDestinations: Object.keys(merged).length,
    untagged: Object.entries(merged).filter(([, v]) => !v).map(([k]) => k),
  }
}

export function categorize(transfer: Transfer, categoryMap: CategoryMap): string {
  const key = categoryKeyFor(transfer)
  if (!key) return 'other'
  const cat = categoryMap[key]
  if (!cat) {
    if (transfer.direction === 'INTERNAL') return 'transfer-out'
    return 'untagged'
  }
  return cat
}
