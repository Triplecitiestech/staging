// src/lib/connector/autotask-capability.ts
//
// LIVE capability authority for Autotask, derived from the REST API's own
// entityInformation endpoints and cached with a TTL.
//
// THE DESIGN RULE THAT DRIVES THIS FILE: never hardcode "Autotask can't do X".
// Kaseya ships API changes, and a stale hardcoded vendor-limitation claim is
// precisely the failure mode the failure-envelope contract exists to eliminate.
// So UPSTREAM_UNSUPPORTED for Autotask is ALWAYS derived from a live lookup.
//
// The corollary matters just as much: if the cache is cold and the lookup
// FAILS, we return TRANSIENT — not UPSTREAM_UNSUPPORTED. "I could not ask" is
// never evidence of "the vendor cannot". Getting that backwards would let a
// 30-second Autotask outage manufacture a permanent false limitation claim.
//
// Companion: ./failure-envelope.ts (the vendor-neutral contract this feeds).

import { AutotaskClient } from '@/lib/autotask'
import {
  ClassifiedConnectorError,
  connectorFailure,
  throwClassified,
  type ConnectorFailure,
  type FailureInput,
} from './failure-envelope'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityOperation = 'query' | 'create' | 'update' | 'delete'

export interface FieldMetadata {
  name: string
  dataType?: unknown
  isRequired: boolean
  isReadOnly: boolean
  isQueryable?: boolean
  isPickList?: unknown
  picklistValueCount?: number
  isReference?: boolean
  referenceEntityType?: string | null
}

export interface EntityCapabilities {
  canQuery: boolean | null
  canCreate: boolean | null
  canUpdate: boolean | null
  canDelete: boolean | null
  hasUserDefinedFields?: boolean | null
  supportsWebhookCallouts?: boolean | null
}

export interface EntityCapabilitySnapshot {
  entity: string
  capabilities: EntityCapabilities
  fields: FieldMetadata[]
  /** ISO timestamp of the live lookup this snapshot came from. */
  fetchedAt: string
}

export type CacheOutcome = 'hit' | 'miss' | 'stale-fallback'

export interface SnapshotResult {
  snapshot: EntityCapabilitySnapshot
  cache: CacheOutcome
  /** Set when the live lookup failed and an EXPIRED cache entry was used. */
  staleWarning?: string
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const TTL_MS = Math.max(1, Number(process.env.CONNECTOR_AT_CAPABILITY_TTL_MINUTES || 30)) * 60_000

interface CacheEntry {
  snapshot: EntityCapabilitySnapshot
  expiresAt: number
}

// globalThis-cached to survive hot-reload in dev and warm-invocation reuse on
// Vercel — the same convention the Prisma/pg pools use in this repo. Without
// it every serverless invocation would re-fetch entityInformation for the same
// entity, which is both slow and a needless load on the Autotask API.
const globalForCapability = globalThis as unknown as {
  __atCapabilityCache?: Map<string, CacheEntry>
}
const cache: Map<string, CacheEntry> = (globalForCapability.__atCapabilityCache ??= new Map())

/** Autotask entity names are case-insensitive in practice; normalize for the key. */
const cacheKey = (entity: string): string => entity.toLowerCase()

export interface CacheStats {
  ttlMinutes: number
  entries: Array<{ entity: string; fetchedAt: string; expiresAt: string; expired: boolean }>
}

/** Cache introspection — used by the drift report and to verify cache behaviour. */
export function capabilityCacheStats(): CacheStats {
  const now = Date.now()
  return {
    ttlMinutes: TTL_MS / 60_000,
    entries: Array.from(cache.entries()).map(([entity, e]) => ({
      entity,
      fetchedAt: e.snapshot.fetchedAt,
      expiresAt: new Date(e.expiresAt).toISOString(),
      expired: e.expiresAt <= now,
    })),
  }
}

/** Clear the cache. Exposed for tests and for a forced re-read after an API change. */
export function clearCapabilityCache(entity?: string): void {
  if (entity) cache.delete(cacheKey(entity))
  else cache.clear()
}

// ---------------------------------------------------------------------------
// Live lookup
// ---------------------------------------------------------------------------

/**
 * Seam for tests: the function that actually performs the live lookup. Tests
 * replace it so classification can be verified against real captured metadata
 * without credentials or network access.
 */
export type CapabilityFetcher = (entity: string) => Promise<Record<string, unknown>>

let fetcher: CapabilityFetcher | null = null

/** Override the live fetcher (tests only). Pass null to restore the real client. */
export function __setCapabilityFetcher(fn: CapabilityFetcher | null): void {
  fetcher = fn
}

let client: AutotaskClient | null = null

async function liveLookup(entity: string): Promise<Record<string, unknown>> {
  if (fetcher) return fetcher(entity)
  if (!client) {
    try {
      client = new AutotaskClient()
    } catch (e) {
      // Missing credentials is a deployment-configuration problem the owner
      // fixes — never a vendor limitation, and never something to retry.
      throwClassified({
        reasonCode: 'PERMISSION_DENIED',
        message:
          'Autotask API credentials are not configured on this deployment, so the connector cannot read live entityInformation.',
        evidence: e instanceof Error ? e.message : String(e),
        remediation:
          'Set AUTOTASK_API_USERNAME, AUTOTASK_API_SECRET, AUTOTASK_API_INTEGRATION_CODE and AUTOTASK_API_BASE_URL in the Vercel environment.',
        surface: 'autotask',
      })
    }
  }
  return client!.getEntityCapabilities(entity)
}

function normalizeSnapshot(entity: string, raw: Record<string, unknown>): EntityCapabilitySnapshot {
  const caps = (raw?.capabilities ?? {}) as Record<string, unknown>
  const asBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : v == null ? null : Boolean(v))
  return {
    entity: typeof raw?.entity === 'string' ? raw.entity : entity,
    capabilities: {
      canQuery: asBool(caps.canQuery),
      canCreate: asBool(caps.canCreate),
      canUpdate: asBool(caps.canUpdate),
      canDelete: asBool(caps.canDelete),
      hasUserDefinedFields: asBool(caps.hasUserDefinedFields),
      supportsWebhookCallouts: asBool(caps.supportsWebhookCallouts),
    },
    fields: Array.isArray(raw?.fields)
      ? (raw.fields as Array<Record<string, unknown>>).map((f) => ({
          name: String(f.name),
          dataType: f.dataType,
          isRequired: f.isRequired === true,
          isReadOnly: f.isReadOnly === true,
          isQueryable: f.isQueryable as boolean | undefined,
          isPickList: f.isPickList,
          picklistValueCount: typeof f.picklistValueCount === 'number' ? f.picklistValueCount : undefined,
          isReference: f.isReference === true,
          referenceEntityType: (f.referenceEntityType as string | null) ?? null,
        }))
      : [],
    fetchedAt: new Date().toISOString(),
  }
}

