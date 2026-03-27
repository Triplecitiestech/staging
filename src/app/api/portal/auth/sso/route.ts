import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { signState } from '@/lib/portal-session'

/**
 * GET /api/portal/auth/sso
 *
 * Initiates Microsoft 365 SSO without requiring the user to enter their email first.
 * Uses Azure AD "common" endpoint so any M365 account can sign in.
 * The company is discovered from the user's email AFTER authentication (in the callback).
 *
 * Uses TCT's own Azure AD app (AZURE_AD_CLIENT_ID) configured as multi-tenant,
 * or falls back to the "common" endpoint which prompts the user for their credentials.
 */
export async function GET(): Promise<NextResponse> {
  const clientId = process.env.AZURE_AD_CLIENT_ID
  if (!clientId) {
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

  // "common" endpoint allows any Azure AD or personal Microsoft account
  const authorizeUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`

  return NextResponse.redirect(authorizeUrl)
}
