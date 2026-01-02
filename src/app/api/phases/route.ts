import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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
