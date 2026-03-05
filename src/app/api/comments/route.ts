import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

function getNoteNotificationHtml(opts: {
  authorName: string
  companyName: string
  taskText: string
  noteContent: string
  projectTitle: string
  phaseTitle: string
  isCustomerNote: boolean
}) {
  const title = opts.isCustomerNote ? 'Customer Note Added' : 'New Note on Task'
  const subtitle = opts.isCustomerNote
    ? `<strong>${opts.authorName}</strong> from <strong>${opts.companyName}</strong> added a note to a task.`
    : `<strong>${opts.authorName}</strong> added a note to a task for <strong>${opts.companyName}</strong>.`

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #0f172a; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${title}</h2>
      </div>
      <div style="background-color: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px; color: #475569; font-size: 14px;">${subtitle}</p>
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 8px; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Task</p>
          <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b; font-weight: 600;">${opts.taskText}</p>
          <p style="margin: 0 0 8px; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Note</p>
          <p style="margin: 0; font-size: 14px; color: #334155; white-space: pre-wrap;">${opts.noteContent}</p>
        </div>
        <p style="margin: 0 0 4px; font-size: 12px; color: #94a3b8;">
          Project: ${opts.projectTitle} / ${opts.phaseTitle}
        </p>
        <p style="margin: 0; font-size: 11px; color: #cbd5e1;">
          This notification was sent automatically by Triple Cities Tech.
        </p>
      </div>
    </div>
  `
}

// GET comments for a phase or task
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const { searchParams } = new URL(req.url)
    const phaseId = searchParams.get('phaseId')
    const taskId = searchParams.get('taskId')
    const includeInternal = searchParams.get('includeInternal') === 'true'

    if (!phaseId && !taskId) {
      return NextResponse.json(
        { error: 'Must provide either phaseId or taskId' },
        { status: 400 }
      )
    }

    const where: {
      phaseId?: string
      taskId?: string
      isInternal?: boolean
    } = {}
    if (phaseId) where.phaseId = phaseId
    if (taskId) where.taskId = taskId

    // Filter internal comments based on permission
    if (!includeInternal) {
      where.isInternal = false
    }

    const comments = await prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json(comments)
  } catch (error) {
    console.error('Failed to fetch comments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    )
  }
}

// POST new comment
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const data = await req.json()

    // Validate required fields
    if (!data.content) {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      )
    }

    if (!data.phaseId && !data.taskId) {
      return NextResponse.json(
        { error: 'Must provide either phaseId or taskId' },
        { status: 400 }
      )
    }

    const comment = await prisma.comment.create({
      data: {
        phaseId: data.phaseId || null,
        taskId: data.taskId || null,
        content: data.content,
        isInternal: data.isInternal ?? false,
        authorEmail: session.user?.email || 'unknown',
        authorName: session.user?.name || 'Unknown User',
      }
    })

    // Notification logic
    if (data.taskId) {
      try {
        const staffUser = await prisma.staffUser.findFirst({
          where: { email: session.user?.email || '' }
        })

        // Get task details for any notifications
        const task = await prisma.phaseTask.findUnique({
          where: { id: data.taskId },
          include: {
            phase: {
              include: {
                project: {
                  include: { company: { select: { displayName: true } } }
                }
              }
            }
          }
        })

        // If the author is NOT staff and the note is external, this is a customer note
        if (!staffUser && !data.isInternal) {
          await prisma.phaseTask.update({
            where: { id: data.taskId },
            data: { status: 'CUSTOMER_NOTE_ADDED' }
          })

          // Auto-notify all staff on customer notes
          try {
            const { Resend } = await import('resend')
            const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

            if (resend && task) {
              const allStaff = await prisma.staffUser.findMany({
                where: { isActive: true },
                select: { email: true }
              })
              const staffEmails = allStaff.map(u => u.email).filter(Boolean)

              if (staffEmails.length > 0) {
                await resend.emails.send({
                  from: 'Triple Cities Tech <noreply@triplecitiestech.com>',
                  to: staffEmails,
                  subject: `Customer Note: ${task.taskText} - ${task.phase.project.company.displayName}`,
                  html: getNoteNotificationHtml({
                    authorName: session.user?.name || 'A customer',
                    companyName: task.phase.project.company.displayName,
                    taskText: task.taskText,
                    noteContent: data.content,
                    projectTitle: task.phase.project.title,
                    phaseTitle: task.phase.title,
                    isCustomerNote: true,
                  }),
                })
              }
            }
          } catch (notifyErr) {
            console.warn('Failed to send customer note notification:', notifyErr)
          }
        }

        // Send selective notifications if notifyEmails were specified
        if (data.notifyEmails && Array.isArray(data.notifyEmails) && data.notifyEmails.length > 0 && task) {
          try {
            const { Resend } = await import('resend')
            const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

            if (resend) {
              const validEmails = data.notifyEmails.filter((e: string) => e && e.includes('@'))
              if (validEmails.length > 0) {
                await resend.emails.send({
                  from: 'Triple Cities Tech <noreply@triplecitiestech.com>',
                  to: validEmails,
                  subject: `Note on Task: ${task.taskText} - ${task.phase.project.company.displayName}`,
                  html: getNoteNotificationHtml({
                    authorName: session.user?.name || 'Someone',
                    companyName: task.phase.project.company.displayName,
                    taskText: task.taskText,
                    noteContent: data.content,
                    projectTitle: task.phase.project.title,
                    phaseTitle: task.phase.title,
                    isCustomerNote: false,
                  }),
                })
              }
            }
          } catch (notifyErr) {
            console.warn('Failed to send note notification:', notifyErr)
          }
        }
      } catch (statusErr) {
        console.warn('Failed to process note notifications:', statusErr)
      }
    }

    return NextResponse.json(comment)
  } catch (error) {
    console.error('Failed to create comment:', error)
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    )
  }
}
