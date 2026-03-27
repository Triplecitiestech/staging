import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import {
  verifyState,
  createPortalSession,
  setPortalSessionCookie,
  type PortalSessionData,
} from '@/lib/portal-session'

// ---------------------------------------------------------------------------
// Raw pg pool
// ---------------------------------------------------------------------------

const pool = getPool()

// ---------------------------------------------------------------------------
// GET /api/portal/auth/callback?code=...&state=...
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code')
  const stateParam = request.nextUrl.searchParams.get('state')
  const errorParam = request.nextUrl.searchParams.get('error')
  const errorDesc = request.nextUrl.searchParams.get('error_description')

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'

  // Handle Azure AD error responses
  if (errorParam) {
    console.error(`[portal/auth/callback] Azure AD error: ${errorParam} — ${errorDesc}`)
    return new NextResponse(errorPage(`Authentication failed: ${errorDesc || errorParam}`), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  if (!code || !stateParam) {
    return new NextResponse(errorPage('Missing authorization code or state parameter.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // 1. Validate state
  const stateObj = verifyState(stateParam)
  if (!stateObj) {
    return new NextResponse(errorPage('Invalid or tampered state parameter.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const isCommonFlow = stateObj.flow === 'common'
  const companySlug = typeof stateObj.companySlug === 'string'
    ? (stateObj.companySlug as string).toLowerCase().trim()
    : null

  // For the per-company flow, companySlug must be present
  if (!isCommonFlow && !companySlug) {
    return new NextResponse(errorPage('Invalid state: missing company information.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const client = await pool.connect()
  try {
    let tokenClientId: string
    let tokenClientSecret: string
    let tokenTenantId: string
    let companyId: string
    let finalSlug: string

    if (isCommonFlow) {
      // Common SSO flow — use TCT's own Azure AD app credentials + tenant
      tokenClientId = process.env.AZURE_AD_CLIENT_ID || ''
      tokenClientSecret = process.env.AZURE_AD_CLIENT_SECRET || ''
      tokenTenantId = process.env.AZURE_AD_TENANT_ID || 'common'

      if (!tokenClientId || !tokenClientSecret) {
        return new NextResponse(errorPage('SSO is not configured. Please contact Triple Cities Tech.'), {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        })
      }

      // companyId and finalSlug will be determined after we decode the token
      companyId = ''
      finalSlug = ''
    } else {
      // Per-company flow — use company's own M365 app credentials
      const companyRes = await client.query<{
        id: string
        m365_tenant_id: string
        m365_client_id: string
        m365_client_secret: string
      }>(
        `SELECT id, m365_tenant_id, m365_client_id, m365_client_secret
         FROM companies
         WHERE slug = $1
         LIMIT 1`,
        [companySlug]
      )

      if (companyRes.rows.length === 0) {
        return new NextResponse(errorPage('Company not found.'), {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        })
      }

      const company = companyRes.rows[0]

      if (!company.m365_tenant_id || !company.m365_client_id || !company.m365_client_secret) {
        return new NextResponse(errorPage('SSO is not fully configured for this company.'), {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      }

      tokenClientId = company.m365_client_id
      tokenClientSecret = company.m365_client_secret
      tokenTenantId = company.m365_tenant_id
      companyId = company.id
      finalSlug = companySlug!
    }

    // 3. Exchange code for tokens
    const redirectUri = `${baseUrl}/api/portal/auth/callback`
    const tokenUrl = `https://login.microsoftonline.com/${tokenTenantId}/oauth2/v2.0/token`

    const tokenBody = new URLSearchParams({
      client_id: tokenClientId,
      client_secret: tokenClientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'openid profile email',
    })

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('[portal/auth/callback] Token exchange failed:', errBody)
      return new NextResponse(
        errorPage('Failed to complete authentication. Please try again.'),
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    }

    const tokenData = await tokenRes.json()
    const idToken: string | undefined = tokenData.id_token

    if (!idToken) {
      return new NextResponse(errorPage('No ID token received from Microsoft.'), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // 4. Decode ID token (JWT) — we only need the payload claims
    const payloadB64 = idToken.split('.')[1]
    if (!payloadB64) {
      return new NextResponse(errorPage('Invalid ID token format.'), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    const claims = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'))
    const userEmail: string = (claims.email || claims.preferred_username || '').toLowerCase().trim()
    const userName: string = claims.name || ''

    if (!userEmail) {
      return new NextResponse(
        errorPage('Could not determine your email from the Microsoft account. Please contact your administrator.'),
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    }

    // 4b. For common flow, discover company from email domain
    if (isCommonFlow) {
      const domain = userEmail.split('@')[1]

      // Try matching by contact email domain
      const domainRes = await client.query<{ id: string; slug: string }>(
        `SELECT DISTINCT c.id, c.slug
         FROM companies c
         JOIN company_contacts cc ON cc."companyId" = c.id
         WHERE LOWER(cc.email) LIKE $1
           AND cc."isActive" = true
         LIMIT 1`,
        ['%@' + domain]
      )

      if (domainRes.rows.length > 0) {
        companyId = domainRes.rows[0].id
        finalSlug = domainRes.rows[0].slug
      } else {
        // Try matching by m365_tenant_id from the token
        const tenantIdFromToken = claims.tid
        if (tenantIdFromToken) {
          const tenantRes = await client.query<{ id: string; slug: string }>(
            `SELECT id, slug FROM companies WHERE m365_tenant_id = $1 LIMIT 1`,
            [tenantIdFromToken]
          )
          if (tenantRes.rows.length > 0) {
            companyId = tenantRes.rows[0].id
            finalSlug = tenantRes.rows[0].slug
          }
        }
      }

      if (!companyId || !finalSlug) {
        return new NextResponse(
          errorPage(
            'We could not find a company associated with your Microsoft account. Please contact Triple Cities Tech for portal access.'
          ),
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        )
      }
    }

    // 5. Verify user exists in company_contacts
    const contactRes = await client.query<{
      customerRole: string
      isPrimary: boolean
      name: string
    }>(
      `SELECT "customerRole", "isPrimary", name
       FROM company_contacts
       WHERE "companyId" = $1
         AND LOWER(email) = $2
         AND "isActive" = true
       LIMIT 1`,
      [companyId, userEmail]
    )

    let contact = contactRes.rows[0] ?? null

    // Fallback: try matching by username part (before @) against all contacts for this company
    if (!contact) {
      const usernamePart = userEmail.split('@')[0]
      if (usernamePart) {
        const fallbackRes = await client.query<{
          customerRole: string
          isPrimary: boolean
          name: string
        }>(
          `SELECT "customerRole", "isPrimary", name
           FROM company_contacts
           WHERE "companyId" = $1
             AND LOWER(email) LIKE $2
             AND "isActive" = true
           LIMIT 1`,
          [companyId, usernamePart + '@%']
        )
        contact = fallbackRes.rows[0] ?? null
      }
    }

    // Second fallback: user authenticated via the correct tenant — allow as basic viewer
    if (!contact) {
      contact = {
        customerRole: 'CLIENT_USER',
        isPrimary: false,
        name: userName || userEmail,
      }
    }

    const isManager = contact.customerRole === 'CLIENT_MANAGER' || contact.isPrimary
    const role = contact.customerRole || 'CLIENT_USER'

    // 6. Create session cookie
    const sessionData: PortalSessionData = {
      email: userEmail,
      name: userName || contact.name || userEmail,
      companySlug: finalSlug,
      role,
      isManager,
      exp: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
    }

    const token = createPortalSession(sessionData)
    await setPortalSessionCookie(token)

    // 7. Redirect to returnTo (if provided in state) or portal dashboard
    const returnTo = typeof stateObj.returnTo === 'string' && stateObj.returnTo.startsWith('/') && !stateObj.returnTo.startsWith('//')
      ? stateObj.returnTo
      : `/portal/${finalSlug}/dashboard`
    return NextResponse.redirect(`${baseUrl}${returnTo}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[portal/auth/callback] Error:', msg)
    return new NextResponse(
      errorPage('An internal error occurred during authentication. Please try again.'),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    )
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Error page HTML
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
    a { color:#22d3ee; text-decoration:underline; }
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
