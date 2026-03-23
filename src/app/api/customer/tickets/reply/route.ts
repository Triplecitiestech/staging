import { NextRequest, NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-session'
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
    const session = await getPortalSession()
    if (!session || session.companySlug !== companySlug.toLowerCase().trim()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Demo company: read-only access
    if (companySlug.toLowerCase().trim() === 'contoso-industries') {
      return NextResponse.json(
        { error: 'Demo portal is read-only. Write operations are disabled.' },
        { status: 403 }
      )
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

    // Look up the customer contact's Autotask ID so the note is attributed to them
    let autotaskContactId: number | undefined
    const customerName = session.name || session.email.split('@')[0]
    if (session.email) {
      const contact = await prisma.companyContact.findFirst({
        where: {
          email: session.email,
          company: { slug: companySlug.toLowerCase().trim() },
        },
        select: { autotaskContactId: true, name: true },
      })
      if (contact?.autotaskContactId) {
        autotaskContactId = parseInt(contact.autotaskContactId, 10)
        if (isNaN(autotaskContactId)) autotaskContactId = undefined
      }
    }

    // Create the note in Autotask
    const { AutotaskClient } = await import('@/lib/autotask')
    const client = new AutotaskClient()

    const note = await client.createTicketNote(atTicketId, {
      title: `Customer Reply from ${customerName}`,
      description: message.trim(),
      noteType: 1,
      publish: 1, // External/customer-visible
      creatorContactID: autotaskContactId,
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
