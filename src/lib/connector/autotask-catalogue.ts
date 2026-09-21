// src/lib/connector/autotask-catalogue.ts
//
// THE Autotask API surface, as a machine-generated catalogue.
//
// WHY THIS FILE EXISTS: every Autotask capability in this connector was added
// reactively, after a missing one blocked live work. On 2026-09-21 a $45
// shipping charge could not be put on a ticket because TicketCharges had no
// surface — while entityInformation had been reporting TicketCharges.canCreate
// true the whole time. The same week, note editing, attachment delete, ticket
// re-parent and picklist lookups were each built only after they blocked
// somebody mid-task.
//
// Closing those gaps one at a time is what produced the pattern. The fix is not
// a longer hand-written list: it is that THERE IS NO HAND-WRITTEN LIST. This
// catalogue is generated from the zone's own metadata by
// scripts/generate-autotask-catalogue.ts, committed as a snapshot, and the
// coverage check (./autotask-coverage.ts) fails the build when the surface does
// not cover it.
//
// THE SNAPSHOT IS NOT THE AUTHORITY AT RUNTIME. It is the build-time census —
// what to cover and what to enforce coverage against. Every live decision
// ("can this instance create a TicketCharge?", "is this field writable?") still
// goes through ./autotask-capability.ts, which reads entityInformation live and
// returns TRANSIENT rather than a vendor claim when it cannot. A committed file
// must never become the thing that says "the vendor can't" — that is the exact
// stale-belief failure this whole subsystem exists to end.

import rawCatalogue from '@/data/autotask-catalogue.generated.json'

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface CatalogueField {
  name: string
  dataType?: string
  isRequired: boolean
  isReadOnly: boolean
  isQueryable?: boolean
  isPickList?: boolean
  isReference?: boolean
  referenceEntityType?: string | null
}

export interface CatalogueCapabilities {
  canQuery: boolean | null
  canCreate: boolean | null
  canUpdate: boolean | null
  canDelete: boolean | null
  hasUserDefinedFields?: boolean | null
}

export interface CatalogueEntity {
  name: string
  capabilities: CatalogueCapabilities
  fields: CatalogueField[]
}

/**
 * How each entity name came to be probed. Recorded per RUN, and every source
 * that was tried is listed whether or not it answered — the Kaseya Quote
 * Manager probe taught this repo that a diagnostic which reports only the first
 * mechanism that worked is indistinguishable from one that guessed.
 */
export interface CatalogueDiscovery {
  /** The source that supplied the candidate names the run actually used. */
  source: 'swagger' | 'vendor-doc-list' | 'reference-closure' | 'previous-snapshot'
  /** Every source attempted, with its outcome. */
  attempted: Array<{ source: string; outcome: string; count?: number }>
  /** Candidates probed that returned 404 — no REST surface on this instance. */
  notRestEntities: string[]
  /** Candidates whose probe failed for a reason that is NOT a 404. Never read as absent. */
  unchecked: Array<{ entity: string; error: string }>
}

export interface AutotaskCatalogue {
  generatedAt: string
  generator: string
  /** Zone host the metadata was read from, with no credentials in it. */
  zone: string | null
  discovery: CatalogueDiscovery
  entities: CatalogueEntity[]
}

export const CATALOGUE: AutotaskCatalogue = rawCatalogue as AutotaskCatalogue

export type EntityOperation = 'query' | 'create' | 'update' | 'delete'

export const WRITE_OPERATIONS: readonly Exclude<EntityOperation, 'query'>[] = ['create', 'update', 'delete'] as const

