// src/lib/connector/auth.ts
//
// Pluggable OAuth auth for the MCP connector. The authorization server is
// selected by CONNECTOR_AUTH_PROVIDER:
//
//   'workos' (default) — WorkOS AuthKit. Legacy behavior, identical to the
//                        original inline verifier.
//   'entra'            — Microsoft Entra / Azure AD (reuses the staff-SSO
//                        tenant). Drops the WorkOS dependency.
//
// Both are RFC 9728 protected-resource setups: /.well-known/oauth-protected-
// resource advertises the authorization server, Claude runs the OAuth dance
// there, and we validate the AS-issued JWT here. The signed-in user's email is
// extracted so writes stay attributed to the real person (Autotask
// impersonation + HR audit actor).
//
// Switching providers is ENV-ONLY — no code change. The default is 'workos', so
// production is untouched until the Entra app is configured and the var flipped.
// The Entra specifics that vary per tenant (token audience, issuer, email claim)
// are env-configurable, so a tenant quirk is a config change, never a code
// change. See docs/runbooks/CONNECTOR_AUTH_ENTRA.md.

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { createRemoteJWKSet, jwtVerify } from 'jose'

type Provider = 'workos' | 'entra'

export function connectorAuthProvider(): Provider {
  return process.env.CONNECTOR_AUTH_PROVIDER === 'entra' ? 'entra' : 'workos'
}

// Canonical resource id for the connector (RFC 9728 `resource`; also the RFC
// 8707 resource indicator Claude sends). Shared by both providers.
const resourceUrl = () => process.env.MCP_RESOURCE_URL

// ── WorkOS (legacy) ──────────────────────────────────────────────────────────
const authkitDomain = () => process.env.AUTHKIT_DOMAIN

// ── Entra ────────────────────────────────────────────────────────────────────
const entraIssuer = () =>
  process.env.CONNECTOR_ENTRA_ISSUER ||
  (process.env.CONNECTOR_ENTRA_TENANT_ID
    ? `https://login.microsoftonline.com/${process.env.CONNECTOR_ENTRA_TENANT_ID}/v2.0`
    : undefined)
// The value our server accepts as the token `aud`. IMPORTANT: Entra v2 access
// tokens ALWAYS carry the app's CLIENT ID (a GUID) as `aud` — NOT the
// Application ID URI. So CONNECTOR_ENTRA_AUDIENCE must be the app's client id.
// (The Application ID URI is still set on the app so Claude sends it as the
// RFC 8707 `resource` param; it just isn't what lands in `aud`.)
const entraAudience = () => process.env.CONNECTOR_ENTRA_AUDIENCE

// Lazy JWKS singletons (one per provider; created on first verify).
let workosJwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getWorkosJwks() {
  const domain = authkitDomain()
  if (!domain) return null
  if (!workosJwks) workosJwks = createRemoteJWKSet(new URL(`${domain}/oauth2/jwks`))
  return workosJwks
}

let entraJwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getEntraJwks() {
  const tenant = process.env.CONNECTOR_ENTRA_TENANT_ID
  if (!tenant) return null
  if (!entraJwks) {
    entraJwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`)
    )
  }
  return entraJwks
}

/** RFC 9728 protected-resource metadata for the active provider. */
export function getProtectedResourceMetadata(): Record<string, unknown> {
  if (connectorAuthProvider() === 'entra') {
    const issuer = entraIssuer()
    const body: Record<string, unknown> = {
      resource: resourceUrl(),
      authorization_servers: issuer ? [issuer] : [],
      bearer_methods_supported: ['header'],
    }
    const scopes = process.env.CONNECTOR_ENTRA_SCOPES
    if (scopes) body.scopes_supported = scopes.split(/\s+/).filter(Boolean)
    return body
  }
  const domain = authkitDomain()
  return {
    resource: resourceUrl(),
    authorization_servers: domain ? [domain] : [],
    bearer_methods_supported: ['header'],
  }
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === 'string' && v.trim().length) return v
  return undefined
}

/**
 * Verify a bearer token for the active provider and resolve the caller's
 * identity. Returns undefined (→ 401) on any failure — fail-closed, matching
 * the original verifier.
 */
export async function verifyConnectorToken(bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined

  try {
    if (connectorAuthProvider() === 'entra') {
      const jwks = getEntraJwks()
      const issuer = entraIssuer()
      const audience = entraAudience()
      if (!jwks || !issuer || !audience) return undefined
      const { payload } = await jwtVerify(bearerToken, jwks, { issuer, audience })
      const p = payload as Record<string, unknown>
      const sub = typeof p.sub === 'string' ? p.sub : undefined
      // Entra work/school access tokens carry the UPN/email in one of these,
      // depending on the tenant + optional-claims config (see the runbook).
      const email = firstString(p.preferred_username, p.email, p.upn, p.unique_name)?.toLowerCase()
      return {
        token: bearerToken,
        scopes: typeof p.scp === 'string' ? (p.scp as string).split(' ') : [],
        clientId: firstString(p.azp, p.appid, sub) ?? 'unknown',
        extra: { sub, email },
      }
    }

    // WorkOS (default) — unchanged from the original inline verifier.
    const jwks = getWorkosJwks()
    const domain = authkitDomain()
    const resource = resourceUrl()
    if (!jwks || !domain || !resource) return undefined
    const { payload } = await jwtVerify(bearerToken, jwks, { issuer: domain, audience: resource })
    const sub = typeof payload.sub === 'string' ? payload.sub : undefined
    // Dynamic import keeps the heavy write-tools/Autotask graph out of the
    // lightweight /.well-known metadata route, which also imports this module.
    const { resolveUserEmail } = await import('@/lib/mcp-write-tools')
    const email = await resolveUserEmail(sub, (payload as Record<string, unknown>).email)
    return {
      token: bearerToken,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
      clientId: (payload.client_id as string) ?? sub ?? 'unknown',
      extra: { sub, email },
    }
  } catch {
    return undefined
  }
}
