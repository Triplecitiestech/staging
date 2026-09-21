// src/lib/mcp-autotask-entity-tools.ts
//
// THE GENERIC AUTOTASK SURFACE: query, create, update and delete for EVERY
// entity in the live catalogue, with no per-entity tool to write and therefore
// no per-entity gap to discover the hard way.
//
// WHY THIS REPLACES HAND-PICKING
// ------------------------------
// The 79 hand-built Autotask tools covered 44 of roughly 180 entities, and
// every one of those 44 was added AFTER a missing capability blocked live work.
// On 2026-09-21 a $45 shipping charge could not be put on a ticket, because
// TicketCharges had no tool — while entityInformation had been reporting
// TicketCharges.canCreate true the entire time. Note editing, attachment
// delete, ticket re-parent and picklist lookups were each built the same way in
// the same week.
//
// Adding a 5th, 6th and 7th tool for those gaps would have produced an 80th,
// 81st and 82nd tool and the identical situation next month. These five tools
// are parameterised by ENTITY, so the covered set is the catalogue, and the
// coverage check (src/lib/connector/autotask-coverage.ts) fails the build if
// the catalogue ever grows past them.
//
// WHAT IS *NOT* GENERIC, DELIBERATELY
// -----------------------------------
// The ergonomic tools stay. autotask_create_task knows that Autotask enforces a
// four-field assignment group and that the role must be one the resource
// actually holds; autotask_update_ticket knows a company change has to move
// companyLocationID and clear a stale contactID in the same PATCH. None of that
// is in the metadata, so none of it can be derived. The generic tools are the
// floor — nothing is unreachable — and the ergonomic ones are the domain
// knowledge on top. A caller that knows an ergonomic tool exists should use it.
//
// EVERY GUARANTEE OF THE EXISTING WRITE PATH IS PRESERVED
// ------------------------------------------------------
//   - the vendor's LIVE metadata decides what is permitted, never this file;
//   - a write is read-back verified per field, and an accepted HTTP status is
//     never reported as success;
//   - read-back projections come from that entity's own live field list;
//   - instance CONFIGURATION still goes through the staged approval gate, and
//     an entity nobody has classified defaults TO the gate, not past it;
//   - failures carry the {reasonCode, message, evidence, remediation, fixableBy}
//     envelope, with no new reason codes.

import { z } from 'zod'
import { AutotaskClient } from '@/lib/autotask'
import { writeAtFirstWorkingPath } from '@/lib/autotask-write'
import { resolveResourceId, resolveUserEmail } from '@/lib/mcp-write-tools'
import { splitByQueryability, verifyWrittenFields } from '@/lib/mcp-project-tools'
import { stageConfigWrite } from '@/lib/connector/staged-writes'
import { GENERATED_AREA_PREFIX } from '@/lib/connector/staged-writes-core'
import {
  assertOperationPermitted,
  getEntityCapabilitySnapshot,
  readOnlyFieldFailure,
  type FieldMetadata,
} from '@/lib/connector/autotask-capability'
import {
  catalogueEntity,
  catalogueEntityNames,
  parentRoutes,
  permittedOperations,
  writePathCandidates,
  type EntityOperation,
} from '@/lib/connector/autotask-catalogue'
import { findExemption } from '@/lib/connector/autotask-exemptions'
import { writePolicyFor } from '@/lib/connector/autotask-write-policy'
import {
  FAILURE_ENVELOPE_TOOL_NOTE,
  failureResult,
  throwClassified,
  toolFailure,
} from '@/lib/connector/failure-envelope'

