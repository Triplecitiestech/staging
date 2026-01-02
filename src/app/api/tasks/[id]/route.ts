import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const data = await req.json()

    // Build update object with only provided fields
    const updateData: {
      taskText?: string
      completed?: boolean
      notes?: string | null
      completedBy?: string | null
      completedAt?: Date | null
    } = {}

    if (data.taskText !== undefined) updateData.taskText = data.taskText
    if (data.completed !== undefined) {
      updateData.completed = data.completed
      updateData.completedBy = data.completed ? session.user?.email || null : null
      updateData.completedAt = data.completed ? new Date() : null
    }
    if (data.notes !== undefined) updateData.notes = data.notes

    let task
    try {
      task = await prisma.phaseTask.update({
        where: { id },
        data: updateData
      })
    } catch {
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
          createdAt: true
        }
      })
    }

    return NextResponse.json(task)
  } catch (error) {
    console.error('Task update error:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
