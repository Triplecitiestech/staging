import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
})

/**
 * Process Scheduled Offboardings Cron
 * Runs daily at 12:01 AM EST via Vercel Cron
 *
 * Finds hr_requests with status='scheduled' where last_day <= today (EST)
 * and triggers processing for each.
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

  const client = await pool.connect()
  try {
    // Get today's date in EST
    const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const todayEst = estNow.toISOString().slice(0, 10)

    // Find scheduled offboarding requests where last_day <= today
    const result = await client.query<{ id: string; answers: Record<string, unknown> }>(
      `SELECT id, answers
       FROM hr_requests
       WHERE status = 'scheduled'
         AND type = 'offboarding'
       ORDER BY created_at ASC`
    )

    const dueRequests = result.rows.filter(row => {
      const answers = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers
      const lastDay = (answers as Record<string, string>).last_day
      return lastDay && lastDay <= todayEst
    })

    if (dueRequests.length === 0) {
      return NextResponse.json({
        message: 'No scheduled offboardings due today',
        todayEst,
        checked: result.rows.length,
      })
    }

    // Process each due request by calling the process endpoint
    const processUrl = new URL('/api/hr/process', request.url)
    const internalSecret = process.env.INTERNAL_SECRET ?? ''
    const results: Array<{ id: string; status: string; error?: string }> = []

    for (const req of dueRequests) {
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
        results.push({ id: req.id, status: res.ok ? 'processed' : 'failed', error: data.error })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ id: req.id, status: 'failed', error: msg })
        console.error(`[cron/process-scheduled-offboards] Failed to process ${req.id}:`, msg)
      }
    }

    console.log(`[cron/process-scheduled-offboards] Processed ${results.length} scheduled offboarding(s)`)

    return NextResponse.json({
      message: `Processed ${results.length} scheduled offboarding(s)`,
      todayEst,
      results,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cron/process-scheduled-offboards] Cron error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    client.release()
  }
}
