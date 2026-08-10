// src/app/api/connector/oauth/token/route.ts
//
// Token endpoint for the connector's own OAuth server.
//
// Two grants: authorization_code (PKCE-verified, single-use) and refresh_token
// (rotated on every use). Public client — there is no client_secret to check,
// so PKCE is what binds the code to the client that requested it.
//
// Body MUST be accepted as application/x-www-form-urlencoded (RFC 6749
// §4.1.3); Claude sends both the initial exchange and refreshes that way, and a
// JSON-only parser here is a documented cause of 415s. JSON is also accepted
// because tolerating it costs nothing and rejecting it would be a confusing
// failure for anyone testing by hand.
//
// Error codes are RFC 6749 spellings on purpose: Anthropic's docs require
// `invalid_grant` (not invalid_request, not a custom code) when a refresh token
// is no longer valid, or Claude will not fall back to re-authorizing.

import {
  accessTokenTtlSeconds,
  refreshTokenTtlSeconds,
  redirectUriAllowed,
  signAccessToken,
  verifyPkce,
  isConfigured,
  CONNECTOR_SCOPE,
} from '@/lib/connector/oauth/tokens'
import {
  consumeAuthCode,
  getClient,
  newSecret,
  rotateRefreshToken,
  saveRefreshToken,
  OAuthStoreUnavailable,
} from '@/lib/connector/oauth/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const NO_STORE = { ...CORS_HEADERS, 'Cache-Control': 'no-store', Pragma: 'no-cache' }

function err(code: string, description: string, status = 400) {
  return Response.json({ error: code, error_description: description }, { status, headers: NO_STORE })
}

async function readParams(request: Request): Promise<URLSearchParams> {
  const ct = request.headers.get('content-type') || ''
  const raw = await request.text()
  if (ct.includes('application/json')) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>
      const sp = new URLSearchParams()
      for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') sp.set(k, v)
      return sp
    } catch {
      return new URLSearchParams()
    }
  }
  return new URLSearchParams(raw)
}

async function issue(clientId: string, userEmail: string, scope: string) {
  const accessToken = await signAccessToken({ email: userEmail, clientId, scope })
  const refreshToken = newSecret()
  await saveRefreshToken(refreshToken, { clientId, userEmail, scope }, refreshTokenTtlSeconds())
  return Response.json(
    {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: accessTokenTtlSeconds(),
      refresh_token: refreshToken,
      scope,
    },
    { headers: NO_STORE }
  )
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return err('server_error', 'Authorization server is not configured (missing signing key or base URL)', 503)
  }

  const p = await readParams(request)
  const grantType = p.get('grant_type')
  const clientId = p.get('client_id')
  if (!clientId) return err('invalid_client', 'client_id is required')

  try {
    const client = await getClient(clientId)
    if (!client) return err('invalid_client', 'Unknown client_id', 401)

    if (grantType === 'authorization_code') {
      const code = p.get('code')
      const redirectUri = p.get('redirect_uri')
      const verifier = p.get('code_verifier')
      if (!code) return err('invalid_request', 'code is required')
      if (!verifier) return err('invalid_request', 'code_verifier is required (PKCE)')

      // Single-use by construction — consumeAuthCode marks it spent atomically,
      // so a replay of the same code loses the race and lands here as
      // invalid_grant even if it is otherwise well-formed.
      const rec = await consumeAuthCode(code)
      if (!rec) return err('invalid_grant', 'Authorization code is invalid, expired, or already used')

      // The code is bound to the client that requested it. Without this check,
      // any registered client could redeem another's code.
      if (rec.clientId !== clientId) {
        return err('invalid_grant', 'Authorization code was not issued to this client')
      }
      if (!redirectUri || redirectUri !== rec.redirectUri) {
        return err('invalid_grant', 'redirect_uri does not match the authorization request')
      }
      if (!redirectUriAllowed(redirectUri, client.redirectUris)) {
        return err('invalid_grant', 'redirect_uri is not registered for this client')
      }
      if (!verifyPkce(verifier, rec.codeChallenge, rec.codeChallengeMethod)) {
        return err('invalid_grant', 'PKCE verification failed')
      }

      return await issue(clientId, rec.userEmail, rec.scope || CONNECTOR_SCOPE)
    }

    if (grantType === 'refresh_token') {
      const presented = p.get('refresh_token')
      if (!presented) return err('invalid_request', 'refresh_token is required')

      // Rotation: the new token is minted first so the old row can record what
      // replaced it, and the response that invalidates the old one carries the
      // new one — the ordering Anthropic's docs require of public clients.
      const replacement = newSecret()
      const rec = await rotateRefreshToken(presented, replacement)
      if (!rec) return err('invalid_grant', 'Refresh token is invalid, expired, or already used')
      if (rec.clientId !== clientId) {
        return err('invalid_grant', 'Refresh token was not issued to this client')
      }

      const scope = rec.scope || CONNECTOR_SCOPE
      const accessToken = await signAccessToken({ email: rec.userEmail, clientId, scope })
      await saveRefreshToken(replacement, { clientId, userEmail: rec.userEmail, scope }, refreshTokenTtlSeconds())
      return Response.json(
        {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: accessTokenTtlSeconds(),
          refresh_token: replacement,
          scope,
        },
        { headers: NO_STORE }
      )
    }

    return err('unsupported_grant_type', `grant_type must be authorization_code or refresh_token`)
  } catch (e) {
    if (e instanceof OAuthStoreUnavailable) return err('server_error', e.message, 503)
    throw e
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
