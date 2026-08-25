// src/lib/connector/autotask-picklists.ts
//
// Resolve an Autotask picklist value by LABEL at runtime, instead of hardcoding
// its numeric id.
//
// WHY THIS EXISTS: hardcoded picklist ids in this codebase have now been wrong
// FIVE times, every one of them a value copied from Autotask's DEFAULT picklist
// rather than read from this instance:
//
//   AT_TASK_STATUS_IN_PROGRESS   was 4  — this instance has no Tasks.status 4 at all (it is 8)
//   AT_PROJECT_STATUS.ACTIVE     was 4  — 4 is "Change Order" here (In Progress is 2)
//   AT_TASK_PRIORITY.LOW/.HIGH   were 1/3 — INVERTED; live 1 is High and 3 is Low
//   autotask_add_project_note    defaulted noteType 3 — ProjectNotes.noteType is 8/5/12, no 3
//   the shared note-publish help  said "no id 3, use 4" — true of TaskNotes, FALSE of ProjectNotes
//
// Five instances of one root cause is a pattern, not a run of bad luck. A
// constant cannot notice that Kaseya renumbered something; a lookup can.
//
// THE FALLBACK IS THE DELICATE PART. A resolver that throws when the lookup
// fails would turn a brief Autotask blip into a failed write, which is worse
// than the bug it replaces. A resolver that silently falls back to a hardcoded
// id would reintroduce exactly the defect above, invisibly. So this returns the
// fallback AND says it did — `resolvedFrom: 'fallback'` — and callers surface
// that, so a wrong id can be seen in a response rather than inferred from a
// rejection.

import { AutotaskClient } from '@/lib/autotask'

export type PicklistSource = 'live' | 'cache' | 'fallback'

export interface ResolvedPicklistValue {
  id: number
  /** How the id was obtained. 'fallback' means the live lookup did not answer. */
  resolvedFrom: PicklistSource
  /** Every live option, when the lookup succeeded — so a caller can name the real choices. */
  options: Array<{ id: number; label: string }>
  /** Set when resolvedFrom is 'fallback': why the lookup did not answer. */
  warning?: string
}

interface CacheEntry {
  options: Array<{ id: number; label: string }>
  expiresAt: number
}

const TTL_MS = Math.max(1, Number(process.env.CONNECTOR_AT_PICKLIST_TTL_MINUTES || 30)) * 60_000

// globalThis-cached for the same reason the capability cache is: without it
// every serverless invocation re-fetches the same picklist.
const globalForPicklists = globalThis as unknown as { __atPicklistCache?: Map<string, CacheEntry> }
const cache: Map<string, CacheEntry> = (globalForPicklists.__atPicklistCache ??= new Map())

const key = (entity: string, field: string) => `${entity.toLowerCase()}.${field.toLowerCase()}`

/** Clear the cache. Exposed for tests and for a forced re-read after a picklist edit. */
export function clearPicklistCache(entityField?: { entity: string; field: string }): void {
  if (entityField) cache.delete(key(entityField.entity, entityField.field))
  else cache.clear()
}

/** Test seam — lets the resolver be exercised without credentials or network. */
export type PicklistFetcher = (entity: string, field: string) => Promise<Array<{ id: number; label: string }>>
let fetcher: PicklistFetcher | null = null
export function __setPicklistFetcher(fn: PicklistFetcher | null): void {
  fetcher = fn
}

async function loadOptions(entity: string, field: string): Promise<Array<{ id: number; label: string }>> {
  if (fetcher) return fetcher(entity, field)
  return new AutotaskClient().getEntityPicklist(entity, field)
}

/**
 * Compare picklist labels forgivingly.
 *
 * Case and surrounding punctuation/spacing only — NOT a fuzzy match. "Project
 * Notes" must not resolve to "Project Status" because a near-miss silently
 * writing the wrong status is worse than a clean failure.
 */
function labelsMatch(a: string, b: string): boolean {
  const norm = (v: string) => v.trim().toLowerCase().replace(/[\s_-]+/g, ' ')
  return norm(a) === norm(b)
}

/**
 * Resolve `label` to its live id on this instance.
 *
 * `fallbackId` is used ONLY when the live lookup fails outright (network, auth,
 * an entity with no such field). A lookup that SUCCEEDS and simply does not
 * contain the label is not a fallback case — that means the label is wrong or
 * was renamed, and the caller needs to know, so it comes back with
 * resolvedFrom 'fallback' and a warning naming every option that does exist.
 */
export async function resolvePicklistId(
  entity: string,
  field: string,
  label: string,
  fallbackId: number,
): Promise<ResolvedPicklistValue> {
  const k = key(entity, field)
  const cached = cache.get(k)
  const now = Date.now()

  if (cached && cached.expiresAt > now) {
    const hit = cached.options.find((o) => labelsMatch(o.label, label))
    if (hit) return { id: hit.id, resolvedFrom: 'cache', options: cached.options }
    return {
      id: fallbackId,
      resolvedFrom: 'fallback',
      options: cached.options,
      warning: `No ${entity}.${field} value is labelled "${label}" on this instance (cached ${cached.options.length} option(s): ${cached.options.map((o) => `${o.id} ${o.label}`).join(', ')}). Fell back to id ${fallbackId}, which may be wrong.`,
    }
  }

  let options: Array<{ id: number; label: string }>
  try {
    options = await loadOptions(entity, field)
  } catch (e) {
    return {
      id: fallbackId,
      resolvedFrom: 'fallback',
      options: [],
      warning: `Could not read the live ${entity}.${field} picklist (${e instanceof Error ? e.message : String(e)}), so id ${fallbackId} was used unverified. If the write is rejected for an invalid picklist value, this is why.`,
    }
  }

  cache.set(k, { options, expiresAt: now + TTL_MS })
  const hit = options.find((o) => labelsMatch(o.label, label))
  if (hit) return { id: hit.id, resolvedFrom: 'live', options }

  return {
    id: fallbackId,
    resolvedFrom: 'fallback',
    options,
    warning: `No ${entity}.${field} value is labelled "${label}" on this instance. Live options: ${options.map((o) => `${o.id} ${o.label}`).join(', ') || 'none returned'}. Fell back to id ${fallbackId}, which may be wrong.`,
  }
}

/**
 * Is `id` a real value of this picklist right now?
 *
 * Returns null when the lookup itself failed — "I could not check" must never
 * read as "it is invalid", the same rule the capability layer follows.
 */
export async function picklistIdIsValid(
  entity: string,
  field: string,
  id: number,
): Promise<{ valid: boolean | null; options: Array<{ id: number; label: string }> }> {
  const k = key(entity, field)
  const cached = cache.get(k)
  if (cached && cached.expiresAt > Date.now()) {
    return { valid: cached.options.some((o) => o.id === id), options: cached.options }
  }
  try {
    const options = await loadOptions(entity, field)
    cache.set(k, { options, expiresAt: Date.now() + TTL_MS })
    return { valid: options.some((o) => o.id === id), options }
  } catch {
    return { valid: null, options: [] }
  }
}
