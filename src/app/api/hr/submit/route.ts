import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { PoolClient } from 'pg'
import { getPool } from '@/lib/db-pool'
import { getPortalSession } from '@/lib/portal-session'
import { withDbRetry } from '@/lib/resilience'

// ---------------------------------------------------------------------------
// Raw pg pool — bypasses Prisma entirely so schema mismatches can't cause 500s
// ---------------------------------------------------------------------------

const pool = getPool()

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

  // 3. DB work — acquire connection with retry for serverless cold starts
  let client: PoolClient
  try {
    client = await withDbRetry(() => pool.connect(), 'hr/submit pool.connect')
  } catch (connErr) {
    const msg = connErr instanceof Error ? connErr.message : String(connErr)
    console.error('[hr/submit] Database connection failed after retries:', msg)
    return NextResponse.json(
      { error: 'Unable to connect to the database. Please try again in a moment.' },
      { status: 503 }
    )
  }

  // Ensure HR tables exist (idempotent)
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_requests (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        company_id TEXT NOT NULL,
        company_slug TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        submitted_by_email TEXT NOT NULL,
        submitted_by_name TEXT,
        answers JSONB NOT NULL DEFAULT '{}',
        resolved_action_plan JSONB,
        autotask_ticket_id INTEGER,
        autotask_ticket_number TEXT,
        target_upn TEXT,
        target_user_id TEXT,
        idempotency_key TEXT UNIQUE NOT NULL,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        impersonated_by_email TEXT,
        impersonated_by_name TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    // Add columns if they don't exist (safe for existing tables)
    await client.query(`ALTER TABLE hr_requests ADD COLUMN IF NOT EXISTS impersonated_by_email TEXT`).catch(() => {})
    await client.query(`ALTER TABLE hr_requests ADD COLUMN IF NOT EXISTS impersonated_by_name TEXT`).catch(() => {})
    await client.query(`ALTER TABLE hr_requests ADD COLUMN IF NOT EXISTS scheduled_deletion_date DATE`).catch(() => {})
    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_audit_logs (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        company_id TEXT NOT NULL,
        request_id TEXT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT,
        details JSONB,
        severity TEXT DEFAULT 'info',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
  } catch (migErr) {
    console.error('[hr/submit] Table ensure failed (non-fatal):', migErr)
  }
  try {
    // 3a. Look up company by slug
    const companyRes = await client.query<{ id: string; name: string }>(
      `SELECT id, "displayName" as name FROM companies WHERE slug = $1 LIMIT 1`,
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

    // 3c. Compute idempotency key — prevents accidental double-clicks (2 min window)
    const answersTyped = answers as Record<string, string>
    // Use 2-minute slot so legitimate re-submissions (e.g., re-hiring) are allowed quickly
    const minuteSlot = Math.floor(Date.now() / 120_000)
    const identifierParts = type === 'offboarding'
      ? [answersTyped.employee_to_offboard ?? answersTyped.work_email ?? '']
      : [(answersTyped.first_name ?? '').trim().toLowerCase(), (answersTyped.last_name ?? '').trim().toLowerCase()]
    const rawKey = [
      company.id,
      normalizedEmail,
      type,
      ...identifierParts,
      minuteSlot,
    ].join(':')

    const idempotencyKey = createHash('sha256').update(rawKey).digest('hex')

    // 3d. Check for duplicate within the last 2 minutes (double-click protection only)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const dupRes = await client.query<{ id: string }>(
      `SELECT id FROM hr_requests
       WHERE idempotency_key = $1
         AND created_at >= $2
       LIMIT 1`,
      [idempotencyKey, twoMinutesAgo]
    )

    if (dupRes.rows.length > 0) {
      return NextResponse.json(
        {
          error: 'This request was already submitted moments ago. Please wait a moment before trying again.',
          requestId: dupRes.rows[0].id,
        },
        { status: 409 }
      )
    }

    // 3e. Detect impersonation from portal session (server-side, not client-provided)
    const portalSession = await getPortalSession()
    const impersonation = portalSession?.impersonation ?? null

    // 3f. Determine target UPN for offboarding
    const offboardTarget = answersTyped.employee_to_offboard ?? answersTyped.work_email ?? ''
    const targetUpn =
      type === 'offboarding' && offboardTarget
        ? offboardTarget.toLowerCase().trim()
        : null

    // 3g. Insert hr_request
    const submitterName = submittedByName?.trim() ?? contact.name ?? null

    const insertRes = await client.query<{ id: string }>(
      `INSERT INTO hr_requests
         (company_id, company_slug, type, status, submitted_by_email, submitted_by_name,
          answers, idempotency_key, target_upn, impersonated_by_email, impersonated_by_name,
          created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6::jsonb, $7, $8, $9, $10, NOW(), NOW())
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
        impersonation?.adminEmail ?? null,
        impersonation?.adminName ?? null,
      ]
    )

    const requestId = insertRes.rows[0].id

    // 3h. Write audit log with dual attribution for impersonation
    const employeeName = type === 'offboarding'
      ? (answersTyped.employee_to_offboard ?? `${answersTyped.first_name ?? ''} ${answersTyped.last_name ?? ''}`.trim())
      : `${answersTyped.first_name ?? ''} ${answersTyped.last_name ?? ''}`.trim()

    const actorLabel = impersonation
      ? `${impersonation.adminEmail} (impersonating ${normalizedEmail})`
      : normalizedEmail

    await client.query(
      `INSERT INTO hr_audit_logs
         (company_id, request_id, actor, action, resource, details, severity, created_at)
       VALUES ($1, $2, $3, 'request_submitted', $4, $5::jsonb, 'info', NOW())`,
      [
        company.id,
        requestId,
        actorLabel,
        `hr_request:${requestId}`,
        JSON.stringify({
          type,
          employeeName,
          submittedByName: submitterName,
          ...(impersonation ? {
            impersonatedBy: impersonation.adminEmail,
            impersonatedByName: impersonation.adminName,
            performedAs: normalizedEmail,
          } : {}),
        }),
      ]
    )

    if (impersonation) {
      console.log(`[hr/submit] Admin ${impersonation.adminEmail} submitted ${type} request as ${normalizedEmail} for company ${normalizedSlug}`)
    }

    // 3i. Fire-and-forget background processing
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

    // 3j. Return 202 Accepted
    return NextResponse.json(
      { requestId, message: 'Request submitted successfully' },
      { status: 202 }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[hr/submit] DB error:', msg)
    // Surface enough detail to help debugging while remaining professional
    const userMessage = msg.includes('duplicate key')
      ? 'A duplicate request was detected. Please wait a few minutes before trying again.'
      : msg.includes('column') || msg.includes('relation')
        ? 'A database configuration issue occurred. Please contact support.'
        : `Submission failed: ${msg}`
    return NextResponse.json(
      { error: userMessage, detail: msg },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
