import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'
import { auth } from '@/auth'

// POST /api/customer/notes - Save a customer note on a phase or task
export async function POST(request: NextRequest) {
  try {
    console.log('[Customer Notes API] Starting request')
    console.log('[Customer Notes API] Headers:', Object.fromEntries(request.headers.entries()))
    console.log('[Customer Notes API] Cookies:', request.cookies.getAll())

    const body = await request.json()
    const { phaseId, taskId, content } = body

    console.log('[Customer Notes API] Request body:', { phaseId, taskId, contentLength: content?.length })

    // Check authentication - either customer session OR admin session
    const authenticatedCompany = await getAuthenticatedCompany()
    const adminSession = await auth()

    console.log('[Customer Notes API] Auth check:', {
      customerAuth: !!authenticatedCompany,
      adminAuth: !!adminSession
    })

    // Allow access if either customer is authenticated OR admin is authenticated (for preview mode)
    if (!authenticatedCompany && !adminSession) {
      console.log('[Customer Notes API] Not authenticated - no valid customer or admin session found')
      return NextResponse.json(
        { error: 'Unauthorized - please log in again. Your session may have expired.' },
        { status: 401 }
      )
    }

    // Log which auth method was used
    if (adminSession) {
      console.log('[Customer Notes API] Using admin session for authentication')
    } else {
      console.log('[Customer Notes API] Using customer session for authentication')
    }

    const { prisma } = await import('@/lib/prisma')

    // If customer (not admin), verify the resource belongs to their company
    if (authenticatedCompany && !adminSession) {
      const company = await prisma.company.findUnique({
        where: { slug: authenticatedCompany },
        select: { id: true }
      })

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 })
      }

      if (phaseId) {
        const phase = await prisma.phase.findFirst({
          where: {
            id: phaseId,
            project: { companyId: company.id }
          }
        })
        if (!phase) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
      } else if (taskId) {
        const task = await prisma.phaseTask.findFirst({
          where: {
            id: taskId,
            phase: { project: { companyId: company.id } }
          }
        })
        if (!task) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
      }
    }

    if (phaseId) {
      // Update phase customer notes
      console.log('[Customer Notes API] Updating phase notes:', phaseId)
      await prisma.phase.update({
        where: { id: phaseId },
        data: { customerNotes: content }
      })

      console.log('[Customer Notes API] Phase notes updated successfully')
      return NextResponse.json({ success: true, type: 'phase' })
    } else if (taskId) {
      // Update task notes
      console.log('[Customer Notes API] Updating task notes:', taskId)
      await prisma.phaseTask.update({
        where: { id: taskId },
        data: { notes: content }
      })

      // Notify internal members assigned to this task
      try {
        const task = await prisma.phaseTask.findUnique({
          where: { id: taskId },
          select: { taskText: true, phaseId: true }
        })
        const assignments = await prisma.assignment.findMany({
          where: { taskId },
          select: { assigneeEmail: true, assigneeName: true }
        })
        // Also check phase-level assignments
        if (task?.phaseId) {
          const phaseAssignments = await prisma.assignment.findMany({
            where: { phaseId: task.phaseId },
            select: { assigneeEmail: true, assigneeName: true }
          })
          assignments.push(...phaseAssignments)
        }
        // Deduplicate by email
        const notifiedEmails = new Set<string>()
        for (const assignment of assignments) {
          if (!assignment.assigneeEmail || notifiedEmails.has(assignment.assigneeEmail)) continue
          notifiedEmails.add(assignment.assigneeEmail)
          await prisma.notification.create({
            data: {
              recipientEmail: assignment.assigneeEmail,
              type: 'COMMENT',
              entityType: 'task',
              entityId: taskId,
              title: 'Customer Note Added',
              message: `A customer added a note on task "${task?.taskText || 'Unknown'}": ${content.substring(0, 200)}`,
              linkUrl: `/admin/projects`,
            }
          })
        }
        console.log(`[Customer Notes API] Notified ${notifiedEmails.size} staff member(s)`)
      } catch (notifyError) {
        console.error('[Customer Notes API] Failed to send notifications:', notifyError)
        // Non-critical - don't fail the note save
      }

      console.log('[Customer Notes API] Task notes updated successfully')
      return NextResponse.json({ success: true, type: 'task' })
    } else {
      console.log('[Customer Notes API] Missing phaseId and taskId')
      return NextResponse.json(
        { error: 'Either phaseId or taskId is required' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('[Customer Notes API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
