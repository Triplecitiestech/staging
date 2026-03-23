import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import crypto from 'crypto'
import { signState } from '@/lib/portal-session'

// ---------------------------------------------------------------------------
// Raw pg pool — same pattern as /api/hr/submit
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
})

// ---------------------------------------------------------------------------
// GET /api/portal/auth/login?company=<slug>
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const companySlug = request.nextUrl.searchParams.get('company')?.toLowerCase().trim()
  const returnTo = request.nextUrl.searchParams.get('returnTo')

  if (!companySlug) {
    return new NextResponse(errorPage('Missing company parameter.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const client = await pool.connect()
  try {
    // Look up M365 credentials for this company
    const res = await client.query<{
      m365_tenant_id: string | null
      m365_client_id: string | null
    }>(
      `SELECT m365_tenant_id, m365_client_id
       FROM companies
       WHERE slug = $1
       LIMIT 1`,
      [companySlug]
    )

    if (res.rows.length === 0) {
      return new NextResponse(errorPage('Company not found.'), {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    const { m365_tenant_id, m365_client_id } = res.rows[0]

    if (!m365_tenant_id || !m365_client_id) {
      return new NextResponse(
        errorPage(
          'Single sign-on has not been configured for this company yet. Please contact Triple Cities Tech to complete setup.'
        ),
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    }

    // Build OAuth state with HMAC signature
    const nonce = crypto.randomBytes(16).toString('hex')
    // Include returnTo in state if it's a valid relative path (prevent open redirect)
    const safeReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : null
    const state = signState({ companySlug, nonce, ...(safeReturnTo ? { returnTo: safeReturnTo } : {}) })

    // Build Azure AD authorize URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'
    const redirectUri = `${baseUrl}/api/portal/auth/callback`

    const params = new URLSearchParams({
      client_id: m365_client_id,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: 'openid profile email',
      state,
    })

    const authorizeUrl = `https://login.microsoftonline.com/${m365_tenant_id}/oauth2/v2.0/authorize?${params.toString()}`

    return NextResponse.redirect(authorizeUrl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[portal/auth/login] DB error:', msg)
    return new NextResponse(errorPage('An internal error occurred. Please try again.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Fallback HTML page for error / SSO-not-configured states
// ---------------------------------------------------------------------------

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Portal Sign In | Triple Cities Tech</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
           background:#0a0a0a; color:#e5e5e5; font-family:system-ui,-apple-system,sans-serif; }
    .card { max-width:480px; padding:2rem; border:1px solid #333; border-radius:12px; text-align:center; }
    h1 { font-size:1.25rem; color:#22d3ee; margin-bottom:1rem; }
    p { font-size:0.95rem; line-height:1.6; color:#a3a3a3; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Triple Cities Tech — Customer Portal</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
