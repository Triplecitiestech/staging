import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { AutotaskClient } from '@/lib/autotask'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/autotask/notes
 * Creates a note on an Autotask task. Matches the current user to their Autotask resource.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { autotaskTaskId, title, description, isInternal } = body

    if (!autotaskTaskId || !description) {
      return NextResponse.json(
        { error: 'autotaskTaskId and description are required' },
        { status: 400 }
      )
    }

    const atTaskId = parseInt(autotaskTaskId, 10)
    if (isNaN(atTaskId)) {
      return NextResponse.json({ error: 'Invalid autotaskTaskId' }, { status: 400 })
    }

    const client = new AutotaskClient()

    // Look up the staff user to get cached Autotask resource ID
    const staffUser = await prisma.staffUser.findUnique({
      where: { email: session.user.email },
    })

    // Try to resolve Autotask resource ID from cached value or by email lookup
    let resourceName = staffUser?.name || session.user.name || session.user.email
    let atResourceId: number | null = null

    if (staffUser?.autotaskResourceId) {
      atResourceId = parseInt(staffUser.autotaskResourceId, 10)
    }

    if (!atResourceId) {
      // Look up by email in Autotask
      const resource = await client.getResourceByEmail(session.user.email)
      if (resource) {
        atResourceId = resource.id
        resourceName = `${resource.firstName} ${resource.lastName}`.trim()
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

    const note = await client.createTaskNote(atTaskId, {
      title: title || `Note from ${resourceName}`,
      description,
      publish: isInternal ? 2 : 1,
    })

    return NextResponse.json({
      success: true,
      note,
      authorName: resourceName,
    })
  } catch (error) {
    console.error('Error creating Autotask note:', error)
    return NextResponse.json(
      { error: 'Failed to create note', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
