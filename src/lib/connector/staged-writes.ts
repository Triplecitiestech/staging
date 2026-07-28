// src/lib/connector/staged-writes.ts
//
// The connector's STRUCTURAL write gate for Autotask configuration.
//
// Flow (no step can be skipped by any caller — human, skill, or automation):
//   1. stageConfigWrite()   — MCP tool: snapshots current state, computes the
//                             before→after diff, persists a pending row.
//                             WRITES NOTHING to Autotask.
//   2. approve / reject     — a HUMAN on /admin/connector/staged-writes
//                             (staff session + system_settings permission).
//                             The MCP OAuth token cannot reach that endpoint,
//                             so an AI caller can never self-approve.
//   3. executeStagedWrite() — MCP tool: only succeeds on an APPROVED,
//                             unexpired row; re-reads the live record and
//                             aborts on drift; single-use; re-reads after the
//                             write and stores the verification.
//
// Kill switch: CONNECTOR_CONFIG_WRITES_ENABLED must be 'true' or staging and
// execution both refuse. Every row is a permanent audit record.

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { AutotaskClient } from '@/lib/autotask'
import { patchConfigEntity, createConfigEntity, deleteConfigEntity } from '@/lib/autotask-write'
import {
  CONFIG_WRITE_AREAS,
  FieldsNotAllowlistedError,
  OVERLAY_KEY_STATUS_SLA,
  buildDiff,
  buildTargetLabel,
  detectDrift,
  resolveConfigArea,
  snapshotFields,
  validateSlaOverlayMappings,
  validateStagedChange,
  type ConfigWriteOperation,
  type StagedChangeInput,
} from './staged-writes-core'
import { ClassifiedConnectorError, throwClassified } from './failure-envelope'
import {
  classifyRejectedFields,
  classifyUnsupportedOperation,
  stagedWriteDriftedFailure,
  stagedWriteNotApprovedFailure,
  validateBeforeStaging,
  type DuplicateWarning,
} from './autotask-write-validation'

const TTL_MINUTES = Number(process.env.CONNECTOR_STAGED_WRITE_TTL_MINUTES || 60)

function assertWritesEnabled(): void {
  if (process.env.CONNECTOR_CONFIG_WRITES_ENABLED !== 'true') {
    // POLICY_BLOCKED, not a failure: the kill switch is a TCT guardrail doing
    // exactly its job. Classifying it as an error invites a caller to treat it
    // as something to work around.
    throwClassified({
      reasonCode: 'POLICY_BLOCKED',
      message:
        'Autotask config writes are disabled by the connector kill switch, so nothing can be staged or executed. Read tools are unaffected.',
      evidence: 'Environment variable CONNECTOR_CONFIG_WRITES_ENABLED is not set to "true" on this deployment.',
      remediation:
        'Ask Kurtis to set CONNECTOR_CONFIG_WRITES_ENABLED=true in the Vercel environment. This is a deliberate switch — do not attempt another write path.',
      surface: 'autotask',
    })
  }
}

function approvalUrl(): string {
  return `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/admin/connector/staged-writes`
}

/** Lazily expire overdue pending/approved rows so state is always honest. */
async function expireOverdue(): Promise<void> {
  await prisma.connectorStagedWrite.updateMany({
    where: { status: { in: ['pending_approval', 'approved'] }, expiresAt: { lt: new Date() } },
    data: { status: 'expired' },
  })
}

export interface StageResult {
  stagedWriteId: string
  area: string
  operation: ConfigWriteOperation
  targetLabel: string
  diff: string
  status: string
  expiresAt: Date
  approvalUrl: string
  note: string
  /** Same-name/SKU records that already exist. Advisory — see findDuplicates. */
  duplicateWarnings?: DuplicateWarning[]
  /** Caveats the approver should read before approving (e.g. contradictory field metadata). */
  validationNotes?: string[]
}

/**
 * Validate the request, then classify any rejection with live API metadata.
 *
 * The pure allowlist check throws plain Errors for shape problems and a typed
 * FieldsNotAllowlistedError for field problems. Only the latter needs a live
 * lookup to attribute blame, so only that path pays for one.
 */
async function validateAndClassify(input: StagedChangeInput) {
  const area = resolveConfigArea(input.area)
  const spec = CONFIG_WRITE_AREAS[area]

  // Operation not offered by this area: ask the API whether that is a vendor
  // limit (UPSTREAM_UNSUPPORTED) or our gap (NOT_IMPLEMENTED), rather than
  // reporting the connector's own allowlist as though it were the reason.
  if (spec && spec.targetSystem === 'autotask' && !spec.operations.includes(input.operation)) {
    await classifyUnsupportedOperation(area, spec.entity, input.operation, spec.operations)
  }

  try {
    return validateStagedChange(input)
  } catch (err) {
    if (err instanceof FieldsNotAllowlistedError) await classifyRejectedFields(err)
    throw err
  }
}

