/**
 * Stale Disposition Surfacing — C16/F4
 *
 * Compliance evidence frameworks (SOC 2, CMMC, ISO 27001 etc.) all require
 * periodic re-review of accepted risks and active remediation work. This
 * module finds dispositions that look stale so the cockpit can surface
 * them for staff attention.
 *
 * Definitions:
 *   - 'accepted_risk' older than ACCEPTED_RISK_REVIEW_DAYS without a
 *     lastReviewedAt update → needs re-attestation
 *   - 'scheduled' / 'in_progress' past dueDate → overdue
 *   - 'open' for more than OPEN_TRIAGE_DAYS without ever being triaged
 *     (lastReviewedAt is still null) → un-triaged backlog
 *   - 'deferred' past deferredUntil → ready to re-enter the pipeline (this
 *     one lives on compliance_pending_changes, not dispositions; included
 *     for cockpit completeness)
 *
 * No side effects — purely a query. The cockpit (P2) renders the result
 * as a "needs attention" panel. The disposition status itself doesn't
 * auto-change; staff must explicitly re-review.
 */

import type { PoolClient } from 'pg'
import { getPool } from '@/lib/db-pool'

/** Re-review cadence for accepted_risk dispositions (auditor expectation: annual). */
export const ACCEPTED_RISK_REVIEW_DAYS = 90

/** How long an 'open' disposition can sit without being looked at before flagging. */
export const OPEN_TRIAGE_DAYS = 30

export type StaleReason =
  | 'accepted_risk_review_due'
  | 'scheduled_overdue'
  | 'in_progress_overdue'
  | 'open_untriaged'
  | 'deferred_due'

export interface StaleDisposition {
  id: string | null
  companyId: string
  frameworkId: string
  controlId: string
  lifecycleStatus: string
  reason: StaleReason
  /** Days the row has been stale by. Larger = more urgent. */
  daysStale: number
  /** lastReviewedAt or dueDate or deferredUntil, depending on reason. */
  staleAnchorAt: string | null
  /** Assignee email (so cockpit can show "you have N stale items"). */
  assignedTo: string | null
}

/**
 * Find all stale dispositions for one company. Returns up to `limit` rows
 * ordered by daysStale DESC.
 */
