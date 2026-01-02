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

    // Build update object with only provided fields
    const updateData: {
      title?: string
      description?: string | null
      status?: PhaseStatus
      customerNotes?: string | null
      internalNotes?: string | null
      isVisibleToCustomer?: boolean
    } = {}

    if (data.title !== undefined) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description
    if (data.status !== undefined) updateData.status = data.status as PhaseStatus
    if (data.customerNotes !== undefined) updateData.customerNotes = data.customerNotes
    if (data.internalNotes !== undefined) updateData.internalNotes = data.internalNotes
    if (data.isVisibleToCustomer !== undefined) updateData.isVisibleToCustomer = data.isVisibleToCustomer

    const phase = await prisma.phase.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json(phase)
  } catch (error) {
    console.error('Phase update error:', error)
    return NextResponse.json({ error: 'Failed to update phase' }, { status: 500 })
  }
}

// DELETE phase (cascade will delete tasks)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    // Verify phase exists
    const phase = await prisma.phase.findUnique({
      where: { id }
    })

    if (!phase) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 })
    }

    // Delete phase (tasks will be cascade deleted)
    await prisma.phase.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Phase deletion error:', error)
    return NextResponse.json({ error: 'Failed to delete phase' }, { status: 500 })
  }
}
