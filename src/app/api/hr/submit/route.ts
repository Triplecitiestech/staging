import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
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

interface SubmitRequestBody {
  type: 'onboarding' | 'offboarding'
  answers: Record<string, unknown>
  submittedByEmail: string
  submittedByName?: string
  companySlug: string
}

// ---------------------------------------------------------------------------
// POST /api/hr/submit
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Parse body — catch empty/malformed body before anything else
  let body: SubmitRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { type, answers, submittedByEmail, submittedByName, companySlug } = body

  // 2. Input validation
  if (!type || !['onboarding', 'offboarding'].includes(type)) {
    return NextResponse.json(
      { error: 'Invalid type — must be "onboarding" or "offboarding"' },
      { status: 400 }
    )
  }

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return NextResponse.json({ error: 'answers must be an object' }, { status: 400 })
  }

  if (!submittedByEmail || typeof submittedByEmail !== 'string') {
    return NextResponse.json({ error: 'submittedByEmail is required' }, { status: 400 })
  }

  if (!companySlug || typeof companySlug !== 'string') {
    return NextResponse.json({ error: 'companySlug is required' }, { status: 400 })
  }

  const normalizedEmail = submittedByEmail.toLowerCase().trim()
  const normalizedSlug  = companySlug.toLowerCase().trim()

  // 3. DB work — all in one try/catch so any error returns a clean JSON response
  const client = await pool.connect()
  try {
    // 3a. Look up company by slug
    const companyRes = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM companies WHERE slug = $1 LIMIT 1`,
      [normalizedSlug]
    )

    if (companyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const company = companyRes.rows[0]

    // 3b. Verify submitter is an active CLIENT_MANAGER (or isPrimary) for this company
    const contactRes = await client.query<{
      name: string
      customerRole: string
      isPrimary: boolean
    }>(
      `SELECT name, "customerRole", "isPrimary"
       FROM company_contacts
       WHERE "companyId" = $1
         AND LOWER(email) = $2
         AND "isActive" = true
       LIMIT 1`,
      [company.id, normalizedEmail]
    )

    if (contactRes.rows.length === 0) {
      return NextResponse.json(
        { error: 'Forbidden — this email is not authorized to submit HR requests for this company' },
        { status: 403 }
      )
    }

    const contact = contactRes.rows[0]
    const isAuthorized = contact.customerRole === 'CLIENT_MANAGER' || contact.isPrimary

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Forbidden — this email does not have Manager role for this company' },
        { status: 403 }
      )
    }

    // 3c. Compute idempotency key — scoped per hour to prevent duplicate submissions
    const answersTyped = answers as Record<string, string>
    const hourSlot = Math.floor(Date.now() / 3_600_000)
    const rawKey = [
      company.id,
      normalizedEmail,
      type,
      (answersTyped.first_name ?? '').trim().toLowerCase(),
      (answersTyped.last_name ?? '').trim().toLowerCase(),
      hourSlot,
    ].join(':')

    const idempotencyKey = createHash('sha256').update(rawKey).digest('hex')

    // 3d. Check for duplicate within the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const dupRes = await client.query<{ id: string }>(
      `SELECT id FROM hr_requests
       WHERE idempotency_key = $1
         AND created_at >= $2
       LIMIT 1`,
      [idempotencyKey, tenMinutesAgo]
    )

    if (dupRes.rows.length > 0) {
      return NextResponse.json(
        {
          error: 'Duplicate request detected — an identical request was submitted within the last 10 minutes',
          requestId: dupRes.rows[0].id,
        },
        { status: 409 }
      )
    }

    // 3e. Determine target UPN for offboarding
    const targetUpn =
      type === 'offboarding' && typeof answersTyped.work_email === 'string'
        ? answersTyped.work_email.toLowerCase().trim()
        : null

    // 3f. Insert hr_request
    const submitterName = submittedByName?.trim() ?? contact.name ?? null

    const insertRes = await client.query<{ id: string }>(
      `INSERT INTO hr_requests
         (company_id, company_slug, type, status, submitted_by_email, submitted_by_name,
          answers, idempotency_key, target_upn, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id`,
      [
        company.id,
        normalizedSlug,
        type,
        normalizedEmail,
        submitterName,
        JSON.stringify(answers),
        idempotencyKey,
        targetUpn,
      ]
    )

    const requestId = insertRes.rows[0].id

    // 3g. Write audit log
    const employeeName = `${answersTyped.first_name ?? ''} ${answersTyped.last_name ?? ''}`.trim()
    await client.query(
      `INSERT INTO hr_audit_logs
         (company_id, request_id, actor, action, resource, details, severity, created_at)
       VALUES ($1, $2, $3, 'request_submitted', $4, $5, 'info', NOW())`,
      [
        company.id,
        requestId,
        normalizedEmail,
        `hr_request:${requestId}`,
        JSON.stringify({ type, employeeName, submittedByName: submitterName }),
      ]
    )

    // 3h. Fire-and-forget background processing
    const processUrl = new URL('/api/hr/process', request.url)
    const internalSecret = process.env.INTERNAL_SECRET ?? ''

    fetch(processUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({ requestId }),
    }).catch((err) => {
      console.error('[hr/submit] Failed to kick off background processing:', err)
    })

    // 3i. Return 202 Accepted
    return NextResponse.json(
      { requestId, message: 'Request submitted successfully' },
      { status: 202 }
    )
  } catch (err) {
    console.error('[hr/submit] DB error:', err)
    return NextResponse.json(
      { error: 'Submission failed. Please try again.' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
