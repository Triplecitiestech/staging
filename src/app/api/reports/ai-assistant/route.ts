import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Fetches real-time data from the database relevant to the user's prompt.
 * Instead of relying solely on pre-aggregated frontend data, this queries
 * actual ticket/company/technician records for accurate, current answers.
 */
async function fetchRelevantData(prompt: string, context: string): Promise<string> {
  const lowerPrompt = prompt.toLowerCase()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekAgo = new Date(todayStart.getTime() - 7 * 86400000)
  const monthAgo = new Date(todayStart.getTime() - 30 * 86400000)

  const sections: string[] = []

  // ── Company-specific deep dive ──
  // When a user mentions a specific company, fetch detailed per-company data
  try {
    // Find all companies and check if any name appears in the prompt
    const allCompanies = await prisma.company.findMany({
      select: { id: true, displayName: true },
    })
    const mentionedCompany = allCompanies.find(c =>
      c.displayName && lowerPrompt.includes(c.displayName.toLowerCase())
    )

    if (mentionedCompany) {
      // Tickets for this company in last 30 days
      const companyTickets = await prisma.ticket.findMany({
        where: { companyId: mentionedCompany.id, createDate: { gte: monthAgo } },
        select: {
          autotaskTicketId: true,
          ticketNumber: true,
          title: true,
          status: true,
          statusLabel: true,
          priority: true,
          priorityLabel: true,
          queueLabel: true,
          assignedResourceId: true,
          createDate: true,
          completedDate: true,
          lastActivityDate: true,
        },
        orderBy: { createDate: 'desc' },
        take: 100,
      })

      // Resolve technician names
      const resIds = companyTickets.map(t => t.assignedResourceId).filter((id): id is number => id !== null)
      const resources = resIds.length > 0
        ? await prisma.resource.findMany({ where: { autotaskResourceId: { in: resIds } }, select: { autotaskResourceId: true, firstName: true, lastName: true } })
        : []
      const resMap = new Map(resources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`]))

      const openCount = companyTickets.filter(t => ![5, 12, 24].includes(t.status)).length
      const closedCount = companyTickets.filter(t => [5, 12, 24].includes(t.status)).length

      sections.push(`## Company Deep Dive: ${mentionedCompany.displayName} (last 30 days)\nTotal tickets: ${companyTickets.length} (${openCount} open, ${closedCount} closed)\n\n### All Tickets:\n${companyTickets.map(t =>
        `- #${t.ticketNumber || t.autotaskTicketId} [${t.priorityLabel || 'P' + t.priority}] "${t.title}" | Status: ${t.statusLabel || t.status} | Queue: ${t.queueLabel || 'N/A'} | Tech: ${(t.assignedResourceId && resMap.get(t.assignedResourceId)) || 'Unassigned'} | Created: ${t.createDate?.toLocaleDateString() || 'N/A'}${t.completedDate ? ' | Closed: ' + t.completedDate.toLocaleDateString() : ''}`
      ).join('\n')}`)

      // Lifecycle metrics for this company (response times, resolution times, SLA)
      const lifecycleData = await prisma.ticketLifecycle.findMany({
        where: { companyId: mentionedCompany.id, createDate: { gte: monthAgo } },
        select: {
          autotaskTicketId: true,
          firstResponseMinutes: true,
          fullResolutionMinutes: true,
          waitingCustomerMinutes: true,
          activeResolutionMinutes: true,
          techNoteCount: true,
          customerNoteCount: true,
          reopenCount: true,
          totalHoursLogged: true,
          isFirstTouchResolution: true,
          slaResponseMet: true,
          slaResolutionMet: true,
        },
      })

      if (lifecycleData.length > 0) {
        const withResponse = lifecycleData.filter(l => l.firstResponseMinutes != null)
        const withResolution = lifecycleData.filter(l => l.fullResolutionMinutes != null)
        const withWaiting = lifecycleData.filter(l => l.waitingCustomerMinutes != null)

        const avgFirstResponse = withResponse.length > 0
          ? withResponse.reduce((s, l) => s + (l.firstResponseMinutes || 0), 0) / withResponse.length : null
        const avgResolution = withResolution.length > 0
          ? withResolution.reduce((s, l) => s + (l.fullResolutionMinutes || 0), 0) / withResolution.length : null
        const avgWaitingCustomer = withWaiting.length > 0
          ? withWaiting.reduce((s, l) => s + (l.waitingCustomerMinutes || 0), 0) / withWaiting.length : null
        const totalTechNotes = lifecycleData.reduce((s, l) => s + l.techNoteCount, 0)
        const totalCustNotes = lifecycleData.reduce((s, l) => s + l.customerNoteCount, 0)
        const slaResponseMet = lifecycleData.filter(l => l.slaResponseMet === true).length
        const slaResponseTotal = lifecycleData.filter(l => l.slaResponseMet != null).length
        const slaResMet = lifecycleData.filter(l => l.slaResolutionMet === true).length
        const slaResTotal = lifecycleData.filter(l => l.slaResolutionMet != null).length
        const firstTouchCount = lifecycleData.filter(l => l.isFirstTouchResolution).length
        const totalHours = lifecycleData.reduce((s, l) => s + l.totalHoursLogged, 0)
        const reopens = lifecycleData.reduce((s, l) => s + l.reopenCount, 0)

        sections.push(`### ${mentionedCompany.displayName} — Response & Resolution Metrics\n` +
          `Tickets with lifecycle data: ${lifecycleData.length}\n` +
          (avgFirstResponse != null ? `Avg first response time: ${(avgFirstResponse / 60).toFixed(1)} hours (${avgFirstResponse.toFixed(0)} minutes)\n` : '') +
          (avgResolution != null ? `Avg full resolution time: ${(avgResolution / 60).toFixed(1)} hours\n` : '') +
          (avgWaitingCustomer != null ? `Avg time waiting on customer: ${(avgWaitingCustomer / 60).toFixed(1)} hours\n` : '') +
          `Total tech notes (our outreach): ${totalTechNotes}\n` +
          `Total customer notes (their responses): ${totalCustNotes}\n` +
          (totalCustNotes > 0 ? `Ratio of our outreach to their responses: ${(totalTechNotes / totalCustNotes).toFixed(1)}:1\n` : 'Customer has sent 0 notes — no responses recorded\n') +
          `First-touch resolution: ${firstTouchCount}/${lifecycleData.length}\n` +
          `SLA response compliance: ${slaResponseMet}/${slaResponseTotal}${slaResponseTotal > 0 ? ` (${((slaResponseMet / slaResponseTotal) * 100).toFixed(1)}%)` : ''}\n` +
          `SLA resolution compliance: ${slaResMet}/${slaResTotal}${slaResTotal > 0 ? ` (${((slaResMet / slaResTotal) * 100).toFixed(1)}%)` : ''}\n` +
          `Total hours logged: ${totalHours.toFixed(1)}\n` +
          `Ticket reopens: ${reopens}`)
      }

      // Per-ticket communication analysis from TicketNote
      const ticketIds = companyTickets.map(t => t.autotaskTicketId)
      if (ticketIds.length > 0) {
        try {
          const notes = await prisma.ticketNote.findMany({
            where: { autotaskTicketId: { in: ticketIds } },
            select: {
              autotaskTicketId: true,
              title: true,
              creatorResourceId: true,
              creatorContactId: true,
              createDateTime: true,
              publish: true,
            },
            orderBy: { createDateTime: 'asc' },
          })

          if (notes.length > 0) {
            // Resolve resource names to identify who created each note
            const noteResourceIds = notes.map(n => n.creatorResourceId).filter((id): id is number => id !== null)
            const noteResources = noteResourceIds.length > 0
              ? await prisma.resource.findMany({
                  where: { autotaskResourceId: { in: Array.from(new Set(noteResourceIds)) } },
                  select: { autotaskResourceId: true, firstName: true, lastName: true },
                })
              : []
            const noteResMap = new Map(noteResources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`]))

            // Categorize each note:
            // - Human technician note: creatorResourceId set, creatorContactId null
            // - Customer note: creatorContactId set
            // - System/API note: both creatorResourceId AND creatorContactId are null (automated workflows, API integrations)
            // publish values: 1 = internal (AT staff), 2 = internal (resources only), 3 = customer-visible (external)
            const humanTechNotes = notes.filter(n => n.creatorResourceId != null && n.creatorContactId == null)
            const customerNotes = notes.filter(n => n.creatorContactId != null)
            const systemNotes = notes.filter(n => n.creatorResourceId == null && n.creatorContactId == null)

            // Further break down human tech notes by visibility
            const techExternalNotes = humanTechNotes.filter(n => n.publish === 3) // customer-visible outreach
            const techInternalNotes = humanTechNotes.filter(n => n.publish !== 3) // internal notes (publish 1, 2, or null)

            // Group notes by ticket
            const notesByTicket = new Map<string, typeof notes>()
            for (const note of notes) {
              const existing = notesByTicket.get(note.autotaskTicketId) || []
              existing.push(note)
              notesByTicket.set(note.autotaskTicketId, existing)
            }

            // Calculate per-ticket communication patterns using ONLY human tech notes (exclude system/API notes)
            const customerResponseDelays: number[] = []
            const humanOutreachBeforeResponse: number[] = []

            for (const tktNotes of Array.from(notesByTicket.values())) {
              let humanOutreachCount = 0
              let lastHumanTechNoteTime: Date | null = null

              for (const note of tktNotes) {
                const isHumanTechNote = note.creatorResourceId != null && note.creatorContactId == null
                const isCustomerNote = note.creatorContactId != null
                // Notes with both null are system/API — skip for outreach counting

                if (isHumanTechNote) {
                  humanOutreachCount++
                  lastHumanTechNoteTime = note.createDateTime
                } else if (isCustomerNote) {
                  if (humanOutreachCount > 0) {
                    humanOutreachBeforeResponse.push(humanOutreachCount)
                  }
                  if (lastHumanTechNoteTime) {
                    const delayMs = note.createDateTime.getTime() - lastHumanTechNoteTime.getTime()
                    customerResponseDelays.push(delayMs / (1000 * 60 * 60)) // hours
                  }
                  humanOutreachCount = 0
                  lastHumanTechNoteTime = null
                }
              }
              if (humanOutreachCount > 0) {
                humanOutreachBeforeResponse.push(humanOutreachCount)
              }
            }

            // Per-ticket note breakdown
            let perTicketBreakdown = ''
            const ticketNumMap = new Map(companyTickets.map(t => [t.autotaskTicketId, t.ticketNumber || t.autotaskTicketId]))
            for (const [ticketId, tktNotes] of Array.from(notesByTicket.entries())) {
              const tktHuman = tktNotes.filter(n => n.creatorResourceId != null && n.creatorContactId == null)
              const tktCustomer = tktNotes.filter(n => n.creatorContactId != null)
              const tktSystem = tktNotes.filter(n => n.creatorResourceId == null && n.creatorContactId == null)
              const tktExternal = tktHuman.filter(n => n.publish === 3)
              const tktInternal = tktHuman.filter(n => n.publish !== 3)

              // Identify unique human technicians on this ticket
              const techNames = Array.from(new Set(tktHuman.map(n => noteResMap.get(n.creatorResourceId!) || `Resource #${n.creatorResourceId}`))).join(', ')

              perTicketBreakdown += `\n  Ticket #${ticketNumMap.get(ticketId)}: ${tktNotes.length} total notes\n`
              perTicketBreakdown += `    Human tech notes: ${tktHuman.length} (${tktExternal.length} customer-visible, ${tktInternal.length} internal)\n`
              perTicketBreakdown += `    Customer notes: ${tktCustomer.length}\n`
              perTicketBreakdown += `    System/API automated notes: ${tktSystem.length}\n`
              if (techNames) perTicketBreakdown += `    Technicians: ${techNames}\n`
            }

            let commSection = `### ${mentionedCompany.displayName} — Communication Pattern Analysis\n` +
              `Total notes across ${notesByTicket.size} tickets: ${notes.length}\n\n` +
              `**Note Breakdown by Author Type:**\n` +
              `- Human technician notes: ${humanTechNotes.length} (${techExternalNotes.length} customer-visible outreach, ${techInternalNotes.length} internal-only)\n` +
              `- Customer notes: ${customerNotes.length}\n` +
              `- System/API automated notes: ${systemNotes.length} (workflow automations, API integrations — NOT human outreach)\n\n` +
              `**Per-Ticket Breakdown:**${perTicketBreakdown}\n`

            // Report HUMAN outreach metrics (excluding system/API notes)
            commSection += `**Human Outreach Metrics (excluding system/API notes):**\n`
            if (humanOutreachBeforeResponse.length > 0) {
              const avgOutreach = humanOutreachBeforeResponse.reduce((s, v) => s + v, 0) / humanOutreachBeforeResponse.length
              const maxOutreach = Math.max(...humanOutreachBeforeResponse)
              commSection += `Avg HUMAN tech outreach attempts before customer response: ${avgOutreach.toFixed(1)}\n`
              commSection += `Max human outreach attempts without response: ${maxOutreach}\n`
            }

            if (customerResponseDelays.length > 0) {
              const avgDelay = customerResponseDelays.reduce((s, v) => s + v, 0) / customerResponseDelays.length
              const maxDelay = Math.max(...customerResponseDelays)
              const minDelay = Math.min(...customerResponseDelays)
              commSection += `Avg customer response time: ${avgDelay.toFixed(1)} hours (${(avgDelay / 24).toFixed(1)} days)\n`
              commSection += `Fastest customer response: ${minDelay.toFixed(1)} hours\n`
              commSection += `Slowest customer response: ${maxDelay.toFixed(1)} hours (${(maxDelay / 24).toFixed(1)} days)\n`
            } else {
              commSection += `No customer response patterns could be calculated (no customer notes found after human tech outreach)\n`
            }

            sections.push(commSection)
          }
        } catch { /* ticket_notes table may not exist */ }
      }

      // Health score for this company
      try {
        const healthScore = await prisma.customerHealthScore.findFirst({
          where: { companyId: mentionedCompany.id },
          orderBy: { computedAt: 'desc' },
        })
        if (healthScore) {
          sections.push(`### ${mentionedCompany.displayName} — Health Score\n` +
            `Overall: ${healthScore.overallScore}/100 (${healthScore.trend})\n` +
            `Ticket Volume Trend: ${healthScore.ticketVolumeTrendScore}/100\n` +
            `Reopen Rate: ${healthScore.reopenRateScore}/100\n` +
            `Priority Mix: ${healthScore.priorityMixScore}/100\n` +
            `Support Hours Trend: ${healthScore.supportHoursTrendScore}/100\n` +
            `Avg Resolution Time: ${healthScore.avgResolutionTimeScore}/100\n` +
            `Aging Tickets: ${healthScore.agingTicketsScore}/100\n` +
            `SLA Compliance: ${healthScore.slaComplianceScore}/100`)
        }
      } catch { /* */ }
    }
  } catch { /* company lookup failed — non-fatal */ }

  // Always include high-level summary
  try {
    const [totalTickets, openTickets, companies, resources] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { status: { notIn: [5, 12, 24] } } }),
      prisma.company.count(),
      prisma.resource.count({ where: { isActive: true } }),
    ])
    sections.push(`## System Overview\nTotal tickets: ${totalTickets}, Open tickets: ${openTickets}, Companies: ${companies}, Active technicians: ${resources}`)
  } catch { /* tables may not exist */ }

  // Tickets created/closed today
  if (lowerPrompt.includes('today') || lowerPrompt.includes('daily') || context === 'dashboard') {
    try {
      const [createdToday, closedToday, todayTickets] = await Promise.all([
        prisma.ticket.count({ where: { createDate: { gte: todayStart } } }),
        prisma.ticket.count({
          where: { completedDate: { gte: todayStart } },
        }),
        prisma.ticket.findMany({
          where: {
            OR: [
              { createDate: { gte: todayStart } },
              { lastActivityDate: { gte: todayStart } },
            ],
          },
          select: {
            autotaskTicketId: true,
            title: true,
            status: true,
            statusLabel: true,
            priority: true,
            priorityLabel: true,
            assignedResourceId: true,
            createDate: true,
            completedDate: true,
            company: { select: { displayName: true } },
          },
          orderBy: { lastActivityDate: 'desc' },
          take: 50,
        }),
      ])
      // Build resource name map
      const resourceIds = todayTickets.map(t => t.assignedResourceId).filter((id): id is number => id !== null)
      const resources = resourceIds.length > 0
        ? await prisma.resource.findMany({ where: { autotaskResourceId: { in: resourceIds } }, select: { autotaskResourceId: true, firstName: true, lastName: true } })
        : []
      const resMap = new Map(resources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`]))

      sections.push(`## Today (${todayStart.toDateString()})\nTickets created today: ${createdToday}\nTickets closed today: ${closedToday}\n\n### Tickets active today (up to 50):\n${todayTickets.map(t =>
        `- #${t.autotaskTicketId} "${t.title}" | Status: ${t.statusLabel || t.status} | Priority: ${t.priorityLabel || t.priority} | Company: ${t.company?.displayName || 'N/A'} | Tech: ${(t.assignedResourceId && resMap.get(t.assignedResourceId)) || 'Unassigned'}${t.completedDate ? ' | CLOSED' : ''}`
      ).join('\n')}`)
    } catch { /* */ }
  }

  // This week's data
  if (lowerPrompt.includes('week') || lowerPrompt.includes('recent') || context === 'dashboard') {
    try {
      const [createdThisWeek, closedThisWeek] = await Promise.all([
        prisma.ticket.count({ where: { createDate: { gte: weekAgo } } }),
        prisma.ticket.count({ where: { completedDate: { gte: weekAgo } } }),
      ])
      sections.push(`## This Week (last 7 days)\nCreated: ${createdThisWeek}, Closed: ${closedThisWeek}`)
    } catch { /* */ }
  }

  // Technician performance
  if (lowerPrompt.includes('tech') || lowerPrompt.includes('performer') || lowerPrompt.includes('workload') ||
      lowerPrompt.includes('team') || context === 'technicians') {
    try {
      const timeEntries = await prisma.ticketTimeEntry.groupBy({
        by: ['resourceId'],
        where: { dateWorked: { gte: monthAgo } },
        _sum: { hoursWorked: true },
        _count: { id: true },
        orderBy: { _sum: { hoursWorked: 'desc' } },
        take: 20,
      })
      // Resolve resource names
      const techResIds = timeEntries.map(t => t.resourceId)
      const techResources = techResIds.length > 0
        ? await prisma.resource.findMany({ where: { autotaskResourceId: { in: techResIds } }, select: { autotaskResourceId: true, firstName: true, lastName: true } })
        : []
      const techNameMap = new Map(techResources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`]))

      const ticketsByTech = await prisma.ticket.groupBy({
        by: ['assignedResourceId'],
        where: { createDate: { gte: monthAgo }, assignedResourceId: { not: null } },
        _count: { id: true },
      })
      const closedByTech = await prisma.ticket.groupBy({
        by: ['assignedResourceId'],
        where: { completedDate: { gte: monthAgo }, assignedResourceId: { not: null } },
        _count: { id: true },
      })
      const closedMap = new Map(closedByTech.map(r => [r.assignedResourceId, r._count.id]))
      const assignedMap = new Map(ticketsByTech.map(r => [r.assignedResourceId, r._count.id]))

      sections.push(`## Technician Performance (last 30 days)\n${timeEntries.map(t => {
        const name = techNameMap.get(t.resourceId) || `Resource #${t.resourceId}`
        return `- ${name}: ${(t._sum.hoursWorked || 0).toFixed(1)} hrs logged, ${t._count.id} time entries, ${assignedMap.get(t.resourceId) || 0} tickets assigned, ${closedMap.get(t.resourceId) || 0} tickets closed`
      }).join('\n')}`)
    } catch { /* */ }
  }

  // Company metrics
  if (lowerPrompt.includes('compan') || lowerPrompt.includes('client') || lowerPrompt.includes('customer') ||
      context === 'companies' || context === 'health') {
    try {
      const companyTickets = await prisma.ticket.groupBy({
        by: ['companyId'],
        where: { createDate: { gte: monthAgo } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      })
      const compIds = companyTickets.map(c => c.companyId)
      const compNames = compIds.length > 0
        ? await prisma.company.findMany({ where: { id: { in: compIds } }, select: { id: true, displayName: true } })
        : []
      const compNameMap = new Map(compNames.map(c => [c.id, c.displayName]))
      sections.push(`## Top Companies by Ticket Volume (last 30 days)\n${companyTickets.map(c =>
        `- ${compNameMap.get(c.companyId) || c.companyId}: ${c._count.id} tickets`
      ).join('\n')}`)
    } catch { /* */ }

    try {
      const healthScores = await prisma.customerHealthScore.findMany({
        orderBy: { overallScore: 'asc' },
        take: 15,
        select: {
          companyId: true,
          overallScore: true,
          trend: true,
          ticketVolumeTrendScore: true,
          reopenRateScore: true,
          avgResolutionTimeScore: true,
          slaComplianceScore: true,
          computedAt: true,
        },
      })
      if (healthScores.length > 0) {
        const healthCompIds = healthScores.map(h => h.companyId)
        const healthComps = await prisma.company.findMany({ where: { id: { in: healthCompIds } }, select: { id: true, displayName: true } })
        const healthCompMap = new Map(healthComps.map(c => [c.id, c.displayName]))
        sections.push(`## Customer Health Scores (lowest first)\n${healthScores.map(h =>
          `- ${healthCompMap.get(h.companyId) || h.companyId}: Score ${h.overallScore}/100 (${h.trend}) | Volume: ${h.ticketVolumeTrendScore} | Reopen: ${h.reopenRateScore} | Resolution: ${h.avgResolutionTimeScore} | SLA: ${h.slaComplianceScore}`
        ).join('\n')}`)
      }
    } catch { /* */ }
  }

  // SLA / priority data
  if (lowerPrompt.includes('sla') || lowerPrompt.includes('priority') || lowerPrompt.includes('urgent') || context === 'analytics') {
    try {
      const priorityBreakdown = await prisma.ticket.groupBy({
        by: ['priority'],
        where: { createDate: { gte: monthAgo } },
        _count: { id: true },
      })
      sections.push(`## Priority Breakdown (last 30 days)\n${priorityBreakdown.map(p =>
        `- Priority ${p.priority}: ${p._count.id} tickets`
      ).join('\n')}`)
    } catch { /* */ }

    try {
      const slaData = await prisma.ticketLifecycle.findMany({
        where: { createDate: { gte: monthAgo } },
        select: { slaResponseMet: true, slaResolutionMet: true, firstResponseMinutes: true, fullResolutionMinutes: true },
      })
      if (slaData.length > 0) {
        const responseMet = slaData.filter(d => d.slaResponseMet === true).length
        const resolutionMet = slaData.filter(d => d.slaResolutionMet === true).length
        const slaTotal = slaData.filter(d => d.slaResponseMet !== null).length
        const avgFirstResponse = slaData.filter(d => d.firstResponseMinutes).reduce((s, d) => s + (d.firstResponseMinutes || 0), 0) / (slaData.filter(d => d.firstResponseMinutes).length || 1)
        const avgResolution = slaData.filter(d => d.fullResolutionMinutes).reduce((s, d) => s + (d.fullResolutionMinutes || 0), 0) / (slaData.filter(d => d.fullResolutionMinutes).length || 1)
        sections.push(`## SLA & Response Metrics (last 30 days, ${slaData.length} tickets)\nSLA Response Met: ${responseMet}/${slaTotal} (${slaTotal > 0 ? ((responseMet / slaTotal) * 100).toFixed(1) : 0}%)\nSLA Resolution Met: ${resolutionMet}/${slaTotal} (${slaTotal > 0 ? ((resolutionMet / slaTotal) * 100).toFixed(1) : 0}%)\nAvg First Response: ${(avgFirstResponse / 60).toFixed(1)} hrs\nAvg Resolution Time: ${(avgResolution / 60).toFixed(1)} hrs`)
      }
    } catch { /* */ }
  }

  // Open / backlog tickets
  if (lowerPrompt.includes('open') || lowerPrompt.includes('backlog') || lowerPrompt.includes('attention') || lowerPrompt.includes('overdue')) {
    try {
      const openTickets = await prisma.ticket.findMany({
        where: { status: { notIn: [5, 12, 24] } },
        select: {
          autotaskTicketId: true,
          title: true,
          status: true,
          statusLabel: true,
          priority: true,
          priorityLabel: true,
          assignedResourceId: true,
          createDate: true,
          lastActivityDate: true,
          company: { select: { displayName: true } },
        },
        orderBy: { priority: 'asc' },
        take: 30,
      })
      const openResIds = openTickets.map(t => t.assignedResourceId).filter((id): id is number => id !== null)
      const openResources = openResIds.length > 0
        ? await prisma.resource.findMany({ where: { autotaskResourceId: { in: openResIds } }, select: { autotaskResourceId: true, firstName: true, lastName: true } })
        : []
      const openResMap = new Map(openResources.map(r => [r.autotaskResourceId, `${r.firstName} ${r.lastName}`]))

      sections.push(`## Open Tickets (top 30 by priority)\n${openTickets.map(t =>
        `- #${t.autotaskTicketId} [${t.priorityLabel || 'P' + t.priority}] "${t.title}" | ${t.company?.displayName || 'N/A'} | Tech: ${(t.assignedResourceId && openResMap.get(t.assignedResourceId)) || 'Unassigned'} | Created: ${t.createDate?.toLocaleDateString() || 'N/A'} | Last activity: ${t.lastActivityDate?.toLocaleDateString() || 'N/A'}`
      ).join('\n')}`)
    } catch { /* */ }
  }

  // Anomalies and trends
  if (lowerPrompt.includes('anomal') || lowerPrompt.includes('trend') || lowerPrompt.includes('predict') || context === 'analytics') {
    try {
      // Daily ticket creation trend for last 30 days
      const tickets = await prisma.ticket.findMany({
        where: { createDate: { gte: monthAgo } },
        select: { createDate: true },
      })
      const dailyCounts = new Map<string, number>()
      for (const t of tickets) {
        if (t.createDate) {
          const key = t.createDate.toISOString().slice(0, 10)
          dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1)
        }
      }
      const sortedDays = Array.from(dailyCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      if (sortedDays.length > 0) {
        sections.push(`## Daily Ticket Creation Trend (last 30 days)\n${sortedDays.map(([d, c]) => `${d}: ${c}`).join('\n')}`)
      }
    } catch { /* */ }
  }

  return sections.length > 0 ? sections.join('\n\n') : 'No detailed data could be fetched from the database.'
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * POST /api/reports/ai-assistant
 * AI-powered report assistant that answers questions about reporting data.
 * Supports full conversation history for follow-up questions.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()

    // Support both legacy single-prompt and new messages array format
    const messages: ChatMessage[] = body.messages || (body.prompt ? [{ role: 'user' as const, content: body.prompt }] : [])
    const context: string = body.context || ''
    const data: unknown = body.data

    if (!messages.length || !messages[messages.length - 1]?.content) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI assistant not configured' }, { status: 503 })
    }

    const client = new Anthropic({ apiKey })

    // Use the latest user message to determine what data to fetch
    const latestUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || ''

    // Fetch real data from the database based on the prompt and context
    const realtimeData = await fetchRelevantData(latestUserMessage, context)

    // Also include the frontend-provided summary data as supplementary context
    const frontendContext = data ? JSON.stringify(data, null, 0).slice(0, 4000) : ''

    const systemPrompt = `You are an AI reporting assistant for Triple Cities Tech, a managed IT services company. You help staff analyze service desk data and generate insights.

Context: You are viewing the "${context}" section of the reporting dashboard.
Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

## Real-Time Database Data
${realtimeData}

${frontendContext ? `## Dashboard Summary Data (supplementary)\n${frontendContext}` : ''}

