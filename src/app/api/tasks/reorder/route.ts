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
    const { taskOrders } = await req.json() as { taskOrders: Array<{ id: string; orderIndex: number }> }

    // Update all task orders in a transaction
    await prisma.$transaction(
      taskOrders.map(({ id, orderIndex }) =>
        prisma.phaseTask.update({
          where: { id },
          data: { orderIndex },
        })
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to reorder tasks:', error)
    return NextResponse.json(
      { error: 'Failed to reorder tasks' },
      { status: 500 }
    )
  }
}
