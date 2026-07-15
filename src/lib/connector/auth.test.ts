/**
 * Unit tests for the connector's pluggable auth provider selection and the
 * RFC 9728 protected-resource metadata it advertises. Token signature checks
 * are I/O (Entra/WorkOS JWKS) and are validated live per
 * docs/runbooks/CONNECTOR_AUTH_ENTRA.md; here we lock the deterministic logic.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { connectorAuthProvider, getProtectedResourceMetadata } from './auth'

afterEach(() => vi.unstubAllEnvs())

describe('connectorAuthProvider', () => {
  it('defaults to workos when unset or unrecognized', () => {
    vi.stubEnv('CONNECTOR_AUTH_PROVIDER', '')
    expect(connectorAuthProvider()).toBe('workos')
    vi.stubEnv('CONNECTOR_AUTH_PROVIDER', 'something-else')
    expect(connectorAuthProvider()).toBe('workos')
  })

  it('selects entra only on the exact value', () => {
    vi.stubEnv('CONNECTOR_AUTH_PROVIDER', 'entra')
    expect(connectorAuthProvider()).toBe('entra')
  })
})

describe('getProtectedResourceMetadata', () => {
  it('workos: advertises the AuthKit domain as the authorization server', () => {
    vi.stubEnv('CONNECTOR_AUTH_PROVIDER', 'workos')
    vi.stubEnv('AUTHKIT_DOMAIN', 'https://auth.example.com')
    vi.stubEnv('MCP_RESOURCE_URL', 'https://www.triplecitiestech.com/api/connector/mcp')
    const m = getProtectedResourceMetadata()
    expect(m.resource).toBe('https://www.triplecitiestech.com/api/connector/mcp')
    expect(m.authorization_servers).toEqual(['https://auth.example.com'])
    expect(m.bearer_methods_supported).toEqual(['header'])
  })

  it('entra: derives the v2 issuer from the tenant id', () => {
    vi.stubEnv('CONNECTOR_AUTH_PROVIDER', 'entra')
    vi.stubEnv('CONNECTOR_ENTRA_ISSUER', '')
    vi.stubEnv('CONNECTOR_ENTRA_TENANT_ID', '11111111-2222-3333-4444-555555555555')
    vi.stubEnv('MCP_RESOURCE_URL', 'https://www.triplecitiestech.com/api/connector/mcp')
    const m = getProtectedResourceMetadata()
    expect(m.authorization_servers).toEqual([
      'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0',
    ])
    expect(m.resource).toBe('https://www.triplecitiestech.com/api/connector/mcp')
  })

  it('entra: honors an explicit issuer override (sovereign cloud)', () => {
    vi.stubEnv('CONNECTOR_AUTH_PROVIDER', 'entra')
    vi.stubEnv('CONNECTOR_ENTRA_ISSUER', 'https://login.microsoftonline.us/tid/v2.0')
    vi.stubEnv('CONNECTOR_ENTRA_TENANT_ID', 'tid')
    const m = getProtectedResourceMetadata()
    expect(m.authorization_servers).toEqual(['https://login.microsoftonline.us/tid/v2.0'])
  })

  it('entra: includes scopes_supported only when configured', () => {
    vi.stubEnv('CONNECTOR_AUTH_PROVIDER', 'entra')
    vi.stubEnv('CONNECTOR_ENTRA_TENANT_ID', 'tid')
    vi.stubEnv('CONNECTOR_ENTRA_SCOPES', 'api://abc/mcp.access')
    expect(getProtectedResourceMetadata().scopes_supported).toEqual(['api://abc/mcp.access'])
    vi.stubEnv('CONNECTOR_ENTRA_SCOPES', '')
    expect(getProtectedResourceMetadata().scopes_supported).toBeUndefined()
  })
})
