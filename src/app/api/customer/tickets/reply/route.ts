import { NextRequest } from 'next/server'
import { getPortalSession } from '@/lib/portal-session'
import { prisma } from '@/lib/prisma'
import { checkCsrf } from '@/lib/security'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * POST /api/customer/tickets/reply
 * Creates a customer reply on an Autotask ticket.
 * Body: { companySlug, ticketId, message }
 */
export async function POST(request: NextRequest) {
  const csrfBlocked = checkCsrf(request)
  if (csrfBlocked) return csrfBlocked

  const reqId = generateRequestId()
  try {
    const body = await request.json()
    const { companySlug, ticketId, message } = body

    if (!companySlug || !ticketId || !message?.trim()) {
      return apiError('companySlug, ticketId, and message are required', reqId, 400)
    }

    // Verify customer is authenticated for this company
    const session = await getPortalSession()
    if (!session || session.companySlug !== companySlug.toLowerCase().trim()) {
      return apiError('Unauthorized', reqId, 401)
    }

    // Demo company: read-only access
    if (companySlug.toLowerCase().trim() === 'contoso-industries') {
      return apiError('Demo portal is read-only. Write operations are disabled.', reqId, 403)
    }

    // Look up company
    const company = await prisma.company.findUnique({
      where: { slug: companySlug.toLowerCase().trim() },
      select: { autotaskCompanyId: true, displayName: true },
    })

    if (!company?.autotaskCompanyId) {
      return apiError('Company not linked to Autotask', reqId, 400)
    }

    const atTicketId = parseInt(ticketId, 10)
    if (isNaN(atTicketId)) {
      return apiError('Invalid ticket ID', reqId, 400)
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

    return apiOk({ noteId: note.id }, reqId)
  } catch (error) {
    console.error('[Customer Ticket Reply API] Error:', error)
    return apiError('Failed to submit reply', reqId, 500)
  }
}
