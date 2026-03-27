import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { signState } from '@/lib/portal-session'

/**
 * GET /api/portal/auth/sso
 *
 * Initiates Microsoft 365 SSO without requiring the user to enter their email first.
 * Uses TCT's Azure AD tenant endpoint so the app is always found in the correct directory.
 * The company is discovered from the user's email AFTER authentication (in the callback).
 */
export async function GET(): Promise<NextResponse> {
  const clientId = process.env.AZURE_AD_CLIENT_ID
  const tenantId = process.env.AZURE_AD_TENANT_ID
  if (!clientId || !tenantId) {
    return new NextResponse('Azure AD not configured', { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'
  const redirectUri = `${baseUrl}/api/portal/auth/callback`
  const nonce = crypto.randomBytes(16).toString('hex')

  // Sign state so the callback knows this is a "common" SSO flow (no company pre-selected)
  const state = signState({ flow: 'common', nonce })

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'openid profile email',
    state,
  })

  // Use TCT's tenant endpoint — the app registration lives in this tenant
  const authorizeUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`

  return NextResponse.redirect(authorizeUrl)
}
