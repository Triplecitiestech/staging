import { NextRequest } from 'next/server'
import { getPortalSession } from '@/lib/portal-session'
import { checkCsrf } from '@/lib/security'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'
import { classifyError } from '@/lib/resilience'
import { resolvePortalTicketAccess, PortalTicketAccessError } from '@/lib/tickets/adapters'
import { customerReplyTitle } from '@/lib/tickets/utils'

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
    // Auth before input validation — unauthenticated callers get 401, not
    // a 400 that confirms which fields the endpoint expects
    const session = await getPortalSession()
    if (!session) {
      return apiError('Unauthorized', reqId, 401)
    }

    const body = await request.json()
    const { companySlug, ticketId, message } = body

    if (!companySlug || !ticketId || !message?.trim()) {
      return apiError('companySlug, ticketId, and message are required', reqId, 400)
    }

    if (session.companySlug !== companySlug.toLowerCase().trim()) {
      return apiError('Unauthorized', reqId, 401)
    }

    // Demo company: read-only access
    if (companySlug.toLowerCase().trim() === 'contoso-industries') {
      return apiError('Demo portal is read-only. Write operations are disabled.', reqId, 403)
    }

    const atTicketId = parseInt(ticketId, 10)
    if (isNaN(atTicketId)) {
      return apiError('Invalid ticket ID', reqId, 400)
    }

    // Ownership first: the ticket must belong to this company, and a
    // non-manager must be its contact. Without this the route posted a note
    // onto any ticket id it was handed, including other customers' tickets.
    let autotaskContactId: number | null
    try {
      ;({ autotaskContactId } = await resolvePortalTicketAccess(atTicketId, session))
    } catch (err) {
      if (err instanceof PortalTicketAccessError) {
        return err.reason === 'not_linked'
          ? apiError('Company not linked to Autotask', reqId, 400)
          : apiError('Ticket not found', reqId, 404)
      }
      throw err
    }

    // A staff member viewing the portal as a customer must not post AS that
    // customer: no contact attribution, and a title that does not read as a
    // customer reply (parseCustomerReplyAuthor keys on that title).
    const impersonation = session.impersonation
    const customerName = session.name || session.email.split('@')[0]
    const title = impersonation
      ? `Reply from ${impersonation.adminName} (Triple Cities Tech, viewing as ${impersonation.targetName})`
      : customerReplyTitle(customerName)
    const createdByContactID = impersonation ? undefined : (autotaskContactId ?? undefined)

    // Create the note in Autotask
    const { AutotaskClient } = await import('@/lib/autotask')
    const client = new AutotaskClient()
    const noteData = {
      title,
      description: message.trim(),
      noteType: 1,
      publish: 1, // "All Autotask Users" — the customer-visible value
    }

    let note
    try {
      note = await client.createTicketNote(atTicketId, { ...noteData, createdByContactID })
    } catch (err) {
      // createdByContactID is writable per live entityInformation but had never
      // been sent on create before this change. If Autotask REJECTS the request
      // (a deterministic refusal — nothing was created), the customer's reply
      // still matters more than its attribution, so post it without the
      // contact. Anything else (network, 5xx outage) is rethrown rather than
      // retried, because a retry after an ambiguous failure could post twice.
      const { category } = classifyError(err)
      if (!createdByContactID || (category !== 'validation' && category !== 'data_violation')) throw err
      console.warn(
        `[Customer Ticket Reply API] Autotask rejected createdByContactID=${createdByContactID} on ticket ${atTicketId}; posting without contact attribution:`,
        err instanceof Error ? err.message : String(err)
      )
      note = await client.createTicketNote(atTicketId, noteData)
    }

    return apiOk({ noteId: note.id }, reqId)
  } catch (error) {
    console.error('[Customer Ticket Reply API] Error:', error)
    return apiError('Failed to submit reply', reqId, 500)
  }
}
