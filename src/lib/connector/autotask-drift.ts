// src/lib/connector/autotask-drift.ts
//
// CONNECTOR-vs-API drift report for Autotask.
//
// WHY: "the MCP isn't built out" kept arriving as a surprise mid-task. This
// turns it into a tracked backlog — it diffs what the connector actually
// exposes against what live entityInformation says the API now permits, and
// lists every entity, operation and field the API supports that we don't.
//
// Both sides are DERIVED, never hand-written:
//   - our side  = CONFIG_WRITE_AREAS + the config-query allowlist (the same
//                 constants the tools are built from, so this cannot drift from
//                 the real surface the way a written list would)
//   - their side = live entityInformation, per entity, through the cached
//                 capability layer
//
// A gap here is a build task, not a bug. The report is deliberately quiet about
// things it cannot know (e.g. whether a read tool "covers" an entity well) and
// loud about the two things it can prove: an operation the API permits that no
// area offers, and a writable field no allowlist includes.

import {
  CONFIG_WRITE_AREAS,
  fieldSupplyRoutes,
  routeExemptFromReadOnly,
  settableFields,
  type ConfigWriteOperation,
} from './staged-writes-core'
import { CONFIG_QUERY_ENTITIES } from '@/lib/mcp-config-read-tools'
import {
  getEntityCapabilitySnapshot,
  type EntityCapabilitySnapshot,
  type EntityOperation,
} from './autotask-capability'

const WRITE_OPS: ConfigWriteOperation[] = ['create', 'update', 'delete']

/**
 * Fields never worth reporting as a gap: Autotask system columns that no
 * caller should be setting even where the metadata leaves them writable.
 * Keeping this list tiny and explicit is the point — anything else that shows
 * up genuinely is a decision for a human.
 */
const UNINTERESTING_FIELDS = new Set(['id'])

export interface EntityDrift {
  entity: string
  /** Write areas in the connector that target this entity. */
  areas: string[]
  apiPermits: { query: boolean | null; create: boolean | null; update: boolean | null; delete: boolean | null }
  /** Operations the API permits that NO connector area offers. */
  missingOperations: ConfigWriteOperation[]
  /** Fields the API reports writable that no area for this entity allowlists. */
  missingWritableFields: string[]
  /** Fields an area allowlists that the API reports read-only or unknown — a latent bug. */
  suspectAllowlistedFields: Array<{ field: string; area: string; problem: 'read-only upstream' | 'unknown to the API' }>
  readable: boolean
  /** True when the connector can read this entity generically. */
  inQueryAllowlist: boolean
  fetchedAt: string
  note?: string
}

export interface DriftReportEntry {
  entity: string
  error: string
}

export interface AutotaskDriftReport {
  generatedAt: string
  generatedFrom: string
  scope: { entitiesChecked: number; source: string }
  summary: {
    entitiesWithGaps: number
    totalMissingOperations: number
    totalMissingWritableFields: number
    suspectAllowlistedFields: number
    lookupFailures: number
  }
  /** Entities where the API allows something the connector does not expose. */
  gaps: EntityDrift[]
  /** Entities checked with no gap found — listed by name only, to stay readable. */
  aligned: string[]
  /**
   * Entities whose live lookup failed. Reported explicitly and NEVER folded
   * into "aligned": an unchecked entity must not read as a verified one.
   */
  unchecked: DriftReportEntry[]
  interpretation: string
}

/** Every Autotask entity the connector touches, derived from its own constants. */
export function connectorAutotaskEntities(): string[] {
  const fromAreas = Object.values(CONFIG_WRITE_AREAS)
    .filter((s) => s.targetSystem === 'autotask')
    .map((s) => s.entity)
  return Array.from(new Set([...fromAreas, ...CONFIG_QUERY_ENTITIES])).sort()
}

