import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import {
  createGraphClient,
  getTenantCredentialsBySlug,
} from '@/lib/graph'
import { withDbRetry } from '@/lib/resilience'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const pool = getPool()

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

      const deletionResult = await client.query<{
        id: string
        type: string
        answers: Record<string, unknown>
        company_slug: string
        target_user_id: string | null
        target_upn: string | null
        autotask_ticket_id: number | null
        scheduled_deletion_date: string
      }>(
        `SELECT id, type, answers, company_slug, target_user_id, target_upn,
                autotask_ticket_id, scheduled_deletion_date::text
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

          // Delete the user account from Azure AD
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
                title: 'Account Permanently Deleted — 30-Day Hold Expired',
                description: [
                  `The Microsoft 365 account for ${fullName} (${req.target_upn}) has been permanently deleted.`,
                  '',
                  `Scheduled deletion date: ${req.scheduled_deletion_date}`,
                  `Executed: ${todayEst}`,
                  '',
                  'This action was performed automatically by the HR automation system after the 30-day hold period expired.',
                  'The account can no longer be recovered from Azure AD.',
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
      console.warn('[cron/process-scheduled] Scheduled deletion query failed (non-fatal):', delQueryErr instanceof Error ? delQueryErr.message : delQueryErr)
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
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cron/process-scheduled] Cron error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    client.release()
  }
}