let _client: AutotaskClient | null = null
function autotask(): AutotaskClient {
  if (!_client) _client = new AutotaskClient()
  return _client
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}
function fail(err: unknown, tool: string, details?: Record<string, unknown>) {
  return toolFailure(err, { surface: 'autotask', tool, ...(details ? { details } : {}) })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpExtra = any

const emailOf = (extra: McpExtra): string | undefined => extra?.authInfo?.extra?.email as string | undefined

/** The signed-in technician's Autotask resource id, for write attribution. */
async function impersonationId(extra: McpExtra): Promise<number> {
  const email = await resolveUserEmail(extra?.authInfo?.extra?.sub as string | undefined, emailOf(extra))
  return resolveResourceId(email)
}

// ---------------------------------------------------------------------------
// Shared pre-flight
// ---------------------------------------------------------------------------

/**
 * Resolve an entity name, refusing anything the catalogue does not know.
 *
 * The catalogue is a build-time census, so a name it lacks might still be real —
 * Kaseya ships entities between regenerations. So this does NOT claim the entity
 * does not exist: it says the connector's catalogue is behind and names the
 * regeneration step. Claiming "no such entity" from a committed file is exactly
 * the stale-vendor-claim failure the capability layer exists to prevent, and
 * `assertOperationPermitted` below settles the question live either way.
 */
function resolveEntity(entity: string): string {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(entity)) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: `"${entity}" is not a bare Autotask REST entity name (letters only, e.g. "TicketCharges").`,
      remediation: 'Pass the entity exactly as Autotask names it, with no path, spaces or punctuation.',
      surface: 'autotask',
      details: { entity },
    })
  }
  const known = catalogueEntity(entity)
  if (!known) {
    throwClassified({
      reasonCode: 'NOT_IMPLEMENTED',
      message:
        `"${entity}" is not in the connector's generated Autotask catalogue. That does NOT mean Autotask has no such entity — ` +
        'it means this build\'s catalogue snapshot predates it, or the name is spelled differently.',
      evidence: `Catalogue holds ${catalogueEntityNames().length} entities and none matches "${entity}" case-insensitively.`,
      remediation:
        'Confirm the live name with autotask_entity_capabilities. If Autotask does have it, regenerate the catalogue (npm run gen:autotask-catalogue) and commit the snapshot — the coverage check will then require a surface for it.',
      surface: 'autotask',
      details: { entity },
    })
  }
  return known.name
}

/** Refuse an operation carrying a dated exemption, quoting the reason verbatim. */
function assertNotExempt(entity: string, operation: EntityOperation, field?: string): void {
  const exemption = findExemption(entity, operation, field)
  if (!exemption) return
  throwClassified({
    reasonCode: 'POLICY_BLOCKED',
    message:
      `${entity}.${operation}${field ? ` (${field})` : ''} is deliberately not offered through the connector. ` +
      `This is a TCT guardrail recorded on ${exemption.dated}, not an Autotask limitation${
        exemption.reason === 'VENDOR_BROKEN' ? ' — though the vendor also fails it, see evidence' : ''
      }.`,
    ...(exemption.liveError ? { evidence: exemption.liveError } : {}),
    remediation: `${exemption.rationale} If this needs to change, it is an owner decision recorded in src/lib/connector/autotask-exemptions.ts — never a workaround through another tool.`,
    surface: 'autotask',
    details: { entity, operation, field, exemption: exemption.reason, dated: exemption.dated },
  })
}

interface FieldPlan {
  /** Fields that will be sent. */
  payload: Record<string, unknown>
  /** Live metadata for every field named, for the response. */
  meta: FieldMetadata[]
  /** Fields the API reports create-only (isRequired + isReadOnly). */
  createOnly: string[]
}

/**
 * Validate a field payload against the entity's LIVE metadata.
 *
 * Three distinct refusals, because they route to three different people:
 *   - a field the API has never heard of        → INVALID_INPUT (caller typo)
 *   - a field the API reports read-only         → INVALID_INPUT with the metadata
 *   - a required field missing on create        → PRECONDITION_FAILED, before
 *     the call is spent. Autotask answers a missing required field with a 500
 *     AFTER accepting nothing, and on a staged area it costs a human approval
 *     to find out — which is how a Service create died on "Missing Required
 *     Field: periodType" in July.
 */
