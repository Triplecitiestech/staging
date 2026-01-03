import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import("@/lib/prisma")
    const { id: parentTaskId } = await params
    const data = await req.json()

    // Get parent task to check nesting level
    const parentTask = await prisma.phaseTask.findUnique({
      where: { id: parentTaskId },
      include: {
        parent: {
          include: {
            parent: true
          }
        }
      }
    })

    if (!parentTask) {
      return NextResponse.json({ error: 'Parent task not found' }, { status: 404 })
    }

    // Check if we're already at level 3 (max depth)
    let level = 1
    if (parentTask.parent) {
      level = 2
      if (parentTask.parent.parent) {
        level = 3
      }
    }

    if (level >= 3) {
      return NextResponse.json(
        { error: 'Maximum sub-task depth (3 levels) reached' },
        { status: 400 }
      )
    }

    // Get the highest orderIndex for this parent's subtasks
    const lastSubTask = await prisma.phaseTask.findFirst({
      where: { parentTaskId },
      orderBy: { orderIndex: 'desc' }
    })

    const orderIndex = lastSubTask ? lastSubTask.orderIndex + 1 : 0

    const subTask = await prisma.phaseTask.create({
      data: {
        phaseId: parentTask.phaseId,
        parentTaskId,
        taskText: data.taskText || 'New sub-task',
        orderIndex,
        status: 'NOT_STARTED'
      }
    })

    return NextResponse.json(subTask)
  } catch (error) {
    console.error('Sub-task creation error:', error)
    return NextResponse.json({ error: 'Failed to create sub-task' }, { status: 500 })
  }
}
