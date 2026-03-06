import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'
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
    const authenticatedCompany = await getAuthenticatedCompany()
    const adminSession = await auth()

    if (!authenticatedCompany && !adminSession) {
      return NextResponse.json(
        { error: 'Unauthorized - please log in again.' },
        { status: 401 }
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
    if (authenticatedCompany && !adminSession) {
      const companySlug = task.phase?.project?.company?.slug
      if (companySlug !== authenticatedCompany) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const authorName = adminSession
      ? (adminSession.user?.name || 'Admin')
      : (task.phase?.project?.company?.displayName || 'Customer')

    const authorEmail = adminSession
      ? (adminSession.user?.email || 'admin')
      : 'customer'

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
          const companyName = task.phase?.project?.company?.displayName || 'Customer'
          await client.createTaskNote(atTaskId, {
            title: `Comment from ${companyName} Portal`,
            description: content.trim(),
            noteType: 1,
            publish: 1,
          })
          console.log(`[Customer Comments API] Comment synced to Autotask task ${atTaskId}`)
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
