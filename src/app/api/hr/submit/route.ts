import { NextRequest, NextResponse, after } from 'next/server'
import { createHash } from 'crypto'
import { PoolClient } from 'pg'
import { getPool } from '@/lib/db-pool'
import { getPortalSession } from '@/lib/portal-session'
import { withDbRetry } from '@/lib/resilience'
import { checkCsrf } from '@/lib/security'

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
  // CSRF protection
  const csrfBlocked = checkCsrf(request)
  if (csrfBlocked) return csrfBlocked

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

    // 3i. Kick off background processing.
    //
    // This used to be a bare fetch() the route never awaited, then an
    // immediate 202. On Vercel the function can be frozen the instant the
    // response is sent, killing a request nothing is waiting on — the leading
    // explanation for requests that sit at 'pending' forever with no Autotask
    // ticket ("never started", PORTAL_DEFECT_INVESTIGATION.md). after() keeps
    // the function alive until the kickoff has run.
    const processUrl = new URL('/api/hr/process', request.url).toString()
    after(() => kickOffProcessing(processUrl, requestId))

    // 3j. Return 202 Accepted — RECEIVED, not provisioned. Processing runs
    // after this response and its outcome is recorded on the request and the
    // Autotask ticket, never implied here.
    return NextResponse.json(
      { requestId, message: 'Request received — processing has started' },
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

// ---------------------------------------------------------------------------
// Background kickoff
// ---------------------------------------------------------------------------

/**
 * How long to wait for /api/hr/process to answer. That route responds only
 * when the whole pipeline finishes (up to its 300 s maxDuration), so NOT
 * hearing back within this window is normal and is not a failure — the call
 * has been delivered and processing continues in its own invocation. The
 * failures this catches are the fast ones: a refused auth secret, a missing
 * route, a request the pipeline rejects outright.
 */
const KICKOFF_WAIT_MS = 25_000

/**
 * Deliver the processing call and record a kickoff failure on the request row.
 *
 * A failed kickoff leaves the row at 'pending' with error_message set, so it
 * shows on /admin/hr/pending as "never started" WITH the reason, instead of as
 * an unexplained pending row. It never changes status — nothing ran, and a
 * human decides what happens next.
 */
async function kickOffProcessing(processUrl: string, requestId: string): Promise<void> {
  let failure: string | null = null
  try {
    const res = await fetch(processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET ?? '',
      },
      body: JSON.stringify({ requestId }),
      signal: AbortSignal.timeout(KICKOFF_WAIT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      failure = `Processing did not start: /api/hr/process answered HTTP ${res.status}${body ? ` — ${body.slice(0, 300)}` : ''}`
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      // Still running — see KICKOFF_WAIT_MS.
      return
    }
    failure = `Processing did not start: could not reach /api/hr/process — ${err instanceof Error ? err.message : String(err)}`
  }

  if (!failure) return
  console.error(`[hr/submit] Kickoff failed for request ${requestId}: ${failure}`)
  try {
    await pool.query(
      `UPDATE hr_requests
          SET error_message = $2, updated_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [requestId, failure]
    )
  } catch (dbErr) {
    console.error(
      `[hr/submit] Could not record kickoff failure for request ${requestId}:`,
      dbErr instanceof Error ? dbErr.message : String(dbErr)
    )
  }
}