async function planFields(
  entity: string,
  operation: 'create' | 'update',
  fields: Record<string, unknown>,
): Promise<FieldPlan> {
  const { snapshot } = await getEntityCapabilitySnapshot(entity)
  const byLower = new Map(snapshot.fields.map((f) => [f.name.toLowerCase(), f]))
  const createOnly = snapshot.fields.filter((f) => f.isRequired && f.isReadOnly && f.name.toLowerCase() !== 'id').map((f) => f.name)

  const unknown: string[] = []
  const readOnly: FieldMetadata[] = []
  const payload: Record<string, unknown> = {}
  const meta: FieldMetadata[] = []

  for (const [key, value] of Object.entries(fields)) {
    const m = byLower.get(key.toLowerCase())
    if (!m) {
      unknown.push(key)
      continue
    }
    meta.push(m)
    // isReadOnly is a QUESTION on create, not a verdict: Autotask flags a field
    // read-only when it is settable at create and immutable afterwards. Refusing
    // those on create is the periodType bug, which made every Service create
    // impossible for a caller that believed the connector.
    if (m.isReadOnly && !(operation === 'create' && m.isRequired)) {
      readOnly.push(m)
      continue
    }
    // Send the LIVE spelling — an allowlist and the API disagreeing on case is
    // a real drift this repo has already hit (displayColorRGB vs displayColorRgb).
    payload[m.name] = value
  }

  if (unknown.length) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: `${entity} has no field named ${unknown.map((f) => `"${f}"`).join(', ')} on this instance.`,
      evidence: `entityInformation for ${entity} (read ${snapshot.fetchedAt}) lists: ${snapshot.fields.map((f) => f.name).join(', ')}.`,
      remediation: 'Correct the field name. autotask_entity_capabilities lists every field with its type and flags.',
      surface: 'autotask',
      details: { entity, unknownFields: unknown },
    })
  }
  if (readOnly.length) {
    // One field → the existing, better-worded single-field envelope.
    if (readOnly.length === 1) {
      const m = readOnly[0]
      return failThrow(
        readOnlyFieldFailure({
          entity,
          field: m.name,
          exists: true,
          isReadOnly: m.isReadOnly,
          isRequired: m.isRequired,
          apiWritable: false,
          evidence: `entityInformation reports ${entity}.${m.name} isReadOnly true, isRequired ${m.isRequired} (read ${snapshot.fetchedAt}).`,
          fetchedAt: snapshot.fetchedAt,
          cache: 'hit',
        }),
      )
    }
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: `${readOnly.map((m) => `${entity}.${m.name}`).join(', ')} cannot be written — the Autotask API reports them read-only.`,
      evidence: readOnly
        .map((m) => `${entity}.${m.name} isReadOnly true, isRequired ${m.isRequired}`)
        .concat(`(read ${snapshot.fetchedAt})`)
        .join('; '),
      remediation: 'Drop those fields from the request. Autotask either computes them or sets them itself.',
      surface: 'autotask',
      details: { entity, readOnlyFields: readOnly.map((m) => m.name) },
    })
  }

  if (operation === 'create') {
    const supplied = new Set(Object.keys(payload).map((k) => k.toLowerCase()))
    const missing = snapshot.fields
      .filter((f) => f.isRequired && f.name.toLowerCase() !== 'id' && !supplied.has(f.name.toLowerCase()))
      .map((f) => f.name)
    if (missing.length) {
      throwClassified({
        reasonCode: 'PRECONDITION_FAILED',
        message: `Creating a ${entity} requires ${missing.join(', ')}, which the request did not supply.`,
        evidence: `entityInformation reports ${missing.map((f) => `${entity}.${f} isRequired true`).join(', ')} (read ${snapshot.fetchedAt}).`,
        remediation:
          `Supply ${missing.join(', ')} and call again. This is refused here rather than sent, because Autotask answers a missing required field with an HTTP 500 after storing nothing — and on a staged entity it would cost a human approval to find that out.`,
        surface: 'autotask',
        details: { entity, missingRequired: missing },
      })
    }
  }

  if (!Object.keys(payload).length) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: 'fields must contain at least one writable field.',
      remediation: 'Name the fields to write. autotask_entity_capabilities lists which are writable on this entity.',
      surface: 'autotask',
      details: { entity },
    })
  }

  return { payload, meta, createOnly }
}

