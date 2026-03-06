import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface TimelineEntry {
  id: string
  type: 'note' | 'time_entry' | 'status_change' | 'created'
  timestamp: string
  author: string
  authorType: 'technician' | 'customer' | 'system'
  content: string
  isInternal: boolean
  hoursWorked?: number
}

/**
 * GET /api/customer/tickets/timeline?companySlug=xxx&ticketId=123
 * Returns the chronological timeline for a specific ticket.
 * Only returns customer-visible (external) notes.
 */
export async function GET(request: NextRequest) {
  try {
    const companySlug = request.nextUrl.searchParams.get('companySlug')
    const ticketId = request.nextUrl.searchParams.get('ticketId')

    if (!companySlug || !ticketId) {
      return NextResponse.json({ error: 'companySlug and ticketId required' }, { status: 400 })
    }

    // Verify customer is authenticated for this company
    const authenticatedCompany = await getAuthenticatedCompany()
    if (authenticatedCompany !== companySlug.toLowerCase().trim()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Demo company: return synthetic timeline
    if (companySlug.toLowerCase().trim() === 'contoso-industries') {
      const { DEMO_TIMELINE } = await import('@/lib/demo-mode')
      const demoTimeline = DEMO_TIMELINE[parseInt(ticketId, 10) as keyof typeof DEMO_TIMELINE] || []
      return NextResponse.json({ timeline: demoTimeline })
    }

    // Verify company has Autotask ID
    const company = await prisma.company.findUnique({
      where: { slug: companySlug.toLowerCase().trim() },
      select: { autotaskCompanyId: true },
    })

    if (!company?.autotaskCompanyId) {
      return NextResponse.json({ timeline: [] })
    }

    const atTicketId = parseInt(ticketId, 10)
    if (isNaN(atTicketId)) {
      return NextResponse.json({ timeline: [] })
    }

    // Fetch ticket notes and time entries from Autotask
    const { AutotaskClient } = await import('@/lib/autotask')
    const client = new AutotaskClient()

    const [notes, timeEntries] = await Promise.all([
      client.getTicketNotes(atTicketId),
      client.getTicketTimeEntries(atTicketId),
    ])

    // Build resource cache for author names
    const resourceIds = new Set<number>()
    notes.forEach(n => {
      if (n.creatorResourceID) resourceIds.add(n.creatorResourceID)
    })
    timeEntries.forEach(te => {
      if (te.resourceID) resourceIds.add(te.resourceID)
    })

    const resourceMap = new Map<number, string>()
    for (const resId of Array.from(resourceIds)) {
      try {
        const resource = await client.getResource(resId)
        if (resource) {
          resourceMap.set(resId, `${resource.firstName} ${resource.lastName}`.trim())
        }
      } catch {
        // Individual resource lookup failed, use fallback
      }
    }

    const timeline: TimelineEntry[] = []

    // Add only customer-visible notes
    // Autotask publish values:
    //   1 = All Autotask Users (INTERNAL - visible to AT staff only)
    //   2 = Internal Only (Resources only)
    //   3 = Published (Customer Portal visible - this is the ONLY external type)
    // ONLY show publish=3 — these are the notes explicitly published to customers
    for (const note of notes) {
      // Only allow customer-portal-published notes
      if (note.publish !== 3) continue

      // Skip system-generated notes (no human creator)
      if (!note.creatorResourceID && !note.creatorContactID) continue

      const isCustomerNote = !!note.creatorContactID && !note.creatorResourceID
      const authorName = note.creatorResourceID
        ? resourceMap.get(note.creatorResourceID) || 'Triple Cities Tech'
        : 'Customer'

      timeline.push({
        id: `note-${note.id}`,
        type: 'note',
        timestamp: note.createDateTime || note.lastActivityDate || '',
        author: authorName,
        authorType: isCustomerNote ? 'customer' : 'technician',
        content: note.description || note.title || '',
        isInternal: false,
      })
    }

    // Add customer-visible time entries (non-internal summary notes only)
    for (const te of timeEntries) {
      if (!te.summaryNotes) continue

      const authorName = resourceMap.get(te.resourceID) || 'Triple Cities Tech'

      timeline.push({
        id: `time-${te.id}`,
        type: 'time_entry',
        timestamp: te.startDateTime || te.dateWorked || te.createDateTime || '',
        author: authorName,
        authorType: 'technician',
        content: te.summaryNotes,
        isInternal: false,
        hoursWorked: te.hoursWorked,
      })
    }

    // Sort by timestamp ascending (chronological)
    timeline.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return dateA - dateB
    })

    return NextResponse.json({ timeline })
  } catch (error) {
    console.error('[Customer Ticket Timeline API] Error:', error)
    return NextResponse.json({ timeline: [] })
  }
}