function analyseEntity(entity: string, snapshot: EntityCapabilitySnapshot): EntityDrift {
  const areas = Object.values(CONFIG_WRITE_AREAS).filter(
    (s) => s.targetSystem === 'autotask' && s.entity.toLowerCase() === entity.toLowerCase(),
  )
  const offered = new Set<ConfigWriteOperation>(areas.flatMap((a) => a.operations))
  // Includes parent-id fields, which are settable via `parentId` rather than
  // `changes`. Reading allowedFields directly here reported four such fields as
  // gaps the connector had supported all along.
  const allowlisted = settableFields(areas)

  const caps = snapshot.capabilities
  const permits: Record<ConfigWriteOperation, boolean | null> = {
    create: caps.canCreate,
    update: caps.canUpdate,
    delete: caps.canDelete,
  }
  const missingOperations = WRITE_OPS.filter((op) => permits[op] === true && !offered.has(op))

  // Only worth reporting writable-field gaps where we can actually write at
  // all; listing 20 fields on a read-only entity is noise.
  //
  // Compared case-INSENSITIVELY, matching the suspect check below and
  // fieldSupplyRoutes(). The two halves of this report disagreed on case, so an
  // allowlist entry spelled differently from the API (ticket_category allows
  // 'displayColorRGB'; Autotask reports 'displayColorRgb') was reported as a
  // missing writable field by one half while the other stayed silent about it.
  const canWriteSomething = caps.canCreate === true || caps.canUpdate === true
  const settableLower = new Set([...allowlisted.keys()].map((k) => k.toLowerCase()))
  const missingWritableFields = canWriteSomething
    ? snapshot.fields
        .filter(
          (f) =>
            !f.isReadOnly && !UNINTERESTING_FIELDS.has(f.name) && !settableLower.has(f.name.toLowerCase()),
        )
        .map((f) => f.name)
    : []

  // The inverse check, which is what caught the markupRate bug: a field we
  // claim to accept that the API will not take.
  const suspectAllowlistedFields: EntityDrift['suspectAllowlistedFields'] = []
  for (const [field, { area, route }] of allowlisted) {
    const meta = snapshot.fields.find((f) => f.name.toLowerCase() === field.toLowerCase())
    // A field the API has never heard of is a latent bug whatever the route:
    // sending it, or building a child path from it, fails just the same. This
    // check used to sit behind an early `continue` for createOnlyFields, which
    // meant a typo in a createOnlyFields entry could never be caught by this
    // report — and it still has to cover parent-id fields, where a typo breaks
    // every create in the area.
    if (!meta) {
      suspectAllowlistedFields.push({ field, area, problem: 'unknown to the API' })
      continue
    }
    // The read-only check, by contrast, is genuinely inapplicable to create-only
    // and parent-id fields — being read-only upstream is the whole reason they
    // are segregated, so flagging them here would report the design as a defect.
    if (meta.isReadOnly && !routeExemptFromReadOnly(route)) {
      suspectAllowlistedFields.push({ field, area, problem: 'read-only upstream' })
    }
  }

  return {
    entity: snapshot.entity,
    areas: areas.map((a) => a.area),
    apiPermits: { query: caps.canQuery, create: caps.canCreate, update: caps.canUpdate, delete: caps.canDelete },
    missingOperations,
    missingWritableFields,
    suspectAllowlistedFields,
    readable: caps.canQuery === true,
    inQueryAllowlist: (CONFIG_QUERY_ENTITIES as readonly string[]).includes(entity),
    fetchedAt: snapshot.fetchedAt,
    ...(() => {
      const notes: string[] = []
      if (areas.length === 0 && canWriteSomething) {
        notes.push(`No connector write area targets ${snapshot.entity} at all, though the API permits ${WRITE_OPS.filter((o) => permits[o] === true).join('/')}.`)
      }
      // Informational only, deliberately NOT counted as a gap: a dedicated read
      // tool may already cover this entity (autotask_list_services covers
      // Services, for instance) and the report cannot see that mapping, so
      // flagging it would produce confident false positives.
      if (caps.canQuery === true && !(CONFIG_QUERY_ENTITIES as readonly string[]).includes(entity)) {
        notes.push(`The API allows querying ${snapshot.entity} but it is absent from the generic config-query allowlist. Check whether a dedicated read tool covers it before treating this as a gap.`)
      }
      return notes.length ? { note: notes.join(' ') } : {}
    })(),
  }
}

const hasGap = (d: EntityDrift): boolean =>
  d.missingOperations.length > 0 || d.missingWritableFields.length > 0 || d.suspectAllowlistedFields.length > 0

