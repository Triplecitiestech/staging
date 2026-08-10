// src/lib/connector/oauth/store.ts
//
// Persistence for the connector's OWN OAuth authorization server.
//
// Raw pg (getPool()), not Prisma — same as every other connector_* table
// (docs/gotchas.md -> Database rules). New tables are created by
// /api/migrations/run; POST it once after deploy or every call here fails
// with 42P01.
//
// SECRETS ARE STORED HASHED. Authorization codes and refresh tokens are the
// bearer credentials of this flow, so only their SHA-256 lands in the
// database. A dump of these tables cannot be replayed against the token
// endpoint. There is deliberately no column that could hold the plaintext.

import { createHash, randomBytes } from 'crypto'
import { getPool } from '@/lib/db-pool'

/** Opaque credential generator — 32 bytes of CSPRNG, base64url. */
export function newSecret(): string {
  return randomBytes(32).toString('base64url')
}

/** The only representation of a code/refresh token we ever persist. */
export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export interface OAuthClient {
  clientId: string
  clientName: string | null
  redirectUris: string[]
}

export interface AuthCodeRecord {
  clientId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
  resource: string | null
  userEmail: string
  scope: string | null
}

export interface RefreshRecord {
  clientId: string
  userEmail: string
  scope: string | null
}

/** Thrown when the tables have not been created yet (POST /api/migrations/run). */
export class OAuthStoreUnavailable extends Error {
  constructor() {
    super('connector OAuth tables are missing — POST /api/migrations/run once after deploy')
    this.name = 'OAuthStoreUnavailable'
  }
}

function rethrow(err: unknown): never {
  // 42P01 = undefined_table. Surfaced as its own error so a missing migration
  // reads as "not deployed yet" rather than an opaque 500.
  if (typeof err === 'object' && err && (err as { code?: string }).code === '42P01') {
    throw new OAuthStoreUnavailable()
  }
  throw err
}

// ── Clients (RFC 7591 dynamic registration) ─────────────────────────────────

export async function registerClient(
  clientId: string,
  clientName: string | null,
  redirectUris: string[]
): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO connector_oauth_clients (client_id, client_name, redirect_uris)
       VALUES ($1, $2, $3)
       ON CONFLICT (client_id) DO UPDATE
         SET client_name = EXCLUDED.client_name,
             redirect_uris = EXCLUDED.redirect_uris`,
      [clientId, clientName, redirectUris]
    )
  } catch (err) { rethrow(err) }
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT client_id, client_name, redirect_uris
         FROM connector_oauth_clients WHERE client_id = $1`,
      [clientId]
    )
    if (!rows.length) return null
    const r = rows[0] as { client_id: string; client_name: string | null; redirect_uris: string[] }
    return { clientId: r.client_id, clientName: r.client_name, redirectUris: r.redirect_uris ?? [] }
  } catch (err) { rethrow(err) }
}

// ── Authorization codes ─────────────────────────────────────────────────────

export async function saveAuthCode(code: string, rec: AuthCodeRecord, ttlSeconds: number): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO connector_oauth_codes
         (code_hash, client_id, redirect_uri, code_challenge, code_challenge_method,
          resource, user_email, scope, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + ($9 || ' seconds')::interval)`,
      [
        hashSecret(code), rec.clientId, rec.redirectUri, rec.codeChallenge,
        rec.codeChallengeMethod, rec.resource, rec.userEmail, rec.scope, String(ttlSeconds),
      ]
    )
  } catch (err) { rethrow(err) }
}

/**
 * Single-use redemption. The UPDATE ... WHERE consumed_at IS NULL RETURNING is
 * the atomicity: two concurrent exchanges of the same code cannot both win, so
 * a stolen code is useless once the legitimate client has used it (OAuth 2.1
 * requires codes be single-use).
 */
export async function consumeAuthCode(code: string): Promise<AuthCodeRecord | null> {
  try {
    const { rows } = await getPool().query(
      `UPDATE connector_oauth_codes
          SET consumed_at = NOW()
        WHERE code_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
        RETURNING client_id, redirect_uri, code_challenge, code_challenge_method,
                  resource, user_email, scope`,
      [hashSecret(code)]
    )
    if (!rows.length) return null
    const r = rows[0] as {
      client_id: string; redirect_uri: string; code_challenge: string
      code_challenge_method: string; resource: string | null; user_email: string; scope: string | null
    }
    return {
      clientId: r.client_id,
      redirectUri: r.redirect_uri,
      codeChallenge: r.code_challenge,
      codeChallengeMethod: r.code_challenge_method,
      resource: r.resource,
      userEmail: r.user_email,
      scope: r.scope,
    }
  } catch (err) { rethrow(err) }
}

// ── Refresh tokens ──────────────────────────────────────────────────────────

export async function saveRefreshToken(token: string, rec: RefreshRecord, ttlSeconds: number): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO connector_oauth_refresh_tokens
         (token_hash, client_id, user_email, scope, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::interval)`,
      [hashSecret(token), rec.clientId, rec.userEmail, rec.scope, String(ttlSeconds)]
    )
  } catch (err) { rethrow(err) }
}

/**
 * Rotate: consume the presented refresh token and record which token replaced
 * it. Public clients MUST rotate (OAuth 2.1 / MCP authorization spec), and
 * Anthropic's connector docs require the new token be returned in the same
 * response that invalidates the old one.
 */
export async function rotateRefreshToken(oldToken: string, newToken: string): Promise<RefreshRecord | null> {
  try {
    const { rows } = await getPool().query(
      `UPDATE connector_oauth_refresh_tokens
          SET revoked_at = NOW(), rotated_to = $2
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
        RETURNING client_id, user_email, scope`,
      [hashSecret(oldToken), hashSecret(newToken)]
    )
    if (!rows.length) return null
    const r = rows[0] as { client_id: string; user_email: string; scope: string | null }
    return { clientId: r.client_id, userEmail: r.user_email, scope: r.scope }
  } catch (err) { rethrow(err) }
}

/** Revoke every refresh token for one user — the per-person kill switch. */
export async function revokeUserRefreshTokens(userEmail: string): Promise<number> {
  try {
    const { rowCount } = await getPool().query(
      `UPDATE connector_oauth_refresh_tokens
          SET revoked_at = NOW()
        WHERE lower(user_email) = lower($1) AND revoked_at IS NULL`,
      [userEmail]
    )
    return rowCount ?? 0
  } catch (err) { rethrow(err) }
}
