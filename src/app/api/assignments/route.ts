import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Resend } from 'resend'
import { getTaskAssignmentEmailHtml } from '@/lib/email-templates'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// GET assignments for a phase or task
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
    const assigneeEmail = searchParams.get('assigneeEmail')

    const where: {
      phaseId?: string
      taskId?: string
      assigneeEmail?: string
    } = {}
    if (phaseId) where.phaseId = phaseId
    if (taskId) where.taskId = taskId
    if (assigneeEmail) where.assigneeEmail = assigneeEmail

    const assignments = await prisma.assignment.findMany({
      where,
      orderBy: { assignedAt: 'desc' }
    })

    return NextResponse.json(assignments)
  } catch (error) {
    console.error('Failed to fetch assignments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch assignments' },
      { status: 500 }
    )
  }
}

// POST new assignment
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const data = await req.json()

    // Validate required fields
    if (!data.assigneeEmail || !data.assigneeName) {
      return NextResponse.json(
        { error: 'assigneeEmail and assigneeName are required' },
        { status: 400 }
      )
    }

    if (!data.phaseId && !data.taskId) {
      return NextResponse.json(
        { error: 'Must provide either phaseId or taskId' },
        { status: 400 }
      )
    }

    // Check if assignment already exists (only check the specific phase/task, not broadly)
    const duplicateWhere: { assigneeEmail: string; phaseId?: string; taskId?: string } = {
      assigneeEmail: data.assigneeEmail,
    }
    if (data.taskId) {
      duplicateWhere.taskId = data.taskId
    } else if (data.phaseId) {
      duplicateWhere.phaseId = data.phaseId
    }

    const existing = await prisma.assignment.findFirst({ where: duplicateWhere })

    if (existing) {
      return NextResponse.json(
        { error: 'This user is already assigned' },
        { status: 409 }
      )
    }

    const assignment = await prisma.assignment.create({
      data: {
        phaseId: data.phaseId || null,
        taskId: data.taskId || null,
        assigneeEmail: data.assigneeEmail,
        assigneeName: data.assigneeName,
        assignedBy: session.user?.email || 'unknown',
      }
    })

    // Send email notification to assignee
    if (resend) {
      try {
        // Fetch task/phase details for the email
        let taskText = ''
        let projectName = ''
        let phaseName = ''
        let companySlug = ''

        if (data.taskId) {
          const task = await prisma.phaseTask.findUnique({
            where: { id: data.taskId },
            include: {
              phase: {
                include: {
                  project: {
                    include: { company: { select: { slug: true, displayName: true } } }
                  }
                }
              }
            }
          })
          if (task) {
            taskText = task.taskText
            phaseName = task.phase.title
            projectName = task.phase.project.title
            companySlug = task.phase.project.company.slug
          }
        } else if (data.phaseId) {
          const phase = await prisma.phase.findUnique({
            where: { id: data.phaseId },
            include: {
              project: {
                include: { company: { select: { slug: true, displayName: true } } }
              }
            }
          })
          if (phase) {
            phaseName = phase.title
            projectName = phase.project.title
            companySlug = phase.project.company.slug
          }
        }

        const portalUrl = `${process.env.NEXTAUTH_URL || 'https://www.triplecitiestech.com'}/onboarding/${companySlug}`

        await resend.emails.send({
          from: 'Triple Cities Tech <noreply@triplecitiestech.com>',
          to: data.assigneeEmail,
          subject: `Task Assigned: ${taskText || phaseName || 'New Assignment'}`,
          html: getTaskAssignmentEmailHtml({
            assigneeName: data.assigneeName,
            taskText,
            phaseName,
            projectName,
            assignedBy: session.user?.name || session.user?.email || 'Your project manager',
            portalUrl,
          })
        })
      } catch (emailErr) {
        console.warn('Failed to send assignment email:', emailErr)
      }
    }

    return NextResponse.json(assignment)
  } catch (error) {
    console.error('Failed to create assignment:', error)
    return NextResponse.json(
      { error: 'Failed to create assignment' },
      { status: 500 }
    )
  }
}