export async function stageConfigWrite(
  input: StagedChangeInput & { reason?: string; stagedBy: string },
): Promise<StageResult> {
  assertWritesEnabled()
  const spec = await validateAndClassify(input)
  const client = new AutotaskClient()

  let before: Record<string, unknown> | null = null
  let proposed: Record<string, unknown> = { ...input.changes }
  let parentId = input.parentId ?? null
  let targetLabel: string

  if (spec.targetSystem === 'overlay') {
    // Owner-maintained status→SLA-event overlay: validate every statusId
    // against the LIVE status picklist and pin the label alongside it.
    const statuses = await client.getEntityPicklistDetailed('Tickets', 'status')
    const mappings = validateSlaOverlayMappings(input.changes.mappings, statuses.options)
    const labelById = new Map(statuses.options.map((s) => [s.id, s.label]))
    proposed = {
      mappings: mappings.map((m) => ({ ...m, statusLabel: labelById.get(m.statusId) ?? null })),
      note: input.changes.note ?? null,
    }
    const existing = await prisma.connectorConfigOverlay.findUnique({ where: { key: OVERLAY_KEY_STATUS_SLA } })
    before = existing ? { mappings: existing.value, note: existing.note } : null
    targetLabel = spec.label
  } else {
    if (input.operation === 'update' || input.operation === 'delete') {
      const row = await client.getConfigRow(spec.entity, input.entityId!)
      if (!row) throw new Error(`${spec.entity} id ${input.entityId} not found — nothing staged.`)
      before = snapshotFields(spec, row)
      if (parentId == null && spec.parentIdFromField) {
        const derived = Number(row[spec.parentIdFromField])
        if (!Number.isNaN(derived)) parentId = derived
      }
      targetLabel = buildTargetLabel(spec, row, input.entityId)
    } else {
      targetLabel = buildTargetLabel(spec, input.changes, undefined)
    }
    if (spec.parentIdField && parentId == null) {
      throw new Error(`Could not resolve parentId (${spec.parentIdField}) for ${spec.area}.`)
    }
  }

  // Business validation AFTER the snapshot (so an update knows its own id for
  // the duplicate check) but BEFORE anything is persisted — a staged row that
  // cannot possibly execute is a waste of the approver's attention.
  const { duplicateWarnings, notes } =
    spec.targetSystem === 'autotask'
      ? await validateBeforeStaging(client, spec, input.operation, proposed, input.entityId)
      : { duplicateWarnings: [] as DuplicateWarning[], notes: [] as string[] }

  const baseDiff = buildDiff(input.operation, before, input.operation === 'delete' ? {} : proposed)
  // Warnings are appended to the DIFF, not just returned to the caller, because
  // the diff is what the human actually reads on the approval page.
  const diff = [
    baseDiff,
    ...duplicateWarnings.map(
      (w) => `\n⚠ DUPLICATE ${w.field} "${w.value}": ${w.note}\n   existing: ${w.matches.map((m) => `#${m.id} ${String(m.name ?? '')}${m.isActive === false ? ' (inactive)' : ''}`).join(', ')}`,
    ),
    ...notes.map((n) => `\nℹ ${n}`),
  ].join('\n')
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000)

  const row = await prisma.connectorStagedWrite.create({
    data: {
      area: spec.area,
      operation: input.operation,
      targetSystem: spec.targetSystem,
      entityPath: spec.writePath(parentId ?? undefined),
      entityId: input.entityId ?? null,
      parentId,
      targetLabel,
      before: before === null ? undefined : (before as Prisma.InputJsonValue),
      proposed: proposed as Prisma.InputJsonValue,
      diff,
      reason: input.reason ?? null,
      risk: spec.risk,
      status: 'pending_approval',
      stagedBy: input.stagedBy,
      expiresAt,
    },
  })

  return {
    stagedWriteId: row.id,
    area: spec.area,
    operation: input.operation,
    targetLabel,
    diff,
    status: row.status,
    expiresAt,
    approvalUrl: approvalUrl(),
    note: `NOTHING has been written. A staff member must approve this at ${approvalUrl()} (system_settings permission), then call autotask_execute_staged_write with this id. Expires ${expiresAt.toISOString()}.`,
    ...(duplicateWarnings.length ? { duplicateWarnings } : {}),
    ...(notes.length ? { validationNotes: notes } : {}),
  }
}

