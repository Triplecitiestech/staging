// src/lib/connector/autotask-write-validation.ts
//
// PRE-STAGE validation for Autotask config writes.
//
// Why this is its own module rather than more code inside staged-writes.ts:
// that file is the gate's DB/execution orchestrator (snapshot → persist →
// approve → drift-check → execute). What lives here is a different concern —
// deciding whether a request is even coherent before anything is staged — and
// it needs its own tests. Two rules drive it:
//
//   1. FAIL AT STAGE TIME, NOT EXECUTE TIME. A staged row is a request for a
//      human's attention. Asking Kurtis to approve a change that cannot
//      possibly work wastes his time and burns the single-use row.
//
//   2. A REFUSED FIELD MUST SAY WHOSE PROBLEM IT IS. "unsupported field" is
//      useless. A field the live API reports read-only is the caller's mistake
//      (INVALID_INPUT, with the metadata as evidence). A field the API says is
//      perfectly writable but the allowlist omits is OUR gap
//      (NOT_IMPLEMENTED, naming exactly what to add).

import type { AutotaskClient } from '@/lib/autotask'
import { throwClassified, type FailureInput } from './failure-envelope'
import { checkField, checkOperation } from './autotask-capability'
import {
  CONFIG_WRITE_AREAS,
  type ConfigWriteAreaSpec,
  type ConfigWriteOperation,
  type FieldsNotAllowlistedError,
} from './staged-writes-core'

/** BillingCodes.useType 5 = "Recurring Contract Service Code" (live picklist, 2026-07-28). */
export const USE_TYPE_RECURRING_CONTRACT_SERVICE = 5

// ---------------------------------------------------------------------------
// Gate-outcome envelopes (pure builders, so they are unit-testable)
// ---------------------------------------------------------------------------

/**
 * The approval gate holding is POLICY_BLOCKED — implemented, permitted, and
 * deliberately waiting on a human. remediation carries the approval URL so the
 * caller can tell the owner exactly where to go.
 */
export function stagedWriteNotApprovedFailure(row: {
  id: string
  status: string
  targetLabel?: string
  approvalUrl: string
}): FailureInput {
  const pending = row.status === 'pending_approval'
  return {
    reasonCode: 'POLICY_BLOCKED',
    message: pending
      ? 'This change is staged and waiting for human approval — nothing has been written. The connector cannot self-approve staged writes.'
      : `Cannot execute: this staged write is '${row.status}', not 'approved'.`,
    evidence: `ConnectorStagedWrite ${row.id} has status '${row.status}'. Approval requires a staff session with the system_settings permission, which the connector's OAuth token cannot obtain.`,
    remediation: pending
      ? `A staff member must approve it at ${row.approvalUrl} , then call autotask_execute_staged_write again with this id. This gate is intentional — do not look for another write path.`
      : `Staged writes are single-use. Stage the change again with autotask_stage_config_write and have it approved at ${row.approvalUrl} .`,
    surface: 'autotask',
    details: { stagedWriteId: row.id, status: row.status, approvalUrl: row.approvalUrl, targetLabel: row.targetLabel },
  }
}

/**
 * Drift is PRECONDITION_FAILED: the request was legitimate, the world moved
 * between staging and execution. Routes the owner to "see what changed and
 * restage", which is the actual next step.
 */
export function stagedWriteDriftedFailure(row: {
  id: string
  targetLabel?: string
  driftedFields: string[]
  verb: 'written' | 'deleted'
}): FailureInput {
  return {
    reasonCode: 'PRECONDITION_FAILED',
    message:
      `Live record changed since staging (fields: ${row.driftedFields.join(', ')}). Nothing ${row.verb}. ` +
      'The approved diff no longer describes reality, so the gate aborted rather than apply a change nobody reviewed.',
    evidence: `Drift check compared the staged before-snapshot with a fresh read of ${row.targetLabel ?? 'the record'}; these fields differ: ${row.driftedFields.join(', ')}.`,
    remediation:
      'Re-stage the change with autotask_stage_config_write to snapshot the current values, and have the new diff approved. Do not retry this id — it is spent.',
    surface: 'autotask',
    details: { stagedWriteId: row.id, driftedFields: row.driftedFields, targetLabel: row.targetLabel },
  }
}

// ---------------------------------------------------------------------------
// Field rejection → the right reason code
// ---------------------------------------------------------------------------

