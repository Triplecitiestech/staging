// Onboarding session management with secure cookies
import crypto from 'crypto'
import { cookies } from 'next/headers'

const SESSION_COOKIE_NAME = 'onboarding_session'
const SESSION_LIFETIME = 12 * 60 * 60 * 1000 // 12 hours in milliseconds

// In-memory session store (for serverless, this resets on each deployment)
// In production, consider using Redis or a database
const sessions = new Map<string, { companySlug: string; expires: number }>()

// Generate a secure session token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Create a new session
export function createSession(companySlug: string): string {
  const token = generateSessionToken()
  const expires = Date.now() + SESSION_LIFETIME

  sessions.set(token, { companySlug, expires })

  // Cleanup expired sessions
  cleanupExpiredSessions()

  return token
}

// Validate a session token and return the company slug if valid
export function validateSession(token: string): string | null {
  const session = sessions.get(token)

  if (!session) {
    return null
  }

  // Check if session has expired
  if (Date.now() > session.expires) {
    sessions.delete(token)
    return null
  }

  return session.companySlug
}

// Destroy a session
export function destroySession(token: string): void {
  sessions.delete(token)
}

// Cleanup expired sessions
function cleanupExpiredSessions(): void {
  const now = Date.now()
  sessions.forEach((session, token) => {
    if (now > session.expires) {
      sessions.delete(token)
    }
  })
}

// Set session cookie (Next.js 15 cookies API)
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_LIFETIME / 1000, // maxAge is in seconds
    path: '/onboarding',
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
