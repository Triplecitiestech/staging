import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

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
    const { prisma } = await import('@/lib/prisma')
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
