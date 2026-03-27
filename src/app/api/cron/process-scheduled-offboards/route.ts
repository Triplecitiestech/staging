import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import {
  createGraphClient,
  getTenantCredentialsBySlug,
} from '@/lib/graph'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const pool = getPool()

/**
 * Process Scheduled HR Requests Cron
 * Runs daily at 12:01 AM EST via Vercel Cron
 *
 * Handles two types:
 * 1. Scheduled offboardings: last_day <= today → triggers full offboarding pipeline
 * 2. Scheduled onboardings: start_date <= today → enables locked account
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
    client = await pool.connect()
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
