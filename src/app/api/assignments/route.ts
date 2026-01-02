import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

// GET assignments for a phase or task
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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

    // Check if assignment already exists
    const existing = await prisma.assignment.findFirst({
      where: {
        OR: [
          { phaseId: data.phaseId, assigneeEmail: data.assigneeEmail },
          { taskId: data.taskId, assigneeEmail: data.assigneeEmail }
        ]
      }
    })

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

    // TODO: Create notification for assignee
    // This will be implemented in Phase 7

    return NextResponse.json(assignment)
  } catch (error) {
    console.error('Failed to create assignment:', error)
    return NextResponse.json(
      { error: 'Failed to create assignment' },
      { status: 500 }
    )
  }
}
