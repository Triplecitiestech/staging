import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/test/auth
 *
 * Test-only endpoint that creates an authenticated session for e2e testing.
 * Only available when E2E_TEST_SECRET environment variable is set.
 * NEVER enable in production.
 *
 * Body: { email: string, role?: string }
 * Returns: { success: true, sessionToken: string }
 */
export async function POST(request: NextRequest) {
  const testSecret = process.env.E2E_TEST_SECRET
  if (!testSecret) {
    return NextResponse.json({ error: 'Test auth not available' }, { status: 404 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${testSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { email, role } = body

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    // Ensure test staff user exists
    let staffUser = await prisma.staffUser.findUnique({
      where: { email },
      select: { id: true, email: true, role: true },
    })

    if (!staffUser) {
      staffUser = await prisma.staffUser.create({
        data: {
          email,
          name: 'E2E Test User',
          role: role || 'SUPER_ADMIN',
          isActive: true,
          lastLogin: new Date(),
        },
        select: { id: true, email: true, role: true },
      })
    }

    // Ensure NextAuth user + account exist
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: 'E2E Test User' },
      })
    }

    // Create a session directly in the database
    const crypto = await import('crypto')
    const sessionToken = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    })

    // Set the session cookie
    const cookieStore = await cookies()
    const secureCookie = process.env.NODE_ENV === 'production'
    const cookieName = secureCookie
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token'

    cookieStore.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      path: '/',
      expires,
    })

    return NextResponse.json({
      success: true,
      sessionToken,
      cookieName,
      user: { email: staffUser.email, role: staffUser.role },
    })
  } catch (error) {
    console.error('[test/auth] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create test session' },
      { status: 500 }
    )
  }
}