/** `throwClassified` takes FailureInput; readOnlyFieldFailure returns a built failure. */
function failThrow(failure: ReturnType<typeof readOnlyFieldFailure>): never {
  throwClassified({
    reasonCode: failure.reasonCode as 'INVALID_INPUT',
    message: failure.message,
    ...(failure.evidence ? { evidence: failure.evidence } : {}),
    remediation: failure.remediation,
    surface: 'autotask',
    ...(failure.details ? { details: failure.details } : {}),
  })
}

// ---------------------------------------------------------------------------
// Read-back
// ---------------------------------------------------------------------------

/**
 * Re-read a row and check the requested values actually landed.
 *
 * Fail-closed: a field the read-back does not return counts as NOT landed, and
 * the whole call fails PRECONDITION_FAILED. An accepted HTTP status has never
 * been evidence in this connector that a write stuck, and a PATCH Autotask
 * accepts but silently discards is a real shape here — a null contractID is
 * accepted and thrown away.
 */
async function verifyRow(
  entity: string,
  id: number,
  requested: Record<string, unknown>,
  before: Record<string, unknown> | null,
): Promise<{
  verified: boolean
  after: Record<string, unknown> | null
  mismatches: Array<{ field: string; requested: unknown; actual: unknown }>
  changedFields: string[]
  unverifiableFields: string[]
  unverifiableNote: string | null
}> {
  const { verifiable, unverifiable, reason } = await splitByQueryability(entity, Object.keys(requested))
  const after = await autotask().getConfigRow(entity, id)
  if (!after) {
    return {
      verified: false,
      after: null,
      mismatches: Object.entries(requested).map(([field, value]) => ({ field, requested: value, actual: undefined })),
      changedFields: [],
      unverifiableFields: unverifiable,
      unverifiableNote: reason,
    }
  }
  const scoped = Object.fromEntries(Object.entries(requested).filter(([k]) => verifiable.includes(k)))
  const result = verifyWrittenFields(scoped, before, after)
  return {
    verified: result.mismatches.length === 0,
    after,
    mismatches: result.mismatches,
    changedFields: result.changedFields,
    unverifiableFields: unverifiable,
    unverifiableNote: reason,
  }
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

const ENTITY_ARG = z
  .string()
  .describe('REST entity name exactly as Autotask spells it, e.g. TicketCharges, Opportunities, ConfigurationItems, ServiceCalls')

const POLICY_NOTE =
  'WRITE POLICY: operational records (tickets, notes, time, charges, projects, CRM, assets, procurement) are written DIRECTLY and attributed to you by Autotask resource impersonation. Instance CONFIGURATION — and any entity nobody has classified — goes through the staged human-approval gate at /admin/connector/staged-writes instead, and the tool returns a stagedWriteId rather than performing the write. That default is on purpose: a capability that needs one click is a capability; a capability that does not exist is the bug this surface was built to end.'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerAutotaskEntityTools(server: any) {
  // ---- catalogue ---------------------------------------------------------
  server.registerTool(
    'autotask_entity_catalogue',
    {
      title: 'Autotask: the whole API surface this connector covers',
      description:
        'THE INDEX of every Autotask REST entity the connector can reach, generated from the zone\'s own entityInformation rather than hand-written — so it is the answer to "can the connector touch X" for ANY x, not just the ones somebody built a tool for. Per entity: the operations the API permits, the fields it reports writable, whether a write goes direct or through the staged approval gate, which ergonomic tool (if any) knows that entity\'s quirks, and any dated exemption refusing an operation. Call it with no entity for the full list of names plus counts. READ-ONLY. NOTE the catalogue is a build-time snapshot: it says what to cover, never what the vendor can do right now — autotask_capability_check and autotask_entity_capabilities answer that live. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {
        entity: z.string().optional().describe('One entity for full detail. Omit for the index.'),
        writableOnly: z.boolean().optional().describe('With entity: list only the writable fields (default true)'),
      },
    },
    async ({ entity, writableOnly }: { entity?: string; writableOnly?: boolean }) => {
      try {
        if (!entity) {
          const rows = catalogueEntityNames().map((name) => ({
            entity: name,
            operations: permittedOperations(name),
            writePolicy: writePolicyFor(name),
          }))
          return ok({
            entities: rows.length,
            note:
              'Generated from live entityInformation by scripts/generate-autotask-catalogue.ts. The coverage check fails the build on anything here the connector does not expose.',
            catalogue: rows,
          })
        }
        const name = resolveEntity(entity)
        const entry = catalogueEntity(name)!
        const fields = (writableOnly ?? true) ? entry.fields.filter((f) => !f.isReadOnly) : entry.fields
        return ok({
          entity: name,
          operations: permittedOperations(name),
          writePolicy: writePolicyFor(name),
          stagedAreaName: `${GENERATED_AREA_PREFIX}${name}`,
          parentRoutes: parentRoutes(name),
          exemptions: (['create', 'update', 'delete'] as EntityOperation[])
            .map((op) => ({ operation: op, exemption: findExemption(name, op) }))
            .filter((r) => r.exemption)
            .map((r) => ({ operation: r.operation, reason: r.exemption!.reason, dated: r.exemption!.dated, rationale: r.exemption!.rationale })),
          fields,
        })
      } catch (e) {
        return fail(e, 'autotask_entity_catalogue')
      }
    },
  )

  // ---- query -------------------------------------------------------------
  server.registerTool(
    'autotask_entity_query',
    {
      title: 'Autotask: query ANY entity',
      description:
        'Read rows from ANY queryable Autotask REST entity — TicketCharges, Invoices, BillingItems, ContractServices, Opportunities, Quotes, QuoteItems, ConfigurationItems, ServiceCalls, Appointments, PurchaseOrders, InventoryItems, Expenses, Tags, Departments, Taxes, anything in autotask_entity_catalogue. Filters use the API\'s own operators (eq, noteq, gt, gte, lt, lte, contains, beginsWith, endsWith, exist, notExist, in). Returns ONE API page (max 500 rows) with hasMore. Prefer a dedicated tool where one exists — autotask_get_ticket, autotask_company_tickets and the rest carry resolved labels, links and activity-gap warnings this generic read does not. READ-ONLY. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {
        entity: ENTITY_ARG,
        filters: z
          .array(
            z.object({
              field: z.string(),
              op: z.enum(['eq', 'noteq', 'gt', 'gte', 'lt', 'lte', 'contains', 'beginsWith', 'endsWith', 'exist', 'notExist', 'in']),
              value: z.unknown().optional().describe('Omit for exist / notExist'),
            }),
          )
          .optional()
          .describe('ANDed together. Omit for all rows (capped).'),
        includeFields: z.array(z.string()).optional().describe('Limit the columns returned — strongly recommended on wide entities'),
        max: z.number().int().min(1).max(500).optional().describe('Row cap (default 500)'),
      },
    },
    async ({
      entity,
      filters,
      includeFields,
      max,
    }: {
      entity: string
      filters?: Array<{ field: string; op: string; value?: unknown }>
      includeFields?: string[]
      max?: number
    }) => {
      try {
        const name = resolveEntity(entity)
        await assertOperationPermitted(name, 'query')
        return ok(await autotask().queryConfigEntity(name, filters ?? [], includeFields, max ?? 500))
      } catch (e) {
        return fail(e, 'autotask_entity_query', { entity })
      }
    },
  )

  // ---- create ------------------------------------------------------------
  server.registerTool(
    'autotask_entity_create',
    {
      title: 'Autotask: create a record on ANY entity',
      description:
        'Create a record on ANY Autotask entity the API permits creating — including every family that had no connector surface before 2026-09-21: TicketCharges (product and cost charges on a ticket), Opportunities, Quotes and QuoteItems, Contracts and ContractServices, ConfigurationItems, ServiceCalls and Appointments, TicketChecklistItems, Expenses, PurchaseOrders, InventoryItems, Tags. Fields are validated against LIVE entityInformation before anything is sent: an unknown field, a read-only field, or a missing required field is refused HERE with the vendor metadata as evidence rather than costing a call (or a human approval) to discover. The write is READ-BACK VERIFIED per field — an accepted HTTP status is never reported as success. ' +
        POLICY_NOTE +
        ' Where an ergonomic tool exists for the entity (autotask_create_ticket, autotask_create_task, autotask_create_time_entry, autotask_create_company, autotask_create_contact…), PREFER IT: those carry rules the metadata cannot express, such as the four-field task assignment group. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {
        entity: ENTITY_ARG,
        fields: z.record(z.unknown()).describe('Field name → value, as Autotask names them. Required fields are enforced from live metadata.'),
        parentId: z
          .number()
          .int()
          .optional()
          .describe('For a child entity written under its parent (e.g. a TicketNote under Tickets/{id}/Notes). Usually derivable from the fields; supply it if the create is refused for a missing parent.'),
        reason: z.string().optional().describe('Why — recorded on the staged-write audit row when the entity is gated'),
      },
    },
    async (
      { entity, fields, parentId, reason }: { entity: string; fields: Record<string, unknown>; parentId?: number; reason?: string },
      extra: McpExtra,
    ) => {
      try {
        const name = resolveEntity(entity)
        await assertOperationPermitted(name, 'create')
        assertNotExempt(name, 'create')
        const plan = await planFields(name, 'create', fields)
        const policy = writePolicyFor(name)

        if (policy === 'staged') {
          const staged = await stageConfigWrite({
            area: `${GENERATED_AREA_PREFIX}${name}`,
            operation: 'create',
            ...(parentId != null ? { parentId } : {}),
            changes: plan.payload,
            ...(reason ? { reason } : {}),
            stagedBy: emailOf(extra) ?? 'unknown',
          })
          return ok({ ...staged, entity: name, writePolicy: 'staged', createOnlyFields: plan.createOnly })
        }

        const rid = await impersonationId(extra)
        const candidates = writePathCandidates(name, { ...plan.payload, ...(parentId != null ? derivedParent(name, parentId) : {}) })
        const written = await writeAtFirstWorkingPath<{ itemId?: number }>(
          'POST',
          candidates.map((path) => ({ path, body: plan.payload })),
          rid,
        )
        const newId = written.result?.itemId
        if (!newId) {
          throwClassified({
            reasonCode: 'VERIFY_FAILED',
            message: `Autotask accepted the ${name} create but returned no itemId, so the connector cannot say which record it made.`,
            remediation:
              'Do NOT retry blindly — a record may exist. Query the entity for the values that were sent before creating another.',
            surface: 'autotask',
            details: { entity: name, pathUsed: written.pathUsed, pathAttempts: written.attempts, verificationState: 'unverified' },
          })
        }

        const check = await verifyRow(name, newId, plan.payload, null)
        if (!check.verified) {
          throwClassified({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask created ${name} id ${newId}, but the read-back does not show ${check.mismatches.map((m) => m.field).join(', ')} as requested.`,
            evidence: JSON.stringify(check.mismatches),
            remediation:
              'The record EXISTS — do not create another. Re-read it, correct the fields that did not land with autotask_entity_update, or delete it if it is unusable.',
            surface: 'autotask',
            details: { entity: name, id: newId, mismatches: check.mismatches, pathUsed: written.pathUsed, verificationState: 'unverified' },
          })
        }

        return ok({
          entity: name,
          id: newId,
          writePolicy: 'direct',
          created: check.after,
          verified: true,
          changedFields: check.changedFields,
          pathUsed: written.pathUsed,
          pathAttempts: written.attempts,
          ...(check.unverifiableFields.length ? { unverifiableFields: check.unverifiableFields, unverifiableNote: check.unverifiableNote } : {}),
          attributedTo: emailOf(extra) ?? null,
        })
      } catch (e) {
        return fail(e, 'autotask_entity_create', { entity })
      }
    },
  )

  // ---- update ------------------------------------------------------------
  server.registerTool(
    'autotask_entity_update',
    {
      title: 'Autotask: update a record on ANY entity',
      description:
        'PATCH named fields on any Autotask record the API permits updating. Only the fields supplied are sent — there is no GET-and-merge, so nothing the caller did not name can be overwritten. Fields are validated against LIVE entityInformation first (unknown / read-only refused here with the metadata as evidence), and the result is READ-BACK VERIFIED per field: a value Autotask accepted and did not store comes back PRECONDITION_FAILED, never success. That case is real on this API — a null contractID is accepted and silently discarded. ' +
        POLICY_NOTE +
        ' Prefer the ergonomic tool where one exists: autotask_update_ticket knows that changing a ticket\'s company must move companyLocationID and clear a stale contactID in the SAME call, which this generic tool does not. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {
        entity: ENTITY_ARG,
        id: z.number().int().describe('The record id'),
        fields: z.record(z.unknown()).describe('Field name → new value. Null clears a nullable field.'),
        parentId: z.number().int().optional().describe('Parent id, for a child entity whose PATCH path needs one'),
        reason: z.string().optional().describe('Why — recorded on the staged-write audit row when the entity is gated'),
      },
    },
    async (
      { entity, id, fields, parentId, reason }: { entity: string; id: number; fields: Record<string, unknown>; parentId?: number; reason?: string },
      extra: McpExtra,
    ) => {
      try {
        const name = resolveEntity(entity)
        await assertOperationPermitted(name, 'update')
        assertNotExempt(name, 'update')
        const plan = await planFields(name, 'update', fields)
        const policy = writePolicyFor(name)

        if (policy === 'staged') {
          const staged = await stageConfigWrite({
            area: `${GENERATED_AREA_PREFIX}${name}`,
            operation: 'update',
            entityId: id,
            ...(parentId != null ? { parentId } : {}),
            changes: plan.payload,
            ...(reason ? { reason } : {}),
            stagedBy: emailOf(extra) ?? 'unknown',
          })
          return ok({ ...staged, entity: name, writePolicy: 'staged' })
        }

        const before = await autotask().getConfigRow(name, id)
        if (!before) {
          throwClassified({
            reasonCode: 'PRECONDITION_FAILED',
            message: `${name} id ${id} does not exist (or the API credential cannot see it), so there is nothing to update.`,
            remediation: `Confirm the id with autotask_entity_query({ entity: "${name}", filters: [{ field: "id", op: "eq", value: ${id} }] }).`,
            surface: 'autotask',
            details: { entity: name, id },
          })
        }

        const rid = await impersonationId(extra)
        const candidates = writePathCandidates(name, { ...before, ...(parentId != null ? derivedParent(name, parentId) : {}) })
        const written = await writeAtFirstWorkingPath(
          'PATCH',
          candidates.map((path) => ({ path, body: { id, ...plan.payload } })),
          rid,
        )

        const check = await verifyRow(name, id, plan.payload, before)
        if (!check.verified) {
          throwClassified({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the ${name} ${id} update but the read-back does not show ${check.mismatches.map((m) => m.field).join(', ')} as requested.`,
            evidence: JSON.stringify(check.mismatches),
            remediation:
              'Do not retry unchanged. Re-read the record: Autotask accepts some values it then discards, and a field that will not move usually has a rule behind it (a closed record, a cross-parent reference, or a computed value).',
            surface: 'autotask',
            details: { entity: name, id, mismatches: check.mismatches, pathUsed: written.pathUsed },
          })
        }

        return ok({
          entity: name,
          id,
          writePolicy: 'direct',
          verified: true,
          changedFields: check.changedFields,
          before,
          after: check.after,
          pathUsed: written.pathUsed,
          pathAttempts: written.attempts,
          ...(check.unverifiableFields.length ? { unverifiableFields: check.unverifiableFields, unverifiableNote: check.unverifiableNote } : {}),
          attributedTo: emailOf(extra) ?? null,
        })
      } catch (e) {
        return fail(e, 'autotask_entity_update', { entity, id })
      }
    },
  )

  // ---- delete ------------------------------------------------------------
  server.registerTool(
    'autotask_entity_delete',
    {
      title: 'Autotask: delete a record on ANY entity',
      description:
        'Delete a record where the API permits it, VERIFIED BY RE-READ — a delete Autotask accepted but did not perform is reported as a failure, not as success. Some deletes are refused on purpose and say so with a dated reason: TimeEntries (a billing record), Contacts and Companies (deleting one leaves every ticket, quote and contract that referenced it pointing at nothing). Those refusals are TCT guardrails, listed in autotask_entity_catalogue, and are not to be routed around. Where an entity supports deactivation (isActive false), that is almost always the right operation instead. ' +
        POLICY_NOTE +
        ' ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {
        entity: ENTITY_ARG,
        id: z.number().int().describe('The record id'),
        parentId: z.number().int().optional().describe('Parent id, for a child entity whose DELETE path needs one'),
        reason: z.string().optional().describe('Why — recorded on the staged-write audit row when the entity is gated'),
      },
    },
    async ({ entity, id, parentId, reason }: { entity: string; id: number; parentId?: number; reason?: string }, extra: McpExtra) => {
      try {
        const name = resolveEntity(entity)
        await assertOperationPermitted(name, 'delete')
        assertNotExempt(name, 'delete')
        const policy = writePolicyFor(name)

        if (policy === 'staged') {
          const staged = await stageConfigWrite({
            area: `${GENERATED_AREA_PREFIX}${name}`,
            operation: 'delete',
            entityId: id,
            ...(parentId != null ? { parentId } : {}),
            changes: {},
            ...(reason ? { reason } : {}),
            stagedBy: emailOf(extra) ?? 'unknown',
          })
          return ok({ ...staged, entity: name, writePolicy: 'staged' })
        }

        const before = await autotask().getConfigRow(name, id)
        if (!before) {
          throwClassified({
            reasonCode: 'PRECONDITION_FAILED',
            message: `${name} id ${id} does not exist (or is already gone), so there is nothing to delete.`,
            remediation: 'Re-read before deleting; nothing was changed.',
            surface: 'autotask',
            details: { entity: name, id },
          })
        }

        const rid = await impersonationId(extra)
        const candidates = writePathCandidates(name, { ...before, ...(parentId != null ? derivedParent(name, parentId) : {}) })
        const written = await writeAtFirstWorkingPath(
          'DELETE',
          candidates.map((path) => ({ path: `${path}/${id}` })),
          rid,
        )

        const after = await autotask().getConfigRow(name, id)
        if (after) {
          throwClassified({
            reasonCode: 'PRECONDITION_FAILED',
            message: `Autotask accepted the delete of ${name} ${id}, but the record is still there on re-read.`,
            evidence: `A follow-up query by id still returns the row (path used: ${written.pathUsed}).`,
            remediation:
              'Do not retry unchanged. The record is intact; something is holding it — check whether it has been billed, closed or referenced elsewhere.',
            surface: 'autotask',
            details: { entity: name, id, pathUsed: written.pathUsed },
          })
        }

        return ok({
          entity: name,
          id,
          writePolicy: 'direct',
          deleted: true,
          confirmedAbsent: true,
          deletedRecord: before,
          pathUsed: written.pathUsed,
          pathAttempts: written.attempts,
          attributedTo: emailOf(extra) ?? null,
        })
      } catch (e) {
        return fail(e, 'autotask_entity_delete', { entity, id })
      }
    },
  )
}

/**
 * Turn an explicit parentId into the field name the entity's parent route uses,
 * so writePathCandidates can build the child path from it.
 */
function derivedParent(entity: string, parentId: number): Record<string, unknown> {
  const route = parentRoutes(entity)[0]
  return route ? { [route.parentIdField]: parentId } : {}
}

export { failureResult }
