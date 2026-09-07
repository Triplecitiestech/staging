import { NextRequest, NextResponse } from 'next/server'
import { classifyError } from '@/lib/resilience'
import { getPool } from '@/lib/db-pool'
import {
  createGraphClient,
  getTenantCredentialsBySlug,
} from '@/lib/graph'
import { withDbRetry } from '@/lib/resilience'
import {
  evaluateDeletionGuard,
  describeVerdict,
  type DeletionGuardVerdict,
  type SubjectLiveState,
} from '@/lib/hr/deletion-guard'
import type { PoolClient } from 'pg'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const pool = getPool()

/**
 * Thrown to leave the deletion block early without it looking like a failure.
 * The block's own catch treats it as a clean skip, not an error.
 */
class SkipDeletions extends Error {
  constructor() {
    super('deletions skipped')
    this.name = 'SkipDeletions'
  }
}

/**
 * Process Scheduled HR Requests Cron
 * Runs daily at 5:01 AM EST via Vercel Cron
 *
 * Handles three types:
 * 1. Scheduled offboardings: last_day <= today → triggers full offboarding pipeline
 * 2. Scheduled onboardings: start_date <= today → enables locked account
 * 3. Scheduled deletions: scheduled_deletion_date <= today → permanently deletes M365 account
 */
export async function GET(request: NextRequest) {
  return handleCron(request)
}

export async function POST(request: NextRequest) {
  return handleCron(request)
}

