import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
})

// ---------------------------------------------------------------------------
// GET /api/forms/links/[token] — Validate a form link
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const { token } = await params

  if (!token) {
    return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    const result = await client.query<{
      id: string
      company_id: string
      type: string
      pre_fill: Record<string, unknown> | null
      expires_at: string
      used_at: string | null
    }>(
      `SELECT fl.id, fl.company_id, fl.type, fl.pre_fill, fl.expires_at, fl.used_at,
              c.slug as company_slug
       FROM form_links fl
       JOIN companies c ON c.id = fl.company_id
       WHERE fl.token = $1`,
      [token]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ valid: false, error: 'Link not found' })
    }

    const link = result.rows[0]

    // Check if expired
    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: 'Link has expired' })
    }

    // Check if used
    if (link.used_at) {
      return NextResponse.json({ valid: false, error: 'Link has already been used' })
    }

    return NextResponse.json({
      valid: true,
      companySlug: (link as Record<string, unknown>).company_slug,
      type: link.type,
      preFill: link.pre_fill,
    })
  } finally {
    client.release()
  }
}
