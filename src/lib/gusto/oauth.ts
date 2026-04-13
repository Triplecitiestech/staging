/**
 * Gusto OAuth 2.0 (authorization code flow).
 *
 * Flow:
 *   1. Admin clicks "Connect Gusto" in our UI
 *   2. We redirect to Gusto's /oauth/authorize with state
 *   3. Gusto redirects back to our /callback with ?code=... &state=...
 *   4. We exchange code for { access_token, refresh_token, expires_in }
 *   5. Store both tokens + expiry in gusto_connections row
 *   6. Refresh access token before expiry (or on 401 response)
 *
 * Important: Gusto refresh tokens are single-use. Each refresh returns a NEW
 * refresh_token that replaces the previous one. Persist atomically.
 */

import crypto from 'crypto'
import { getGustoApiBase, getGustoClientCredentials, getGustoOAuthBase, type GustoEnvironment } from './config'

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

export interface AuthorizeParams {
  env?: GustoEnvironment
  state: string
  scope?: string
}

export function buildAuthorizeUrl({ env, state, scope }: AuthorizeParams): string {
  const { clientId, redirectUri } = getGustoClientCredentials()
  const base = getGustoOAuthBase(env)
  const url = new URL('/oauth/authorize', base)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  if (scope) url.searchParams.set('scope', scope)
  return url.toString()
}

/** Generate an opaque CSRF state token for OAuth round-trip */
export function generateOAuthState(): string {
  return crypto.randomBytes(24).toString('base64url')
}

// ---------------------------------------------------------------------------
// Token exchange + refresh
// ---------------------------------------------------------------------------

export interface GustoTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number // seconds
  scope?: string
  created_at?: number
}

async function postTokenEndpoint(
  env: GustoEnvironment,
  body: URLSearchParams
): Promise<GustoTokenResponse> {
  const url = `${getGustoApiBase(env)}/oauth/token`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gusto token endpoint failed (${res.status}): ${text}`)
  }
  return (await res.json()) as GustoTokenResponse
}

/** Exchange an authorization code for access + refresh tokens */
export async function exchangeCodeForTokens(
  code: string,
  env: GustoEnvironment
): Promise<GustoTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGustoClientCredentials()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  })
  return postTokenEndpoint(env, body)
}

/** Refresh an expired access token. Returns a NEW refresh_token that MUST replace the old one. */
export async function refreshAccessToken(
  refreshToken: string,
  env: GustoEnvironment
): Promise<GustoTokenResponse> {
  const { clientId, clientSecret } = getGustoClientCredentials()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })
  return postTokenEndpoint(env, body)
}
