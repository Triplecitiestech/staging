// src/app/api/connector/oauth/authorize/route.ts
//
// Authorization endpoint for the connector's own OAuth server.
//
// The user authenticates with the EXISTING staff NextAuth session (Azure AD),
// so per-technician attribution is preserved end to end: the signed-in email is
// bound into the authorization code here, carried into the access token, and
// read back by the MCP mount for Autotask impersonation and the HR audit actor.
// Nothing about attribution changes by moving off Entra-as-authorization-server
// — Entra is still the identity provider, one layer down.
//
// Error handling follows RFC 6749 §4.1.2.1: problems with client_id or
// redirect_uri are rendered here and NEVER redirected, because redirecting to
// an unvalidated URI is the open-redirect bug itself. Everything after those
// two checks redirects the error back to the verified callback.

import { auth } from '@/auth'
import {
  AUTH_CODE_TTL_SECONDS,
  CONNECTOR_SCOPE,
  isConfigured,
  issuerUrl,
  redirectUriAllowed,
} from '@/lib/connector/oauth/tokens'
import { getClient, newSecret, saveAuthCode, OAuthStoreUnavailable } from '@/lib/connector/oauth/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Rendered only for the two errors that must not be redirected. */
function fatal(message: string, status = 400) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Authorization error</title>` +
      `<body style="font:16px/1.5 system-ui;padding:2rem;max-width:40rem">` +
      `<h1 style="font-size:1.25rem">Authorization error</h1><p>${message}</p></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

function redirectError(redirectUri: string, code: string, description: string, state: string | null) {
  const u = new URL(redirectUri)
  u.searchParams.set('error', code)
  u.searchParams.set('error_description', description)
  if (state) u.searchParams.set('state', state)
  return Response.redirect(u.toString(), 302)
}

export async function GET(request: Request) {
  if (!isConfigured()) {
    return fatal('This authorization server is not configured (missing signing key or base URL).', 503)
  }

  const url = new URL(request.url)
  const p = url.searchParams
  const clientId = p.get('client_id')
  const redirectUri = p.get('redirect_uri')
  const state = p.get('state')

  if (!clientId) return fatal('Missing <code>client_id</code>.')
  if (!redirectUri) return fatal('Missing <code>redirect_uri</code>.')

  let client
  try {
    client = await getClient(clientId)
  } catch (e) {
    if (e instanceof OAuthStoreUnavailable) return fatal(e.message, 503)
    throw e
  }
  if (!client) return fatal('Unknown <code>client_id</code>. Re-add the connector so it registers again.')

  // Validated against what THIS client registered — not a global allowlist, so
  // one client can never be used to redirect to another's callback.
  if (!redirectUriAllowed(redirectUri, client.redirectUris)) {
    return fatal('The <code>redirect_uri</code> does not match one registered by this client.')
  }

  // ── From here every error goes back to the (now verified) callback ────────

  if (p.get('response_type') !== 'code') {
    return redirectError(redirectUri, 'unsupported_response_type', 'Only response_type=code is supported', state)
  }

  const codeChallenge = p.get('code_challenge')
  const codeChallengeMethod = p.get('code_challenge_method')
  if (!codeChallenge) {
    return redirectError(redirectUri, 'invalid_request', 'PKCE code_challenge is required', state)
  }
  if (codeChallengeMethod !== 'S256') {
    return redirectError(redirectUri, 'invalid_request', 'code_challenge_method must be S256', state)
  }

  // Staff sign-in. No session means bounce through the normal Azure AD flow and
  // come straight back to this same authorize URL with its parameters intact —
  // which is what makes the OAuth dance resume rather than restart.
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    const back = `${issuerUrl()}${url.pathname}${url.search}`
    return Response.redirect(`${issuerUrl()}/auth/signin?callbackUrl=${encodeURIComponent(back)}`, 302)
  }

  // No separate consent screen: the redirect URIs this server will register are
  // limited to Anthropic's documented callbacks, and the user just completed an
  // interactive tenant sign-in to reach this line. Add one here if the callback
  // allowlist is ever widened.
  const code = newSecret()
  try {
    await saveAuthCode(
      code,
      {
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        resource: p.get('resource'),
        userEmail: email,
        scope: p.get('scope') || CONNECTOR_SCOPE,
      },
      AUTH_CODE_TTL_SECONDS
    )
  } catch (e) {
    if (e instanceof OAuthStoreUnavailable) return fatal(e.message, 503)
    throw e
  }

  const out = new URL(redirectUri)
  out.searchParams.set('code', code)
  if (state) out.searchParams.set('state', state)
  return Response.redirect(out.toString(), 302)
}
