import { NextRequest, NextResponse } from 'next/server'
import {
  WILMAR_STATUS_CODE_COOKIE,
  WILMAR_STATUS_CODE_COOKIE_MAX_AGE_SECONDS,
  WILMAR_STATUS_CODE_COOKIE_VALUE,
  verifyWilmarStatusCode,
} from '@/lib/wilmar-status-code'

/**
 * Verifies the 6-digit code for the Wilmar status page's second gate and,
 * on success, sets a marker cookie scoped to that one status URL. Genuinely
 * simple by design — no rate limiting, no lockout, no brute-force
 * protection. See src/lib/wilmar-status-code.ts for why.
 */
export async function POST(request: NextRequest) {
  let body: { token?: unknown; code?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  const code = typeof body.code === 'string' ? body.code : ''

  // Same fail-closed behavior as the page's own token check: an unconfigured
  // or mismatched token never gets past this endpoint either.
  const expectedToken = process.env.WILMAR_STATUS_TOKEN
  if (!expectedToken || token !== expectedToken || !verifyWilmarStatusCode(code)) {
    return NextResponse.json({ ok: false, message: 'Incorrect code, try again.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(WILMAR_STATUS_CODE_COOKIE, WILMAR_STATUS_CODE_COOKIE_VALUE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: WILMAR_STATUS_CODE_COOKIE_MAX_AGE_SECONDS,
    // Scoped to this one status URL, matching the token-per-URL access model.
    path: `/status/${token}`,
  })
  return response
}
