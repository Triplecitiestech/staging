import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'

// ---------------------------------------------------------------------------
// Raw pg pool — bypasses Prisma entirely so schema mismatches can't cause 500s
// ---------------------------------------------------------------------------

const pool = getPool()

// ---------------------------------------------------------------------------
// GET /api/hr/requests/[id]?companySlug=<slug>&email=<email>
// Returns the full HR request including all steps.
// Validates that the request belongs to the given company and email is a manager.
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Request ID is required' }, { status: 400 })
  }

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

    // 3. Load the HR request
    const requestRes = await client.query<{
      id: string
      type: string
      status: string
      company_id: string
      submitted_by_email: string
      submitted_by_name: string | null
      answers: unknown
      resolved_action_plan: unknown
      autotask_ticket_id: number | null
      autotask_ticket_number: string | null
      target_upn: string | null
      error_message: string | null
      retry_count: number
      started_at: Date | null
      completed_at: Date | null
      created_at: Date
      updated_at: Date
    }>(
      `SELECT * FROM hr_requests WHERE id = $1 LIMIT 1`,
      [id]
    )

    if (requestRes.rows.length === 0) {
      return NextResponse.json({ error: 'HR request not found' }, { status: 404 })
    }

    const hrRequest = requestRes.rows[0]

    // 4. Verify ownership — prevent cross-company data leakage
    if (hrRequest.company_id !== companyId) {
      return NextResponse.json({ error: 'HR request not found' }, { status: 404 })
    }

    // 5. Load steps
    const stepsRes = await client.query<{
      id: string
      step_key: string
      step_name: string
      status: string
      attempt: number
      input: unknown
      output: unknown
      error: unknown
      started_at: Date | null
      completed_at: Date | null
      created_at: Date
    }>(
      `SELECT * FROM hr_request_steps WHERE request_id = $1 ORDER BY created_at ASC`,
      [id]
    )

    const toIso = (d: Date | string | null): string | null => {
      if (!d) return null
      return d instanceof Date ? d.toISOString() : String(d)
    }

    const answers = (hrRequest.answers ?? {}) as Record<string, string>
    const firstName = answers.first_name ?? ''
    const lastName  = answers.last_name ?? ''

    // 6. Return full request + steps
    return NextResponse.json(
      {
        request: {
          id: hrRequest.id,
          type: hrRequest.type,
          status: hrRequest.status,
          submittedByEmail: hrRequest.submitted_by_email,
          submittedByName: hrRequest.submitted_by_name,
          answers: hrRequest.answers,
          resolvedActionPlan: hrRequest.resolved_action_plan,
          autotaskTicketId: hrRequest.autotask_ticket_id,
          autotaskTicketNumber: hrRequest.autotask_ticket_number,
          targetUpn: hrRequest.target_upn,
          errorMessage: hrRequest.error_message,
          retryCount: hrRequest.retry_count,
          startedAt:   toIso(hrRequest.started_at),
          completedAt: toIso(hrRequest.completed_at),
          createdAt:   toIso(hrRequest.created_at)!,
          updatedAt:   toIso(hrRequest.updated_at)!,
          employeeName: `${firstName} ${lastName}`.trim() || 'Unknown Employee',
          steps: stepsRes.rows.map((s) => ({
            id: s.id,
            stepKey:     s.step_key,
            stepName:    s.step_name,
            status:      s.status,
            attempt:     s.attempt,
            input:       s.input,
            output:      s.output,
            error:       s.error,
            startedAt:   toIso(s.started_at),
            completedAt: toIso(s.completed_at),
            createdAt:   toIso(s.created_at)!,
          })),
        },
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('[hr/requests/[id]] DB error:', err)
    return NextResponse.json(
      { error: 'Failed to load request. Please try again.' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