Instructions:
- Answer using the REAL-TIME DATABASE DATA above — it is queried live from the database.
- Be specific: cite exact ticket numbers, technician names, company names, and counts.
- When asked about "today", use the tickets with today's date from the data above.
- Use bullet points and markdown headers for clarity.
- If asked to generate a report, format it professionally with headers, sections, and key metrics.
- When company-specific data is available (Company Deep Dive, Response & Resolution Metrics, Communication Pattern Analysis), use it to provide detailed per-company insights including ticket counts, response times, SLA compliance, customer response delays, and outreach-to-response ratios.
- Do not make up data. Only reference what is provided above.
- Keep responses under 600 words unless generating a full report or a company-specific analysis.
- Format time values nicely (e.g., "2.5 hours" not "150 minutes").
- Be actionable — suggest next steps when relevant.
- This is a conversation. The user may ask follow-up questions about your previous answers. Reference your prior responses and the data when answering follow-ups.
- IMPORTANT: When discussing ticket notes and outreach, always distinguish between note types:
  - "Human technician notes" = created by a real person (has creatorResourceId, no creatorContactId)
  - "Customer notes" = created by the customer (has creatorContactId)
  - "System/API automated notes" = created by workflows or API integrations (both creator fields are null) — NEVER count these as human outreach attempts
  - Notes with publish=3 are customer-visible (external outreach); publish=1 or 2 are internal-only
  - Only count customer-visible human tech notes (publish=3) as genuine outreach to the customer
  - Internal notes (publish=1 or 2) are team communication, not customer outreach`

    const anthropicMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: anthropicMessages,
    })

    const textContent = message.content.find(c => c.type === 'text')
    const response = textContent ? textContent.text : 'No response generated'

    return NextResponse.json({ response })
  } catch (err) {
    console.error('[AI Assistant] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI assistant failed' },
      { status: 500 },
    )
  }
}
