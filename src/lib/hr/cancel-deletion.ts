/**
 * Cancel a scheduled 30-day account deletion.
 *
 * WHY THIS EXISTS
 *
 * Until now there was no cancellation path of any kind. `hr_requests` was
 * written by exactly two files, the request route was GET-only, and the admin
 * HR page was a static diagram — yet the customer-visible note posted at
 * scheduling time told the client: "If the deletion needs to be cancelled,
 * update the HR request before the scheduled date." That instruction referred
 * to nothing that existed.
 *
 * Owner decision 2026-09-04: client contacts keep the ability to schedule
 * irreversible deletions with no TCT approval step. That makes a working
 * cancel — reachable by a human who notices in time — load-bearing rather
 * than a convenience.
 *
 * Two callers share this:
 *   1. A TCT staff member clicking cancel at /admin/hr/pending.
 *   2. The onboarding pipeline, when Graph returns ObjectConflict on
 *      POST /users for a UPN that has a deletion armed — the machine-readable
 *      proof that the person is being reinstated. That signal existed on
 *      2026-08-10 and was discarded into a ticket note.
 *
 * Clearing `scheduled_deletion_date` is the whole mechanism: the cron selects
 * on `scheduled_deletion_date IS NOT NULL`, so a null row can never be picked
 * up. Nothing else about the request is touched — the offboarding itself
 * stands, only the pending deletion is called off.
 */

import type { PoolClient } from 'pg'

export type CancelReason =
  /** A TCT staff member cancelled it deliberately. */
  | 'staff_cancelled'
  /** Graph reported the UPN already exists while re-onboarding the subject. */
  | 'superseded_by_onboarding'
  /** Live preconditions showed the account had been reinstated. */
  | 'reinstated_precondition_failed'

export interface CancelDeletionResult {
  /** True only when a row actually moved from armed to cancelled. */
  cancelled: boolean
  /** Why nothing changed, when cancelled is false. */
  reason:
    | 'ok'
    | 'not_found'
    | 'no_deletion_scheduled'
    | 'error'
  targetUpn: string | null
  targetUserId: string | null
  autotaskTicketId: number | null
  scheduledDeletionDate: string | null
  detail: string
}

/**
 * Clear a pending deletion and record who did it and why.
 *
 * Idempotent: cancelling an already-cancelled deletion reports
 * `no_deletion_scheduled` rather than pretending to have done something. The
 * caller must not describe a no-op as a cancellation — that is the
 * success-shaped-output failure this whole incident is about.
 */
export async function cancelScheduledDeletion(
  client: PoolClient,
  requestId: string,
  actor: string,
  reason: CancelReason,
  note?: string
): Promise<CancelDeletionResult> {
  const base: Omit<CancelDeletionResult, 'cancelled' | 'reason' | 'detail'> = {
    targetUpn: null,
    targetUserId: null,
    autotaskTicketId: null,
    scheduledDeletionDate: null,
  }

  try {
    // Clear it and return the prior state in one statement, so a concurrent
    // run cannot see the row as still-armed after we have cleared it.
    const { rows } = await client.query<{
      target_upn: string | null
      target_user_id: string | null
      autotask_ticket_id: number | null
      prior_date: string | null
    }>(
      `UPDATE hr_requests
          SET scheduled_deletion_date = NULL,
              updated_at = NOW()
        WHERE id = $1
          AND scheduled_deletion_date IS NOT NULL
      RETURNING target_upn, target_user_id, autotask_ticket_id,
                (SELECT scheduled_deletion_date::text
                   FROM hr_requests WHERE id = $1) AS prior_date`,
      [requestId]
    )

    if (rows.length === 0) {
      // Distinguish "no such request" from "nothing was armed" — they need
      // different answers in the UI.
      const exists = await client.query<{ id: string; sd: string | null }>(
        `SELECT id, scheduled_deletion_date::text AS sd FROM hr_requests WHERE id = $1`,
        [requestId]
      )
      if (exists.rows.length === 0) {
        return {
          ...base,
          cancelled: false,
          reason: 'not_found',
          detail: `No HR request with id ${requestId}.`,
        }
      }
      return {
        ...base,
        cancelled: false,
        reason: 'no_deletion_scheduled',
        detail:
          'That request has no account deletion armed. Either it never had one, or it has already been cancelled or executed. Nothing was changed.',
      }
    }

    const row = rows[0]

    await client
      .query(
        `INSERT INTO hr_audit_logs
           (company_id, request_id, actor, action, resource, details, severity, created_at)
         SELECT company_id, $1, $2, 'account_deletion_cancelled', $3, $4::jsonb, 'warning', NOW()
         FROM hr_requests WHERE id = $1`,
        [
          requestId,
          actor,
          `user:${row.target_user_id}`,
          JSON.stringify({
            targetUpn: row.target_upn,
            cancelReason: reason,
            note: note ?? null,
            executionMode: reason === 'staff_cancelled' ? 'interactive' : 'scheduled',
          }),
        ]
      )
      .catch(() => {
        // Non-fatal: the deletion is already disarmed, which is what matters.
      })

    return {
      cancelled: true,
      reason: 'ok',
      targetUpn: row.target_upn,
      targetUserId: row.target_user_id,
      autotaskTicketId: row.autotask_ticket_id,
      scheduledDeletionDate: row.prior_date,
      detail: `Scheduled deletion for ${row.target_upn ?? row.target_user_id ?? 'the subject'} has been cancelled. The account will not be deleted.`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ...base,
      cancelled: false,
      reason: 'error',
      detail: `Could not cancel the deletion: ${msg}`,
    }
  }
}

/**
 * Find requests with an armed deletion for a given subject in a given company.
 *
 * Matches on objectId when one is known, and on UPN otherwise. UPN is a WEAK
 * key — it is reassignable, it changes on rename, and a recreated account
 * carries the same UPN with a different objectId — so the caller is told which
 * key matched and must not treat a UPN match as proof of identity.
 */
export async function findArmedDeletionsForSubject(
  client: PoolClient,
  companySlug: string,
  opts: { objectId?: string | null; upn?: string | null }
): Promise<Array<{ id: string; matchedBy: 'object_id' | 'upn'; targetUpn: string | null; scheduledDeletionDate: string | null }>> {
  const out: Array<{
    id: string
    matchedBy: 'object_id' | 'upn'
    targetUpn: string | null
    scheduledDeletionDate: string | null
  }> = []

  if (opts.objectId) {
    const { rows } = await client.query<{ id: string; target_upn: string | null; sd: string | null }>(
      `SELECT id, target_upn, scheduled_deletion_date::text AS sd
         FROM hr_requests
        WHERE company_slug = $1
          AND target_user_id = $2
          AND scheduled_deletion_date IS NOT NULL`,
      [companySlug, opts.objectId]
    )
    for (const r of rows) {
      out.push({ id: r.id, matchedBy: 'object_id', targetUpn: r.target_upn, scheduledDeletionDate: r.sd })
    }
  }

  if (opts.upn) {
    const { rows } = await client.query<{ id: string; target_upn: string | null; sd: string | null }>(
      `SELECT id, target_upn, scheduled_deletion_date::text AS sd
         FROM hr_requests
        WHERE company_slug = $1
          AND LOWER(target_upn) = LOWER($2)
          AND scheduled_deletion_date IS NOT NULL`,
      [companySlug, opts.upn]
    )
    for (const r of rows) {
      if (!out.some((o) => o.id === r.id)) {
        out.push({ id: r.id, matchedBy: 'upn', targetUpn: r.target_upn, scheduledDeletionDate: r.sd })
      }
    }
  }

  return out
}
