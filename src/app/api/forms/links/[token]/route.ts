import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'

const pool = getPool()

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
    // form_links.company_id is UUID while companies.id is TEXT — the join
    // needs the explicit ::text cast or Postgres rejects it with
    // "operator does not exist: text = uuid" (docs/gotchas.md → Thread).
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
       JOIN companies c ON c.id = fl.company_id::text
       WHERE fl.token = $1`,
      [token]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ valid: false, error: 'Link not found' }, { status: 404 })
    }

    const link = result.rows[0]

    // Check if expired
    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json(
        { valid: false, error: 'This form link has expired. Please request a new one.' },
        { status: 410 }
      )
    }

    // Check if used — single-use: /used stamps used_at after submission
    if (link.used_at) {
      return NextResponse.json(
        { valid: false, error: 'This form link has already been used. Please request a new one.' },
        { status: 410 }
      )
    }

    return NextResponse.json({
      valid: true,
      companySlug: (link as Record<string, unknown>).company_slug,
      type: link.type,
      preFill: link.pre_fill,
    })
  } catch (err) {
    console.error('[forms/links/validate] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { valid: false, error: 'Unable to validate this form link. Please try again.' },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
