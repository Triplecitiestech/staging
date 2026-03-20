import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

// ---------------------------------------------------------------------------
// Raw pg pool — bypasses Prisma entirely so schema mismatches can't cause 500s
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HrRequestSummary {
  id: string
  type: 'onboarding' | 'offboarding'
  status: string
  submittedByEmail: string
  submittedByName: string | null
  autotaskTicketNumber: string | null
  employeeName: string
  createdAt: string
  completedAt: string | null
  stepCount: number
  completedStepCount: number
}

// ---------------------------------------------------------------------------
// GET /api/hr/requests?companySlug=<slug>&email=<email>
// Returns the 20 most recent HR requests for the given company.
// Requires a verified manager email to prevent unauthenticated access.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const companySlug = searchParams.get('companySlug')?.toLowerCase().trim() ?? ''
  const email       = searchParams.get('email')?.toLowerCase().trim() ?? ''

  if (!companySlug) {
    return NextResponse.json({ error: 'companySlug is required' }, { status: 400 })
  }
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    // 1. Resolve company
    const companyRes = await client.query<{ id: string }>(
      `SELECT id FROM companies WHERE slug = $1 LIMIT 1`,
      [companySlug]
    )

    if (companyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const companyId = companyRes.rows[0].id

    // 2. Verify requesting email is an active manager for this company
    const contactRes = await client.query<{ customerRole: string; isPrimary: boolean }>(
      `SELECT "customerRole", "isPrimary"
       FROM company_contacts
       WHERE "companyId" = $1
         AND LOWER(email) = $2
         AND "isActive" = true
       LIMIT 1`,
      [companyId, email]
    )

    if (contactRes.rows.length === 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contact = contactRes.rows[0]
    if (contact.customerRole !== 'CLIENT_MANAGER' && !contact.isPrimary) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 3. Fetch the 20 most recent requests with step counts
    const requestsRes = await client.query<{
      id: string
      type: string
      status: string
      submitted_by_email: string
      submitted_by_name: string | null
      autotask_ticket_number: string | null
      answers: unknown
      created_at: Date
      completed_at: Date | null
      step_count: string
      completed_step_count: string
    }>(
      `SELECT
         r.id,
         r.type,
         r.status,
         r.submitted_by_email,
         r.submitted_by_name,
         r.autotask_ticket_number,
         r.answers,
         r.created_at,
         r.completed_at,
         COUNT(s.id)                                                       AS step_count,
         COUNT(s.id) FILTER (WHERE s.status = 'completed')                AS completed_step_count
       FROM hr_requests r
       LEFT JOIN hr_request_steps s ON s.request_id = r.id
       WHERE r.company_id = $1
       GROUP BY r.id
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [companyId]
    )

    // 4. Shape the response
    const summaries: HrRequestSummary[] = requestsRes.rows.map((r) => {
      const answers = (r.answers ?? {}) as Record<string, string>
      const firstName = answers.first_name ?? ''
      const lastName  = answers.last_name ?? ''

      return {
        id: r.id,
        type: r.type as 'onboarding' | 'offboarding',
        status: r.status,
        submittedByEmail: r.submitted_by_email,
        submittedByName: r.submitted_by_name,
        autotaskTicketNumber: r.autotask_ticket_number,
        employeeName: `${firstName} ${lastName}`.trim() || 'Unknown Employee',
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        completedAt: r.completed_at instanceof Date
          ? r.completed_at.toISOString()
          : r.completed_at
            ? String(r.completed_at)
            : null,
        stepCount: parseInt(r.step_count, 10) || 0,
        completedStepCount: parseInt(r.completed_step_count, 10) || 0,
      }
    })

    return NextResponse.json({ requests: summaries }, { status: 200 })
  } catch (err) {
    console.error('[hr/requests] DB error:', err)
    return NextResponse.json(
      { error: 'Failed to load requests. Please try again.' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
