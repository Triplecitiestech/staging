import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

// POST /api/customer/notes - Save a customer note on a phase or task
export async function POST(request: NextRequest) {
  try {
    console.log('[Customer Notes API] Starting request')
    console.log('[Customer Notes API] Headers:', Object.fromEntries(request.headers.entries()))
    console.log('[Customer Notes API] Cookies:', request.cookies.getAll())

    const body = await request.json()
    const { phaseId, taskId, content } = body

    console.log('[Customer Notes API] Request body:', { phaseId, taskId, contentLength: content?.length })

    // Verify customer authentication via session cookie
    const authenticatedCompany = await getAuthenticatedCompany()

    console.log('[Customer Notes API] Authenticated company result:', authenticatedCompany)

    if (!authenticatedCompany) {
      console.log('[Customer Notes API] Not authenticated - no valid session found')
      return NextResponse.json(
        { error: 'Unauthorized - please log in again. Your session may have expired.' },
        { status: 401 }
      )
    }

    if (phaseId) {
      // Update phase customer notes
      console.log('[Customer Notes API] Updating phase notes:', phaseId)
      await prisma.phase.update({
        where: { id: phaseId },
        data: { customerNotes: content }
      })

      console.log('[Customer Notes API] Phase notes updated successfully')
      return NextResponse.json({ success: true, type: 'phase' })
    } else if (taskId) {
      // Update task notes
      console.log('[Customer Notes API] Updating task notes:', taskId)
      await prisma.phaseTask.update({
        where: { id: taskId },
        data: { notes: content }
      })

      console.log('[Customer Notes API] Task notes updated successfully')
      return NextResponse.json({ success: true, type: 'task' })
    } else {
      console.log('[Customer Notes API] Missing phaseId and taskId')
      return NextResponse.json(
        { error: 'Either phaseId or taskId is required' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('[Customer Notes API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
