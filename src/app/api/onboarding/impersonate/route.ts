import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createPortalSession, setPortalSessionCookie, type PortalSessionData } from '@/lib/portal-session'

export const dynamic = 'force-dynamic'

// POST /api/onboarding/impersonate - Admin impersonates a customer portal session
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden: requires Super Admin or Admin role' }, { status: 403 })
    }

    const { companySlug } = await request.json()

    if (!companySlug || typeof companySlug !== 'string') {
      return NextResponse.json({ error: 'companySlug is required' }, { status: 400 })
    }

    // Verify the company exists
    const { prisma } = await import('@/lib/prisma')
    const company = await prisma.company.findUnique({
      where: { slug: companySlug },
      select: { id: true, slug: true }
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Create a portal session for admin impersonation
    const sessionData: PortalSessionData = {
      email: session.user?.email ?? 'admin@triplecitiestech.com',
      name: session.user?.name ?? 'TCT Admin',
      companySlug: company.slug,
      role: 'CLIENT_MANAGER',
      isManager: true,
      exp: Date.now() + 8 * 60 * 60 * 1000,
    }
    const token = createPortalSession(sessionData)
    await setPortalSessionCookie(token)

    return NextResponse.json({
      success: true,
      portalUrl: `/onboarding/${company.slug}`
    })
  } catch (error) {
    console.error('Impersonate error:', error)
    return NextResponse.json(
      { error: 'Failed to impersonate', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
