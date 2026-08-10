// src/app/api/connector/oauth/register/route.ts
//
// RFC 7591 Dynamic Client Registration for the connector's own OAuth server.
//
// This endpoint is the reason the new connector needs no client secret pasted
// into Claude's Advanced settings — which is the thing that failed on
// 2026-08-10 when the Entra app's secret lapsed and every reconnect silently
// produced no token. Entra has no DCR at all; ours does, so there is no secret
// to expire.
//
// Claude registers as a PUBLIC client: no client_secret is issued, and PKCE
// carries the security instead (MCP authorization spec / OAuth 2.1).
//
// Body is application/json per RFC 7591 §3.1 — NOT form-urlencoded like
// /token. Anthropic's docs call this out because sharing one body parser
// between the two endpoints is a common cause of 415s.

import { randomUUID } from 'crypto'
import { isRegisterableRedirectUri } from '@/lib/connector/oauth/tokens'
import { registerClient, OAuthStoreUnavailable } from '@/lib/connector/oauth/store'
import { SUPPORTED_SCOPES } from '@/lib/connector/oauth/metadata'

export const runtime = 'nodejs'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function err(code: string, description: string, status = 400) {
  return Response.json({ error: code, error_description: description }, { status, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return err('invalid_client_metadata', 'Body must be JSON (RFC 7591 §3.1)')
  }

  const rawUris = body.redirect_uris
  if (!Array.isArray(rawUris) || rawUris.length === 0) {
    return err('invalid_redirect_uri', 'redirect_uris is required and must be a non-empty array')
  }

  const redirectUris = rawUris.filter((u): u is string => typeof u === 'string')
  if (redirectUris.length !== rawUris.length) {
    return err('invalid_redirect_uri', 'redirect_uris must contain only strings')
  }

  // Narrowed allowlist — see isRegisterableRedirectUri for why this is not open
  // registration. Reject the whole request rather than silently dropping the
  // offending entry: a client that thinks it registered a callback it did not
  // fails later, somewhere far less diagnosable than here.
  const rejected = redirectUris.filter((u) => !isRegisterableRedirectUri(u))
  if (rejected.length) {
    return err(
      'invalid_redirect_uri',
      `Not an accepted callback for this server: ${rejected.join(', ')}. ` +
        'Expected an https://claude.ai callback or an RFC 8252 loopback address.'
    )
  }

  const clientId = randomUUID()
  const clientName = typeof body.client_name === 'string' ? body.client_name.slice(0, 200) : null

  try {
    await registerClient(clientId, clientName, redirectUris)
  } catch (e) {
    if (e instanceof OAuthStoreUnavailable) {
      return err('server_error', e.message, 503)
    }
    throw e
  }

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName ?? undefined,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      // Public client: no secret is issued, so none can leak or expire.
      token_endpoint_auth_method: 'none',
      scope: SUPPORTED_SCOPES.join(' '),
    },
    { status: 201, headers: CORS_HEADERS }
  )
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
