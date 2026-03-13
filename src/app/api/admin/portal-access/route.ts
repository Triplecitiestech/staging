import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createSession, setSessionCookie } from '@/lib/onboarding-session'

/**
 * GET /api/admin/portal-access?company=slug
 *
 * Staff impersonation endpoint: creates a customer portal session
 * for an authenticated admin user and redirects to the customer dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication and role
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden: requires Super Admin or Admin role' }, { status: 403 })
    }

    const companySlug = request.nextUrl.searchParams.get('company')
    if (!companySlug) {
      return NextResponse.json({ error: 'company parameter required' }, { status: 400 })
    }

    const slug = companySlug.toLowerCase().trim()

    // Verify company exists
    const { prisma } = await import('@/lib/prisma')
    const company = await prisma.company.findUnique({
      where: { slug },
      select: { id: true, displayName: true },
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Create a customer portal session for this company
    const token = createSession(slug)
    await setSessionCookie(token)

    console.log(`[Admin Portal Access] Staff ${session.user?.email} impersonating customer portal for ${company.displayName} (${slug})`)

    // Redirect to the customer portal
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin
    return NextResponse.redirect(new URL(`/onboarding/${slug}`, baseUrl))
  } catch (error) {
    console.error('[Admin Portal Access] Error:', error)
    return NextResponse.json({ error: 'Failed to create portal access' }, { status: 500 })
  }
}
