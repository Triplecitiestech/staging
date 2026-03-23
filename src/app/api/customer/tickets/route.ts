import { NextRequest, NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-session'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/customer/tickets?companySlug=xxx
 * Returns last 30 days of Autotask tickets for the authenticated customer's company.
 */
export async function GET(request: NextRequest) {
  try {
    const companySlug = request.nextUrl.searchParams.get('companySlug')
    if (!companySlug) {
      return NextResponse.json({ error: 'companySlug required' }, { status: 400 })
    }

    // Verify customer is authenticated for this company
    const session = await getPortalSession()
    if (!session || session.companySlug !== companySlug.toLowerCase().trim()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Demo company: return synthetic tickets
    if (companySlug.toLowerCase().trim() === 'contoso-industries') {
      const { DEMO_TICKETS } = await import('@/lib/demo-mode')
      return NextResponse.json({ tickets: DEMO_TICKETS })
    }

    // Look up the company's Autotask ID
    const company = await prisma.company.findUnique({
      where: { slug: companySlug.toLowerCase().trim() },
      select: { autotaskCompanyId: true },
    })

    if (!company?.autotaskCompanyId) {
      return NextResponse.json({ tickets: [] })
    }

    const atCompanyId = parseInt(company.autotaskCompanyId, 10)
    if (isNaN(atCompanyId)) {
      return NextResponse.json({ tickets: [] })
    }

    // Fetch tickets from Autotask
    const { AutotaskClient } = await import('@/lib/autotask')
    const client = new AutotaskClient()
    const rawTickets = await client.getCompanyTickets(atCompanyId, 30)

    const tickets = rawTickets.map(t => ({
      id: t.id,
      ticketNumber: t.ticketNumber || String(t.id),
      title: t.title,
      description: t.description || null,
      status: String(t.status),
      createDate: t.createDate,
      completedDate: t.completedDate || null,
      priority: String(t.priority),
    }))

    return NextResponse.json({ tickets })
  } catch (error) {
    console.error('[Customer Tickets API] Error:', error)
    return NextResponse.json({ tickets: [] })
  }
}
