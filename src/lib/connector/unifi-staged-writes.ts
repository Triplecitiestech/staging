// src/lib/connector/unifi-staged-writes.ts
//
// UniFi tier-2 writes through the SAME structural gate as Autotask config
// writes (./staged-writes.ts): stage (never writes) → human approves at
// /admin/connector/staged-writes (staff auth the MCP token cannot reach) →
// drift-checked single-use execute. Same ConnectorStagedWrite table, same
// admin UI, same lifecycle — only the snapshot/write transport differs
// (Cloud Connector Proxy instead of the Autotask REST client).
//
// Differences that justify this module instead of extending staged-writes.ts:
//   - UniFi ids are strings (the Int entityId column stays null; the target
//     lives in entityPath via buildUnifiEntityPath, parsed back on execute).
//   - Kill switch is CONNECTOR_UNIFI_WRITES_ENABLED, independent of the
//     Autotask CONNECTOR_CONFIG_WRITES_ENABLED.
//   - Updates are GET→merge→PUT: the Integration API replaces the object on
//     PUT, so writing only the changed fields would wipe the rest.
//   - Snapshots/diffs are stored secret-REDACTED so passphrases never land
//     in the audit table; drift compares redacted-to-redacted.

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  proxyGet,
  proxyPost,
  proxyPut,
  proxyDelete,
  redactSecrets,
  UnifiProxyError,
} from '@/lib/ubiquiti-proxy'
import {
  UNIFI_WRITE_AREAS,
  buildDiff,
  buildTargetLabel,
  buildUnifiEntityPath,
  detectDrift,
  normalizeUnifiChanges,
  parseUnifiEntityPath,
  snapshotFields,
  validateUnifiStagedChange,
  type UnifiStagedChangeInput,
  type UnifiWriteAreaSpec,
} from './staged-writes-core'
import type { StageResult, ExecuteResult } from './staged-writes'

const TTL_MINUTES = Number(process.env.CONNECTOR_STAGED_WRITE_TTL_MINUTES || 60)

export function assertUnifiWritesEnabled(): void {
  if (process.env.CONNECTOR_UNIFI_WRITES_ENABLED !== 'true') {
    throw new Error(
      'UniFi writes are disabled: set CONNECTOR_UNIFI_WRITES_ENABLED=true in Vercel env vars to enable them (covers both direct device/client actions and staged config changes). UniFi read tools are unaffected.'
    )
  }
}

function approvalUrl(): string {
  return `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/admin/connector/staged-writes`
}

async function expireOverdue(): Promise<void> {
  await prisma.connectorStagedWrite.updateMany({
    where: { status: { in: ['pending_approval', 'approved'] }, expiresAt: { lt: new Date() } },
    data: { status: 'expired' },
  })
}

/** Item path for one existing resource (update/delete/snapshot). */
function itemPath(spec: UnifiWriteAreaSpec, siteId: string, targetId: string): string {
  return `${spec.collectionPath(siteId)}/${encodeURIComponent(targetId)}`
}

/** Redacted, allowlist-scoped snapshot of a live UniFi resource. */
function unifiSnapshot(spec: UnifiWriteAreaSpec, row: Record<string, unknown>): Record<string, unknown> {
  return redactSecrets(snapshotFields(spec, row))
}

