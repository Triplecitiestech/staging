import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

// POST /api/customer/notes - Save a customer note on a phase or task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phaseId, taskId, content, companySlug } = body

    if (!companySlug) {
      return NextResponse.json(
        { error: 'Company slug is required' },
        { status: 400 }
      )
    }

    // Verify customer authentication via cookie
    const authCookie = request.cookies.get('customer_auth')
    if (!authCookie || authCookie.value !== companySlug) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (phaseId) {
      // Update phase customer notes
      await prisma.phase.update({
        where: { id: phaseId },
        data: { customerNotes: content }
      })

      return NextResponse.json({ success: true, type: 'phase' })
    } else if (taskId) {
      // Update task notes
      await prisma.phaseTask.update({
        where: { id: taskId },
        data: { notes: content }
      })

      return NextResponse.json({ success: true, type: 'task' })
    } else {
      return NextResponse.json(
        { error: 'Either phaseId or taskId is required' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('[Customer Notes API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