/**
 * Turn a not-allowlisted-field rejection into an evidence-backed envelope.
 *
 * Asks live entityInformation about every refused field and splits them:
 *   - read-only upstream        → INVALID_INPUT  (the caller must drop it)
 *   - unknown to the API        → INVALID_INPUT  (misspelled or nonexistent)
 *   - writable but not exposed  → NOT_IMPLEMENTED (a connector gap, named)
 *
 * A mixed batch reports the connector gap, because that is the actionable half:
 * telling the owner "we could add this" is worth more than repeating that a
 * computed field is computed.
 *
 * Never returns — always throws a classified error.
 */
export async function classifyRejectedFields(err: FieldsNotAllowlistedError): Promise<never> {
  const readOnly: string[] = []
  const unknown: string[] = []
  const buildable: string[] = []
  const evidence: string[] = []

  for (const field of err.fields) {
    try {
      const verdict = await checkField(err.entity, field)
      evidence.push(verdict.evidence)
      if (!verdict.exists) unknown.push(field)
      else if (verdict.isReadOnly) readOnly.push(field)
      else buildable.push(field)
    } catch {
      // A capability lookup failure must not turn into a confident claim about
      // the field. Treat it as a possible connector gap (the actionable, and
      // recoverable, reading) and say the check could not be completed.
      buildable.push(field)
      evidence.push(`Live entityInformation lookup for ${err.entity}.${field} did not complete; classification is provisional.`)
    }
  }

  if (buildable.length) {
    throwClassified({
      reasonCode: 'NOT_IMPLEMENTED',
      message:
        `The Autotask API allows writing ${err.entity}.${buildable.join(', ')}, but the connector's '${err.area}' write area does not expose ${buildable.length === 1 ? 'it' : 'them'} yet.`,
      evidence: evidence.join(' '),
      remediation:
        `This is a connector gap, not an Autotask limit. To close it, add ${buildable.map((f) => `'${f}'`).join(', ')} to the allowedFields of the '${err.area}' area in src/lib/connector/staged-writes-core.ts. ` +
        `Report it to Kurtis as a build task rather than telling him Autotask cannot do it.` +
        (readOnly.length ? ` (Also requested but genuinely read-only upstream: ${readOnly.join(', ')} — those must be dropped.)` : '') +
        (unknown.length ? ` (Also requested but unknown to the API: ${unknown.join(', ')} — check the spelling.)` : ''),
      surface: 'autotask',
      details: { area: err.area, entity: err.entity, connectorGapFields: buildable, readOnlyFields: readOnly, unknownFields: unknown },
    })
  }

  if (unknown.length && !readOnly.length) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: `${err.entity} has no field named ${unknown.join(', ')} on this instance.`,
      evidence: evidence.join(' '),
      remediation: `Check the spelling against autotask_entity_capabilities for ${err.entity}, then call again.`,
      surface: 'autotask',
      details: { area: err.area, entity: err.entity, unknownFields: unknown },
    })
  }

  throwClassified({
    reasonCode: 'INVALID_INPUT',
    message:
      `${readOnly.map((f) => `${err.entity}.${f}`).join(', ')} cannot be written — the Autotask API reports ${readOnly.length === 1 ? 'it' : 'them'} read-only, so ${readOnly.length === 1 ? 'it is' : 'they are'} not offered in the '${err.area}' area.`,
    evidence: evidence.join(' '),
    remediation:
      `Drop ${readOnly.join(', ')} from the request. Autotask computes ${readOnly.length === 1 ? 'this value' : 'these values'} itself` +
      (readOnly.includes('markupRate') ? ' — markupRate is derived from unitPrice and unitCost, and updates on its own when those change.' : '.') +
      (unknown.length ? ` Also unknown to the API: ${unknown.join(', ')} — check the spelling.` : ''),
    surface: 'autotask',
    details: { area: err.area, entity: err.entity, readOnlyFields: readOnly, unknownFields: unknown },
  })
}

/**
 * Turn "this area does not offer that operation" into the right reason code.
 *
 * The connector not offering an operation is NOT itself a reason — the question
 * is why. Asking live entityInformation splits the two cases that matter:
 *
 *   - the API forbids it (Services.canDelete false) → UPSTREAM_UNSUPPORTED.
 *     Nobody can build this; stop looking for a workaround.
 *   - the API allows it and we simply have not exposed it → NOT_IMPLEMENTED,
 *     with remediation naming the area to extend.
 *
 * Deriving it live is what keeps this honest when Kaseya ships API changes: the
 * day Autotask starts allowing Service deletes, this returns NOT_IMPLEMENTED on
 * its own, with no code change and no stale claim.
 *
 * Never returns — always throws a classified error.
 */
