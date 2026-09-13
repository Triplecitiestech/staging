// POST /api/field/login/request  { email }
//
// Step 1 of contractor login. Enrolled or not, the response is the same
// ({ ok: true } + the pending-email cookie) so the endpoint never reveals who
// is enrolled. Per-IP limit: 10 requests per hour → 429.

import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiOk, generateRequestId } from '@/lib/api-response'
import { checkCsrf, isValidEmail } from '@/lib/security'
import { CODE_TTL_MS, clientIpFromHeaders, requestLoginCode } from '@/lib/field/login'
import { FIELD_PENDING_COOKIE, FIELD_RESPONSE_HEADERS } from '@/lib/field/edge'
import { normaliseEmail } from '@/lib/field/tokens'
import { isMissingTableError } from '@/lib/field/store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const reqId = generateRequestId()
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  let body: { email?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid request body', reqId, 400)
  }

  const email = normaliseEmail(body.email)
  if (!email || !isValidEmail(email)) {
    return apiError('Enter a valid email address.', reqId, 400)
  }

  try {
    const result = await requestLoginCode(email, {
      ip: clientIpFromHeaders(request.headers),
      userAgent: request.headers.get('user-agent'),
    })

    if (result.outcome === 'rate_limited') {
      const res = apiError('Too many code requests. Try again later.', reqId, 429, 'rate_limited')
      res.headers.set('Retry-After', '3600')
      return res
    }

    // AWAIT the send. A floating promise does not survive the response on
    // Vercel — the function freezes and the request never reaches Resend,
    // which is exactly what happened on the first production sign-in. The
    // send is time-boxed (8s) in email.ts, and a delivery failure never fails
    // the request: the code is already stored and staff can read it back on
    // /field/admin.
    if (result.outcome === 'issued') {
      await result.delivery.catch(() => 'failed' as const)
    }

    const res = apiOk({ ok: true, next: '/field/login/code' }, reqId)
    for (const [k, v] of Object.entries(FIELD_RESPONSE_HEADERS)) res.headers.set(k, v)
    res.cookies.set(FIELD_PENDING_COOKIE, email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(CODE_TTL_MS / 1000),
    })
    return res
  } catch (err) {
    if (isMissingTableError(err)) {
      console.error('[field] field_* tables missing — POST /api/migrations/run has not been run')
      return apiError('Sign-in is not available yet.', reqId, 503, 'not_configured')
    }
    console.error('[field] code request failed:', err instanceof Error ? err.message : String(err))
    return apiError('Something went wrong. Try again.', reqId, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