export async function listStagedWrites(status?: string, targetSystems?: string[]): Promise<Array<Record<string, unknown>>> {
  await expireOverdue()
  const rows = await prisma.connectorStagedWrite.findMany({
    where: { ...(status ? { status } : {}), ...(targetSystems?.length ? { targetSystem: { in: targetSystems } } : {}) },
    orderBy: { stagedAt: 'desc' },
    take: 50,
  })
  return rows.map((r) => ({
    id: r.id,
    area: r.area,
    operation: r.operation,
    targetLabel: r.targetLabel,
    status: r.status,
    risk: r.risk,
    diff: r.diff,
    reason: r.reason,
    stagedBy: r.stagedBy,
    stagedAt: r.stagedAt,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt,
    executedAt: r.executedAt,
    expiresAt: r.expiresAt,
    error: r.error,
  }))
}

/** Human decision — called ONLY from the staff-authenticated admin API. */
export async function resolveStagedWrite(
  id: string,
  action: 'approve' | 'reject',
  byEmail: string,
): Promise<{ id: string; status: string }> {
  await expireOverdue()
  const next = action === 'approve' ? 'approved' : 'rejected'
  const updated = await prisma.connectorStagedWrite.updateMany({
    where: { id, status: 'pending_approval' },
    data: { status: next, approvedBy: byEmail, approvedAt: new Date() },
  })
  if (updated.count !== 1) {
    const row = await prisma.connectorStagedWrite.findUnique({ where: { id } })
    throw new Error(row ? `Cannot ${action}: staged write is '${row.status}', not pending_approval.` : 'Staged write not found.')
  }
  return { id, status: next }
}

export async function cancelStagedWrite(
  id: string,
  byEmail: string,
  // Scopes the cancel to the calling connector's system so the UniFi cancel
  // tool cannot void a pending Autotask change (or vice versa).
  allowedTargetSystems?: string[],
): Promise<{ id: string; status: string }> {
  const updated = await prisma.connectorStagedWrite.updateMany({
    where: {
      id,
      status: { in: ['pending_approval', 'approved'] },
      ...(allowedTargetSystems?.length ? { targetSystem: { in: allowedTargetSystems } } : {}),
    },
    data: { status: 'cancelled', error: `Cancelled by ${byEmail}` },
  })
  if (updated.count !== 1) {
    const row = await prisma.connectorStagedWrite.findUnique({ where: { id } })
    if (row && allowedTargetSystems?.length && !allowedTargetSystems.includes(row.targetSystem)) {
      throw new Error(
        row.targetSystem === 'unifi'
          ? 'This staged write targets UniFi — cancel it with unifi_cancel_staged_write.'
          : 'This staged write targets Autotask — cancel it with autotask_cancel_staged_write.'
      )
    }
    throw new Error('Staged write not found or not cancellable.')
  }
  return { id, status: 'cancelled' }
}

export interface ExecuteResult {
  stagedWriteId: string
  status: string
  targetLabel: string
  apiResult: unknown
  verification: unknown
}

