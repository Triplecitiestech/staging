import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'
import { exchangeCode } from '@/lib/cfo/qb-auth'

export const dynamic = 'force-dynamic'

// Intuit redirect target. Validates the state cookie (CSRF), exchanges the
// authorization code for tokens, and returns to the dashboard.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || !(await canAccessCfoDashboard(session))) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const realmId = params.get('realmId')
  const state = params.get('state')
  const cookieState = request.cookies.get('qb_oauth_state')?.value

  const done = (status: string) => {
    const res = NextResponse.redirect(new URL(`/admin/cfo?qb=${status}`, request.url))
    res.cookies.delete('qb_oauth_state')
    return res
  }

  if (!code || !realmId) return done('error')
  if (!state || !cookieState || state !== cookieState) return done('csrf')

  try {
    await exchangeCode(code, realmId)
    return done('connected')
  } catch (err) {
    console.error('[cfo/qb/callback] token exchange failed:', err instanceof Error ? err.message : String(err))
    return done('error')
  }
}
