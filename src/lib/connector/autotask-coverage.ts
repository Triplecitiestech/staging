// src/lib/connector/autotask-coverage.ts
//
// THE CHECK THAT MAKES HAND-PICKING IMPOSSIBLE.
//
// Pure. No network, no DB. It diffs three things:
//
//   1. the CATALOGUE  — every entity, operation and writable field the live API
//                       permits (./autotask-catalogue.ts, machine-generated)
//   2. the SURFACE    — what the connector's registered tools actually claim to
//                       cover (SURFACE_CLAIMS below, bound to real tool names)
//   3. the EXEMPTIONS — the dated, reasoned refusals (./autotask-exemptions.ts)
//
// and returns a violation for anything in (1) that is in neither (2) nor (3).
// The test wrapper turns a non-empty violation list into a failed build.
//
// WHY THIS IS NOT A CHECK THAT CAN ONLY PASS
// ------------------------------------------
// The generic entity tools claim `entities: '*'`, so while they are registered
// almost everything is covered and most runs are green. That is the intended
// steady state, not a vacuous check — the check has four live failure modes:
//
//   - a claim naming a tool that is not registered collapses to zero coverage
//     (delete autotask_entity_create and ~180 entities go uncovered at once);
//   - a refusal added anywhere without a matching exemption;
//   - an exemption that is stale, undated, unreasoned, or says "not needed yet";
//   - a regenerated catalogue that adds an entity a narrowed claim excludes.
//
// The first is demonstrated directly in autotask-coverage.test.ts, which strips
// an entity from the surface and asserts the report fails naming it.

import {
  CATALOGUE,
  catalogueEntities,
  permittedOperations,
  writableFields,
  type CatalogueEntity,
  type EntityOperation,
} from './autotask-catalogue'
import { findExemption, validateExemptions, SURFACE_EXEMPTIONS, type SurfaceExemption } from './autotask-exemptions'
import { writePolicyFor } from './autotask-write-policy'

// ---------------------------------------------------------------------------
// What the connector claims to cover
// ---------------------------------------------------------------------------

export interface ToolCoverageClaim {
  /** The registered MCP tool name. Asserted to exist in TOOL_FACTS by the test. */
  tool: string
  /** '*' = every entity in the catalogue. */
  entities: '*' | readonly string[]
  operations: readonly EntityOperation[]
  /** '*' = every field the API reports writable on that entity. */
  fields: '*' | readonly string[]
  note: string
}

/**
 * The connector's Autotask coverage, declared per tool.
 *
 * The four generic tools are what make this total. The ergonomic tools are
 * listed too, not because they add coverage the generic ones lack, but because
 * this is the file somebody reads to find out what covers what — and a tool
 * that quietly stopped being registered should show up here as a missing claim
 * rather than as nothing at all.
 */
export const SURFACE_CLAIMS: readonly ToolCoverageClaim[] = [
  {
    tool: 'autotask_entity_query',
    entities: '*',
    operations: ['query'],
    fields: '*',
    note: 'Generic read for any queryable entity in the catalogue, with the API\'s own filter operators.',
  },
  {
    tool: 'autotask_entity_create',
    entities: '*',
    operations: ['create'],
    fields: '*',
    note: 'Generic create. Accepts every field live entityInformation reports isReadOnly false; staged or direct per ./autotask-write-policy.ts.',
  },
  {
    tool: 'autotask_entity_update',
    entities: '*',
    operations: ['update'],
    fields: '*',
    note: 'Generic update, read-back verified per field.',
  },
  {
    tool: 'autotask_entity_delete',
    entities: '*',
    operations: ['delete'],
    fields: '*',
    note: 'Generic delete, verified by re-read.',
  },
] as const

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export type ViolationKind =
  | 'operation-not-exposed'
  | 'field-not-exposed'
  | 'exemption-stale'
  | 'exemption-malformed'
  | 'policy-entity-unknown'

export interface CoverageViolation {
  kind: ViolationKind
  entity: string
  operation?: EntityOperation
  field?: string
  message: string
}

export interface CoverageExemptionRow {
  entity: string
  operation?: EntityOperation
  field?: string
  reason: SurfaceExemption['reason']
  dated: string
  rationale: string
  liveError?: string
}

export interface CoverageReport {
  generatedFrom: { catalogueGeneratedAt: string; entities: number }
  summary: {
    entities: number
    operationsPermitted: number
    operationsCovered: number
    operationsExempted: number
    writableFields: number
    fieldsCovered: number
    fieldsExempted: number
    violations: number
  }
  violations: CoverageViolation[]
  exemptions: CoverageExemptionRow[]
  /** Per-entity write policy, so the report shows what a write would actually do. */
  policy: Array<{ entity: string; policy: 'direct' | 'staged'; operations: EntityOperation[] }>
}

interface CoverageInput {
  entities?: CatalogueEntity[]
  claims?: readonly ToolCoverageClaim[]
  exemptions?: SurfaceExemption[]
  /** Tool names that are actually registered. Claims naming anything else contribute NOTHING. */
  registeredTools?: readonly string[] | null
}

/** Does any claim cover this entity+operation? */
function claimCovers(
  claims: readonly ToolCoverageClaim[],
  registered: Set<string> | null,
  entity: string,
  operation: EntityOperation,
  field?: string,
): boolean {
  return claims.some((c) => {
    if (registered && !registered.has(c.tool)) return false
    if (!c.operations.includes(operation)) return false
    if (c.entities !== '*' && !c.entities.some((e) => e.toLowerCase() === entity.toLowerCase())) return false
    if (field === undefined) return true
    return c.fields === '*' || c.fields.some((f) => f.toLowerCase() === field.toLowerCase())
  })
}