export async function executeStagedWrite(id: string): Promise<ExecuteResult> {
  assertWritesEnabled()
  await expireOverdue()
  const row = await prisma.connectorStagedWrite.findUnique({ where: { id } })
  if (!row) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: `No staged write exists with id ${id}.`,
      remediation: 'Check the id against autotask_list_staged_writes.',
      surface: 'autotask',
      details: { stagedWriteId: id },
    })
  }
  if (row.targetSystem === 'unifi') {
    // Refuse BEFORE the single-use claim so the approved row isn't burned.
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      // The tool name stays in the MESSAGE, not only in remediation: this is the
      // one piece of information that makes the failure self-correcting, and
      // some clients surface only the message.
      message: 'This staged write targets UniFi, not Autotask — execute it with unifi_execute_staged_write instead.',
      remediation: 'Call unifi_execute_staged_write with the same staged-write id.',
      surface: 'autotask',
      details: { stagedWriteId: id, targetSystem: row.targetSystem },
    })
  }
  if (row.status !== 'approved') {
    throwClassified(
      stagedWriteNotApprovedFailure({
        id,
        status: row.status,
        targetLabel: row.targetLabel,
        approvalUrl: approvalUrl(),
      }),
    )
  }

  // Single-use claim — a concurrent duplicate call loses this race.
  const claimed = await prisma.connectorStagedWrite.updateMany({
    where: { id, status: 'approved' },
    data: { status: 'executing' },
  })
  if (claimed.count !== 1) {
    throwClassified({
      reasonCode: 'PRECONDITION_FAILED',
      message: 'This staged write was already picked up by another execution.',
      evidence: `The single-use claim on ${id} did not win — its status was no longer 'approved' at claim time.`,
      remediation: 'Check the outcome with autotask_list_staged_writes before re-staging; the change may already have been applied.',
      surface: 'autotask',
      details: { stagedWriteId: id },
    })
  }

  // Marks failures whose terminal status is already persisted, so the outer
  // catch doesn't overwrite e.g. 'drifted' with 'failed'.
  class HandledStageError extends Error {}
  const fail = async (message: string, status = 'failed'): Promise<never> => {
    await prisma.connectorStagedWrite.update({ where: { id }, data: { status, error: message } })
    throw new HandledStageError(message)
  }

  /** Persist the terminal 'drifted' status, then throw the classified envelope. */
  const failDrifted = async (drifted: string[], verb: 'written' | 'deleted'): Promise<never> => {
    const failure = stagedWriteDriftedFailure({ id, targetLabel: row.targetLabel, driftedFields: drifted, verb })
    await prisma.connectorStagedWrite.update({ where: { id }, data: { status: 'drifted', error: failure.message } })
    throwClassified(failure)
  }

  try {
    const spec = CONFIG_WRITE_AREAS[row.area]
    if (!spec) return await fail(`Config area '${row.area}' no longer exists.`)
    const proposed = row.proposed as Record<string, unknown>
    const before = (row.before ?? null) as Record<string, unknown> | null
    const client = new AutotaskClient()

    let apiResult: unknown
    let verification: unknown

    if (spec.targetSystem === 'overlay') {
      const saved = await prisma.connectorConfigOverlay.upsert({
        where: { key: OVERLAY_KEY_STATUS_SLA },
        create: {
          key: OVERLAY_KEY_STATUS_SLA,
          value: proposed.mappings as Prisma.InputJsonValue,
          note: (proposed.note as string) ?? null,
          updatedBy: row.approvedBy ?? row.stagedBy,
          lastVerifiedAt: new Date(),
        },
        update: {
          value: proposed.mappings as Prisma.InputJsonValue,
          note: (proposed.note as string) ?? null,
          updatedBy: row.approvedBy ?? row.stagedBy,
          lastVerifiedAt: new Date(),
        },
      })
      apiResult = { overlayKey: saved.key }
      verification = { mappings: saved.value, note: saved.note, lastVerifiedAt: saved.lastVerifiedAt }
    } else if (row.operation === 'update') {
      // Drift check: if the live record moved since staging, abort — the
      // approved diff no longer describes reality.
      const live = await client.getConfigRow(spec.entity, row.entityId!)
      const drifted = detectDrift(before, live ? snapshotFields(spec, live) : null)
      if (drifted.length) return await failDrifted(drifted, 'written')
      apiResult = await patchConfigEntity(row.entityPath, { id: row.entityId, ...proposed })
      const after = await client.getConfigRow(spec.entity, row.entityId!)
      verification = after ? snapshotFields(spec, after) : null
    } else if (row.operation === 'create') {
      const payload = { ...proposed }
      if (spec.parentIdField && row.parentId != null) payload[spec.parentIdField] = row.parentId
      apiResult = await createConfigEntity(row.entityPath, payload)
      const newId = (apiResult as { itemId?: number })?.itemId
      verification = newId ? snapshotFields(spec, (await client.getConfigRow(spec.entity, newId)) ?? {}) : null
    } else {
      const live = await client.getConfigRow(spec.entity, row.entityId!)
      const drifted = detectDrift(before, live ? snapshotFields(spec, live) : null)
      if (drifted.length && live) return await failDrifted(drifted, 'deleted')
      apiResult = await deleteConfigEntity(`${row.entityPath}/${row.entityId}`)
      const gone = await client.getConfigRow(spec.entity, row.entityId!)
      verification = { deleted: gone === null }
    }

    await prisma.connectorStagedWrite.update({
      where: { id },
      data: { status: 'executed', executedAt: new Date(), result: { apiResult, verification } as Prisma.InputJsonValue },
    })
    return { stagedWriteId: id, status: 'executed', targetLabel: row.targetLabel, apiResult, verification }
  } catch (err) {
    // Both of these already persisted their terminal status; re-writing it here
    // would overwrite 'drifted' with 'failed' and lose why it stopped.
    if (err instanceof HandledStageError) throw err
    if (err instanceof ClassifiedConnectorError) throw err
    const message = err instanceof Error ? err.message : String(err)
    await prisma.connectorStagedWrite.update({ where: { id }, data: { status: 'failed', error: message } }).catch(() => {})
    throw err
  }
}

/** Read the owner-maintained status→SLA-event overlay (or null if unset). */
export async function getStatusSlaOverlay(): Promise<Record<string, unknown> | null> {
  try {
    const row = await prisma.connectorConfigOverlay.findUnique({ where: { key: OVERLAY_KEY_STATUS_SLA } })
    if (!row) return null
    return {
      source: 'manual_overlay (owner-maintained in TCT database — NOT from the Autotask API)',
      mappings: row.value,
      note: row.note,
      updatedBy: row.updatedBy,
      lastVerifiedAt: row.lastVerifiedAt,
    }
  } catch {
    // Overlay table unreachable must never break the statuses read.
    return null
  }
}
