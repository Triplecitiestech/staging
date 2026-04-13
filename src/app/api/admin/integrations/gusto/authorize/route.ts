import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { buildAuthorizeUrl, generateOAuthState } from '@/lib/gusto/oauth'
import { getGustoEnvironment } from '@/lib/gusto/config'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/integrations/gusto/authorize
 *
 * Initiates Gusto OAuth. Generates a CSRF state, sets it in a short-lived
 * signed HttpOnly cookie, and redirects the admin to Gusto.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasPermission(session.user.role, 'manage_pto_integrations', session.user.permissionOverrides)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const state = generateOAuthState()
  const signingKey = process.env.NEXTAUTH_SECRET
  if (!signingKey) {
    return NextResponse.json({ error: 'Server misconfigured (NEXTAUTH_SECRET missing)' }, { status: 500 })
  }
  // Bind state to the user to prevent cross-user replay
  const payload = `${state}.${session.user.email}`
  const sig = crypto.createHmac('sha256', signingKey).update(payload).digest('base64url')
  const cookieValue = `${payload}.${sig}`

  let url: string
  try {
    url = buildAuthorizeUrl({ state, env: getGustoEnvironment() })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build authorize URL' },
      { status: 500 }
    )
  }

  const res = NextResponse.redirect(url, { status: 302 })
  res.cookies.set('gusto_oauth_state', cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes
  })
  return res
}