/** A 404 from entityInformation means the entity has no REST surface at all. */
function isNotFound(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return m.includes('404')
}

/**
 * THE single definition of "Autotask has no such REST entity".
 *
 * Exported because more than one tool can hit this condition, and they must
 * agree. Live verification caught them disagreeing: asking
 * autotask_entity_capabilities about a non-existent entity returned
 * INVALID_INPUT (a bare 404 classified as validation) while
 * autotask_capability_check returned UPSTREAM_UNSUPPORTED for the very same
 * entity. One fact must not have two reason codes depending on which tool was
 * asked — that is the ambiguity this contract exists to remove.
 *
 * The message deliberately covers BOTH readings, because a 404 genuinely cannot
 * distinguish a typo from an absent entity.
 */
export function entityHasNoRestSurfaceFailure(entity: string, err?: unknown): FailureInput {
  return {
    reasonCode: 'UPSTREAM_UNSUPPORTED',
    message: `Autotask has no REST entity named "${entity}" on this instance, so nothing can be read from or written to it through the API.`,
    evidence: `GET /v1.0/${entity}/entityInformation returned 404 on this instance.`,
    remediation:
      'Confirm the entity name is spelled exactly as Autotask names it (a typo 404s identically). If the spelling is right, this data is UI-only — there is no REST surface to build against.',
    surface: 'autotask',
    ...(err ? { vendorError: err instanceof Error ? err.message : String(err) } : {}),
    details: { entity },
  }
}

/**
 * Classify a failure from any raw entityInformation call.
 *
 * Returns the shared no-REST-surface envelope for a 404, or null to let the
 * caller's normal classification handle it.
 */
export function classifyEntityInformationError(entity: string, err: unknown): FailureInput | null {
  if (err instanceof ClassifiedConnectorError) return null
  return isNotFound(err) ? entityHasNoRestSurfaceFailure(entity, err) : null
}

/**
 * Get the capability snapshot for one entity, from cache when fresh.
 *
 * Failure behaviour is the crux of this module:
 *   - live lookup 404s      → UPSTREAM_UNSUPPORTED (evidence: the 404). The
 *                             entity genuinely has no REST surface.
 *   - live lookup fails AND a stale cache entry exists → use it, flag staleness.
 *     A slightly old truth beats refusing to answer.
 *   - live lookup fails and the cache is COLD → TRANSIENT. This is the rule
 *     that stops an outage from minting a false vendor-limitation claim.
 */
