import { NextRequest, NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-session'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/customer/comments
 * Create a customer comment on a task. Uses Comment model (not task notes).
 * Syncs to Autotask if task has autotaskTaskId.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { taskId, content } = body

    if (!taskId || !content?.trim()) {
      return NextResponse.json(
        { error: 'taskId and content are required' },
        { status: 400 }
      )
    }

    // Check authentication - either customer session OR admin session
    const portalSession = await getPortalSession()
    const adminSession = await auth()

    if (!portalSession && !adminSession) {
      return NextResponse.json(
        { error: 'Unauthorized - please log in again.' },
        { status: 401 }
      )
    }

    // Demo company: read-only access (no write operations)
    if (portalSession?.companySlug === 'contoso-industries' && !adminSession) {
      return NextResponse.json(
        { error: 'Demo portal is read-only. Write operations are disabled.' },
        { status: 403 }
      )
    }

    const { prisma } = await import('@/lib/prisma')

    // Get task details (for company verification and Autotask sync)
    const task = await prisma.phaseTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskText: true,
        autotaskTaskId: true,
        phase: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                title: true,
                companyId: true,
                company: { select: { id: true, slug: true, displayName: true } }
              }
            }
          }
        }
      }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // If customer (not admin), verify the task belongs to their company
    if (portalSession && !adminSession) {
      const companySlug = task.phase?.project?.company?.slug
      if (companySlug !== portalSession.companySlug) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Look up the company's primary contact for author attribution
    const companyId = task.phase?.project?.companyId
    let primaryContact: { name: string; email: string } | null = null
    if (companyId) {
      try {
        const contact = await prisma.companyContact.findFirst({
          where: { companyId, isPrimary: true, isActive: true },
          select: { name: true, email: true },
        })
        if (contact) primaryContact = contact
      } catch {
        // company_contacts table may not exist yet — fall through
      }
      // If no primary, try any active contact
      if (!primaryContact) {
        try {
          const contact = await prisma.companyContact.findFirst({
            where: { companyId, isActive: true },
            select: { name: true, email: true },
          })
          if (contact) primaryContact = contact
        } catch {
          // table may not exist
        }
      }
    }

    // When admin is impersonating/previewing: use primary contact as author
    // When customer is logged in: also use primary contact (they represent the company)
    const authorName = primaryContact?.name
      || task.phase?.project?.company?.displayName
      || 'Customer'

    const authorEmail = primaryContact?.email || 'customer'

    // Create the comment in local DB
    const comment = await prisma.comment.create({
      data: {
        taskId,
        content: content.trim(),
        isInternal: false,
        authorEmail,
        authorName,
      }
    })

    // Sync to Autotask if task has an autotaskTaskId
    if (task.autotaskTaskId) {
      try {
        const atTaskId = parseInt(task.autotaskTaskId, 10)
        if (!isNaN(atTaskId)) {
          const { AutotaskClient } = await import('@/lib/autotask')
          const client = new AutotaskClient()
          await client.createTaskNote(atTaskId, {
            title: `Comment from ${authorName} via Customer Portal`,
            description: content.trim(),
            noteType: 1,
            publish: 1,
          })
          console.log(`[Customer Comments API] Comment synced to Autotask task ${atTaskId} as ${authorName}`)
        }
      } catch (atError) {
        console.error('[Customer Comments API] Failed to sync to Autotask:', atError)
      }
    }

    // Notify staff
    try {
      const assignments = await prisma.assignment.findMany({
        where: { taskId },
        select: { assigneeEmail: true, assigneeName: true }
      })

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
            title: 'Customer Comment Added',
            message: `${authorName} commented on task "${task.taskText}": ${content.trim().substring(0, 200)}`,
            linkUrl: '/admin/projects',
          }
        })
      }
    } catch (notifyError) {
      console.error('[Customer Comments API] Notification failed:', notifyError)
    }

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        authorName: comment.authorName,
        createdAt: comment.createdAt,
      }
    })
  } catch (error) {
    console.error('[Customer Comments API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    )
  }
}
