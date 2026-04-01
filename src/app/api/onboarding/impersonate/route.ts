import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createPortalSession, setPortalSessionCookie, type PortalSessionData } from '@/lib/portal-session'

export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding/impersonate
 *
 * Admin impersonation endpoint — creates a portal session that lets an admin
 * fully act as a specific customer user. Supports dual-identity audit trail.
 *
 * Body: { companySlug: string, contactId?: string }
 *   - contactId: optional — specific contact to impersonate
 *   - If omitted, impersonates the primary contact on the account
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['SUPER_ADMIN', 'ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json({ error: 'Forbidden: requires Super Admin or Admin role' }, { status: 403 })
    }

    const body = await request.json()
    const { companySlug, contactId } = body

    if (!companySlug || typeof companySlug !== 'string') {
      return NextResponse.json({ error: 'companySlug is required' }, { status: 400 })
    }

    const { prisma } = await import('@/lib/prisma')

    // Verify the company exists
    const company = await prisma.company.findUnique({
      where: { slug: companySlug.toLowerCase().trim() },
      select: { id: true, slug: true, displayName: true }
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Resolve target contact — either by explicit ID or find primary
    let targetContact: { email: string; name: string | null; customerRole: string | null; isPrimary: boolean } | null = null

    if (contactId) {
      // Impersonate a specific contact
      targetContact = await prisma.companyContact.findFirst({
        where: { id: contactId, companyId: company.id, isActive: true },
        select: { email: true, name: true, customerRole: true, isPrimary: true },
      })
      if (!targetContact) {
        return NextResponse.json({ error: 'Contact not found or inactive' }, { status: 404 })
      }
    } else {
      // Default: find primary contact or first CLIENT_MANAGER
      targetContact = await prisma.companyContact.findFirst({
        where: {
          companyId: company.id,
          isActive: true,
          OR: [
            { isPrimary: true },
            { customerRole: 'CLIENT_MANAGER' },
          ],
        },
        select: { email: true, name: true, customerRole: true, isPrimary: true },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      })

      // If still no contact, fall back to any active contact
      if (!targetContact) {
        targetContact = await prisma.companyContact.findFirst({
          where: { companyId: company.id, isActive: true },
          select: { email: true, name: true, customerRole: true, isPrimary: true },
          orderBy: { name: 'asc' },
        })
      }
    }

    const adminEmail = session.user?.email ?? 'admin@triplecitiestech.com'
    const adminName = session.user?.name ?? 'TCT Admin'

    // Determine the impersonated user's role
    const targetRole = targetContact
      ? (targetContact.customerRole === 'CLIENT_MANAGER' || targetContact.isPrimary)
        ? 'CLIENT_MANAGER'
        : (targetContact.customerRole || 'CLIENT_USER')
      : 'CLIENT_MANAGER' // Fallback if no contacts exist

    const targetIsManager = targetRole === 'CLIENT_MANAGER'

    // Build the session — use the target user's identity for authorization,
    // but store the admin's identity in the impersonation context for auditing
    const sessionData: PortalSessionData = {
      email: targetContact?.email ?? adminEmail,
      name: targetContact?.name ?? adminName,
      companySlug: company.slug,
      role: targetRole,
      isManager: targetIsManager,
      exp: Date.now() + 8 * 60 * 60 * 1000,
      impersonation: {
        adminEmail,
        adminName,
        targetEmail: targetContact?.email ?? adminEmail,
        targetName: targetContact?.name ?? company.displayName ?? company.slug,
      },
    }

    const token = createPortalSession(sessionData)
    await setPortalSessionCookie(token)

    console.log(`[Impersonate] Admin ${adminEmail} impersonating ${targetContact?.email ?? 'primary user'} for company ${company.displayName} (${company.slug})`)

    return NextResponse.json({
      success: true,
      portalUrl: `/onboarding/${company.slug}`,
      impersonating: {
        email: targetContact?.email ?? null,
        name: targetContact?.name ?? null,
        role: targetRole,
        companyName: company.displayName,
      },
    })
  } catch (error) {
    console.error('Impersonate error:', error)
    return NextResponse.json(
      { error: 'Failed to impersonate', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
