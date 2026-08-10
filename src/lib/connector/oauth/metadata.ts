// src/lib/connector/oauth/metadata.ts
//
// Discovery documents for the connector's own authorization server.
//
// Two documents, two specs, and Claude reads BOTH — they are not
// interchangeable, which is the trap that cost us the July fix:
//
//   RFC 9728 protected-resource metadata  → which AS protects this resource
//   RFC 8414 authorization-server metadata → the endpoints + what it supports
//
// Anthropic's connector docs: "Claude also appends `offline_access` when your
// AUTHORIZATION SERVER metadata lists it in scopes_supported, to obtain a
// refresh token." Putting offline_access only in the protected-resource
// document (which is what we did against Entra) does nothing for refresh.
// It belongs in authorizationServerMetadata() below, and it is there.

import { CONNECTOR_SCOPE, connectorResourceUrl, issuerUrl } from './tokens'

export const OAUTH_BASE = '/api/connector/oauth'

/** Scopes advertised by BOTH documents. offline_access is what buys a refresh token. */
export const SUPPORTED_SCOPES = [CONNECTOR_SCOPE, 'offline_access']

/** RFC 8414. Served at /.well-known/oauth-authorization-server. */
export function authorizationServerMetadata(): Record<string, unknown> {
  const base = issuerUrl()
  return {
    issuer: base,
    authorization_endpoint: `${base}${OAUTH_BASE}/authorize`,
    token_endpoint: `${base}${OAUTH_BASE}/token`,
    // Dynamic client registration: Anthropic lists DCR as supported out of the
    // box, and it is why this flow needs no client secret pasted into Claude —
    // the failure mode that took the connector down when Entra's secret lapsed.
    registration_endpoint: `${base}${OAUTH_BASE}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // The MCP authorization spec requires advertising S256 so spec-compliant
    // clients can verify PKCE support BEFORE starting the flow. Entra's OIDC
    // document omits this; ours must not.
    code_challenge_methods_supported: ['S256'],
    // Claude registers as a PUBLIC client via DCR — no client authentication
    // at the token endpoint.
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: SUPPORTED_SCOPES,
    resource_indicators_supported: true,
    service_documentation: `${base}/admin/connector/usage`,
  }
}

/** RFC 9728. Served at /.well-known/oauth-protected-resource/api/connector/tct/mcp. */
export function protectedResourceMetadata(): Record<string, unknown> {
  return {
    // Must equal the MCP URL exactly as the user types it into Claude,
    // path component included (Anthropic connector docs).
    resource: connectorResourceUrl(),
    authorization_servers: [issuerUrl()],
    bearer_methods_supported: ['header'],
    scopes_supported: SUPPORTED_SCOPES,
  }
}

/**
 * The `scope` value we put on the 401 challenge. Anthropic's docs make this
 * the FIRST-CHOICE lever: "To control which scopes Claude requests, include a
 * scope parameter in the WWW-Authenticate header on your 401 response." Being
 * explicit here means refresh-token issuance does not depend on Claude's
 * fallback behaviour or on any metadata document being read correctly.
 */
export const CHALLENGE_SCOPE = SUPPORTED_SCOPES.join(' ')
