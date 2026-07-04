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
  OVERLAY_KEY_STATUS_SLA,
  buildDiff,
  buildTargetLabel,
  detectDrift,
  snapshotFields,
  validateSlaOverlayMappings,
  validateStagedChange,
  type ConfigWriteOperation,
  type StagedChangeInput,
} from './staged-writes-core'

const TTL_MINUTES = Number(process.env.CONNECTOR_STAGED_WRITE_TTL_MINUTES || 60)

function assertWritesEnabled(): void {
  if (process.env.CONNECTOR_CONFIG_WRITES_ENABLED !== 'true') {
    throw new Error(
      'Config writes are disabled: set CONNECTOR_CONFIG_WRITES_ENABLED=true in Vercel env vars to enable the staged-write gate. Read tools are unaffected.'
    )
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
}

export async function stageConfigWrite(
  input: StagedChangeInput & { reason?: string; stagedBy: string },
): Promise<StageResult> {
  assertWritesEnabled()
  const spec = validateStagedChange(input)
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

  const diff = buildDiff(input.operation, before, input.operation === 'delete' ? {} : proposed)
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
  }
}

export async function listStagedWrites(status?: string, targetSystem?: string): Promise<Array<Record<string, unknown>>> {
  await expireOverdue()
  const rows = await prisma.connectorStagedWrite.findMany({
    where: { ...(status ? { status } : {}), ...(targetSystem ? { targetSystem } : {}) },
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

export async function cancelStagedWrite(id: string, byEmail: string): Promise<{ id: string; status: string }> {
  const updated = await prisma.connectorStagedWrite.updateMany({
    where: { id, status: { in: ['pending_approval', 'approved'] } },
    data: { status: 'cancelled', error: `Cancelled by ${byEmail}` },
  })
  if (updated.count !== 1) throw new Error('Staged write not found or not cancellable.')
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
  if (!row) throw new Error('Staged write not found.')
  if (row.targetSystem === 'unifi') {
    // Refuse BEFORE the single-use claim so the approved row isn't burned.
    throw new Error('This staged write targets UniFi — execute it with unifi_execute_staged_write.')
  }
  if (row.status !== 'approved') {
    throw new Error(
      row.status === 'pending_approval'
        ? `Not approved yet. A staff member must approve it first at ${approvalUrl()}.`
        : `Cannot execute: staged write is '${row.status}'.`
    )
  }

  // Single-use claim — a concurrent duplicate call loses this race and errors.
  const claimed = await prisma.connectorStagedWrite.updateMany({
    where: { id, status: 'approved' },
    data: { status: 'executing' },
  })
  if (claimed.count !== 1) throw new Error('Staged write was already picked up by another execution.')

  // Marks failures whose terminal status is already persisted, so the outer
  // catch doesn't overwrite e.g. 'drifted' with 'failed'.
  class HandledStageError extends Error {}
  const fail = async (message: string, status = 'failed'): Promise<never> => {
    await prisma.connectorStagedWrite.update({ where: { id }, data: { status, error: message } })
    throw new HandledStageError(message)
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
      if (drifted.length) {
        return await fail(
          `Live record changed since staging (fields: ${drifted.join(', ')}). Nothing written — restage to see the current values.`,
          'drifted'
        )
      }
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
      if (drifted.length && live) {
        return await fail(
          `Live record changed since staging (fields: ${drifted.join(', ')}). Nothing deleted — restage to review.`,
          'drifted'
        )
      }
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
    if (err instanceof HandledStageError) throw err
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