export async function getEntityCapabilitySnapshot(
  entity: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<SnapshotResult> {
  if (!/^[A-Za-z]+$/.test(entity)) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: `"${entity}" is not a bare Autotask REST entity name (letters only, e.g. "Services").`,
      remediation: 'Pass the entity name as Autotask spells it, with no path, spaces or punctuation.',
      surface: 'autotask',
      details: { entity },
    })
  }

  const key = cacheKey(entity)
  const cached = cache.get(key)
  if (!opts.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { snapshot: cached.snapshot, cache: 'hit' }
  }

  try {
    const snapshot = normalizeSnapshot(entity, await liveLookup(entity))
    cache.set(key, { snapshot, expiresAt: Date.now() + TTL_MS })
    return { snapshot, cache: 'miss' }
  } catch (err) {
    // A pre-classified error (e.g. missing credentials) already knows its own
    // reason code — never re-classify it as a capability question.
    if (err instanceof ClassifiedConnectorError) throw err

    if (isNotFound(err)) throwClassified(entityHasNoRestSurfaceFailure(entity, err))

    if (cached) {
      return {
        snapshot: cached.snapshot,
        cache: 'stale-fallback',
        staleWarning:
          `Live entityInformation lookup for ${entity} failed; answering from a cached snapshot taken at ${cached.snapshot.fetchedAt}. ` +
          'Treat as a strong prior, not a settled fact.',
      }
    }

    // Cold cache + failed lookup. The one thing we must NOT do here is claim a
    // vendor limitation.
    throwClassified({
      reasonCode: 'TRANSIENT',
      message:
        `Could not read live Autotask entityInformation for ${entity}, and nothing is cached — so the connector cannot say whether this is supported.`,
      evidence: err instanceof Error ? err.message : String(err),
      remediation:
        'Retry. Do NOT report this as an Autotask limitation: a failed capability lookup is not evidence that the API lacks the capability.',
      surface: 'autotask',
      details: { entity, cache: 'cold' },
    })
  }
}

// ---------------------------------------------------------------------------
// Operation verdicts
// ---------------------------------------------------------------------------

const CAP_FIELD: Record<EntityOperation, keyof EntityCapabilities> = {
  query: 'canQuery',
  create: 'canCreate',
  update: 'canUpdate',
  delete: 'canDelete',
}

export interface OperationVerdict {
  entity: string
  operation: EntityOperation
  /** true = API permits it, false = API forbids it, null = metadata did not say. */
  apiPermits: boolean | null
  evidence: string
  fetchedAt: string
  cache: CacheOutcome
  staleWarning?: string
}

/** Ask the live API whether an operation is permitted on an entity. */
export async function checkOperation(entity: string, operation: EntityOperation): Promise<OperationVerdict> {
  const { snapshot, cache: cacheOutcome, staleWarning } = await getEntityCapabilitySnapshot(entity)
  const field = CAP_FIELD[operation]
  const value = snapshot.capabilities[field] as boolean | null
  return {
    entity: snapshot.entity,
    operation,
    apiPermits: value,
    evidence: `entityInformation reports ${snapshot.entity}.${field} ${value === null ? 'absent (metadata did not report it)' : String(value)} (read ${snapshot.fetchedAt}).`,
    fetchedAt: snapshot.fetchedAt,
    cache: cacheOutcome,
    ...(staleWarning ? { staleWarning } : {}),
  }
}

/**
 * Throw UPSTREAM_UNSUPPORTED if the live API forbids this operation.
 *
 * Call this BEFORE attempting a write, so the caller gets an evidence-backed
 * "the vendor cannot" instead of an opaque API rejection. A `null` verdict
 * (metadata silent) deliberately does NOT block: absence of a flag is not a
 * denial, and blocking on it would invent a limitation.
 */
export async function assertOperationPermitted(entity: string, operation: EntityOperation): Promise<OperationVerdict> {
  const verdict = await checkOperation(entity, operation)
  if (verdict.apiPermits === false) {
    throwClassified({
      reasonCode: 'UPSTREAM_UNSUPPORTED',
      message: `The Autotask REST API does not allow ${operation} on ${verdict.entity} for this instance.`,
      evidence: verdict.evidence,
      remediation:
        operation === 'delete'
          ? `Deleting a ${verdict.entity} record is not possible through the API. If deactivation exists on this entity (isActive false), use that instead — and tell the user delete is unavailable rather than implying it failed.`
          : `There is no API path for this. Do not look for a workaround in the connector; the change has to be made in the Autotask UI.`,
      surface: 'autotask',
      details: { entity: verdict.entity, operation, rawMetadata: verdict.evidence },
    })
  }
  return verdict
}

