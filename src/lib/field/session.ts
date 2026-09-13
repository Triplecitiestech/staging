// src/lib/field/session.ts
//
// Node-side half of the contractor session check (the Edge half is in
// src/middleware.ts + src/lib/field/edge.ts). Called by every protected
// /field page and route handler; anything that is not a live session for an
// ACTIVE contractor resolves to null and the caller redirects to /field/login.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { FIELD_LOGIN_PATH, FIELD_SESSION_COOKIE, isWellFormedSessionToken } from './edge'
import { sha256Hex } from './tokens'
import { findSessionByTokenHash, touchSession, type Queryable } from './store'
import { getPool } from '@/lib/db-pool'

export const FIELD_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
/** last_seen_at is written at most this often per session. */
export const LAST_SEEN_THROTTLE_MS = 10 * 60 * 1000

export interface FieldSessionContext {
  sessionId: string
  contractorId: string
  contractorName: string
  contractorEmail: string
  expiresAt: Date
}

/**
 * Resolve a raw cookie value to a session context, or null.
 * Malformed token, unknown hash, expired, or contractor inactive → null.
 * A valid hit refreshes last_seen_at when it is older than the throttle.
 */
export async function resolveFieldSession(
  token: string | undefined,
  db: Queryable = getPool(),
  now: Date = new Date(),
): Promise<FieldSessionContext | null> {
  if (!isWellFormedSessionToken(token)) return null
  const row = await findSessionByTokenHash(sha256Hex(token), db)
  if (!row) return null
  if (row.expiresAt.getTime() <= now.getTime()) return null
  if (!row.contractorActive) return null

  if (now.getTime() - row.lastSeenAt.getTime() >= LAST_SEEN_THROTTLE_MS) {
    // Fire-and-forget: a failed touch must never fail the page.
    touchSession(row.id, db).catch(() => {})
  }

  return {
    sessionId: row.id,
    contractorId: row.contractorId,
    contractorName: row.contractorName,
    contractorEmail: row.contractorEmail,
    expiresAt: row.expiresAt,
  }
}

/** Read the cookie from the current request and resolve it. */
export async function getFieldSession(): Promise<FieldSessionContext | null> {
  const store = await cookies()
  return resolveFieldSession(store.get(FIELD_SESSION_COOKIE)?.value)
}

/** For server components: resolve or redirect to the login page. */
export async function requireFieldSession(): Promise<FieldSessionContext> {
  const ctx = await getFieldSession()
  if (!ctx) redirect(FIELD_LOGIN_PATH)
  return ctx
}

/** Cookie attributes for field_session. Secure follows the repo convention. */
export function fieldSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  }
}
