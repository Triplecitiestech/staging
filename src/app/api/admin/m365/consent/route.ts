/**
 * GET /api/admin/m365/consent?companyId=<id>
 *
 * Initiates the Microsoft Entra "admin consent" flow for the multi-tenant
 * TCT app registration. Redirects the staff user (who is opening this
 * link in front of a customer admin who must sign in) to Microsoft's
 * adminconsent endpoint scoped to "organizations" — restricting consent
 * to work/school accounts only.
 *
 * On success, Microsoft redirects to the callback route with
 *   ?tenant=<customerTenantId>&admin_consent=True&state=<signedState>
 *
 * Required env vars:
 *   - M365_PORTAL_CLIENT_ID      — Application (client) ID of the multi-tenant TCT app
 *   - M365_PORTAL_REDIRECT_URI   — optional override of callback URL (defaults to NEXT_PUBLIC_BASE_URL + /api/admin/m365/consent/callback)
 *   - ONBOARDING_SIGNING_KEY     — used by signState() in portal-session
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { auth } from '@/auth'
import { signState } from '@/lib/portal-session'
import { getPool } from '@/lib/db-pool'

const pool = getPool()

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('companyId')?.trim()
  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId parameter' }, { status: 400 })
  }

  const clientId = process.env.M365_PORTAL_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          'M365_PORTAL_CLIENT_ID is not configured. The multi-tenant TCT app registration ' +
          'must be set up in the TCT Entra tenant and its Application (client) ID added to Vercel env vars.',
      },
      { status: 500 }
    )
  }

  // Verify the company exists before sending the user to Microsoft
  const dbClient = await pool.connect()
  try {
    const res = await dbClient.query<{ id: string }>(
      `SELECT id FROM companies WHERE id = $1 LIMIT 1`,
      [companyId]
    )
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
  } finally {
    dbClient.release()
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'
  const redirectUri =
    process.env.M365_PORTAL_REDIRECT_URI || `${baseUrl}/api/admin/m365/consent/callback`

  const nonce = crypto.randomBytes(16).toString('hex')
  const state = signState({
    flow: 'admin_consent',
    companyId,
    nonce,
    issuedAt: Date.now(),
  })

  // Use 'organizations' so consent is restricted to work/school accounts —
  // personal Microsoft accounts ('common' would allow them) cannot grant
  // tenant-wide admin consent anyway, and including them would surface
  // confusing errors.
  const params = new URLSearchParams({
    client_id: clientId,
    // .default tells Microsoft to consent to whatever app permissions the
    // multi-tenant app registration statically declares — so the scope list
    // can never drift from what's actually requested.
    scope: 'https://graph.microsoft.com/.default',
    redirect_uri: redirectUri,
    state,
  })

  const consentUrl = `https://login.microsoftonline.com/organizations/v2.0/adminconsent?${params.toString()}`
  return NextResponse.redirect(consentUrl)
}
