// /field/logout — delete the session row, clear the cookie, back to login.
// Works with a dead or missing cookie too.

import { NextResponse, type NextRequest } from 'next/server'
import { FIELD_LOGIN_PATH, FIELD_RESPONSE_HEADERS, FIELD_SESSION_COOKIE, isWellFormedSessionToken } from '@/lib/field/edge'
import { deleteSessionByTokenHash, writeAudit } from '@/lib/field/store'
import { sha256Hex } from '@/lib/field/tokens'

export const dynamic = 'force-dynamic'

async function logout(request: NextRequest) {
  const token = request.cookies.get(FIELD_SESSION_COOKIE)?.value
  if (isWellFormedSessionToken(token)) {
    try {
      const deleted = await deleteSessionByTokenHash(sha256Hex(token))
      if (deleted) {
        await writeAudit({ actorType: 'contractor', actorId: deleted.contractorId, event: 'logout' })
      }
    } catch (err) {
      console.error('[field] logout failed to delete session:', err instanceof Error ? err.message : String(err))
    }
  }
  const response = NextResponse.redirect(new URL(FIELD_LOGIN_PATH, request.url), 302)
  for (const [key, value] of Object.entries(FIELD_RESPONSE_HEADERS)) response.headers.set(key, value)
  response.cookies.set(FIELD_SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
  return response
}

export async function GET(request: NextRequest) {
  return logout(request)
}

export async function POST(request: NextRequest) {
  return logout(request)
}