/** Run N promises at a time so a 45-entity sweep doesn't open 45 sockets. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

// ---------------------------------------------------------------------------
// Pre-flight capability check (autotask_capability_check)
// ---------------------------------------------------------------------------
//
// The point of this is to be asked BEFORE an attempt. Hitting the wall and
// reading the reason code works, but it costs a failed call and a round trip;
// asking first lets the caller tell the owner "Autotask can't do that" or "the
// connector doesn't do that yet" without ever trying.

export type CapabilityVerdict =
  | 'SUPPORTED_AND_IMPLEMENTED'
  | 'SUPPORTED_NOT_IMPLEMENTED'
  | 'UPSTREAM_UNSUPPORTED'
  | 'POLICY_GATED'
  | 'UNKNOWN'

export interface CapabilityCheckResult {
  entity: string
  operation?: EntityOperation
  field?: string
  verdict: CapabilityVerdict
  /** The reason code an actual attempt would return right now. */
  reasonCodeIfAttempted: string | null
  fixableBy: string | null
  api: { permits: boolean | null; evidence: string; fetchedAt: string; cache: string; staleWarning?: string }
  connector: {
    implemented: boolean
    areas: string[]
    requiresStagedApproval: boolean
    killSwitch?: { name: string; enabled: boolean }
  }
  message: string
  remediation: string
}

/**
 * Answer "can this instance do X, and does the connector expose it?" without
 * attempting anything.
 *
 * Pass an operation, a field, or both. Verdicts map 1:1 onto the failure
 * taxonomy so a caller can reason about a pre-flight answer and a real failure
 * with the same vocabulary.
 */