async function handleCron(request: NextRequest) {
  // Auth: Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret) {
    const expected = `Bearer ${cronSecret}`
    if (authHeader !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let client
  try {
    client = await withDbRetry(() => pool.connect(), 'cron/process-scheduled pool.connect')
  } catch (connErr) {
    const msg = connErr instanceof Error ? connErr.message : String(connErr)
    console.error('[cron/process-scheduled] Database connection failed:', msg)
    return NextResponse.json({ error: `Database connection failed: ${msg}` }, { status: 503 })
  }

  try {
    // Get today's date in EST
    const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const todayEst = estNow.toISOString().slice(0, 10)

    // Find ALL scheduled requests (both onboarding and offboarding)
    const result = await client.query<{
      id: string
      type: string
      answers: Record<string, unknown>
      company_slug: string
      target_user_id: string | null
      target_upn: string | null
    }>(
      `SELECT id, type, answers, company_slug, target_user_id, target_upn
       FROM hr_requests
       WHERE status = 'scheduled'
       ORDER BY created_at ASC`
    )

    // Separate into due offboardings and due onboardings
    const dueOffboardings: typeof result.rows = []
    const dueOnboardings: typeof result.rows = []

    for (const row of result.rows) {
      const answers = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers
      const a = answers as Record<string, string>

      if (row.type === 'offboarding') {
        if (a.last_day && a.last_day <= todayEst) {
          dueOffboardings.push(row)
        }
      } else if (row.type === 'onboarding') {
        if (a.start_date && a.start_date <= todayEst) {
          dueOnboardings.push(row)
        }
      }
    }

    const results: Array<{ id: string; type: string; status: string; error?: string }> = []

    // --- Process due offboardings by calling the process endpoint ---
    if (dueOffboardings.length > 0) {
      const processUrl = new URL('/api/hr/process', request.url)
      const internalSecret = process.env.INTERNAL_SECRET ?? ''

      for (const req of dueOffboardings) {
        try {
          const res = await fetch(processUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': internalSecret,
            },
            body: JSON.stringify({ requestId: req.id, executeScheduled: true }),
          })

          const data = await res.json()
          results.push({ id: req.id, type: 'offboarding', status: res.ok ? 'processed' : 'failed', error: data.error })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          results.push({ id: req.id, type: 'offboarding', status: 'failed', error: msg })
          console.error(`[cron/process-scheduled] Failed to process offboarding ${req.id}:`, msg)
        }
      }
    }

    // --- Process due onboardings by enabling locked accounts ---
    if (dueOnboardings.length > 0) {
      for (const req of dueOnboardings) {
        try {
          if (!req.target_user_id || !req.company_slug) {
            results.push({ id: req.id, type: 'onboarding', status: 'skipped', error: 'Missing target_user_id or company_slug' })
            continue
          }

          // Get M365 credentials for this company
          const creds = await getTenantCredentialsBySlug(req.company_slug)
          if (!creds) {
            results.push({ id: req.id, type: 'onboarding', status: 'failed', error: 'No M365 credentials for company' })
            continue
          }

          const graph = createGraphClient(creds)

          // Enable the account
          await graph.enableAccount(req.target_user_id)

          // Update request status to completed
          await client.query(
            `UPDATE hr_requests
             SET status = 'completed',
                 completed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [req.id]
          )

          // Add Autotask ticket note if we have the ticket info
          const answers = typeof req.answers === 'string' ? JSON.parse(req.answers) : req.answers
          const a = answers as Record<string, string>
          const fullName = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || req.target_upn || 'employee'

          // Get ticket ID for notes
          const ticketRes = await client.query<{ autotask_ticket_id: number }>(
            `SELECT autotask_ticket_id FROM hr_requests WHERE id = $1`,
            [req.id]
          )
          const ticketId = ticketRes.rows[0]?.autotask_ticket_id

          if (ticketId) {
            const autotask = new (await import('@/lib/autotask')).AutotaskClient()
            try {
              // Add note that account has been unlocked
              await autotask.createTicketNote(ticketId, {
                title: 'Account Unlocked — Start Date Reached',
                description: `The Microsoft 365 account for ${fullName} (${req.target_upn}) has been automatically unlocked.\n\nStart date: ${a.start_date}\nThe employee can now sign in with their credentials.`,
                noteType: 1,
                publish: 1,
              })

              // Close the ticket (status=5)
              const baseUrl = (process.env.AUTOTASK_API_BASE_URL ?? '').replace(/\/$/, '')
              await fetch(`${baseUrl}/V1.0/Tickets`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  UserName: process.env.AUTOTASK_API_USERNAME ?? '',
                  Secret: process.env.AUTOTASK_API_SECRET ?? '',
                  ApiIntegrationCode: process.env.AUTOTASK_API_INTEGRATION_CODE ?? '',
                },
                body: JSON.stringify({ id: ticketId, status: 5 }),
              })
            } catch (noteErr) {
              console.warn(`[cron/process-scheduled] Ticket update failed for ${req.id}:`, noteErr instanceof Error ? noteErr.message : noteErr)
            }
          }

          results.push({ id: req.id, type: 'onboarding', status: 'processed' })
          console.log(`[cron/process-scheduled] Unlocked account for ${fullName} (${req.target_upn})`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          results.push({ id: req.id, type: 'onboarding', status: 'failed', error: msg })
          console.error(`[cron/process-scheduled] Failed to unlock onboarding ${req.id}:`, msg)
        }
      }
    }

    // --- Process scheduled account deletions (30-day hold expired) ---
    try {
      // Ensure column exists before querying
      await client.query(`ALTER TABLE hr_requests ADD COLUMN IF NOT EXISTS scheduled_deletion_date DATE`).catch(() => {})

      // Advance warnings run FIRST and regardless of the kill switch: a
      // warning deletes nothing, and a pending deletion nobody can see is the
      // condition that made 2026-09-03 possible.
      const warned = await warnUpcomingDeletions(client, todayEst)
      if (warned > 0) {
        results.push({
          id: 'deletion-warnings',
          type: 'deletion',
          status: `warned:${warned}`,
        })
      }

      // KILL SWITCH. Default is OFF: scheduled deletion is the only
      // irreversible action in this system, and it stays disabled until
      // someone deliberately turns it on. Flip to 'true' to enable.
      if (process.env.M365_SCHEDULED_DELETION_ENABLED !== 'true') {
        const pending = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM hr_requests
            WHERE scheduled_deletion_date IS NOT NULL
              AND scheduled_deletion_date <= $1::date
              AND status = 'completed'
              AND target_user_id IS NOT NULL`,
          [todayEst]
        )
        const due = Number(pending.rows[0]?.count ?? '0')
        if (due > 0) {
          console.warn(
            `[cron/process-scheduled] ${due} account deletion(s) are due but M365_SCHEDULED_DELETION_ENABLED is not 'true' — none executed.`
          )
        }
        results.push({
          id: 'kill-switch',
          type: 'deletion',
          status: 'disabled',
          error: `M365_SCHEDULED_DELETION_ENABLED is not 'true'; ${due} due deletion(s) skipped`,
        })
        throw new SkipDeletions()
      }

      const deletionResult = await client.query<{
        id: string
        type: string
        answers: Record<string, unknown>
        company_slug: string
        target_user_id: string | null
        target_upn: string | null
        autotask_ticket_id: number | null
        scheduled_deletion_date: string
        completed_at: string | null
      }>(
        `SELECT id, type, answers, company_slug, target_user_id, target_upn,
                autotask_ticket_id, scheduled_deletion_date::text, completed_at
         FROM hr_requests
         WHERE scheduled_deletion_date IS NOT NULL
           AND scheduled_deletion_date <= $1::date
           AND status = 'completed'
           AND target_user_id IS NOT NULL
         ORDER BY scheduled_deletion_date ASC`,
        [todayEst]
      )

      for (const req of deletionResult.rows) {
        try {
          if (!req.target_user_id || !req.company_slug) {
            results.push({ id: req.id, type: 'deletion', status: 'skipped', error: 'Missing target_user_id or company_slug' })
            continue
          }

          const creds = await getTenantCredentialsBySlug(req.company_slug)
          if (!creds) {
            results.push({ id: req.id, type: 'deletion', status: 'failed', error: 'No M365 credentials for company' })
            continue
          }

          const graph = createGraphClient(creds)
          const answers = typeof req.answers === 'string' ? JSON.parse(req.answers) : req.answers
          const a = answers as Record<string, string>
          const fullName = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || req.target_upn || 'employee'
          const subjectLabel = `${fullName} (${req.target_upn ?? req.target_user_id})`

          // ---------------------------------------------------------------
          // PRECONDITION GUARD — the safeguard this whole job was missing.
          //
          // Re-read the account from live Graph and abort unless EVERY gate
          // returns an explicit pass. An unreadable gate is not a pass. See
          // src/lib/hr/deletion-guard.ts and
          // docs/incidents/2026-09-03-tribros-scheduled-deletion-rca.md
          // ---------------------------------------------------------------
          let verdict: DeletionGuardVerdict
          try {
            const live = await graph.getUserDeletionState(req.target_user_id)
            verdict = evaluateDeletionGuard({
              scheduledObjectId: req.target_user_id,
              scheduledUpn: req.target_upn,
              scheduledDeletionDate: req.scheduled_deletion_date,
              offboardedAt: req.completed_at ? new Date(req.completed_at).toISOString() : null,
              live: {
                ...live,
                unavailable: live.unavailable as SubjectLiveState['unavailable'],
              },
            })
          } catch (guardErr) {
            // The guard itself failed. Fail SAFE: treat as abort, never as a
            // pass. A deletion that runs because a guard errored is a worse
            // defect than the one this replaces.
            const msg = guardErr instanceof Error ? guardErr.message : String(guardErr)
            console.error(`[cron/process-scheduled] Deletion guard errored for ${req.id}: ${msg}`)
            verdict = {
              decision: 'abort',
              gates: [],
              blockingGates: [],
              looksReinstated: false,
              summary: `ABORTED: the precondition guard could not run at all (${msg}).`,
            }
          }

          if (verdict.decision === 'abort') {
            console.warn(
              `[cron/process-scheduled] DELETION ABORTED for ${subjectLabel}: ${verdict.summary}`
            )

            // A reinstated account is a permanent cancel — the intent is dead.
            // An unreadable check is not: leave it scheduled so it retries once
            // the read works, rather than silently dropping a real deletion.
            if (verdict.looksReinstated) {
              await client.query(
                `UPDATE hr_requests
                 SET scheduled_deletion_date = NULL, updated_at = NOW()
                 WHERE id = $1`,
                [req.id]
              )
            }

            await escalateAbortedDeletion(client, req, verdict, subjectLabel, todayEst)
            results.push({
              id: req.id,
              type: 'deletion',
              status: verdict.looksReinstated ? 'cancelled_reinstated' : 'aborted_unverified',
            })
            continue
          }

          // Every gate passed. Proceed.
          await graph.deleteUser(req.target_user_id)

          // Clear the scheduled_deletion_date so it doesn't re-process
          await client.query(
            `UPDATE hr_requests
             SET scheduled_deletion_date = NULL,
                 updated_at = NOW()
             WHERE id = $1`,
            [req.id]
          )

          console.log(`[cron/process-scheduled] Deleted account for ${fullName} (${req.target_upn}) — 30-day hold expired`)

          // Add internal-only note to the original Autotask ticket (publish=2 = internal)
          // Do NOT change ticket status
          if (req.autotask_ticket_id) {
            try {
              const autotask = new (await import('@/lib/autotask')).AutotaskClient()
              await autotask.createTicketNote(req.autotask_ticket_id, {
                title: 'Account Deleted — 30-Day Hold Expired',
                description: [
                  `The Microsoft 365 account for ${fullName} (${req.target_upn}) has been permanently deleted.`,
                  '',
                  `Scheduled deletion date: ${req.scheduled_deletion_date}`,
                  `Executed: ${todayEst}`,
                  '',
                  'This action was performed automatically by the HR automation system after the 30-day hold period expired.',
                  '',
                  'Before deleting, the platform re-read the account from Microsoft Graph and confirmed it was still disabled, unlicensed, ungrouped and unused. Every check passed.',
                  '',
                  'Microsoft Entra soft-deletes the object: it can be restored from the tenant\'s deleted-users container for a limited period, after which it is permanently unrecoverable. Consult current Microsoft documentation for the exact window before relying on it.',
                ].join('\n'),
                noteType: 1,
                publish: 2, // Internal only — not visible to customer
              })
            } catch (noteErr) {
              console.warn(`[cron/process-scheduled] Ticket note failed for deletion ${req.id}:`, noteErr instanceof Error ? noteErr.message : noteErr)
            }
          }

          // Write audit log
          try {
            await client.query(
              `INSERT INTO hr_audit_logs
                 (company_id, request_id, actor, action, resource, details, severity, created_at)
               SELECT company_id, $1, 'system', 'account_deleted', $2, $3::jsonb, 'warning', NOW()
               FROM hr_requests WHERE id = $1`,
              [
                req.id,
                `user:${req.target_user_id}`,
                JSON.stringify({
                  targetUpn: req.target_upn,
                  fullName,
                  scheduledDate: req.scheduled_deletion_date,
                  executedDate: todayEst,
                  reason: '30-day hold expired (data_handling: delete_after_backup)',
                }),
              ]
            )
          } catch {
            // Non-fatal
          }

          results.push({ id: req.id, type: 'deletion', status: 'processed' })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          results.push({ id: req.id, type: 'deletion', status: 'failed', error: msg })
          console.error(`[cron/process-scheduled] Failed to delete account for ${req.id}:`, msg)
        }
      }
    } catch (delQueryErr) {
      if (delQueryErr instanceof SkipDeletions) {
        // Kill switch is off. Not an error — already recorded in `results`.
      } else {
        // A failure HERE means no deletion ran and nobody was told. Log it as
        // an error, not a warning: the previous "(non-fatal)" wording meant a
        // broken deletion pipeline looked identical to an idle one.
        const msg = delQueryErr instanceof Error ? delQueryErr.message : String(delQueryErr)
        console.error('[cron/process-scheduled] Scheduled deletion block FAILED:', msg)
        results.push({ id: 'deletion-block', type: 'deletion', status: 'failed', error: msg })
      }
    }

    if (results.length === 0) {
      return NextResponse.json({
        message: 'No scheduled HR requests due today',
        todayEst,
        checked: result.rows.length,
      })
    }

    console.log(`[cron/process-scheduled] Processed ${results.length} scheduled request(s)`)

    return NextResponse.json({
      message: `Processed ${results.length} scheduled HR request(s)`,
      todayEst,
      results,
    })
  } catch (err) {
    const classified = classifyError(err)
    console.error('[cron/process-scheduled] Cron error:', classified.message)

    if (classified.isTransient) {
      return NextResponse.json({
        success: false,
        transient: true,
        error: classified.message,
        errorCategory: classified.category,
      })
    }

    return NextResponse.json({ error: classified.message }, { status: 500 })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Deletion escalation + advance warning
//
// The 2026-09-03 deletion notified nobody: an internal note on a ticket that
// had been Complete for 30 days, deliberately without a status change, so no
// Autotask Event fired and no email went anywhere. The client discovered it
// nine hours later when the user could not sign in.
//
// So: an aborted deletion, and any deletion at all, gets its OWN ticket.
// A new ticket fires Autotask's "Created" event and lands in a queue where
// somebody looks. Reopening the original would corrupt its SLA and resolution
// metrics and its contact list is a month stale.
// ---------------------------------------------------------------------------

interface DeletionRequestRow {
  id: string
  company_slug: string
  target_upn: string | null
  target_user_id: string | null
  autotask_ticket_id: number | null
  scheduled_deletion_date: string
}

/** Autotask company id for the request's company, or null if not resolvable. */
async function autotaskCompanyIdFor(
  client: PoolClient,
  requestId: string
): Promise<number | null> {
  try {
    const res = await client.query<{ autotaskCompanyId: number | null }>(
      `SELECT c."autotaskCompanyId"
         FROM hr_requests r
         JOIN companies c ON c.id = r.company_id
        WHERE r.id = $1`,
      [requestId]
    )
    return res.rows[0]?.autotaskCompanyId ?? null
  } catch {
    return null
  }
}

/**
 * Raise a NEW Autotask ticket describing a deletion that was prevented, and
 * cross-reference it on the original offboarding ticket.
 *
 * Every write here is best-effort and internal-only: an abort has already
 * protected the customer's data, so a failure to log it must not turn into a
 * failure that deletes it.
 */
async function escalateAbortedDeletion(
  client: PoolClient,
  req: DeletionRequestRow,
  verdict: DeletionGuardVerdict,
  subjectLabel: string,
  todayEst: string
): Promise<void> {
  const body = describeVerdict(verdict, subjectLabel, req.scheduled_deletion_date)

  try {
    const autotask = new (await import('@/lib/autotask')).AutotaskClient()
    const companyId = await autotaskCompanyIdFor(client, req.id)

    if (companyId) {
      // Raw POST, matching how /api/hr/process creates its tickets — the
      // shared AutotaskClient exposes no ticket-create method and this is not
      // the place to add one.
      const baseUrl = (process.env.AUTOTASK_API_BASE_URL ?? '').replace(/\/$/, '')
      const due = new Date(Date.now() + 2 * 86_400_000).toISOString()
      let newTicketId: number | null = null
      try {
        const createRes = await fetch(`${baseUrl}/V1.0/Tickets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            UserName: process.env.AUTOTASK_API_USERNAME ?? '',
            Secret: process.env.AUTOTASK_API_SECRET ?? '',
            ApiIntegrationCode: process.env.AUTOTASK_API_INTEGRATION_CODE ?? '',
          },
          body: JSON.stringify({
            companyID: companyId,
            title: `Scheduled account deletion ABORTED — ${subjectLabel}`.slice(0, 255),
            description: body.slice(0, 8000),
            queueID: 29683490, // Help Desk
            status: 1, // New
            priority: verdict.looksReinstated ? 1 : 2, // 1 = High, 2 = Medium
            dueDateTime: due,
          }),
          signal: AbortSignal.timeout(15_000),
        })
        if (createRes.ok) {
          const created = (await createRes.json()) as { itemId?: number }
          newTicketId = created?.itemId ?? null
        } else {
          console.error(
            `[cron/process-scheduled] Abort-ticket create failed (${createRes.status}): ${await createRes.text()}`
          )
        }
      } catch (err) {
        console.error(
          '[cron/process-scheduled] Abort-ticket create threw:',
          err instanceof Error ? err.message : err
        )
      }

      // Cross-reference on the original offboarding ticket so the two connect.
      if (req.autotask_ticket_id) {
        await autotask
          .createTicketNote(req.autotask_ticket_id, {
            title: 'Scheduled Deletion Aborted — Raised On A New Ticket',
            description:
              `The 30-day account deletion for ${subjectLabel}, scheduled for ` +
              `${req.scheduled_deletion_date}, did NOT run. Preconditions were re-checked ` +
              `against live Microsoft Graph immediately before deleting and did not pass.\n\n` +
              `${verdict.summary}\n\n` +
              (newTicketId
                ? `Raised as ticket ${newTicketId} for follow-up. No data was deleted.`
                : `A follow-up ticket could not be created — see the platform logs. No data was deleted.`),
            noteType: 1,
            publish: 2,
          })
          .catch(() => {})
      }
    } else if (req.autotask_ticket_id) {
      // No Autotask company resolved — fall back to a note on the original.
      await autotask
        .createTicketNote(req.autotask_ticket_id, {
          title: 'Scheduled Deletion Aborted',
          description: body,
          noteType: 1,
          publish: 2,
        })
        .catch(() => {})
    }
  } catch (err) {
    console.error(
      `[cron/process-scheduled] Could not escalate aborted deletion for ${req.id}:`,
      err instanceof Error ? err.message : err
    )
  }

  // Audit row. actor names the job AND the human whose request armed it, so an
  // auditor is not left with the bare literal 'system'.
  try {
    await client.query(
      `INSERT INTO hr_audit_logs
         (company_id, request_id, actor, action, resource, details, severity, created_at)
       SELECT company_id,
              $1,
              'scheduled_job:process-scheduled-offboards on behalf of ' || COALESCE(submitted_by_email, 'unknown'),
              $2, $3, $4::jsonb, 'warning', NOW()
       FROM hr_requests WHERE id = $1`,
      [
        req.id,
        verdict.looksReinstated ? 'account_deletion_cancelled' : 'account_deletion_aborted',
        `user:${req.target_user_id}`,
        JSON.stringify({
          targetUpn: req.target_upn,
          scheduledDate: req.scheduled_deletion_date,
          evaluatedDate: todayEst,
          decision: verdict.decision,
          looksReinstated: verdict.looksReinstated,
          summary: verdict.summary,
          gates: verdict.gates.map((g) => ({
            gate: g.gate,
            passed: g.passed,
            evaluated: g.evaluated,
            detail: g.detail,
          })),
          executionMode: 'scheduled',
        }),
      ]
    )
  } catch {
    // Non-fatal — the ticket above is the durable record.
  }
}

/**
 * Post advance warnings on the original ticket at T-7 and T-1 so a pending
 * deletion is visible while there is still time to stop it. Previously the
 * first and only signal was the deletion itself.
 */
async function warnUpcomingDeletions(client: PoolClient, todayEst: string): Promise<number> {
  let warned = 0
  try {
    const { rows } = await client.query<{
      id: string
      target_upn: string | null
      autotask_ticket_id: number | null
      scheduled_deletion_date: string
      days_out: number
    }>(
      `SELECT id, target_upn, autotask_ticket_id, scheduled_deletion_date::text,
              (scheduled_deletion_date - $1::date) AS days_out
         FROM hr_requests
        WHERE scheduled_deletion_date IS NOT NULL
          AND status = 'completed'
          AND target_user_id IS NOT NULL
          AND (scheduled_deletion_date - $1::date) IN (7, 1)`,
      [todayEst]
    )

    if (rows.length === 0) return 0
    const autotask = new (await import('@/lib/autotask')).AutotaskClient()

    for (const row of rows) {
      if (!row.autotask_ticket_id) continue
      try {
        await autotask.createTicketNote(row.autotask_ticket_id, {
          title: `Account Deletion In ${row.days_out} Day${row.days_out === 1 ? '' : 's'} — ${row.scheduled_deletion_date}`,
          description:
            `The Microsoft 365 account for ${row.target_upn ?? 'this employee'} is scheduled to be ` +
            `deleted on ${row.scheduled_deletion_date}, in ${row.days_out} day` +
            `${row.days_out === 1 ? '' : 's'}.\n\n` +
            `Before deleting, the platform re-checks the account against live Microsoft Graph and ` +
            `aborts if it has been re-enabled, re-licensed, re-grouped or used. So a reinstated ` +
            `account will not be deleted by accident.\n\n` +
            `If this deletion should not happen at all, cancel it at ` +
            `/admin/hr/pending before ${row.scheduled_deletion_date}.`,
          noteType: 1,
          publish: 2,
        })
        warned++
      } catch (err) {
        console.warn(
          `[cron/process-scheduled] Could not post deletion warning for ${row.id}:`,
          err instanceof Error ? err.message : err
        )
      }
    }
  } catch (err) {
    console.warn(
      '[cron/process-scheduled] Deletion warning sweep failed:',
      err instanceof Error ? err.message : err
    )
  }
  return warned
}
