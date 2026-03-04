import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const data = await req.json()

    // Validate required fields
    if (!data.phaseId || !data.taskText) {
      return NextResponse.json(
        { error: 'Missing required fields: phaseId and taskText' },
        { status: 400 }
      )
    }

    const task = await prisma.phaseTask.create({
      data: {
        phaseId: data.phaseId,
        taskText: data.taskText,
        completed: data.completed ?? false,
        orderIndex: data.orderIndex ?? 0,
        notes: data.notes,
      }
    })

    return NextResponse.json(task)
  } catch (error) {
    console.error('Failed to create task:', error)
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    )
  }
}
