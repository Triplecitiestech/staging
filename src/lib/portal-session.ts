// Portal SSO session management with HMAC-SHA256 signed cookies
// Uses NEXTAUTH_SECRET for signing — same secret used by NextAuth.js
import crypto from 'crypto'
import { cookies } from 'next/headers'

const PORTAL_COOKIE_NAME = 'portal_session'
const SESSION_LIFETIME_S = 28800 // 8 hours in seconds

function getSigningKey(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set')
  return secret
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortalSessionData {
  email: string
  name: string
  companySlug: string
  role: string      // 'CLIENT_MANAGER' | 'CLIENT_USER' | 'CLIENT_VIEWER'
  isManager: boolean
  exp: number       // Unix timestamp (ms)
}

// ---------------------------------------------------------------------------
// Create / Verify
// ---------------------------------------------------------------------------

/** Create a signed cookie value: base64(payload).base64(hmac) */
export function createPortalSession(data: PortalSessionData): string {
  const payload = JSON.stringify(data)
  const payloadB64 = Buffer.from(payload).toString('base64')

  const hmac = crypto
    .createHmac('sha256', getSigningKey())
    .update(payload)
    .digest('base64')

  return `${payloadB64}.${hmac}`
}

/** Verify signature and expiration. Returns session data or null. */
export function verifyPortalSession(cookieValue: string): PortalSessionData | null {
  try {
    const dotIdx = cookieValue.lastIndexOf('.')
    if (dotIdx === -1) return null

    const payloadB64 = cookieValue.slice(0, dotIdx)
    const signature = cookieValue.slice(dotIdx + 1)

    const payload = Buffer.from(payloadB64, 'base64').toString('utf-8')

    const expected = crypto
      .createHmac('sha256', getSigningKey())
      .update(payload)
      .digest('base64')

    // Timing-safe comparison
    if (signature.length !== expected.length) return null
    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expected)
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null

    const data: PortalSessionData = JSON.parse(payload)

    // Check expiration
    if (Date.now() > data.exp) return null

    return data
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers (Next.js 15 cookies API)
// ---------------------------------------------------------------------------

export async function setPortalSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(PORTAL_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_LIFETIME_S,
    path: '/',
  })
}

export async function getPortalSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(PORTAL_COOKIE_NAME)
  return cookie?.value ?? null
}

export async function clearPortalSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(PORTAL_COOKIE_NAME)
}

/** Read + verify the portal session cookie. Returns session data or null. */
export async function getPortalSession(): Promise<PortalSessionData | null> {
  const token = await getPortalSessionCookie()
  if (!token) return null
  return verifyPortalSession(token)
}

// ---------------------------------------------------------------------------
// HMAC helpers for OAuth state parameter
// ---------------------------------------------------------------------------

/** Sign an OAuth state object and return base64(json).base64(hmac) */
export function signState(stateObj: Record<string, unknown>): string {
  const json = JSON.stringify(stateObj)
  const jsonB64 = Buffer.from(json).toString('base64')
  const hmac = crypto
    .createHmac('sha256', getSigningKey())
    .update(json)
    .digest('base64')
  return `${jsonB64}.${hmac}`
}

/** Verify a signed state string. Returns the parsed object or null. */
export function verifyState(state: string): Record<string, unknown> | null {
  try {
    const dotIdx = state.lastIndexOf('.')
    if (dotIdx === -1) return null

    const jsonB64 = state.slice(0, dotIdx)
    const signature = state.slice(dotIdx + 1)

    const json = Buffer.from(jsonB64, 'base64').toString('utf-8')

    const expected = crypto
      .createHmac('sha256', getSigningKey())
      .update(json)
      .digest('base64')

    if (signature.length !== expected.length) return null
    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expected)
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null

    return JSON.parse(json)
  } catch {
    return null
  }
}
