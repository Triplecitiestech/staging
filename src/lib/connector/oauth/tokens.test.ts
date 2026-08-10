// Tests for the connector authorization server's security-critical pure logic.
//
// Every case here names a way the flow could be broken open. These are the
// checks that stand between a registered OAuth client and write access to
// Autotask, IT Glue and UniFi, so they are asserted by behaviour rather than
// trusted to review.

import { createHash } from 'crypto'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import {
  accessTokenTtlSeconds,
  connectorResourceUrl,
  isConfigured,
  isRegisterableRedirectUri,
  redirectUriAllowed,
  signAccessToken,
  verifyAccessToken,
  verifyPkce,
} from './tokens'
import { authorizationServerMetadata, protectedResourceMetadata, SUPPORTED_SCOPES } from './metadata'

const KEY = 'test-signing-key-that-is-definitely-long-enough-32+'
const BASE = 'https://www.example.test'

const ENV_KEYS = [
  'CONNECTOR_OAUTH_SIGNING_KEY',
  'NEXT_PUBLIC_BASE_URL',
  'CONNECTOR_OAUTH_ACCESS_TTL_DAYS',
] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  process.env.CONNECTOR_OAUTH_SIGNING_KEY = KEY
  process.env.NEXT_PUBLIC_BASE_URL = BASE
  delete process.env.CONNECTOR_OAUTH_ACCESS_TTL_DAYS
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

const challengeFor = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

describe('PKCE', () => {
  it('accepts a correct S256 verifier', () => {
    const v = 'a'.repeat(64)
    expect(verifyPkce(v, challengeFor(v), 'S256')).toBe(true)
  })

  it('rejects a wrong verifier', () => {
    expect(verifyPkce('wrong', challengeFor('a'.repeat(64)), 'S256')).toBe(false)
  })

  // OAuth 2.1 forbids `plain`. Accepting it would let anyone who intercepts the
  // authorization request redeem the code, which is the whole attack PKCE exists
  // to stop — so a client asking for plain must fail, not silently downgrade.
  it('refuses the plain method even when the value matches', () => {
    const v = 'a'.repeat(64)
    expect(verifyPkce(v, v, 'plain')).toBe(false)
  })

  it('refuses an empty verifier or challenge', () => {
    expect(verifyPkce('', 'x', 'S256')).toBe(false)
    expect(verifyPkce('x', '', 'S256')).toBe(false)
  })
})

describe('redirect_uri matching', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback', 'http://localhost/callback']

  it('accepts an exactly registered URI', () => {
    expect(redirectUriAllowed('https://claude.ai/api/mcp/auth_callback', registered)).toBe(true)
  })

  // RFC 8252 §7.3 — Claude Code binds a random port each session and only
  // declares the port-less form. Without this, every Claude Code connect fails.
  it('ignores the port on loopback so Claude Code can connect', () => {
    expect(redirectUriAllowed('http://localhost:3118/callback', registered)).toBe(true)
    expect(redirectUriAllowed('http://localhost:51999/callback', registered)).toBe(true)
  })

  it('does not let the loopback exemption cross host or path', () => {
    expect(redirectUriAllowed('http://localhost:3118/evil', registered)).toBe(false)
    expect(redirectUriAllowed('http://127.0.0.1:3118/callback', registered)).toBe(false)
  })

  // The open-redirect case: no prefix or substring matching, ever.
  it('rejects a lookalike host or an appended path', () => {
    expect(redirectUriAllowed('https://claude.ai.evil.test/api/mcp/auth_callback', registered)).toBe(false)
    expect(redirectUriAllowed('https://claude.ai/api/mcp/auth_callback/../x', registered)).toBe(false)
    expect(redirectUriAllowed('https://evil.test/cb', registered)).toBe(false)
  })

  it('rejects everything when nothing is registered', () => {
    expect(redirectUriAllowed('https://claude.ai/api/mcp/auth_callback', [])).toBe(false)
  })
})

