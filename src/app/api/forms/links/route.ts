import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { randomBytes } from 'crypto'
import { auth } from '@/auth'

const pool = getPool()

// ---------------------------------------------------------------------------
// POST /api/forms/links — Create a form link
// Body: { companySlug, type, preFill?, expiresInMinutes?, source? }
// Auth: admin session OR Thread webhook secret
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Authenticate — admin session or Thread webhook secret
  const threadSecret = request.headers.get('x-thread-secret')
  const expectedThreadSecret = process.env.THREAD_WEBHOOK_SECRET

  let isAuthenticated = false

  if (threadSecret && expectedThreadSecret && threadSecret === expectedThreadSecret) {
    isAuthenticated = true
  } else {
    const session = await auth()
    if (session?.user) {
      isAuthenticated = true
    }
  }

  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    companySlug: string
    type: string
    preFill?: Record<string, unknown>
    expiresInMinutes?: number
    source?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { companySlug, type, preFill, expiresInMinutes = 1440, source = 'manual' } = body

  if (!companySlug || !type || !['onboarding', 'offboarding'].includes(type)) {
    return NextResponse.json({ error: 'companySlug and valid type are required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    // Look up company
    const companyRes = await client.query<{ id: string }>(
      `SELECT id FROM companies WHERE slug = $1 LIMIT 1`,
      [companySlug.toLowerCase().trim()]
    )
    if (companyRes.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    const companyId = companyRes.rows[0].id

    // Generate secure token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)

    await client.query(
      `INSERT INTO form_links (company_id, type, token, pre_fill, source, expires_at, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [
        companyId,
        type,
        token,
        preFill ? JSON.stringify(preFill) : null,
        source,
        expiresAt.toISOString(),
        source === 'thread' ? 'thread' : 'admin',
      ]
    )

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? request.nextUrl.origin
    const url = `${baseUrl}/form/${token}`

    return NextResponse.json({ url, token, expiresAt: expiresAt.toISOString() }, { status: 201 })
  } finally {
    client.release()
  }
}