const CAP_FIELD: Record<EntityOperation, keyof CatalogueCapabilities> = {
  query: 'canQuery',
  create: 'canCreate',
  update: 'canUpdate',
  delete: 'canDelete',
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

const byName = new Map<string, CatalogueEntity>(CATALOGUE.entities.map((e) => [e.name.toLowerCase(), e]))

/** Every entity in the catalogue, alphabetically. */
export function catalogueEntities(): CatalogueEntity[] {
  return [...CATALOGUE.entities].sort((a, b) => a.name.localeCompare(b.name))
}

/** Every entity NAME in the catalogue. */
export function catalogueEntityNames(): string[] {
  return catalogueEntities().map((e) => e.name)
}

/** One entity, matched case-insensitively (Autotask entity names are). */
export function catalogueEntity(entity: string): CatalogueEntity | undefined {
  return byName.get(entity.toLowerCase())
}

/** The entity's canonical spelling, or the input unchanged when unknown. */
export function canonicalEntityName(entity: string): string {
  return catalogueEntity(entity)?.name ?? entity
}

/** Does the catalogue say this instance permits the operation? null = metadata silent. */
export function cataloguePermits(entity: string, op: EntityOperation): boolean | null {
  const e = catalogueEntity(entity)
  if (!e) return null
  return (e.capabilities[CAP_FIELD[op]] ?? null) as boolean | null
}

/** Operations the catalogue reports permitted (true only — null is not a yes). */
export function permittedOperations(entity: string): EntityOperation[] {
  const e = catalogueEntity(entity)
  if (!e) return []
  return (['query', 'create', 'update', 'delete'] as EntityOperation[]).filter(
    (op) => e.capabilities[CAP_FIELD[op]] === true,
  )
}

/**
 * Fields the API reports writable (isReadOnly false).
 *
 * `id` is excluded: it is writable-flagged on some entities but it identifies
 * the record rather than carrying data, and every write path supplies it from
 * the caller's entityId rather than from a field payload.
 */
export function writableFields(entity: string): CatalogueField[] {
  const e = catalogueEntity(entity)
  if (!e) return []
  return e.fields.filter((f) => !f.isReadOnly && f.name.toLowerCase() !== 'id')
}

/** Fields required on create (isRequired true), writable or not. */
export function requiredFields(entity: string): CatalogueField[] {
  return catalogueEntity(entity)?.fields.filter((f) => f.isRequired) ?? []
}

/** One field's catalogue metadata. */
export function catalogueField(entity: string, field: string): CatalogueField | undefined {
  return catalogueEntity(entity)?.fields.find((f) => f.name.toLowerCase() === field.toLowerCase())
}

// ---------------------------------------------------------------------------
// Parent-path derivation
// ---------------------------------------------------------------------------
//
// Some Autotask entities are only writable under their parent
// (Tickets/{id}/Notes, HolidaySets/{id}/Holidays). Which ones, and under which
// segment, is NOT hand-listed here — it is derived from the catalogue's own
// reference metadata, so an entity added by Kaseya next year gets the same
// treatment without anybody noticing it exists.
//
// Derivation, in order:
//   1. A REQUIRED reference field whose referenceEntityType resolves to another
//      catalogue entity is the parent candidate.
//   2. The URL segment is the child entity name with the parent's singular name
//      stripped from the front when it is a prefix (TicketNotes under Tickets →
//      "Notes"), otherwise the entity name itself (Holidays under HolidaySets →
//      "Holidays").
//
// The result is a CANDIDATE list, not a verdict. writeAtFirstWorkingPath tries
// the root path and each candidate in turn and reports which one answered: a
// 404 moves to the next, any other status stops and surfaces. So a wrong guess
// here costs one extra request and is reported, never silently mis-routed.

/** Autotask reference metadata is singular ("Ticket"); REST paths are plural ("Tickets"). */
function pluralCandidates(singular: string): string[] {
  const s = singular.replace(/\s+/g, '')
  const out = [`${s}s`, s]
  if (/y$/.test(s)) out.unshift(`${s.slice(0, -1)}ies`)
  if (/(s|x|z|ch|sh)$/i.test(s)) out.unshift(`${s}es`)
  return Array.from(new Set(out))
}

/** The catalogue entity a reference field points at, or undefined. */
export function referenceTarget(field: CatalogueField): CatalogueEntity | undefined {
  if (!field.referenceEntityType) return undefined
  for (const candidate of pluralCandidates(field.referenceEntityType)) {
    const hit = catalogueEntity(candidate)
    if (hit) return hit
  }
  return undefined
}

export interface ParentRoute {
  /** The field on the child that carries the parent id, e.g. "ticketID". */
  parentIdField: string
  /** The parent's REST entity name, e.g. "Tickets". */
  parentEntity: string
  /** The child segment under the parent, e.g. "Notes". */
  childSegment: string
}

/**
 * Parent routes for an entity, most-likely first.
 *
 * Ordered by how strongly the metadata points at a parent: a required
 * reference whose name prefixes the child entity (TicketNotes.ticketID) beats a
 * required reference that does not.
 */
export function parentRoutes(entity: string): ParentRoute[] {
  const e = catalogueEntity(entity)
  if (!e) return []
  const routes: Array<ParentRoute & { rank: number }> = []
  for (const f of e.fields) {
    if (!f.isReference || !f.isRequired) continue
    const parent = referenceTarget(f)
    if (!parent || parent.name.toLowerCase() === e.name.toLowerCase()) continue
    const singular = f.referenceEntityType as string
    const prefixes = e.name.toLowerCase().startsWith(singular.toLowerCase())
    const childSegment = prefixes ? e.name.slice(singular.length) || e.name : e.name
    routes.push({
      parentIdField: f.name,
      parentEntity: parent.name,
      childSegment,
      rank: prefixes ? 0 : 1,
    })
  }
  return routes
    .sort((a, b) => a.rank - b.rank || a.parentIdField.localeCompare(b.parentIdField))
    .map((r) => ({ parentIdField: r.parentIdField, parentEntity: r.parentEntity, childSegment: r.childSegment }))
}

/**
 * Candidate REST write paths for an entity, root first.
 *
 * `values` supplies the parent ids available on this particular call, so a
 * parent route whose id the caller did not provide is skipped rather than
 * producing a path with `undefined` in it.
 */
export function writePathCandidates(entity: string, values: Record<string, unknown> = {}): string[] {
  const name = canonicalEntityName(entity)
  const paths = [name]
  for (const route of parentRoutes(name)) {
    const id = values[route.parentIdField] ?? values[route.parentIdField.toLowerCase()]
    if (id === undefined || id === null || id === '') continue
    paths.push(`${route.parentEntity}/${id}/${route.childSegment}`)
  }
  return paths
}