describe('registration allowlist', () => {
  it('accepts the documented Claude callback and loopback forms', () => {
    expect(isRegisterableRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(isRegisterableRedirectUri('http://localhost/callback')).toBe(true)
    expect(isRegisterableRedirectUri('http://127.0.0.1/callback')).toBe(true)
  })

  // Registration is open in RFC 7591; we narrow it because an arbitrary
  // registered callback plus one phished staff sign-in is a stolen token.
  it('refuses arbitrary third-party and non-loopback http callbacks', () => {
    expect(isRegisterableRedirectUri('https://evil.test/cb')).toBe(false)
    expect(isRegisterableRedirectUri('http://evil.test/cb')).toBe(false)
    expect(isRegisterableRedirectUri('https://notclaude.ai/cb')).toBe(false)
    expect(isRegisterableRedirectUri('not-a-url')).toBe(false)
  })
})

describe('access tokens', () => {
  it('round-trips the signed-in identity for write attribution', async () => {
    const t = await signAccessToken({ email: 'Tech@Example.test', clientId: 'c1', scope: 'mcp.access' })
    const v = await verifyAccessToken(t)
    expect(v?.email).toBe('tech@example.test')
    expect(v?.clientId).toBe('c1')
    expect(v?.scopes).toContain('mcp.access')
  })

  it('rejects a token signed with a different key', async () => {
    const t = await signAccessToken({ email: 'a@b.test', clientId: 'c1', scope: 'mcp.access' })
    process.env.CONNECTOR_OAUTH_SIGNING_KEY = 'another-key-also-long-enough-to-pass-32ch'
    expect(await verifyAccessToken(t)).toBeNull()
  })

  // Rotating the signing key is the documented break-glass revocation, so it
  // has to actually invalidate outstanding tokens — asserted above — and an
  // unset key must verify NOTHING rather than fall open.
  it('fails closed when no signing key is configured', async () => {
    const t = await signAccessToken({ email: 'a@b.test', clientId: 'c1', scope: 'mcp.access' })
    delete process.env.CONNECTOR_OAUTH_SIGNING_KEY
    expect(isConfigured()).toBe(false)
    expect(await verifyAccessToken(t)).toBeNull()
  })

  it('rejects a token issued for a different audience', async () => {
    const t = await signAccessToken({ email: 'a@b.test', clientId: 'c1', scope: 'mcp.access' })
    process.env.NEXT_PUBLIC_BASE_URL = 'https://other.test'
    expect(await verifyAccessToken(t)).toBeNull()
  })

  it('rejects garbage and empty tokens', async () => {
    expect(await verifyAccessToken(undefined)).toBeNull()
    expect(await verifyAccessToken('')).toBeNull()
    expect(await verifyAccessToken('not.a.jwt')).toBeNull()
  })

  it('defaults to a 30-day lifetime and honours the override', () => {
    expect(accessTokenTtlSeconds()).toBe(30 * 86400)
    process.env.CONNECTOR_OAUTH_ACCESS_TTL_DAYS = '7'
    expect(accessTokenTtlSeconds()).toBe(7 * 86400)
  })

  it('ignores a nonsense TTL override rather than issuing an instantly-dead token', () => {
    process.env.CONNECTOR_OAUTH_ACCESS_TTL_DAYS = '0'
    expect(accessTokenTtlSeconds()).toBe(30 * 86400)
    process.env.CONNECTOR_OAUTH_ACCESS_TTL_DAYS = 'banana'
    expect(accessTokenTtlSeconds()).toBe(30 * 86400)
  })
})

describe('discovery metadata', () => {
  // The July failure in one assertion: offline_access has to be on the
  // AUTHORIZATION SERVER document, because that is the one Claude reads when
  // deciding whether to ask for a refresh token.
  it('advertises offline_access on the authorization server document', () => {
    expect(authorizationServerMetadata().scopes_supported).toContain('offline_access')
  })

  it('advertises S256 PKCE, DCR and both grants', () => {
    const m = authorizationServerMetadata()
    expect(m.code_challenge_methods_supported).toEqual(['S256'])
    expect(m.grant_types_supported).toEqual(['authorization_code', 'refresh_token'])
    expect(m.registration_endpoint).toBe(`${BASE}/api/connector/oauth/register`)
    expect(m.token_endpoint_auth_methods_supported).toEqual(['none'])
    expect(m.issuer).toBe(BASE)
  })

  // Anthropic: the resource field must equal the MCP URL exactly as the user
  // types it into Claude, path component included.
  it('points the protected resource at this mount and at our own AS', () => {
    const m = protectedResourceMetadata()
    expect(m.resource).toBe(`${BASE}/api/connector/tct/mcp`)
    expect(m.resource).toBe(connectorResourceUrl())
    expect(m.authorization_servers).toEqual([BASE])
    expect(m.scopes_supported).toEqual(SUPPORTED_SCOPES)
  })
})
