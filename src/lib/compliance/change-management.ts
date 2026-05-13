/**
 * Compliance Change Management — shared helpers used by API routes.
 *
 * Keeps the route handlers in /api/compliance/[companyId]/changes and
 * /bundles thin: lifecycle transitions, audit-log writes, and shape
 * mapping live here so the same state machine applies to every caller.
 */

import type { PoolClient } from 'pg'
import { getPool } from '@/lib/db-pool'
import { getRemediationAction } from './actions/catalog'

export const PENDING_CHANGE_STATUSES = [
  'drafted',
  'bundled',
  'awaiting_customer',
  'customer_declined',
  'deferred',
  'scheduled',
  'deploying',
  'verifying',
  'complete',
  'rolled_back',
  'abandoned',
] as const

export type PendingChangeStatus = (typeof PENDING_CHANGE_STATUSES)[number]

export const BUNDLE_STATUSES = [
  'drafted',
  'awaiting_customer',
  'partially_approved',
  'fully_approved',
  'scheduled',
  'deploying',
  'complete',
  'cancelled',
] as const

export type BundleStatus = (typeof BUNDLE_STATUSES)[number]

export const CUSTOMER_DECISIONS = ['approved', 'declined', 'deferred'] as const

export type CustomerDecision = (typeof CUSTOMER_DECISIONS)[number]

/** Audit log entry helper. */
export async function writeAudit(
  client: PoolClient,
  args: {
    companyId: string
    action: string
    actor: string
    details: Record<string, unknown>
  }
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO compliance_audit_log ("companyId", action, actor, details)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [args.companyId, args.action, args.actor, JSON.stringify(args.details)]
    )
  } catch (err) {
    console.error('[change-management] audit log write failed:', err)
  }
}

export interface PendingChangeRow {
  id: string
  companyId: string
  actionId: string
  actionVersion: string
  linkedFindingIds: string[]
  customerImpactSummary: string
  internalNotes: string | null
  status: PendingChangeStatus
  bundleId: string | null
  deferredUntil: string | null
  communicatedAt: string | null
  communicatedBy: string | null
  communicationMethod: string | null
  customerReplyReference: string | null
  scheduledFor: string | null
  deployedAt: string | null
  deployedBy: string | null
  verifiedAt: string | null
  verificationResult: Record<string, unknown> | null
  rolledBackAt: string | null
  rolledBackReason: string | null
  createdAt: string
  createdBy: string
  updatedAt: string
}

const PENDING_CHANGE_COLUMNS = `
  id, "companyId", "actionId", "actionVersion", "linkedFindingIds",
  "customerImpactSummary", "internalNotes", status, "bundleId",
  "deferredUntil", "communicatedAt", "communicatedBy", "communicationMethod",
  "customerReplyReference", "scheduledFor", "deployedAt", "deployedBy",
  "verifiedAt", "verificationResult", "rolledBackAt", "rolledBackReason",
  "createdAt", "createdBy", "updatedAt"
`

/** Load a pending change scoped to its company. */
export async function loadPendingChange(
  client: PoolClient,
  companyId: string,
  id: string
): Promise<PendingChangeRow | null> {
  const res = await client.query<PendingChangeRow>(
    `SELECT ${PENDING_CHANGE_COLUMNS}
     FROM compliance_pending_changes
     WHERE id = $1 AND "companyId" = $2`,
    [id, companyId]
  )
  return res.rows[0] ?? null
}

/** Validate the proposed status transition; throws on illegal moves. */
export function assertStatusTransition(
  from: PendingChangeStatus,
  to: PendingChangeStatus
): void {
  if (from === to) return
  const allowed: Record<PendingChangeStatus, PendingChangeStatus[]> = {
    drafted: ['bundled', 'abandoned'],
    bundled: ['awaiting_customer', 'drafted', 'abandoned'],
    awaiting_customer: ['scheduled', 'customer_declined', 'deferred', 'bundled'],
    customer_declined: [], // terminal for this iteration
    deferred: ['drafted', 'bundled'], // re-enter the pipeline
    scheduled: ['deploying', 'awaiting_customer', 'abandoned'],
    deploying: ['verifying', 'rolled_back'],
    verifying: ['complete', 'rolled_back'],
    complete: [], // terminal
    rolled_back: ['drafted'], // re-stage allowed
    abandoned: [], // terminal
  }
  const ok = allowed[from]?.includes(to) ?? false
  if (!ok) {
    throw new Error(`illegal pending-change status transition: ${from} -> ${to}`)
  }
}

/** Validate that the (actionId, version) referenced by a pending change still exists. */
export function assertActionExists(actionId: string): void {
  const action = getRemediationAction(actionId)
  if (!action) {
    throw new Error(`unknown action id: ${actionId}`)
  }
}

/** Shared pool helper. */
export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}
