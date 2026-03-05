import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { TaskStatus, Priority, PhaseOwner } from '@prisma/client'

// Compute phase status from its tasks' statuses
async function syncPhaseStatus(prisma: { phaseTask: { findMany: (args: { where: { phaseId: string; parentTaskId: null }; select: { status: true } }) => Promise<{ status: TaskStatus }[]> }; phase: { update: (args: { where: { id: string }; data: { status: string } }) => Promise<unknown> } }, phaseId: string) {
  const tasks = await prisma.phaseTask.findMany({
    where: { phaseId, parentTaskId: null },
    select: { status: true }
  })

  if (tasks.length === 0) return

  const statuses = tasks.map(t => t.status)
  const doneStatuses: TaskStatus[] = ['REVIEWED_AND_DONE', 'NOT_APPLICABLE', 'ITG_DOCUMENTED']
  const activeStatuses: TaskStatus[] = ['WORK_IN_PROGRESS', 'ASSIGNED', 'WAITING_ON_CLIENT', 'WAITING_ON_VENDOR', 'NEEDS_REVIEW', 'INFORMATION_RECEIVED', 'CUSTOMER_NOTE_ADDED']

  let phaseStatus: string

  if (statuses.every(s => doneStatuses.includes(s))) {
    phaseStatus = 'COMPLETE'
  } else if (statuses.some(s => s === 'STUCK')) {
    phaseStatus = 'REQUIRES_CUSTOMER_COORDINATION'
  } else if (statuses.some(s => s === 'WAITING_ON_CLIENT' || s === 'CUSTOMER_NOTE_ADDED')) {
    phaseStatus = 'WAITING_ON_CUSTOMER'
  } else if (statuses.some(s => activeStatuses.includes(s))) {
    phaseStatus = 'IN_PROGRESS'
  } else {
    phaseStatus = 'NOT_STARTED'
  }

  await prisma.phase.update({
    where: { id: phaseId },
    data: { status: phaseStatus }
  })
}


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
      responsibleParty?: PhaseOwner | null
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
    if (data.responsibleParty !== undefined) updateData.responsibleParty = data.responsibleParty as PhaseOwner | null

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
          responsibleParty: true,
          createdAt: true,
          updatedAt: true
        }
      })
    }

    // Auto-sync phase status when a task status or completion changes
    if ((data.status !== undefined || data.completed !== undefined) && task.phaseId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await syncPhaseStatus(prisma as any, task.phaseId)
      } catch (syncErr) {
        console.warn('Failed to sync phase status:', syncErr)
      }
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

    // Get task's phaseId before deleting
    const taskToDelete = await prisma.phaseTask.findUnique({
      where: { id },
      select: { phaseId: true }
    })

    // Delete task (CASCADE will delete sub-tasks automatically)
    await prisma.phaseTask.delete({
      where: { id }
    })

    // Re-sync phase status after deletion
    if (taskToDelete?.phaseId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await syncPhaseStatus(prisma as any, taskToDelete.phaseId)
      } catch (syncErr) {
        console.warn('Failed to sync phase status after delete:', syncErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Task delete error:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
