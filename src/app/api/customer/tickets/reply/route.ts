import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/customer/tickets/reply
 * Creates a customer reply on an Autotask ticket.
 * Body: { companySlug, ticketId, message }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { companySlug, ticketId, message } = body

    if (!companySlug || !ticketId || !message?.trim()) {
      return NextResponse.json(
        { error: 'companySlug, ticketId, and message are required' },
        { status: 400 }
      )
    }

    // Verify customer is authenticated for this company
    const authenticatedCompany = await getAuthenticatedCompany()
    if (authenticatedCompany !== companySlug.toLowerCase().trim()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Demo company: simulate reply without touching Autotask
    if (companySlug.toLowerCase().trim() === 'contoso-industries') {
      return NextResponse.json({ success: true, noteId: 'demo-reply-' + Date.now() })
    }

    // Look up company
    const company = await prisma.company.findUnique({
      where: { slug: companySlug.toLowerCase().trim() },
      select: { autotaskCompanyId: true, displayName: true },
    })

    if (!company?.autotaskCompanyId) {
      return NextResponse.json(
        { error: 'Company not linked to Autotask' },
        { status: 400 }
      )
    }

    const atTicketId = parseInt(ticketId, 10)
    if (isNaN(atTicketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
    }

    // Create the note in Autotask
    const { AutotaskClient } = await import('@/lib/autotask')
    const client = new AutotaskClient()

    const companyDisplayName = company.displayName
    const note = await client.createTicketNote(atTicketId, {
      title: `Customer Reply from ${companyDisplayName} Portal`,
      description: message.trim(),
      noteType: 1,
      publish: 1, // External/customer-visible
    })

    return NextResponse.json({
      success: true,
      noteId: note.id,
    })
  } catch (error) {
    console.error('[Customer Ticket Reply API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to submit reply' },
      { status: 500 }
    )
  }
}
