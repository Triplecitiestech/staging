import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { TaskStatus, Priority } from '@prisma/client'


export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import("@/lib/prisma")
    const { id } = await params
    const data = await req.json()

    // Build update object with only provided fields
    const updateData: {
      taskText?: string
      completed?: boolean
      notes?: string | null
      completedBy?: string | null
      completedAt?: Date | null
      status?: TaskStatus
      isVisibleToCustomer?: boolean
      assignedTo?: string | null
      assignedToName?: string | null
      dueDate?: Date | null
      priority?: Priority
    } = {}

    if (data.taskText !== undefined) updateData.taskText = data.taskText
    if (data.completed !== undefined) {
      updateData.completed = data.completed
      updateData.completedBy = data.completed ? session.user?.email || null : null
      updateData.completedAt = data.completed ? new Date() : null
    }
    if (data.notes !== undefined) updateData.notes = data.notes

    // New fields for enhanced task management
    if (data.status !== undefined) updateData.status = data.status as TaskStatus
    if (data.isVisibleToCustomer !== undefined) updateData.isVisibleToCustomer = data.isVisibleToCustomer
    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo
    if (data.assignedToName !== undefined) updateData.assignedToName = data.assignedToName
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null
    if (data.priority !== undefined) updateData.priority = data.priority as Priority

    let task
    try {
      task = await prisma.phaseTask.update({
        where: { id },
        data: updateData
      })
    } catch (error) {
      console.error('Task update error (attempting without notes):', error)
      // If notes column doesn't exist, try without it
      const { notes: _notes, ...updateWithoutNotes } = updateData
      task = await prisma.phaseTask.update({
        where: { id },
        data: updateWithoutNotes,
        select: {
          id: true,
          phaseId: true,
          taskText: true,
          completed: true,
          completedBy: true,
          completedAt: true,
          orderIndex: true,
          status: true,
          isVisibleToCustomer: true,
          assignedTo: true,
          assignedToName: true,
          dueDate: true,
          priority: true,
          createdAt: true,
          updatedAt: true
        }
      })
    }

    return NextResponse.json(task)
  } catch (error) {
    console.error('Task update error:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import("@/lib/prisma")
    const { id } = await params

    // Delete task (CASCADE will delete sub-tasks automatically)
    await prisma.phaseTask.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Task delete error:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
