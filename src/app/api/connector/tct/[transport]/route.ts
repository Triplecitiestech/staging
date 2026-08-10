// src/app/api/connector/tct/[transport]/route.ts
//
// Remote MCP connector for Claude, authorized by OUR OWN OAuth server.
//
//   MCP endpoint:        https://<your-domain>/api/connector/tct/mcp
//   Resource metadata:   https://<your-domain>/.well-known/oauth-protected-resource/api/connector/tct/mcp
//   Authorization server: https://<your-domain>  (see /.well-known/oauth-authorization-server)
//
// WHY THIS MOUNT EXISTS. The Entra-backed mount drops every 60-90 minutes and
// nothing on our side could fix it: claude.ai's custom-connector proxy never
// refreshes OAuth tokens (anthropics/claude-ai-mcp#228) and ignores the token
// endpoint of external identity providers specifically. So the ACCESS TOKEN
// LIFETIME is the reconnect interval, and Entra's ceiling is 24 hours.
//
// Being our own authorization server removes both halves of that: no external
// IdP for the proxy to mishandle, and the token lifetime is a number we choose
// (default 30 days). Entra is still the identity provider one layer down — the
// user signs in with Azure AD at /authorize — so per-technician attribution for
// Autotask impersonation and the HR audit actor is unchanged.
//
// The tool surface is IDENTICAL to the Entra mount and comes from the same
// builder; only the auth differs. A NEW URL is required rather than reusing the
// old one, because a Claude client caches the authorization server per
// connector URL and that cache survives remove/re-add (learned 2026-07-16).

import { withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { buildConnectorHandler } from '@/lib/connector/build-mcp-handler'
import { verifyAccessToken } from '@/lib/connector/oauth/tokens'
import { CHALLENGE_SCOPE } from '@/lib/connector/oauth/metadata'

export const runtime = 'nodejs'
export const maxDuration = 60

const handler = buildConnectorHandler('/api/connector/tct')

/**
 * Verify one of our own access tokens. Same AuthInfo shape the Entra verifier
 * returns — `extra.email` is what the write tools read for attribution, so it
 * must stay on this exact path.
 */
async function verify(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  const v = await verifyAccessToken(bearerToken)
  if (!v || !bearerToken) return undefined
  return {
    token: bearerToken,
    scopes: v.scopes,
    clientId: v.clientId,
    extra: { sub: v.email, email: v.email },
  }
}

const authHandler = withMcpAuth(handler, verify, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/connector/tct/mcp',
})

/**
 * Add the RFC 6750 `scope` parameter to the 401 challenge.
 *
 * Anthropic's connector docs make this the FIRST-CHOICE way to control what
 * Claude asks for: "To control which scopes Claude requests, include a scope
 * parameter in the WWW-Authenticate header on your 401 response." Without it,
 * whether `offline_access` is requested — and therefore whether a refresh token
 * exists at all — depends on Claude's fallback reading of metadata documents.
 * That dependency is exactly what went unverified for two weeks against Entra,
 * so state it explicitly here instead.
 *
 * mcp-handler builds the rest of the challenge (error, error_description,
 * resource_metadata); this only appends, and only when scope is absent.
 */
async function withScopeChallenge(request: Request): Promise<Response> {
  const res = (await authHandler(request)) as Response
  if (res.status !== 401) return res
  const existing = res.headers.get('www-authenticate')
  if (!existing || /(^|[\s,])scope=/i.test(existing)) return res
  const headers = new Headers(res.headers)
  headers.set('WWW-Authenticate', `${existing}, scope="${CHALLENGE_SCOPE}"`)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export { withScopeChallenge as GET, withScopeChallenge as POST }
