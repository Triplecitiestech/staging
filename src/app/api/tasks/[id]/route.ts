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

    const task = await prisma.phaseTask.update({
      where: { id },
      data: {
        taskText: data.taskText,
        completed: data.completed,
        notes: data.notes,
      }
    })

    return NextResponse.json(task)
  } catch {
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
