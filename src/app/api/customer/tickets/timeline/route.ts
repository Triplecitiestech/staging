import { NextRequest } from 'next/server'
import { getPortalSession } from '@/lib/portal-session'
import { apiOk, apiError, generateRequestId } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * GET /api/customer/tickets/timeline?companySlug=xxx&ticketId=123
 * Returns the chronological timeline for a specific ticket.
 *
 * Delegates to getCustomerTicketNotes() — the same adapter the portal's ticket
 * view uses — so the customer-visibility rule exists in exactly one place.
 * This route used to carry its own copy of that rule, including the
 * publish === 3 filter that hid every note from every customer.
 */
export async function GET(request: NextRequest) {
  const reqId = generateRequestId()
  try {
    const companySlug = request.nextUrl.searchParams.get('companySlug')
    const ticketId = request.nextUrl.searchParams.get('ticketId')

    // Auth before input validation — unauthenticated callers get 401, not
    // a 400 that confirms which params the endpoint expects
    const session = await getPortalSession()
    if (!session) {
      return apiError('Unauthorized', reqId, 401)
    }

    if (!companySlug || !ticketId) {
      return apiError('companySlug and ticketId required', reqId, 400)
    }

    if (session.companySlug !== companySlug.toLowerCase().trim()) {
      return apiError('Unauthorized', reqId, 401)
    }

    // Demo company: return synthetic timeline
    if (companySlug.toLowerCase().trim() === 'contoso-industries') {
      const { DEMO_TIMELINE } = await import('@/lib/demo-mode')
      const demoTimeline = DEMO_TIMELINE[parseInt(ticketId, 10) as keyof typeof DEMO_TIMELINE] || []
      return apiOk({ timeline: demoTimeline }, reqId)
    }

    const { getCustomerTicketNotes, PortalTicketAccessError } = await import('@/lib/tickets/adapters')
    let timeline
    try {
      ;({ notes: timeline } = await getCustomerTicketNotes(ticketId, session))
    } catch (err) {
      if (err instanceof PortalTicketAccessError) {
        if (err.reason === 'not_linked') return apiOk({ timeline: [] }, reqId)
        return apiError('Ticket not found', reqId, 404)
      }
      throw err
    }

    return apiOk({ timeline }, reqId)
  } catch (error) {
    console.error('[Customer Ticket Timeline API] Error:', error)
    return apiError('Unable to load ticket timeline. Please try again shortly.', reqId, 502)
  }
}
