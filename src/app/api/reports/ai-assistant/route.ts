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

/**
 * POST /api/reports/ai-assistant
 * AI-powered report assistant that answers questions about reporting data.
 * Now queries the database directly for real-time, accurate data.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prompt, context, data } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI assistant not configured' }, { status: 503 })
    }

    const client = new Anthropic({ apiKey })

    // Fetch real data from the database based on the prompt and context
    const realtimeData = await fetchRelevantData(prompt, context)

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
- Do not make up data. Only reference what is provided above.
- Keep responses under 600 words unless generating a full report.
- Format time values nicely (e.g., "2.5 hours" not "150 minutes").
- Be actionable — suggest next steps when relevant.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
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
