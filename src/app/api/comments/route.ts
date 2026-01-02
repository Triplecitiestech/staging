import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

// GET comments for a phase or task
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const phaseId = searchParams.get('phaseId')
    const taskId = searchParams.get('taskId')
    const includeInternal = searchParams.get('includeInternal') === 'true'

    if (!phaseId && !taskId) {
      return NextResponse.json(
        { error: 'Must provide either phaseId or taskId' },
        { status: 400 }
      )
    }

    const where: any = {}
    if (phaseId) where.phaseId = phaseId
    if (taskId) where.taskId = taskId

    // Filter internal comments based on permission
    if (!includeInternal) {
      where.isInternal = false
    }

    const comments = await prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json(comments)
  } catch (error) {
    console.error('Failed to fetch comments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    )
  }
}

// POST new comment
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await req.json()

    // Validate required fields
    if (!data.content) {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      )
    }

    if (!data.phaseId && !data.taskId) {
      return NextResponse.json(
        { error: 'Must provide either phaseId or taskId' },
        { status: 400 }
      )
    }

    const comment = await prisma.comment.create({
      data: {
        phaseId: data.phaseId || null,
        taskId: data.taskId || null,
        content: data.content,
        isInternal: data.isInternal ?? false,
        authorEmail: session.user?.email || 'unknown',
        authorName: session.user?.name || 'Unknown User',
      }
    })

    return NextResponse.json(comment)
  } catch (error) {
    console.error('Failed to create comment:', error)
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    )
  }
}
