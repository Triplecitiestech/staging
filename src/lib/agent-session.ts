// Sales Agent Portal session management.
// HMAC-signed cookies — same pattern as src/lib/onboarding-session.ts but
// scoped to agent IDs and a separate cookie name. This is intentionally
// independent from staff M365 SSO at /admin.

import crypto from 'crypto'
import { cookies } from 'next/headers'

const SESSION_COOKIE_NAME = 'tct_agent_session'
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000 // 12 hours

function getSigningKey(): string {
  const key = process.env.AGENT_SIGNING_KEY || process.env.ONBOARDING_SIGNING_KEY
  if (key) return key
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    console.error('[SECURITY] AGENT_SIGNING_KEY (and ONBOARDING_SIGNING_KEY) not set in production — agent sessions are insecure')
  }
  return 'dev-only-agent-signing-key'
}

export function createAgentSession(agentId: string): string {
  const expires = Date.now() + SESSION_LIFETIME_MS
  const payload = JSON.stringify({ agentId, expires })
  const signature = crypto.createHmac('sha256', getSigningKey()).update(payload).digest('hex')
  return Buffer.from(payload).toString('base64') + '.' + signature
}

export function validateAgentSession(token: string): string | null {
  try {
    const [payloadB64, signature] = token.split('.')
    if (!payloadB64 || !signature) return null
    const payload = Buffer.from(payloadB64, 'base64').toString('utf-8')
    const expected = crypto.createHmac('sha256', getSigningKey()).update(payload).digest('hex')
    // Constant-time compare to avoid timing attacks
    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null
    const data = JSON.parse(payload)
    if (typeof data.expires !== 'number' || Date.now() > data.expires) return null
    if (typeof data.agentId !== 'string') return null
    return data.agentId
  } catch {
    return null
  }
}

export async function setAgentSessionCookie(token: string): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_LIFETIME_MS / 1000,
    path: '/',
  })
}

export async function clearAgentSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE_NAME)
}

export async function getAgentSessionCookie(): Promise<string | null> {
  const store = await cookies()
  return store.get(SESSION_COOKIE_NAME)?.value || null
}

export async function getCurrentAgentId(): Promise<string | null> {
  const token = await getAgentSessionCookie()
  if (!token) return null
  return validateAgentSession(token)
}
