import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie, destroySession, clearSessionCookie } from '@/lib/onboarding-session'
import { logSecurityEvent } from '@/lib/security'

export async function POST(request: NextRequest) {
  try {
    // Get the current session token from cookie
    const sessionToken = await getSessionCookie()

    if (sessionToken) {
      // Destroy the session
      destroySession(sessionToken)

      // Log the logout
      logSecurityEvent('Onboarding session logout', {
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      }, 'low')
    }

    // Clear the cookie
    await clearSessionCookie()

    return NextResponse.json(
      { success: true, message: 'Logged out successfully' },
      { status: 200 }
    )

  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
