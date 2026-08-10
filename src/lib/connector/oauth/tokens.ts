// src/lib/connector/oauth/tokens.ts
//
// Token minting/verification and PKCE for the connector's own authorization
// server. Pure except for reading env — no I/O, so it is unit-testable.
//
// WHY WE ISSUE OUR OWN TOKENS AT ALL: claude.ai's custom-connector proxy does
// not refresh OAuth tokens (anthropics/claude-ai-mcp#228), so in practice the
// ACCESS TOKEN LIFETIME is the reconnect interval. Entra caps access tokens at
// 24h and defaults to 60-90 minutes, which is why the connector dropped all
// day. Issuing our own removes that ceiling.
//
// REVOCATION: there is no per-request denylist lookup — that would add a
// blocking DB round-trip to every MCP call. Two levers instead: revoke a
// person's refresh tokens (store.revokeUserRefreshTokens) to stop renewal, and
// rotate CONNECTOR_OAUTH_SIGNING_KEY to invalidate every outstanding access
// token everywhere, instantly, with one env change + redeploy. The second is
// the break-glass; document it rather than discovering it during an incident.

import { createHash, timingSafeEqual } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'

/** Default access-token lifetime. Overridable, deliberately generous — see header. */
const DEFAULT_ACCESS_TTL_DAYS = 30
/** Refresh tokens outlive access tokens so Claude Code (which DOES refresh) renews silently. */
const DEFAULT_REFRESH_TTL_DAYS = 90
/** Authorization codes are single-use and short-lived (OAuth 2.1 recommends <= 10 min). */
export const AUTH_CODE_TTL_SECONDS = 300

export const CONNECTOR_SCOPE = 'mcp.access'

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function accessTokenTtlSeconds(): number {
  return positiveInt(process.env.CONNECTOR_OAUTH_ACCESS_TTL_DAYS, DEFAULT_ACCESS_TTL_DAYS) * 86400
}

export function refreshTokenTtlSeconds(): number {
  return positiveInt(process.env.CONNECTOR_OAUTH_REFRESH_TTL_DAYS, DEFAULT_REFRESH_TTL_DAYS) * 86400
}

/** Public origin of this deployment. Never hardcode the domain (CLAUDE.md). */
export function issuerUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
}

/** Canonical resource id for the mount this AS protects (RFC 9728 `resource`). */
export function connectorResourceUrl(): string {
  return `${issuerUrl()}/api/connector/tct/mcp`
}

/**
 * Signing key. Fails closed when unset: no key means no verification, and a
 * hardcoded fallback signing key is explicitly forbidden (CLAUDE.md rule 7).
 */
function signingKey(): Uint8Array | null {
  const raw = process.env.CONNECTOR_OAUTH_SIGNING_KEY
  if (!raw || raw.length < 32) return null
  return new TextEncoder().encode(raw)
}

export function isConfigured(): boolean {
  return signingKey() !== null && issuerUrl().length > 0
}

export interface AccessTokenClaims {
  email: string
  clientId: string
  scope: string
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const key = signingKey()
  if (!key) throw new Error('CONNECTOR_OAUTH_SIGNING_KEY is not set')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ scp: claims.scope, azp: claims.clientId, email: claims.email })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
    .setIssuer(issuerUrl())
    .setAudience(connectorResourceUrl())
    .setSubject(claims.email)
    .setIssuedAt(now)
    .setExpirationTime(now + accessTokenTtlSeconds())
    .sign(key)
}

export interface VerifiedToken {
  email: string
  clientId: string
  scopes: string[]
}

/** Fail-closed verification. Returns null on ANY problem — never throws. */
export async function verifyAccessToken(token: string | undefined): Promise<VerifiedToken | null> {
  if (!token) return null
  const key = signingKey()
  if (!key) return null
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: issuerUrl(),
      audience: connectorResourceUrl(),
    })
    const p = payload as Record<string, unknown>
    const email = typeof p.email === 'string' ? p.email.toLowerCase() : undefined
    if (!email) return null
    return {
      email,
      clientId: typeof p.azp === 'string' ? p.azp : 'unknown',
      scopes: typeof p.scp === 'string' ? p.scp.split(' ').filter(Boolean) : [],
    }
  } catch {
    return null
  }
}

/**
 * PKCE (RFC 7636). S256 ONLY — `plain` is forbidden by OAuth 2.1 and Claude
 * always sends S256, so accepting `plain` would only ever weaken this.
 * Compared in constant time: a fast-exit compare on a verifier leaks it.
 */
export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== 'S256') return false
  if (!verifier || !challenge) return false
  const computed = createHash('sha256').update(verifier).digest('base64url')
  const a = Buffer.from(computed)
  const b = Buffer.from(challenge)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function parse(u: string): URL | null {
  try { return new URL(u) } catch { return null }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLoopback(u: URL): boolean {
  return u.protocol === 'http:' && LOOPBACK_HOSTS.has(u.hostname)
}

/**
 * A redirect_uri must match one the client registered — byte for byte, with
 * ONE exception. No prefix matching and no wildcards: a loose comparison here
 * is how an open redirector becomes account takeover.
 *
 * The exception is RFC 8252 §7.3 loopback: Claude Code binds an ephemeral port
 * and declares only `http://localhost/callback` + `http://127.0.0.1/callback`,
 * so the port MUST be ignored or every Claude Code connection fails. Scheme,
 * host and path still have to match exactly, and only for loopback hosts.
 */
export function redirectUriAllowed(candidate: string, registered: string[]): boolean {
  if (registered.includes(candidate)) return true
  const c = parse(candidate)
  if (!c || !isLoopback(c)) return false
  return registered.some((r) => {
    const p = parse(r)
    return !!p && isLoopback(p) && p.hostname === c.hostname && p.pathname === c.pathname
  })
}

/**
 * Registration allowlist. RFC 7591 registration is open by design; we narrow it
 * deliberately, because this authorization server fronts write access to
 * Autotask, IT Glue and UniFi. Anthropic documents exactly which callbacks its
 * surfaces use, so anything else is either a mistake or an attack — and an
 * arbitrary registered redirect URI plus one phished staff sign-in is a stolen
 * token. Widen this only for a callback Anthropic actually documents.
 */
export function isRegisterableRedirectUri(uri: string): boolean {
  const u = parse(uri)
  if (!u) return false
  if (u.protocol === 'https:' && u.hostname === 'claude.ai') return true
  return isLoopback(u)
}