export async function checkAutotaskCapability(input: {
  entity: string
  operation?: EntityOperation
  field?: string
}): Promise<CapabilityCheckResult> {
  const { entity, operation, field } = input
  const { snapshot, cache, staleWarning } = await getEntityCapabilitySnapshot(entity)

  const areas = Object.values(CONFIG_WRITE_AREAS).filter(
    (s) => s.targetSystem === 'autotask' && s.entity.toLowerCase() === entity.toLowerCase(),
  )
  const writesEnabled = process.env.CONNECTOR_CONFIG_WRITES_ENABLED === 'true'
  const killSwitch = { name: 'CONNECTOR_CONFIG_WRITES_ENABLED', enabled: writesEnabled }

  // ---- Field question -----------------------------------------------------
  if (field) {
    const meta = snapshot.fields.find((f) => f.name.toLowerCase() === field.toLowerCase())
    const named = meta?.name ?? field
    const routesByArea = areas.map((a) => ({ area: a, routes: fieldSupplyRoutes(a, named) }))
    // Settable by ANY route, including `parentId`. Deciding this from
    // allowedFields alone answered "no connector area exposes it" for four
    // fields the connector has always supplied.
    const settableIn = routesByArea.filter((r) => r.routes.length > 0).map((r) => r.area)
    const allowlistedIn = routesByArea
      .filter((r) => r.routes.some((x) => x === 'changes' || x === 'create_only'))
      .map((r) => r.area)
    const parentIdIn = routesByArea.filter((r) => r.routes.includes('parent_id')).map((r) => r.area)
    const base = {
      entity: snapshot.entity,
      field: meta?.name ?? field,
      ...(operation ? { operation } : {}),
      api: {
        permits: meta ? !meta.isReadOnly : null,
        evidence: meta
          ? `entityInformation reports ${snapshot.entity}.${meta.name} isReadOnly ${meta.isReadOnly}, isRequired ${meta.isRequired} (read ${snapshot.fetchedAt}).`
          : `entityInformation for ${snapshot.entity} lists no field named "${field}" (read ${snapshot.fetchedAt}).`,
        fetchedAt: snapshot.fetchedAt,
        cache,
        ...(staleWarning ? { staleWarning } : {}),
      },
      connector: {
        implemented: settableIn.length > 0,
        areas: settableIn.map((a) => a.area),
        requiresStagedApproval: settableIn.length > 0,
        killSwitch,
      },
    }

    if (!meta) {
      return {
        ...base,
        verdict: 'UNKNOWN',
        reasonCodeIfAttempted: 'INVALID_INPUT',
        fixableBy: 'caller',
        message: `${snapshot.entity} has no field named "${field}" on this instance.`,
        remediation: `Check the spelling against autotask_entity_capabilities for ${snapshot.entity}.`,
      }
    }
    if (meta.isReadOnly) {
      // isReadOnly does NOT imply "unwritable by anyone". Autotask also sets it
      // on fields that are settable at CREATE and immutable afterwards, and the
      // connector already segregates those in each area's createOnlyFields. So
      // consult that BEFORE declaring a vendor limitation.
      //
      // Getting this wrong was not academic: Services.periodType is create-only
      // AND required on create, and this branch used to answer "read-only, so it
      // cannot be written by anyone / do not offer to change this field". A
      // caller who believed it would omit periodType and every Service create
      // would fail. Settled empirically on 2026-07-28 — service ids 131-136 were
      // created through this connector with periodType 2 and read back as
      // Monthly, while the one create that omitted it died on Autotask's own
      // "Missing Required Field: periodType". Reporting a working write as an
      // upstream limitation is the exact failure this whole layer exists to end.
      // The same reasoning applies, unchanged, to a field supplied as the area's
      // parentId: ServiceBundleServices.serviceBundleID is isReadOnly true here
      // AND required for every bundle-membership create AND written by the
      // connector on every one. This branch answered "cannot be written by
      // anyone / do not offer to change this field" for it — the periodType bug
      // a second time, on a field a caller cannot legally omit. Consult both
      // segregated routes before concluding anything about the vendor.
      const parentOnlyIn = parentIdIn.filter((a) => !(a.createOnlyFields ?? []).includes(meta.name))
      if (parentOnlyIn.length && !allowlistedIn.length) {
        const immutable = operation === 'update' || operation === 'delete'
        const viaAreas = parentOnlyIn.map((a) => a.area).join(' / ')
        return {
          ...base,
          api: {
            ...base.api,
            permits: operation === 'create' ? true : immutable ? false : null,
            evidence:
              `entityInformation reports ${snapshot.entity}.${meta.name} isReadOnly ${meta.isReadOnly}, ` +
              `isRequired ${meta.isRequired} (read ${snapshot.fetchedAt}) — which for this field means set when ` +
              `the record is created and immutable afterwards, not unwritable. The connector supplies it as the ` +
              `${viaAreas} area's parentId, which executeStagedWrite writes into the create payload.`,
          },
          verdict: immutable ? 'UPSTREAM_UNSUPPORTED' : 'POLICY_GATED',
          reasonCodeIfAttempted: immutable ? 'INVALID_INPUT' : 'POLICY_BLOCKED',
          fixableBy: immutable ? 'caller' : 'tct_human',
          message: immutable
            ? `${snapshot.entity}.${meta.name} identifies which parent the record belongs to and is fixed once created. It is not unwritable — a create sets it.`
            : `${snapshot.entity}.${meta.name} IS set when creating a ${snapshot.entity}, via the ${viaAreas} area, and is fixed once set.${
                meta.isRequired ? ` Autotask reports it REQUIRED, so a create cannot omit it.` : ''
              }`,
          remediation: immutable
            ? `Drop ${meta.name} from the update — moving the record to a different parent is not exposed. Create the record under the parent you want and remove the old one.`
            : `Pass it as parentId when staging a create in ${viaAreas} — NOT inside changes, which will refuse it as not allowlisted. It still needs staged human approval. Do not report it as an Autotask limitation.`,
        }
      }

      const createOnlyIn = areas.filter((a) => (a.createOnlyFields ?? []).includes(meta.name))
      if (createOnlyIn.length) {
        const immutable = operation === 'update' || operation === 'delete'
        const split =
          `entityInformation reports ${snapshot.entity}.${meta.name} isReadOnly ${meta.isReadOnly}, ` +
          `isRequired ${meta.isRequired} (read ${snapshot.fetchedAt}) — which for this field means ` +
          `settable on CREATE and immutable on UPDATE, not unwritable.`
        return {
          ...base,
          api: {
            ...base.api,
            // Flat false would be a lie on create, flat true a lie on update.
            permits: operation === 'create' ? true : immutable ? false : null,
            evidence: split,
          },
          verdict: immutable ? 'UPSTREAM_UNSUPPORTED' : 'POLICY_GATED',
          reasonCodeIfAttempted: immutable ? 'INVALID_INPUT' : 'POLICY_BLOCKED',
          fixableBy: immutable ? 'caller' : 'tct_human',
          message: immutable
            ? `${snapshot.entity}.${meta.name} is set when the record is created and cannot be changed afterwards. It is not unwritable — a create can set it.`
            : `${snapshot.entity}.${meta.name} IS settable when creating a ${snapshot.entity}, via the ${createOnlyIn
                .map((a) => a.area)
                .join(' / ')} area, and is immutable once set.${
                meta.isRequired ? ` Autotask also reports it REQUIRED on create, so a create that omits it is rejected.` : ''
              }`,
          remediation: immutable
            ? `Drop ${meta.name} from the update. To change it, create a replacement ${snapshot.entity} with the value you want and deactivate the old one.`
            : `Include ${meta.name} in the changes when staging a create in ${createOnlyIn
                .map((a) => a.area)
                .join(' / ')}. It still needs staged human approval like any config write. Do not report it as an Autotask limitation.`,
        }
      }

      const contradiction = meta.isRequired
        ? ` NOTE: it is flagged isRequired AND isReadOnly at once, which Autotask uses both for create-time-only fields and for computed fields — the flags alone cannot tell you which, so treat it as not updatable.`
        : ''
      return {
        ...base,
        verdict: 'UPSTREAM_UNSUPPORTED',
        reasonCodeIfAttempted: 'INVALID_INPUT',
        fixableBy: 'caller',
        message: `${snapshot.entity}.${meta.name} is read-only in the Autotask API, so it cannot be written by anyone.${contradiction}`,
        remediation: `Do not offer to change this field. Attempting it returns INVALID_INPUT with this metadata as evidence.${meta.name === 'markupRate' ? ' markupRate is computed from unitPrice and unitCost — change those instead.' : ''}`,
      }
    }
    if (!settableIn.length) {
      return {
        ...base,
        verdict: 'SUPPORTED_NOT_IMPLEMENTED',
        reasonCodeIfAttempted: 'NOT_IMPLEMENTED',
        fixableBy: 'claude_code',
        message: `The API allows writing ${snapshot.entity}.${meta.name}, but no connector write area exposes it yet.`,
        remediation: `Add '${meta.name}' to the allowedFields of an area targeting ${snapshot.entity} in src/lib/connector/staged-writes-core.ts. Report it to Kurtis as a build task, not as an Autotask limitation.`,
      }
    }
    // Writable upstream and supplied only as a parentId — Holidays.holidaySetID
    // and UserDefinedFieldListItems.udfFieldId. Falling through to the generic
    // POLICY_GATED answer below would tell the caller to put it in `changes`,
    // where validateStagedChange refuses it as not allowlisted.
    if (parentIdIn.length && !allowlistedIn.length) {
      const immutable = operation === 'update' || operation === 'delete'
      const viaAreas = parentIdIn.map((a) => a.area).join(' / ')
      return {
        ...base,
        verdict: immutable ? 'SUPPORTED_NOT_IMPLEMENTED' : 'POLICY_GATED',
        reasonCodeIfAttempted: immutable ? 'NOT_IMPLEMENTED' : 'POLICY_BLOCKED',
        fixableBy: immutable ? 'claude_code' : 'tct_human',
        message: immutable
          ? `${snapshot.entity}.${meta.name} is writable in the API, but the ${viaAreas} area resolves it from the record to address the row, so moving an existing ${snapshot.entity} to a different parent is not exposed.`
          : `${snapshot.entity}.${meta.name} is set when creating a ${snapshot.entity}, supplied as the ${viaAreas} area's parentId rather than in changes.`,
        remediation: immutable
          ? `Re-parenting would need a new area (or an allowedFields entry) for ${snapshot.entity} in src/lib/connector/staged-writes-core.ts. Report it as a build task. Creating the record under the intended parent works today.`
          : `Pass it as parentId when staging a create in ${viaAreas} — NOT inside changes, which will refuse it as not allowlisted. Staged human approval still applies.`,
      }
    }
    return {
      ...base,
      verdict: writesEnabled ? 'POLICY_GATED' : 'POLICY_GATED',
      reasonCodeIfAttempted: 'POLICY_BLOCKED',
      fixableBy: 'tct_human',
      message: `${snapshot.entity}.${meta.name} is writable and implemented (area${allowlistedIn.length > 1 ? 's' : ''}: ${allowlistedIn.map((a) => a.area).join(', ')}), behind the staged-approval gate.${writesEnabled ? '' : ' The write kill switch is currently OFF.'}`,
      remediation: writesEnabled
        ? 'Stage the change with autotask_stage_config_write, then a human approves it at /admin/connector/staged-writes before autotask_execute_staged_write applies it.'
        : 'Ask Kurtis to set CONNECTOR_CONFIG_WRITES_ENABLED=true, then use the stage → approve → execute flow.',
    }
  }

  // ---- Operation question -------------------------------------------------
  const op: EntityOperation = operation ?? 'query'
  const permitsMap: Record<EntityOperation, boolean | null> = {
    query: snapshot.capabilities.canQuery,
    create: snapshot.capabilities.canCreate,
    update: snapshot.capabilities.canUpdate,
    delete: snapshot.capabilities.canDelete,
  }
  const permits = permitsMap[op]
  const capField = op === 'query' ? 'canQuery' : op === 'create' ? 'canCreate' : op === 'update' ? 'canUpdate' : 'canDelete'
  const offeringAreas = areas.filter((a) => op !== 'query' && a.operations.includes(op as ConfigWriteOperation))
  const readable = (CONFIG_QUERY_ENTITIES as readonly string[]).includes(snapshot.entity)
  const implemented = op === 'query' ? readable : offeringAreas.length > 0

  const base = {
    entity: snapshot.entity,
    operation: op,
    api: {
      permits,
      evidence: `entityInformation reports ${snapshot.entity}.${capField} ${permits === null ? 'absent' : String(permits)} (read ${snapshot.fetchedAt}).`,
      fetchedAt: snapshot.fetchedAt,
      cache,
      ...(staleWarning ? { staleWarning } : {}),
    },
    connector: {
      implemented,
      areas: offeringAreas.map((a) => a.area),
      requiresStagedApproval: op !== 'query' && offeringAreas.length > 0,
      killSwitch,
    },
  }

  if (permits === false) {
    const deactivatable = areas.some((a) => a.allowedFields.includes('isActive'))
    return {
      ...base,
      verdict: 'UPSTREAM_UNSUPPORTED',
      reasonCodeIfAttempted: 'UPSTREAM_UNSUPPORTED',
      fixableBy: 'vendor',
      message: `The Autotask REST API does not permit ${op} on ${snapshot.entity} for this instance.`,
      remediation:
        op === 'delete' && deactivatable
          ? `Delete is unavailable through the API. Deactivate instead (isActive:false) via the staged-write flow, and tell the user delete is not possible rather than implying it failed.`
          : `No API path exists. This has to be done in the Autotask UI — do not promise it, and do not look for a connector workaround.`,
    }
  }
  if (permits === null) {
    return {
      ...base,
      verdict: 'UNKNOWN',
      reasonCodeIfAttempted: null,
      fixableBy: null,
      message: `Live metadata did not report ${capField} for ${snapshot.entity}, so whether ${op} is permitted is genuinely unknown.`,
      remediation: 'Say UNKNOWN rather than unsupported. Re-check with autotask_entity_capabilities, or try the operation and read the reason code.',
    }
  }
  if (!implemented) {
    return {
      ...base,
      verdict: 'SUPPORTED_NOT_IMPLEMENTED',
      reasonCodeIfAttempted: 'NOT_IMPLEMENTED',
      fixableBy: 'claude_code',
      message: `The API permits ${op} on ${snapshot.entity}, but the connector does not expose it yet.`,
      remediation:
        op === 'query'
          ? `Add '${snapshot.entity}' to CONFIG_QUERY_ENTITIES in src/lib/mcp-config-read-tools.ts, or use a dedicated read tool if one exists for it.`
          : `Add a write area for ${snapshot.entity} with '${op}' in its operations, in src/lib/connector/staged-writes-core.ts. Report it to Kurtis as a build task.`,
    }
  }
  if (op === 'query') {
    return {
      ...base,
      verdict: 'SUPPORTED_AND_IMPLEMENTED',
      reasonCodeIfAttempted: null,
      fixableBy: null,
      message: `${snapshot.entity} is queryable and the connector can read it (autotask_config_query, plus any dedicated read tool).`,
      remediation: 'No action needed — go ahead and read it.',
    }
  }
  return {
    ...base,
    verdict: 'POLICY_GATED',
    reasonCodeIfAttempted: 'POLICY_BLOCKED',
    fixableBy: 'tct_human',
    message: `${op} on ${snapshot.entity} is supported and implemented (area${offeringAreas.length > 1 ? 's' : ''}: ${offeringAreas.map((a) => a.area).join(', ')}), behind the staged-approval gate.${writesEnabled ? '' : ' The write kill switch is currently OFF.'}`,
    remediation: writesEnabled
      ? 'Stage it with autotask_stage_config_write; a human approves at /admin/connector/staged-writes, then autotask_execute_staged_write applies it. Being told to get approval is the gate working.'
      : 'Ask Kurtis to set CONNECTOR_CONFIG_WRITES_ENABLED=true first, then stage → approve → execute.',
  }
}