// ---------------------------------------------------------------------------
// Field verdicts
// ---------------------------------------------------------------------------

export interface FieldVerdict {
  entity: string
  field: string
  exists: boolean
  /** Live isReadOnly flag. null when the field does not exist. */
  isReadOnly: boolean | null
  isRequired: boolean | null
  /** API-writable = the field exists and isReadOnly is false. */
  apiWritable: boolean
  dataType?: unknown
  isPickList?: unknown
  picklistValueCount?: number
  referenceEntityType?: string | null
  evidence: string
  /**
   * Set when the metadata is self-contradictory — isRequired AND isReadOnly
   * both true. Autotask does this for fields that are settable on CREATE but
   * immutable on UPDATE (and for computed fields that are never settable).
   * Surfaced rather than silently resolved, because guessing either way
   * produces a confidently wrong answer.
   */
  contradictoryFlags?: string
  fetchedAt: string
  cache: CacheOutcome
  staleWarning?: string
}

/** Ask the live API about one field's writability. */
export async function checkField(entity: string, field: string): Promise<FieldVerdict> {
  const { snapshot, cache: cacheOutcome, staleWarning } = await getEntityCapabilitySnapshot(entity)
  const meta = snapshot.fields.find((f) => f.name.toLowerCase() === field.toLowerCase())

  if (!meta) {
    return {
      entity: snapshot.entity,
      field,
      exists: false,
      isReadOnly: null,
      isRequired: null,
      apiWritable: false,
      evidence:
        `entityInformation for ${snapshot.entity} lists no field named "${field}" (read ${snapshot.fetchedAt}). ` +
        `Fields present: ${snapshot.fields.map((f) => f.name).join(', ')}.`,
      fetchedAt: snapshot.fetchedAt,
      cache: cacheOutcome,
      ...(staleWarning ? { staleWarning } : {}),
    }
  }

  const contradictory =
    meta.isRequired && meta.isReadOnly
      ? `${snapshot.entity}.${meta.name} is flagged BOTH isRequired true AND isReadOnly true. Autotask uses this combination for fields that are set at CREATE time and immutable afterwards, and also for computed fields that are never settable — the flags alone cannot tell you which. Treat as not-updatable; whether it is settable on create must be established empirically.`
      : undefined

  return {
    entity: snapshot.entity,
    field: meta.name,
    exists: true,
    isReadOnly: meta.isReadOnly,
    isRequired: meta.isRequired,
    apiWritable: !meta.isReadOnly,
    dataType: meta.dataType,
    isPickList: meta.isPickList,
    picklistValueCount: meta.picklistValueCount,
    referenceEntityType: meta.referenceEntityType,
    evidence: `entityInformation reports ${snapshot.entity}.${meta.name} isReadOnly ${meta.isReadOnly}, isRequired ${meta.isRequired}, dataType ${String(meta.dataType)} (read ${snapshot.fetchedAt}).`,
    ...(contradictory ? { contradictoryFlags: contradictory } : {}),
    fetchedAt: snapshot.fetchedAt,
    cache: cacheOutcome,
    ...(staleWarning ? { staleWarning } : {}),
  }
}

/**
 * Build the failure envelope for "the caller asked to write a field that the
 * live API says is read-only".
 *
 * This is INVALID_INPUT, not UPSTREAM_UNSUPPORTED: the entity is writable and
 * the connector implements writing it — the caller just named a field that
 * cannot be written. The distinction matters because the owner's action differs
 * (fix the call vs. accept a vendor limit).
 */
export function readOnlyFieldFailure(verdict: FieldVerdict, area?: string): ConnectorFailure {
  return connectorFailure({
    reasonCode: 'INVALID_INPUT',
    message: `${verdict.entity}.${verdict.field} cannot be written — the Autotask API reports it read-only${area ? `, so it is not offered in the ${area} write area` : ''}.`,
    evidence: verdict.evidence,
    remediation:
      `Drop ${verdict.field} from the request. If Autotask computes it (as it does for markup rates), it will update itself when the fields it derives from change.`,
    surface: 'autotask',
    details: { entity: verdict.entity, field: verdict.field, isReadOnly: verdict.isReadOnly },
  })
}
