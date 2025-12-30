// Onboarding session management with secure signed cookies
// Uses signed cookies instead of server-side sessions for serverless compatibility
import crypto from 'crypto'
import { cookies } from 'next/headers'

const SESSION_COOKIE_NAME = 'onboarding_session'
const SESSION_LIFETIME = 12 * 60 * 60 * 1000 // 12 hours in milliseconds

// Get signing key from environment or use a default (in production, MUST be in env)
const SIGNING_KEY = process.env.ONBOARDING_SIGNING_KEY || 'default-signing-key-change-in-production'

// Create a signed session token containing company slug and expiration
export function createSession(companySlug: string): string {
  const expires = Date.now() + SESSION_LIFETIME
  const payload = JSON.stringify({ companySlug, expires })

  // Create HMAC signature
  const signature = crypto
    .createHmac('sha256', SIGNING_KEY)
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
      console.log('[Session Validation] Invalid token format')
      return null
    }

    const payload = Buffer.from(payloadB64, 'base64').toString('utf-8')

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', SIGNING_KEY)
      .update(payload)
      .digest('hex')

    if (signature !== expectedSignature) {
      console.log('[Session Validation] Invalid signature')
      return null
    }

    // Parse and validate payload
    const data = JSON.parse(payload)

    if (Date.now() > data.expires) {
      console.log('[Session Validation] Token expired')
      return null
    }

    console.log('[Session Validation] Valid session for:', data.companySlug)
    return data.companySlug

  } catch (error) {
    console.error('[Session Validation] Error:', error)
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

  console.log('[Set Cookie] Setting session cookie:', {
    name: SESSION_COOKIE_NAME,
    tokenLength: token.length,
    maxAge: SESSION_LIFETIME / 1000
  })

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

  console.log('[Get Cookie] Reading session cookie:', {
    found: !!cookie,
    tokenLength: cookie?.value?.length || 0
  })

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