/**
 * Build the coverage report.
 *
 * `registeredTools` is the binding between this abstract claim list and the
 * real MCP surface. Pass it and a claim whose tool is not registered counts for
 * nothing — which is what stops SURFACE_CLAIMS from being a promise instead of
 * a measurement. Pass null only when the registry genuinely cannot be read.
 */
export function buildCoverageReport(input: CoverageInput = {}): CoverageReport {
  const entities = input.entities ?? catalogueEntities()
  const claims = input.claims ?? SURFACE_CLAIMS
  const exemptions = input.exemptions ?? SURFACE_EXEMPTIONS
  const registered = input.registeredTools ? new Set(input.registeredTools) : null

  const violations: CoverageViolation[] = []
  let operationsPermitted = 0
  let operationsCovered = 0
  let operationsExempted = 0
  let fieldsTotal = 0
  let fieldsCovered = 0
  let fieldsExempted = 0

  // --- structural defects in the exemptions file itself --------------------
  for (const d of validateExemptions(exemptions)) {
    violations.push({
      kind: 'exemption-malformed',
      entity: d.exemption.entity,
      operation: d.exemption.operation,
      field: d.exemption.field,
      message: d.problem,
    })
  }

  const entityNames = new Set(entities.map((e) => e.name.toLowerCase()))
  const usedExemptions = new Set<SurfaceExemption>()

  // --- the diff ------------------------------------------------------------
  for (const entity of entities) {
    const ops = permittedOperations(entity.name)
    for (const op of ops) {
      operationsPermitted += 1
      // Exemption FIRST. The generic tools claim every entity, so asking
      // "is it claimed?" first would count a refused operation as covered and
      // report zero exemptions while three were in force — a summary that
      // contradicts what the tool actually does when called.
      const exemption = findExemption(entity.name, op, undefined, exemptions)
      if (exemption) {
        operationsExempted += 1
        usedExemptions.add(exemption)
      } else if (claimCovers(claims, registered, entity.name, op)) {
        operationsCovered += 1
      } else {
        violations.push({
          kind: 'operation-not-exposed',
          entity: entity.name,
          operation: op,
          message:
            `The Autotask API permits ${op} on ${entity.name} (entityInformation can${op[0].toUpperCase()}${op.slice(1)} true) ` +
            'and no connector tool exposes it. Expose it, or add a dated exemption to autotask-exemptions.ts arguing blast radius (POLICY_GATED) or capturing the live failure (VENDOR_BROKEN). "Not needed yet" is not a valid reason.',
        })
      }

      // Field coverage only makes sense where a payload is sent.
      if (op === 'create' || op === 'update') {
        for (const f of writableFields(entity.name)) {
          fieldsTotal += 1
          const fieldExemption = findExemption(entity.name, op, f.name, exemptions)
          if (fieldExemption) {
            fieldsExempted += 1
            usedExemptions.add(fieldExemption)
          } else if (claimCovers(claims, registered, entity.name, op, f.name)) {
            fieldsCovered += 1
          } else {
            violations.push({
              kind: 'field-not-exposed',
              entity: entity.name,
              operation: op,
              field: f.name,
              message: `${entity.name}.${f.name} is writable upstream (isReadOnly false) and no connector tool accepts it on ${op}.`,
            })
          }
        }
      }
    }
  }

  // --- exemptions that no longer describe anything real --------------------
  //
  // A stale exemption is a failure in its own right. Left alone, this file
  // becomes a record of things that USED to be true — which is exactly the
  // stale-vendor-claim problem, relocated.
  for (const e of exemptions) {
    if (!entityNames.has(e.entity.toLowerCase())) {
      violations.push({
        kind: 'exemption-stale',
        entity: e.entity,
        operation: e.operation,
        field: e.field,
        message: `Exempts ${e.entity}, which is not in the live catalogue at all. Either the entity is gone or the name is wrong; delete the exemption or correct it.`,
      })
      continue
    }
    if (e.operation && !permittedOperations(e.entity).includes(e.operation)) {
      violations.push({
        kind: 'exemption-stale',
        entity: e.entity,
        operation: e.operation,
        message: `Exempts ${e.entity}.${e.operation}, which the API does not permit anyway — so the exemption is doing nothing and hides the fact that the capability is gone.`,
      })
    }
  }

  return {
    generatedFrom: { catalogueGeneratedAt: CATALOGUE.generatedAt, entities: entities.length },
    summary: {
      entities: entities.length,
      operationsPermitted,
      operationsCovered,
      operationsExempted,
      writableFields: fieldsTotal,
      fieldsCovered,
      fieldsExempted,
      violations: violations.length,
    },
    violations,
    exemptions: exemptions.map((e) => ({
      entity: e.entity,
      operation: e.operation,
      field: e.field,
      reason: e.reason,
      dated: e.dated,
      rationale: e.rationale,
      liveError: e.liveError,
    })),
    policy: entities.map((e) => ({
      entity: e.name,
      policy: writePolicyFor(e.name),
      operations: permittedOperations(e.name),
    })),
  }
}

/** One-line-per-violation rendering for a CI log. */
export function formatViolations(report: CoverageReport): string {
  if (!report.violations.length) return 'Autotask surface coverage: no violations.'
  const lines = report.violations.map(
    (v) => `  [${v.kind}] ${v.entity}${v.operation ? `.${v.operation}` : ''}${v.field ? ` (${v.field})` : ''}: ${v.message}`,
  )
  return [`Autotask surface coverage: ${report.violations.length} violation(s).`, ...lines].join('\n')
}
