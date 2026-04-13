import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { auth } from '@/auth'
import { hasPermission } from '@/lib/permissions'
import { exchangeCodeForTokens } from '@/lib/gusto/oauth'
import { getGustoEnvironment } from '@/lib/gusto/config'
import { saveNewConnection, updateCompanyInfo } from '@/lib/gusto/connection'
import { verifyConnection } from '@/lib/gusto/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/integrations/gusto/callback
 *
 * OAuth callback. Verifies state, exchanges code for tokens, saves connection.
 */
export async function GET(request: NextRequest) {
  const settingsUrl = new URL('/admin/settings/integrations/gusto', request.url)

  const session = await auth()
  if (!session?.user?.email || !session.user.role) {
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }
  if (!hasPermission(session.user.role, 'manage_pto_integrations', session.user.permissionOverrides)) {
    settingsUrl.searchParams.set('error', 'forbidden')
    return NextResponse.redirect(settingsUrl)
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const err = request.nextUrl.searchParams.get('error')
  if (err) {
    settingsUrl.searchParams.set('error', err)
    return NextResponse.redirect(settingsUrl)
  }
  if (!code || !state) {
    settingsUrl.searchParams.set('error', 'missing_code_or_state')
    return NextResponse.redirect(settingsUrl)
  }

  // Validate state
  const cookieValue = request.cookies.get('gusto_oauth_state')?.value
  if (!cookieValue) {
    settingsUrl.searchParams.set('error', 'state_cookie_missing')
    return NextResponse.redirect(settingsUrl)
  }
  const lastDot = cookieValue.lastIndexOf('.')
  if (lastDot === -1) {
    settingsUrl.searchParams.set('error', 'state_cookie_malformed')
    return NextResponse.redirect(settingsUrl)
  }
  const payload = cookieValue.slice(0, lastDot)
  const providedSig = cookieValue.slice(lastDot + 1)
  const signingKey = process.env.NEXTAUTH_SECRET
  if (!signingKey) {
    settingsUrl.searchParams.set('error', 'server_misconfigured')
    return NextResponse.redirect(settingsUrl)
  }
  const expectedSig = crypto.createHmac('sha256', signingKey).update(payload).digest('base64url')
  if (providedSig !== expectedSig) {
    settingsUrl.searchParams.set('error', 'state_signature_invalid')
    return NextResponse.redirect(settingsUrl)
  }
  // Split on FIRST dot only: state is base64url (no dots), but the email after
  // the separator may contain dots (e.g. user@example.com).
  const firstDot = payload.indexOf('.')
  if (firstDot === -1) {
    settingsUrl.searchParams.set('error', 'state_payload_malformed')
    return NextResponse.redirect(settingsUrl)
  }
  const stateFromCookie = payload.slice(0, firstDot)
  const userEmailFromCookie = payload.slice(firstDot + 1)
  if (stateFromCookie !== state || userEmailFromCookie !== session.user.email) {
    settingsUrl.searchParams.set('error', 'state_mismatch')
    return NextResponse.redirect(settingsUrl)
  }

  const env = getGustoEnvironment()
  try {
    const tokens = await exchangeCodeForTokens(code, env)
    const connection = await saveNewConnection({ env, tokens, connectedByEmail: session.user.email })

    // Try to resolve company UUID immediately so downstream features work
    try {
      const info = await verifyConnection()
      if (info.primaryCompany) {
        await updateCompanyInfo(connection.id, info.primaryCompany.uuid, info.primaryCompany.name)
      }
    } catch (verifyErr) {
      console.warn('[gusto] post-connect verify failed:', verifyErr)
    }

    settingsUrl.searchParams.set('connected', '1')
  } catch (err2) {
    const msg = err2 instanceof Error ? err2.message : String(err2)
    settingsUrl.searchParams.set('error', 'token_exchange_failed')
    settingsUrl.searchParams.set('detail', encodeURIComponent(msg).slice(0, 200))
  }

  const res = NextResponse.redirect(settingsUrl)
  res.cookies.delete('gusto_oauth_state')
  return res
}
