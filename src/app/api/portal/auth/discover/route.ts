import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { checkRateLimit } from '@/lib/security'

const pool = getPool()

/**
 * GET /api/portal/auth/discover
 * Shows a branded page where the user enters their email.
 * We detect their company from their email domain and redirect to the M365 login.
 *
 * POST /api/portal/auth/discover
 * Accepts { email } and redirects to the correct company's M365 login.
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Redirect to the portal page which has the email form
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin
  return NextResponse.redirect(`${baseUrl}/portal`)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = checkRateLimit(request, { strict: true })
  if (blocked) return blocked

  let email = ''
  const contentType = request.headers.get('content-type') || ''
  const isJsonRequest = contentType.includes('application/json')

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    email = (formData.get('email') as string || '').toLowerCase().trim()
  } else {
    try {
      const body = await request.json()
      email = (body.email || '').toLowerCase().trim()
    } catch {
      email = ''
    }
  }

  if (!email || !email.includes('@')) {
    if (isJsonRequest) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    return new NextResponse(discoverPage('Please enter a valid email address.'), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const domain = email.split('@')[1]

  const client = await pool.connect()
  try {
    // Look up company by M365 tenant domain or contact email domain
    // First try: match company that has a contact with this email domain
    const res = await client.query<{ slug: string; m365_tenant_id: string | null }>(
      `SELECT DISTINCT c.slug, c.m365_tenant_id
       FROM companies c
       JOIN company_contacts cc ON cc."companyId" = c.id
       WHERE LOWER(cc.email) LIKE $1
         AND cc."isActive" = true
         AND c.m365_tenant_id IS NOT NULL
       LIMIT 1`,
      ['%@' + domain]
    )

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'

    if (res.rows.length > 0) {
      const loginUrl = `${baseUrl}/api/portal/auth/login?company=${res.rows[0].slug}&login_hint=${encodeURIComponent(email)}`
      if (isJsonRequest) {
        return NextResponse.json({ redirect: loginUrl })
      }
      return NextResponse.redirect(loginUrl)
    }

    // Fallback: try matching by exact contact email
    const exactRes = await client.query<{ slug: string }>(
      `SELECT c.slug
       FROM companies c
       JOIN company_contacts cc ON cc."companyId" = c.id
       WHERE LOWER(cc.email) = $1
         AND cc."isActive" = true
         AND c.m365_tenant_id IS NOT NULL
       LIMIT 1`,
      [email]
    )

    if (exactRes.rows.length > 0) {
      const loginUrl = `${baseUrl}/api/portal/auth/login?company=${exactRes.rows[0].slug}&login_hint=${encodeURIComponent(email)}`
      if (isJsonRequest) {
        return NextResponse.json({ redirect: loginUrl })
      }
      return NextResponse.redirect(loginUrl)
    }

    const notFoundMsg = 'We could not find a company associated with that email address. Please contact Triple Cities Tech for access.'
    if (isJsonRequest) {
      return NextResponse.json({ error: notFoundMsg }, { status: 404 })
    }
    return new NextResponse(
      discoverPage(notFoundMsg),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    )
  } catch (err) {
    console.error('[portal/auth/discover] Error:', err instanceof Error ? err.message : err)
    const errMsg = 'Something went wrong. Please try again.'
    if (isJsonRequest) {
      return NextResponse.json({ error: errMsg }, { status: 500 })
    }
    return new NextResponse(
      discoverPage(errMsg),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    )
  } finally {
    client.release()
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function discoverPage(error?: string): string {
  const errorBlock = error
    ? `<div style="background:#7f1d1d;border:1px solid #991b1b;color:#fca5a5;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:0.875rem;">${escapeHtml(error)}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign In | Triple Cities Tech Customer Portal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
           background: linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%);
           color: #e5e5e5; font-family: system-ui, -apple-system, sans-serif; padding: 1.5rem; }
    .card { max-width: 400px; width: 100%; }
    .brand { text-align: center; margin-bottom: 2rem; }
    .brand-icon { width: 48px; height: 48px; background: linear-gradient(135deg, #06b6d4, #0891b2);
                  border-radius: 12px; display: flex; align-items: center; justify-content: center;
                  margin: 0 auto 1rem; }
    .brand-icon svg { width: 24px; height: 24px; color: white; }
    h1 { font-size: 1.5rem; font-weight: 700; color: white; margin-bottom: 0.5rem; }
    .subtitle { font-size: 0.875rem; color: #94a3b8; line-height: 1.5; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: 0.8125rem; font-weight: 500; color: #94a3b8; margin-bottom: 0.375rem; }
    input[type="email"] { width: 100%; padding: 0.75rem 1rem; border: 1px solid #334155; border-radius: 8px;
                          background: #1e293b; color: white; font-size: 0.9375rem; outline: none; }
    input[type="email"]:focus { border-color: #06b6d4; box-shadow: 0 0 0 2px rgba(6,182,212,0.2); }
    input[type="email"]::placeholder { color: #475569; }
    .btn { width: 100%; padding: 0.75rem; border: none; border-radius: 8px; font-size: 0.9375rem; font-weight: 600;
           cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.625rem;
           background: linear-gradient(135deg, #06b6d4, #0891b2); color: white; transition: opacity 0.15s; }
    .btn:hover { opacity: 0.9; }
    .footer { text-align: center; margin-top: 2rem; font-size: 0.75rem; color: #475569; }
    .footer a { color: #64748b; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="brand-icon">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>
      </div>
      <h1>Customer Support Portal</h1>
      <p class="subtitle">Sign in with your work email to access your company portal.</p>
    </div>
    ${errorBlock}
    <form method="POST" action="/api/portal/auth/discover">
      <div class="form-group">
        <label for="email">Work Email</label>
        <input type="email" id="email" name="email" placeholder="you@company.com" required autofocus />
      </div>
      <button type="submit" class="btn">
        <svg width="18" height="18" viewBox="0 0 23 23" fill="currentColor"><path d="M0 0h11v11H0zM12 0h11v11H12zM0 12h11v11H0zM12 12h11v11H12z"/></svg>
        Sign in with Microsoft 365
      </button>
    </form>
    <div class="footer">
      <p>Triple Cities Tech &bull; <a href="https://www.triplecitiestech.com">triplecitiestech.com</a></p>
    </div>
  </div>
</body>
</html>`
}
