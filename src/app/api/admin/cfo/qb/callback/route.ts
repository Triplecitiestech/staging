import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { canAccessCfoDashboard } from '@/lib/cfo/access'
import { exchangeCode } from '@/lib/cfo/qb-auth'
import { isEncryptionKeyConfigured } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

// Intuit redirect target. Validates the state cookie (CSRF), exchanges the
// authorization code for tokens, and returns to the Settings page (where the
// connection banner + status live).
export async function GET(request: NextRequest) {
  const done = (status: string) => {
    const res = NextResponse.redirect(new URL(`/admin/cfo/settings?qb=${status}`, request.url))
    res.cookies.delete('qb_oauth_state')
    return res
  }

  const session = await auth()
  if (!session || !(await canAccessCfoDashboard(session))) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const realmId = params.get('realmId')
  const state = params.get('state')
  const cookieState = request.cookies.get('qb_oauth_state')?.value

  if (!code || !realmId) return done('error')
  if (!state || !cookieState || state !== cookieState) return done('csrf')
  // Tokens are encrypted at rest — if the key is missing the save would throw
  // and silently bounce the user back unconnected. Surface it explicitly.
  if (!isEncryptionKeyConfigured()) return done('encryption_key')

  try {
    await exchangeCode(code, realmId)
    return done('connected')
  } catch (err) {
    console.error('[cfo/qb/callback] token exchange failed:', err instanceof Error ? err.message : String(err))
    return done('error')
  }
}
