import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { AutotaskClient } from '@/lib/autotask'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/autotask/time-entries
 * Creates a time entry on an Autotask task. Requires matching the user to an Autotask resource.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { autotaskTaskId, hoursWorked, dateWorked, summaryNotes, internalNotes } = body

    if (!autotaskTaskId || !hoursWorked || !dateWorked) {
      return NextResponse.json(
        { error: 'autotaskTaskId, hoursWorked, and dateWorked are required' },
        { status: 400 }
      )
    }

    const atTaskId = parseInt(autotaskTaskId, 10)
    if (isNaN(atTaskId)) {
      return NextResponse.json({ error: 'Invalid autotaskTaskId' }, { status: 400 })
    }

    const client = new AutotaskClient()

    // Resolve Autotask resource ID — required for time entries
    let atResourceId: number | null = null

    const staffUser = await prisma.staffUser.findUnique({
      where: { email: session.user.email },
    })

    if (staffUser?.autotaskResourceId) {
      atResourceId = parseInt(staffUser.autotaskResourceId, 10)
    }

    if (!atResourceId) {
      const resource = await client.getResourceByEmail(session.user.email)
      if (resource) {
        atResourceId = resource.id
        // Cache for future use
        try {
          await prisma.staffUser.update({
            where: { email: session.user.email },
            data: { autotaskResourceId: String(resource.id) },
          })
        } catch {
          // Non-critical
        }
      }
    }

    if (!atResourceId) {
      return NextResponse.json(
        { error: 'Could not find your Autotask resource. Make sure your email matches between Azure AD and Autotask.' },
        { status: 400 }
      )
    }

    const timeEntry = await client.createTimeEntry({
      taskID: atTaskId,
      resourceID: atResourceId,
      dateWorked,
      hoursWorked: parseFloat(hoursWorked),
      summaryNotes: summaryNotes || '',
      internalNotes: internalNotes || '',
    })

    return NextResponse.json({
      success: true,
      timeEntry,
    })
  } catch (error) {
    console.error('Error creating Autotask time entry:', error)
    return NextResponse.json(
      { error: 'Failed to create time entry', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
