import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const phases = await prisma.phase.findMany({
      where: { projectId },
      select: { id: true, title: true, orderIndex: true, status: true },
      orderBy: { orderIndex: 'asc' },
    })
    return NextResponse.json(phases)
  } catch (error) {
    console.error('Failed to fetch phases:', error)
    return NextResponse.json({ error: 'Failed to fetch phases' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    const data = await req.json()

    // Validate required fields
    if (!data.projectId || !data.title) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId and title' },
        { status: 400 }
      )
    }

    const phase = await prisma.phase.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        description: data.description || '',
        orderIndex: data.orderIndex ?? 0,
        status: data.status || 'NOT_STARTED',
        customerNotes: data.customerNotes,
        internalNotes: data.internalNotes,
        estimatedDays: data.estimatedDays,
      }
    })

    return NextResponse.json(phase)
  } catch (error) {
    console.error('Failed to create phase:', error)
    return NextResponse.json(
      { error: 'Failed to create phase' },
      { status: 500 }
    )
  }
}