export async function classifyUnsupportedOperation(
  area: string,
  entity: string,
  operation: ConfigWriteOperation,
  offeredOperations: ConfigWriteOperation[],
): Promise<never> {
  const verdict = await checkOperation(entity, operation)

  if (verdict.apiPermits === false) {
    const deactivatable = CONFIG_WRITE_AREAS[area]?.allowedFields.includes('isActive')
    throwClassified({
      reasonCode: 'UPSTREAM_UNSUPPORTED',
      message: `The Autotask REST API does not allow ${operation} on ${entity}, so the connector cannot offer it.`,
      evidence: verdict.evidence,
      remediation:
        operation === 'delete' && deactivatable
          ? `${entity} records cannot be deleted through the API at all. Deactivate instead: stage an update with isActive:false on area '${area}'. Tell the user delete is unavailable rather than implying the attempt failed.`
          : `There is no API path for this. The change has to be made in the Autotask UI — do not look for a connector workaround.`,
      surface: 'autotask',
      details: { area, entity, operation, offeredOperations },
    })
  }

  throwClassified({
    reasonCode: 'NOT_IMPLEMENTED',
    message:
      verdict.apiPermits === true
        ? `The Autotask API allows ${operation} on ${entity}, but the connector's '${area}' area only offers ${offeredOperations.join('/')}.`
        : `The connector's '${area}' area only offers ${offeredOperations.join('/')}, and live metadata did not state whether the API allows ${operation} on ${entity}.`,
    evidence: verdict.evidence,
    remediation:
      `This is a connector gap, not an Autotask limit. To close it, add '${operation}' to the operations list of the '${area}' area in src/lib/connector/staged-writes-core.ts (and confirm the write path). Report it to Kurtis as a build task.`,
    surface: 'autotask',
    details: { area, entity, operation, offeredOperations, apiPermits: verdict.apiPermits },
  })
}

// ---------------------------------------------------------------------------
// Reference + picklist validation
// ---------------------------------------------------------------------------

async function validateBillingCode(client: AutotaskClient, billingCodeId: unknown): Promise<void> {
  const id = Number(billingCodeId)
  if (!Number.isInteger(id) || id <= 0) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: `billingCodeID must be a positive integer (got ${JSON.stringify(billingCodeId)}).`,
      remediation: 'Look the code up with autotask_list_billing_codes (useType 5 = Recurring Contract Service Code).',
      surface: 'autotask',
    })
  }

  const row = await client.getConfigRow('BillingCodes', id)
  if (!row) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message: `billingCodeID ${id} does not exist on this Autotask instance.`,
      evidence: `Query of BillingCodes by id ${id} returned no row.`,
      remediation: 'Pick a real code with autotask_list_billing_codes (filter useType 5).',
      surface: 'autotask',
      details: { billingCodeID: id },
    })
  }
  if (row.isActive === false) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message: `Billing code ${id} ("${String(row.name ?? 'unnamed')}") is INACTIVE, so a service cannot be attached to it.`,
      evidence: `BillingCodes id ${id} has isActive false.`,
      remediation: 'Choose an active code, or reactivate that one in Autotask first.',
      surface: 'autotask',
      details: { billingCodeID: id, name: row.name },
    })
  }
  const useType = Number(row.useType)
  if (useType !== USE_TYPE_RECURRING_CONTRACT_SERVICE) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message:
        `Billing code ${id} ("${String(row.name ?? 'unnamed')}") has useType ${useType}, but a recurring service needs useType ${USE_TYPE_RECURRING_CONTRACT_SERVICE} (Recurring Contract Service Code).`,
      evidence: `BillingCodes id ${id} reports useType ${useType}; the live BillingCodes.useType picklist maps ${USE_TYPE_RECURRING_CONTRACT_SERVICE} to "Recurring Contract Service Code".`,
      remediation: `Call autotask_list_billing_codes with useType ${USE_TYPE_RECURRING_CONTRACT_SERVICE} and pick one of those ids.`,
      surface: 'autotask',
      details: { billingCodeID: id, useType },
    })
  }
}

