import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient, PhaseStatus } from '@prisma/client'
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

    const phase = await prisma.phase.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        status: data.status as PhaseStatus,
        customerNotes: data.customerNotes,
        internalNotes: data.internalNotes,
      }
    })

    return NextResponse.json(phase)
  } catch {
    return NextResponse.json({ error: 'Failed to update phase' }, { status: 500 })
  }
}
