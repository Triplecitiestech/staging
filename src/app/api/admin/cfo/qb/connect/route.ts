import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'
import { getAuthUrl, isConfigured } from '@/lib/cfo/qb-auth'

export const dynamic = 'force-dynamic'

// Initiates the QuickBooks OAuth flow. Sets a random state in an httpOnly
// cookie (CSRF protection) and redirects to Intuit's consent screen.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || !(await canAccessCfoDashboard(session))) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }
  if (!isConfigured()) {
    return NextResponse.redirect(new URL('/admin/cfo?qb=not_configured', request.url))
  }

  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(getAuthUrl(state))
  res.cookies.set('qb_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return res
}
