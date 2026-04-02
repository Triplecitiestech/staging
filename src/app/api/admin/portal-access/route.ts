import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createPortalSession, setPortalSessionCookie, type PortalSessionData } from '@/lib/portal-session'

/**
 * GET /api/admin/portal-access?company=slug&contactId=optional
 *
 * Staff impersonation endpoint: creates a customer portal session
 * for an authenticated admin user and redirects to the customer dashboard.
 * Now supports true impersonation with dual-identity audit trail.
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
    const contactId = request.nextUrl.searchParams.get('contactId')

    if (!companySlug) {
      return NextResponse.json({ error: 'company parameter required' }, { status: 400 })
    }

    const slug = companySlug.toLowerCase().trim()

    // Verify company exists
    const { prisma } = await import('@/lib/prisma')
    const company = await prisma.company.findUnique({
      where: { slug },
      select: { id: true, displayName: true, slug: true },
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Resolve target contact — by ID or find primary
    let targetContact: { email: string; name: string | null; customerRole: string | null; isPrimary: boolean } | null = null

    try {
      if (contactId) {
        targetContact = await prisma.companyContact.findFirst({
          where: { id: contactId, companyId: company.id, isActive: true },
          select: { email: true, name: true, customerRole: true, isPrimary: true },
        })
      }

      if (!targetContact) {
        targetContact = await prisma.companyContact.findFirst({
          where: { companyId: company.id, isActive: true, isPrimary: true },
          select: { email: true, name: true, customerRole: true, isPrimary: true },
        })
      }

      if (!targetContact) {
        targetContact = await prisma.companyContact.findFirst({
          where: { companyId: company.id, isActive: true, customerRole: 'CLIENT_MANAGER' },
          select: { email: true, name: true, customerRole: true, isPrimary: true },
        })
      }

      if (!targetContact) {
        targetContact = await prisma.companyContact.findFirst({
          where: { companyId: company.id, isActive: true },
          select: { email: true, name: true, customerRole: true, isPrimary: true },
        })
      }
    } catch (contactErr) {
      console.error('[Admin Portal Access] Contact lookup failed:', contactErr instanceof Error ? contactErr.message : String(contactErr))
    }

    const adminEmail = session.user?.email ?? 'admin@triplecitiestech.com'
    const adminName = session.user?.name ?? 'TCT Admin'

    const targetRole = targetContact
      ? (targetContact.customerRole === 'CLIENT_MANAGER' || targetContact.isPrimary)
        ? 'CLIENT_MANAGER'
        : (targetContact.customerRole || 'CLIENT_USER')
      : 'CLIENT_MANAGER'

    const companyDisplayName = company.displayName ?? slug

    const sessionData: PortalSessionData = {
      email: targetContact?.email ?? adminEmail,
      name: targetContact?.name ?? `${companyDisplayName} (Admin View)`,
      companySlug: slug,
      role: targetRole,
      isManager: targetRole === 'CLIENT_MANAGER',
      exp: Date.now() + 8 * 60 * 60 * 1000,
      impersonation: {
        adminEmail,
        adminName,
        targetEmail: targetContact?.email ?? 'No contacts on file',
        targetName: targetContact?.name ?? companyDisplayName,
      },
    }

    const token = createPortalSession(sessionData)
    await setPortalSessionCookie(token)

    console.log(`[Admin Portal Access] Staff ${adminEmail} impersonating ${targetContact?.email ?? 'primary user'} for ${company.displayName} (${slug})`)

    // Redirect to the customer portal
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin
    return NextResponse.redirect(new URL(`/onboarding/${slug}`, baseUrl))
  } catch (error) {
    console.error('[Admin Portal Access] Error:', error)
    return NextResponse.json({ error: 'Failed to create portal access' }, { status: 500 })
  }
}
