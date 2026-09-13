// POST /api/field/login/verify  { code }
//
// Step 2 of contractor login. The email comes from the pending cookie set by
// step 1. Every attempt waits ATTEMPT_DELAY_MS before answering, right or wrong.

import { NextRequest, NextResponse } from 'next/server'
import { setTimeout as sleep } from 'timers/promises'
import { apiError, apiOk, generateRequestId } from '@/lib/api-response'
import { checkCsrf } from '@/lib/security'
import { ATTEMPT_DELAY_MS, clientIpFromHeaders, verifyLoginCode } from '@/lib/field/login'
import { fieldSessionCookieOptions } from '@/lib/field/session'
import { FIELD_PENDING_COOKIE, FIELD_RESPONSE_HEADERS, FIELD_SESSION_COOKIE } from '@/lib/field/edge'
import { isWellFormedLoginCode, normaliseEmail } from '@/lib/field/tokens'
import { isMissingTableError } from '@/lib/field/store'

export const dynamic = 'force-dynamic'

const WRONG_CODE = 'That code didn’t work.'
const REQUEST_NEW = 'Request a new code.'

export async function POST(request: NextRequest) {
  const reqId = generateRequestId()
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  let body: { code?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  // The delay applies to EVERY attempt, including malformed ones.
  await sleep(ATTEMPT_DELAY_MS)

  const email = normaliseEmail(request.cookies.get(FIELD_PENDING_COOKIE)?.value)
  if (!email) return apiError(REQUEST_NEW, reqId, 400, 'request_new_code')

  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : ''
  if (!isWellFormedLoginCode(code)) return apiError(WRONG_CODE, reqId, 401, 'invalid_code')

  try {
    const result = await verifyLoginCode(email, code, {
      ip: clientIpFromHeaders(request.headers),
      userAgent: request.headers.get('user-agent'),
    })

    if (!result.ok) {
      return result.reason === 'invalid'
        ? apiError(WRONG_CODE, reqId, 401, 'invalid_code')
        : apiError(REQUEST_NEW, reqId, 401, 'request_new_code')
    }

    const res = apiOk({ ok: true, redirect: '/field' }, reqId)
    for (const [k, v] of Object.entries(FIELD_RESPONSE_HEADERS)) res.headers.set(k, v)
    res.cookies.set(FIELD_SESSION_COOKIE, result.sessionToken, fieldSessionCookieOptions(result.expiresAt))
    res.cookies.set(FIELD_PENDING_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
    return res
  } catch (err) {
    if (isMissingTableError(err)) {
      return apiError('Sign-in is not available yet.', reqId, 503, 'not_configured')
    }
    console.error('[field] code verify failed:', err instanceof Error ? err.message : String(err))
    return apiError('Something went wrong. Try again.', reqId, 500)
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