async function validateSlaId(client: AutotaskClient, entity: string, slaId: unknown): Promise<void> {
  if (slaId == null) return
  const id = Number(slaId)
  const picklist = await client.getEntityPicklistDetailed(entity, 'serviceLevelAgreementID', true)
  const match = picklist.options.find((o) => o.id === id)
  if (!match) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: `serviceLevelAgreementID ${JSON.stringify(slaId)} is not a valid value on this instance.`,
      evidence: `Live ${entity}.serviceLevelAgreementID picklist offers: ${picklist.options.map((o) => `${o.id} = ${o.label}`).join('; ')}.`,
      remediation: 'Pass one of the ids listed in the evidence, or omit the field to leave the SLA unset.',
      surface: 'autotask',
      details: { field: 'serviceLevelAgreementID', supplied: slaId },
    })
  }
}

// ---------------------------------------------------------------------------
// Duplicate guard
// ---------------------------------------------------------------------------

export interface DuplicateWarning {
  field: 'name' | 'sku'
  value: string
  matches: Array<{ id: unknown; name: unknown; sku: unknown; isActive: unknown }>
  note: string
}

/**
 * Warn (do not block) when a service/bundle with the same name or SKU exists.
 *
 * Deliberately a warning surfaced in the staged diff rather than a hard
 * failure: legitimate near-duplicates exist, and the human approving the change
 * is better placed to judge than a string match. This catalog already carries
 * real duplication — Watchtower and Fortress are six records for three
 * products — so the warning goes where the approver will actually read it.
 */
export async function findDuplicates(
  client: AutotaskClient,
  entity: string,
  changes: Record<string, unknown>,
  excludeId?: number,
): Promise<DuplicateWarning[]> {
  const out: DuplicateWarning[] = []
  for (const field of ['name', 'sku'] as const) {
    const value = changes[field]
    if (typeof value !== 'string' || !value.trim()) continue
    try {
      const { items } = await client.queryConfigEntity(
        entity,
        [{ op: 'eq', field, value: value.trim() }],
        ['id', 'name', 'sku', 'isActive'],
        50,
      )
      const matches = items
        .filter((r) => excludeId == null || Number(r.id) !== excludeId)
        .map((r) => ({ id: r.id, name: r.name, sku: r.sku, isActive: r.isActive }))
      if (matches.length) {
        out.push({
          field,
          value: value.trim(),
          matches,
          note: `${matches.length} existing ${entity} record(s) already use this ${field}. This is a WARNING, not a block — approve only if the duplicate is intended.`,
        })
      }
    } catch {
      // A failed duplicate probe must never block a legitimate change; the
      // guard is advisory. Silence here is safe because the approver still sees
      // the full diff.
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface PreStageValidation {
  duplicateWarnings: DuplicateWarning[]
  notes: string[]
}

/**
 * Validate a staged Autotask change beyond the pure allowlist check.
 *
 * Runs only for areas that have reference/picklist fields worth resolving; every
 * other area passes through with nothing to say, so existing behaviour for
 * holidays, categories, roles and the rest is unchanged.
 */
export async function validateBeforeStaging(
  client: AutotaskClient,
  spec: ConfigWriteAreaSpec,
  operation: ConfigWriteOperation,
  changes: Record<string, unknown>,
  entityId?: number,
): Promise<PreStageValidation> {
  const notes: string[] = []
  if (operation === 'delete') return { duplicateWarnings: [], notes }

  const isServiceish = spec.entity === 'Services' || spec.entity === 'ServiceBundles'
  if (!isServiceish) return { duplicateWarnings: [], notes }

  if ('billingCodeID' in changes && changes.billingCodeID != null) {
    await validateBillingCode(client, changes.billingCodeID)
  }
  if ('serviceLevelAgreementID' in changes) {
    await validateSlaId(client, spec.entity, changes.serviceLevelAgreementID)
  }
  if (operation === 'create' && 'periodType' in changes) {
    notes.push(
      'periodType is flagged BOTH isRequired and isReadOnly by live entityInformation. It is being sent on CREATE to establish empirically whether Autotask accepts it there. If the create fails on this field, or the read-back shows a different value than requested, periodType is not settable via the API and only the instance default can be produced.',
    )
  }

  const duplicateWarnings = await findDuplicates(client, spec.entity, changes, entityId)
  return { duplicateWarnings, notes }
}

/** Areas whose entity has no API delete, for tool-description accuracy. */
export const AREAS_WITHOUT_DELETE = Object.values(CONFIG_WRITE_AREAS)
  .filter((s) => !s.operations.includes('delete'))
  .map((s) => s.area)
