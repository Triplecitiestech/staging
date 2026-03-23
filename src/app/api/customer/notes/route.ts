import { NextRequest, NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-session'
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
    const portalSession = await getPortalSession()
    const adminSession = await auth()

    console.log('[Customer Notes API] Auth check:', {
      customerAuth: !!portalSession,
      adminAuth: !!adminSession
    })

    // Allow access if either customer is authenticated OR admin is authenticated (for preview mode)
    if (!portalSession && !adminSession) {
      console.log('[Customer Notes API] Not authenticated - no valid customer or admin session found')
      return NextResponse.json(
        { error: 'Unauthorized - please log in again. Your session may have expired.' },
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

    // Log which auth method was used
    if (adminSession) {
      console.log('[Customer Notes API] Using admin session for authentication')
    } else {
      console.log('[Customer Notes API] Using customer session for authentication')
    }

    const { prisma } = await import('@/lib/prisma')

    // If customer (not admin), verify the resource belongs to their company
    if (portalSession && !adminSession) {
      const company = await prisma.company.findUnique({
        where: { slug: portalSession.companySlug },
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
      // Update task notes locally
      console.log('[Customer Notes API] Updating task notes:', taskId)
      await prisma.phaseTask.update({
        where: { id: taskId },
        data: { notes: content }
      })

      // Sync note to Autotask if task has an autotaskTaskId
      const taskForSync = await prisma.phaseTask.findUnique({
        where: { id: taskId },
        select: {
          autotaskTaskId: true,
          taskText: true,
          phase: {
            select: {
              project: {
                select: {
                  company: { select: { displayName: true, slug: true } }
                }
              }
            }
          }
        }
      })

      if (taskForSync?.autotaskTaskId) {
        try {
          const atTaskId = parseInt(taskForSync.autotaskTaskId, 10)
          if (!isNaN(atTaskId)) {
            const { AutotaskClient } = await import('@/lib/autotask')
            const client = new AutotaskClient()
            const companyDisplayName = taskForSync.phase?.project?.company?.displayName || 'Customer'
            await client.createTaskNote(atTaskId, {
              title: `Customer Note from ${companyDisplayName} Portal`,
              description: content,
              noteType: 1,
              publish: 1, // External/customer-visible
            })
            console.log(`[Customer Notes API] Note synced to Autotask task ${atTaskId}`)
          }
        } catch (atError) {
          console.error('[Customer Notes API] Failed to sync note to Autotask:', atError)
          // Non-critical - local note was saved successfully
        }
      }

      // Notify internal staff assigned to this task via email and in-app notification
      try {
        const task = await prisma.phaseTask.findUnique({
          where: { id: taskId },
          select: {
            taskText: true,
            phaseId: true,
            phase: {
              select: {
                title: true,
                project: {
                  select: { title: true, slug: true, company: { select: { displayName: true } } }
                }
              }
            }
          }
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

          // Create in-app notification
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

          // Send email notification
          try {
            const { Resend } = await import('resend')
            const resendKey = process.env.RESEND_API_KEY
            if (resendKey) {
              const resend = new Resend(resendKey)
              const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'
              const companyName = task?.phase?.project?.company?.displayName || 'A customer'
              const projectTitle = task?.phase?.project?.title || 'Unknown Project'
              const taskTitle = task?.taskText || 'Unknown Task'
              const phaseTitle = task?.phase?.title || 'Unknown Phase'

              await resend.emails.send({
                from: process.env.EMAIL_FROM || 'Triple Cities Tech <notifications@triplecitiestech.com>',
                to: [assignment.assigneeEmail],
                subject: `Customer Note: ${taskTitle.substring(0, 60)}`,
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #0f172a, #1e3a5f); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                      <h2 style="margin: 0; font-size: 18px;">Customer Note Added</h2>
                    </div>
                    <div style="padding: 24px; background: white; border: 1px solid #e2e8f0;">
                      <p style="color: #475569;">Hi ${assignment.assigneeName || 'Team Member'},</p>
                      <p style="color: #1e293b;"><strong>${companyName}</strong> added a note on a task you're assigned to:</p>
                      <div style="background: #f8fafc; border-left: 4px solid #0891b2; padding: 16px; margin: 16px 0; border-radius: 4px;">
                        <p style="margin: 0 0 4px 0; font-size: 13px; color: #64748b;">${projectTitle} / ${phaseTitle}</p>
                        <p style="margin: 0 0 8px 0; font-weight: 600; color: #0f172a;">${taskTitle}</p>
                        <p style="margin: 0; color: #334155;">${content.substring(0, 500)}</p>
                      </div>
                      <div style="text-align: center; margin-top: 24px;">
                        <a href="${baseUrl}/admin/projects" style="background: #0891b2; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">View in Admin Portal</a>
                      </div>
                    </div>
                    <div style="padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
                      Triple Cities Tech &bull; Managed IT Services
                    </div>
                  </div>
                `,
                text: `Customer Note Added\n\n${companyName} added a note on task "${taskTitle}" (${projectTitle} / ${phaseTitle}):\n\n${content.substring(0, 500)}\n\nView in admin portal: ${baseUrl}/admin/projects`,
              })
              console.log(`[Customer Notes API] Email sent to ${assignment.assigneeEmail}`)
            }
          } catch (emailError) {
            console.error(`[Customer Notes API] Failed to send email to ${assignment.assigneeEmail}:`, emailError)
            // Non-critical - in-app notification was already created
          }
        }
        console.log(`[Customer Notes API] Notified ${notifiedEmails.size} staff member(s) via app + email`)
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
