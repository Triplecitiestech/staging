// src/lib/field/edge.ts
//
// Pure, Edge-runtime-safe rules shared by src/middleware.ts and the Node-side
// guards. NOTHING in here may import pg, next/headers or any Node built-in:
// the middleware runs on the Edge runtime.
//
// Why the middleware only checks the cookie's SHAPE: the session lookup needs
// Postgres (`pg`), which is not available on the Edge runtime, and switching
// the whole site's middleware to the Node runtime for one feature is not a
// change this feature should make. So the split is:
//   middleware  → headers on every /field/* response, redirect when the
//                 cookie is absent or malformed (no DB)
//   Node guard  → hash lookup, expiry, contractor active, last_seen throttle
//                 (src/lib/field/session.ts), run by every protected page/route

export const FIELD_SESSION_COOKIE = 'field_session'
/** Short-lived cookie carrying the email the code was requested for. */
export const FIELD_PENDING_COOKIE = 'field_login_pending'

export const FIELD_ROOT = '/field'
export const FIELD_LOGIN_PATH = '/field/login'
export const FIELD_PLAYBOOK_PATH = '/field/playbook'

/** Headers every /field/* response carries. */
export const FIELD_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'private, no-store',
}

export function isFieldPath(pathname: string): boolean {
  return pathname === FIELD_ROOT || pathname.startsWith(`${FIELD_ROOT}/`)
}

/**
 * Paths under /field that do NOT require a contractor session:
 *   /field/login, /field/login/code  — the login flow itself
 *   /field/logout                    — must work with a dead cookie
 *   /field/admin                     — STAFF page, gated by NextAuth not by a
 *                                      contractor session
 */
export function isFieldPublicPath(pathname: string): boolean {
  return (
    pathname === FIELD_LOGIN_PATH ||
    pathname.startsWith(`${FIELD_LOGIN_PATH}/`) ||
    pathname === '/field/logout' ||
    pathname === '/field/admin' ||
    pathname.startsWith('/field/admin/')
  )
}

/** A cookie that is not exactly 64 lowercase hex chars is treated as missing. */
export function isWellFormedSessionToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}