export async function findStaleDispositions(
  companyId: string,
  limit = 100
): Promise<StaleDisposition[]> {
  return runWithClient(async (client) => {
    const rows: StaleDisposition[] = []

    // Accepted-risk reviews coming due.
    const acceptedRes = await client.query<{
      id: string
      controlId: string
      frameworkId: string
      assignedTo: string | null
      anchor: string
      daysStale: string
    }>(
      `SELECT id, "controlId", "frameworkId", "assignedTo",
              COALESCE("lastReviewedAt", "decidedAt", "createdAt")::text AS anchor,
              FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE("lastReviewedAt", "decidedAt", "createdAt"))) / 86400)::text AS "daysStale"
       FROM compliance_finding_dispositions
       WHERE "companyId" = $1
         AND "lifecycleStatus" = 'accepted_risk'
         AND COALESCE("lastReviewedAt", "decidedAt", "createdAt") < NOW() - INTERVAL '${ACCEPTED_RISK_REVIEW_DAYS} days'
       ORDER BY COALESCE("lastReviewedAt", "decidedAt", "createdAt") ASC
       LIMIT $2`,
      [companyId, limit]
    )
    for (const r of acceptedRes.rows) {
      rows.push({
        id: r.id,
        companyId,
        frameworkId: r.frameworkId,
        controlId: r.controlId,
        lifecycleStatus: 'accepted_risk',
        reason: 'accepted_risk_review_due',
        daysStale: parseInt(r.daysStale, 10),
        staleAnchorAt: r.anchor,
        assignedTo: r.assignedTo,
      })
    }

    // Scheduled / in_progress past dueDate.
    const overdueRes = await client.query<{
      id: string
      controlId: string
      frameworkId: string
      lifecycleStatus: string
      assignedTo: string | null
      anchor: string
      daysStale: string
    }>(
      `SELECT id, "controlId", "frameworkId", "lifecycleStatus", "assignedTo",
              "dueDate"::text AS anchor,
              FLOOR(EXTRACT(EPOCH FROM (NOW() - "dueDate")) / 86400)::text AS "daysStale"
       FROM compliance_finding_dispositions
       WHERE "companyId" = $1
         AND "lifecycleStatus" IN ('scheduled', 'in_progress')
         AND "dueDate" IS NOT NULL
         AND "dueDate" < NOW()
       ORDER BY "dueDate" ASC
       LIMIT $2`,
      [companyId, limit]
    )
    for (const r of overdueRes.rows) {
      rows.push({
        id: r.id,
        companyId,
        frameworkId: r.frameworkId,
        controlId: r.controlId,
        lifecycleStatus: r.lifecycleStatus,
        reason: r.lifecycleStatus === 'scheduled' ? 'scheduled_overdue' : 'in_progress_overdue',
        daysStale: parseInt(r.daysStale, 10),
        staleAnchorAt: r.anchor,
        assignedTo: r.assignedTo,
      })
    }

    // Open + un-triaged for > OPEN_TRIAGE_DAYS.
    const untriagedRes = await client.query<{
      id: string
      controlId: string
      frameworkId: string
      assignedTo: string | null
      anchor: string
      daysStale: string
    }>(
      `SELECT id, "controlId", "frameworkId", "assignedTo",
              "createdAt"::text AS anchor,
              FLOOR(EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 86400)::text AS "daysStale"
       FROM compliance_finding_dispositions
       WHERE "companyId" = $1
         AND "lifecycleStatus" = 'open'
         AND "lastReviewedAt" IS NULL
         AND "createdAt" < NOW() - INTERVAL '${OPEN_TRIAGE_DAYS} days'
       ORDER BY "createdAt" ASC
       LIMIT $2`,
      [companyId, limit]
    )
    for (const r of untriagedRes.rows) {
      rows.push({
        id: r.id,
        companyId,
        frameworkId: r.frameworkId,
        controlId: r.controlId,
        lifecycleStatus: 'open',
        reason: 'open_untriaged',
        daysStale: parseInt(r.daysStale, 10),
        staleAnchorAt: r.anchor,
        assignedTo: r.assignedTo,
      })
    }

    // Deferred pending changes whose deferredUntil has passed. These live on
    // compliance_pending_changes, not dispositions — surfaced in the same
    // cockpit panel for staff convenience.
    const deferredRes = await client.query<{
      id: string
      actionId: string
      anchor: string
      daysStale: string
    }>(
      `SELECT id, "actionId",
              "deferredUntil"::text AS anchor,
              FLOOR(EXTRACT(EPOCH FROM (NOW() - "deferredUntil")) / 86400)::text AS "daysStale"
       FROM compliance_pending_changes
       WHERE "companyId" = $1
         AND status = 'deferred'
         AND "deferredUntil" IS NOT NULL
         AND "deferredUntil" < NOW()
       ORDER BY "deferredUntil" ASC
       LIMIT $2`,
      [companyId, limit]
    )
    for (const r of deferredRes.rows) {
      rows.push({
        id: r.id,
        companyId,
        // Pending changes carry actionId, not (framework, control). Use the
        // actionId as a stand-in label; the cockpit can dereference via the
        // pending-change row if it wants details.
        frameworkId: 'pending_change',
        controlId: r.actionId,
        lifecycleStatus: 'deferred',
        reason: 'deferred_due',
        daysStale: parseInt(r.daysStale, 10),
        staleAnchorAt: r.anchor,
        assignedTo: null,
      })
    }

    rows.sort((a, b) => b.daysStale - a.daysStale)
    return rows.slice(0, limit)
  })
}

async function runWithClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}
