import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { createGraphClient } from '@/lib/graph'

const pool = getPool()

// ---------------------------------------------------------------------------
// GET /api/admin/companies/[id]/m365
// Returns current M365 config status for a company (credentials masked)
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const client = await pool.connect()
  try {
    const res = await client.query<{
      m365_tenant_id: string | null
      m365_client_id: string | null
      m365_client_secret: string | null
      m365_verified_at: Date | null
      m365_setup_status: string | null
    }>(
      `SELECT m365_tenant_id, m365_client_id, m365_client_secret,
              m365_verified_at, m365_setup_status
       FROM companies WHERE id = $1 LIMIT 1`,
      [id]
    )

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const row = res.rows[0]
    return NextResponse.json({
      tenantId:     row.m365_tenant_id ?? null,
      clientId:     row.m365_client_id ?? null,
      // Never return the secret — just indicate if it's set
      clientSecretSet: !!row.m365_client_secret,
      verifiedAt:   row.m365_verified_at ? new Date(row.m365_verified_at).toISOString() : null,
      setupStatus:  row.m365_setup_status ?? 'not_configured',
    })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// PUT /api/admin/companies/[id]/m365
// Save M365 credentials for a company
// Body: { tenantId, clientId, clientSecret }
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: { tenantId: string; clientId: string; clientSecret: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tenantId, clientId, clientSecret } = body

  if (!tenantId?.trim() || !clientId?.trim() || !clientSecret?.trim()) {
    return NextResponse.json(
      { error: 'tenantId, clientId, and clientSecret are all required' },
      { status: 400 }
    )
  }

  const keepSecret = clientSecret.trim() === '__KEEP__'

  const client = await pool.connect()
  try {
    if (keepSecret) {
      // Only update tenant/client IDs, preserve existing secret
      await client.query(
        `UPDATE companies
         SET m365_tenant_id    = $1,
             m365_client_id    = $2,
             m365_setup_status = 'credentials_saved',
             m365_verified_at  = NULL,
             "updatedAt"       = NOW()
         WHERE id = $3`,
        [tenantId.trim(), clientId.trim(), id]
      )
    } else {
      await client.query(
        `UPDATE companies
         SET m365_tenant_id     = $1,
             m365_client_id     = $2,
             m365_client_secret = $3,
             m365_setup_status  = 'credentials_saved',
             m365_verified_at   = NULL,
             "updatedAt"        = NOW()
         WHERE id = $4`,
        [tenantId.trim(), clientId.trim(), clientSecret.trim(), id]
      )
    }

    return NextResponse.json({ success: true, setupStatus: 'credentials_saved' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/companies/m365 PUT] DB error:', msg)
    return NextResponse.json({ error: 'Failed to save credentials', detail: msg }, { status: 500 })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/companies/[id]/m365
// Test connection — verifies credentials against Graph API
// Body: { action: 'test' }
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: { action: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.action !== 'test') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  // Load credentials
  const dbClient = await pool.connect()
  let creds: { tenantId: string; clientId: string; clientSecret: string } | null = null
  try {
    const res = await dbClient.query<{
      m365_tenant_id: string | null
      m365_client_id: string | null
      m365_client_secret: string | null
    }>(
      `SELECT m365_tenant_id, m365_client_id, m365_client_secret
       FROM companies WHERE id = $1 LIMIT 1`,
      [id]
    )

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const row = res.rows[0]
    if (!row.m365_tenant_id || !row.m365_client_id || !row.m365_client_secret) {
      return NextResponse.json(
        { error: 'No M365 credentials configured. Save credentials first.' },
        { status: 400 }
      )
    }

    creds = {
      tenantId:     row.m365_tenant_id,
      clientId:     row.m365_client_id,
      clientSecret: row.m365_client_secret,
    }
  } finally {
    dbClient.release()
  }

  // Test the connection
  try {
    const graph = createGraphClient(creds)
    const { tenantName } = await graph.verifyConnection()

    // Mark as verified
    const verifyClient = await pool.connect()
    try {
      await verifyClient.query(
        `UPDATE companies
         SET m365_setup_status = 'verified', m365_verified_at = NOW(), "updatedAt" = NOW()
         WHERE id = $1`,
        [id]
      )
    } finally {
      verifyClient.release()
    }

    return NextResponse.json({
      success: true,
      tenantName,
      setupStatus: 'verified',
      verifiedAt: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    // Mark as error in DB
    const errClient = await pool.connect()
    try {
      await errClient.query(
        `UPDATE companies SET m365_setup_status = 'error', "updatedAt" = NOW() WHERE id = $1`,
        [id]
      )
    } finally {
      errClient.release()
    }

    return NextResponse.json(
      { success: false, error: msg, setupStatus: 'error' },
      { status: 502 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/companies/[id]/m365
// Mark onboarding as complete
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: { action: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.action !== 'complete_onboarding') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query(
      `UPDATE companies SET onboarding_completed_at = NOW(), "updatedAt" = NOW() WHERE id = $1`,
      [id]
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    client.release()
  }
}
