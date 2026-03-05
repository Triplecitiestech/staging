import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createSession, setSessionCookie } from '@/lib/onboarding-session'

export const dynamic = 'force-dynamic'

// POST /api/onboarding/impersonate - Admin impersonates a customer portal session
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Create a session token for this company and set the cookie
    const token = createSession(company.slug)
    await setSessionCookie(token)

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
