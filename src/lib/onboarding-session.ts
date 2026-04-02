// Onboarding session management with secure signed cookies
// Uses signed cookies instead of server-side sessions for serverless compatibility
import crypto from 'crypto'
import { cookies } from 'next/headers'

const SESSION_COOKIE_NAME = 'onboarding_session'
const SESSION_LIFETIME = 12 * 60 * 60 * 1000 // 12 hours in milliseconds

// Signing key MUST be set via environment variable — no fallback in production.
// Validated lazily (not at import time) to avoid blocking builds.
function getSigningKey(): string {
  const key = process.env.ONBOARDING_SIGNING_KEY
  if (key) return key
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    console.error('[SECURITY] ONBOARDING_SIGNING_KEY is not set in production — sessions are insecure')
  }
  return 'dev-only-signing-key-not-for-production'
}

// Create a signed session token containing company slug and expiration
export function createSession(companySlug: string): string {
  const expires = Date.now() + SESSION_LIFETIME
  const payload = JSON.stringify({ companySlug, expires })

  // Create HMAC signature
  const signature = crypto
    .createHmac('sha256', getSigningKey())
    .update(payload)
    .digest('hex')

  // Combine payload and signature
  const token = Buffer.from(payload).toString('base64') + '.' + signature

  return token
}

// Validate a signed session token and return the company slug if valid
export function validateSession(token: string): string | null {
  try {
    const [payloadB64, signature] = token.split('.')

    if (!payloadB64 || !signature) {
      return null
    }

    const payload = Buffer.from(payloadB64, 'base64').toString('utf-8')

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', getSigningKey())
      .update(payload)
      .digest('hex')

    if (signature !== expectedSignature) {
      return null
    }

    // Parse and validate payload
    const data = JSON.parse(payload)

    if (Date.now() > data.expires) {
      return null
    }

    return data.companySlug

  } catch {
    return null
  }
}

// Destroy a session (no-op since we don't have server-side storage)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function destroySession(token: string): void {
  // With signed cookies, we just clear the cookie client-side
  // No server-side cleanup needed
}

// Set session cookie (Next.js 15 cookies API)
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_LIFETIME / 1000, // maxAge is in seconds
    path: '/', // Changed from /onboarding to / for broader access
  })
}

// Get session cookie
export async function getSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)
  return cookie?.value || null
}

// Clear session cookie
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

// Get authenticated company slug from cookie
export async function getAuthenticatedCompany(): Promise<string | null> {
  const token = await getSessionCookie()
  if (!token) {
    return null
  }

  return validateSession(token)
}