export async function stageUnifiWrite(
  input: UnifiStagedChangeInput & { reason?: string; stagedBy: string },
): Promise<StageResult> {
  assertUnifiWritesEnabled()
  // Expand convenience inputs / apply create-defaults (unifi_network) BEFORE
  // validation, so the gate validates, diffs and writes only real API fields.
  const changes = normalizeUnifiChanges(input.area, input.operation, input.changes)
  const spec = validateUnifiStagedChange({ ...input, changes })

  let before: Record<string, unknown> | null = null
  let targetLabel: string
  let entityPath: string

  if (input.operation === 'update' || input.operation === 'delete') {
    const path = itemPath(spec, input.siteId, input.targetId!)
    let row: Record<string, unknown>
    try {
      row = await proxyGet<Record<string, unknown>>(input.consoleId, path)
    } catch (err) {
      if (err instanceof UnifiProxyError && err.code === 'NOT_FOUND') {
        throw new Error(`${spec.label} '${input.targetId}' not found at site ${input.siteId} — nothing staged. (${err.message})`)
      }
      throw err
    }
    before = unifiSnapshot(spec, row)
    targetLabel = `${buildTargetLabel(spec, row, input.targetId)} @ site ${input.siteId}`
    entityPath = buildUnifiEntityPath(input.consoleId, path)
    if (spec.area === 'unifi_network' && input.operation === 'delete') {
      // Deleting a network that WLANs/zones/policies still reference can take
      // clients down site-wide — surface the reference state to the approver,
      // including when the check itself failed ("unknown" ≠ "none").
      try {
        const refs = await proxyGet<{ data?: unknown[] } | unknown[]>(input.consoleId, `${path}/references`)
        const count = Array.isArray(refs) ? refs.length : (refs?.data?.length ?? 0)
        if (count > 0) {
          targetLabel += ` — WARNING: referenced by ${count} other object(s); deletion may be rejected or break them`
        }
      } catch {
        targetLabel += ' — WARNING: reference check unavailable; could not confirm nothing depends on this network'
      }
    }
  } else {
    targetLabel = `${buildTargetLabel(spec, changes, undefined)} @ site ${input.siteId}`
    entityPath = buildUnifiEntityPath(input.consoleId, spec.collectionPath(input.siteId))
  }

  const proposed = { ...changes }
  const diff = buildDiff(input.operation, before, input.operation === 'delete' ? {} : proposed)
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000)

  const row = await prisma.connectorStagedWrite.create({
    data: {
      area: spec.area,
      operation: input.operation,
      targetSystem: 'unifi',
      entityPath,
      entityId: null,
      parentId: null,
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
    note: `NOTHING has been written to UniFi. A staff member must approve this at ${approvalUrl()} (system_settings permission), then call unifi_execute_staged_write with this id. Expires ${expiresAt.toISOString()}.`,
  }
}

export async function executeUnifiStagedWrite(id: string): Promise<ExecuteResult> {
  assertUnifiWritesEnabled()
  await expireOverdue()
  const row = await prisma.connectorStagedWrite.findUnique({ where: { id } })
  if (!row) throw new Error('Staged write not found.')
  if (row.targetSystem !== 'unifi') {
    throw new Error(`This staged write targets ${row.targetSystem}, not UniFi — execute it with autotask_execute_staged_write.`)
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
  const failWith = async (message: string, status = 'failed'): Promise<never> => {
    await prisma.connectorStagedWrite.update({ where: { id }, data: { status, error: message } })
    throw new HandledStageError(message)
  }

  try {
    const spec = UNIFI_WRITE_AREAS[row.area]
    if (!spec) return await failWith(`UniFi write area '${row.area}' no longer exists.`)
    const parsed = parseUnifiEntityPath(row.entityPath)
    if (!parsed) return await failWith(`Cannot parse the staged UniFi target path '${row.entityPath}'.`)
    const { consoleId, resourcePath } = parsed
    const proposed = row.proposed as Record<string, unknown>
    const before = (row.before ?? null) as Record<string, unknown> | null

    let apiResult: unknown
    let verification: unknown

    if (row.operation === 'update') {
      // Drift check: if the live record moved since staging, abort — the
      // approved diff no longer describes reality.
      const liveFull = await proxyGet<Record<string, unknown>>(consoleId, resourcePath).catch((err) =>
        err instanceof UnifiProxyError && err.code === 'NOT_FOUND' ? null : Promise.reject(err),
      )
      const drifted = detectDrift(before, liveFull ? unifiSnapshot(spec, liveFull) : null)
      if (drifted.length) {
        return await failWith(
          `Live UniFi record changed since staging (fields: ${drifted.join(', ')}). Nothing written — restage to see the current values.`,
          'drifted'
        )
      }
      // GET→merge→PUT: the Integration API replaces the object on PUT, so
      // send the live object with only the approved fields changed. The PUT
      // response echoes the full object (passphrases included) — redact
      // before it lands in the audit row.
      apiResult = redactSecrets((await proxyPut<Record<string, unknown>>(consoleId, resourcePath, { ...liveFull, ...proposed })) ?? { updated: true })
      // The write has APPLIED — a failed read-back must not mark the row
      // 'failed' (audit dishonesty); record that verification was unavailable.
      verification = await proxyGet<Record<string, unknown>>(consoleId, resourcePath).then(
        (after) => unifiSnapshot(spec, after),
        (err) => ({ verified: false, verifyError: err instanceof Error ? err.message : String(err) }),
      )
    } else if (row.operation === 'create') {
      const created = await proxyPost<Record<string, unknown>>(consoleId, resourcePath, proposed)
      apiResult = redactSecrets(created ?? { note: 'create returned no body' })
      verification = created ? unifiSnapshot(spec, created) : null
    } else {
      const liveFull = await proxyGet<Record<string, unknown>>(consoleId, resourcePath).catch((err) =>
        err instanceof UnifiProxyError && err.code === 'NOT_FOUND' ? null : Promise.reject(err),
      )
      const drifted = detectDrift(before, liveFull ? unifiSnapshot(spec, liveFull) : null)
      if (drifted.length && liveFull) {
        return await failWith(
          `Live UniFi record changed since staging (fields: ${drifted.join(', ')}). Nothing deleted — restage to review.`,
          'drifted'
        )
      }
      apiResult = redactSecrets((await proxyDelete<Record<string, unknown>>(consoleId, resourcePath)) ?? { deleted: true })
      // Tri-state read-back: NOT_FOUND confirms the delete; any other read
      // failure means UNVERIFIED, not "still exists".
      verification = await proxyGet<Record<string, unknown>>(consoleId, resourcePath).then(
        () => ({ deleted: false, note: 'object still readable after delete — check in unifi.ui.com' }),
        (err) =>
          err instanceof UnifiProxyError && err.code === 'NOT_FOUND'
            ? { deleted: true }
            : { deleted: 'unverified', verifyError: err instanceof Error ? err.message : String(err) },
      )
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
