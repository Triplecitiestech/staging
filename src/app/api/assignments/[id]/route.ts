import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

interface RouteContext {
  params: Promise<{ id: string }>
}

// DELETE assignment (unassign)
export async function DELETE(req: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await context.params

    const assignment = await prisma.assignment.findUnique({
      where: { id }
    })

    if (!assignment) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      )
    }

    await prisma.assignment.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete assignment:', error)
    return NextResponse.json(
      { error: 'Failed to delete assignment' },
      { status: 500 }
    )
  }
}