export interface DriftOptions {
  /** Limit the sweep to these entities (default: every entity the connector touches). */
  entities?: string[]
  /** Include entities with no gap in `aligned` (default true). */
  includeAligned?: boolean
  /** Re-read live metadata instead of using the cache (default false). */
  forceRefresh?: boolean
}

export async function buildAutotaskDriftReport(opts: DriftOptions = {}): Promise<AutotaskDriftReport> {
  const entities = opts.entities?.length ? opts.entities : connectorAutotaskEntities()

  const results = await mapLimit(entities, 4, async (entity) => {
    try {
      const { snapshot } = await getEntityCapabilitySnapshot(entity, { forceRefresh: opts.forceRefresh })
      return { entity, drift: analyseEntity(entity, snapshot) }
    } catch (err) {
      return { entity, error: err instanceof Error ? err.message : String(err) }
    }
  })

  const drifts = results.filter((r): r is { entity: string; drift: EntityDrift } => 'drift' in r).map((r) => r.drift)
  const unchecked = results
    .filter((r): r is { entity: string; error: string } => 'error' in r)
    .map((r) => ({ entity: r.entity, error: r.error }))

  const gaps = drifts.filter(hasGap)
  const aligned = drifts.filter((d) => !hasGap(d)).map((d) => d.entity)

  return {
    generatedAt: new Date().toISOString(),
    generatedFrom:
      'The connector\'s own CONFIG_WRITE_AREAS + config-query allowlist, diffed against LIVE Autotask entityInformation. Both sides derived — neither is a hand-maintained list.',
    scope: {
      entitiesChecked: drifts.length,
      source: opts.entities?.length ? 'caller-supplied entity list' : 'every Autotask entity the connector touches',
    },
    summary: {
      entitiesWithGaps: gaps.length,
      totalMissingOperations: gaps.reduce((n, d) => n + d.missingOperations.length, 0),
      totalMissingWritableFields: gaps.reduce((n, d) => n + d.missingWritableFields.length, 0),
      suspectAllowlistedFields: gaps.reduce((n, d) => n + d.suspectAllowlistedFields.length, 0),
      lookupFailures: unchecked.length,
    },
    gaps,
    ...(opts.includeAligned === false ? { aligned: [] } : { aligned }),
    unchecked,
    interpretation:
      'missingOperations / missingWritableFields = the Autotask API permits it and the connector does not expose it — a NOT_IMPLEMENTED gap and a candidate build task. ' +
      'suspectAllowlistedFields = the connector claims to accept a field the API reports read-only or does not have; each is a latent bug that would fail or silently no-op at execute time (this is the check that caught Services.markupRate). ' +
      'unchecked = the live lookup failed, so nothing is known about that entity — never read it as "no gaps".',
  }
}
