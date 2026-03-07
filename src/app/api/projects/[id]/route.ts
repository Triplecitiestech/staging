import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { ProjectStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import("@/lib/prisma")
    const { id } = await params
    const data = await req.json()

    // Fetch current project to check for Autotask ID
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { autotaskProjectId: true, status: true }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const updateData: {
      status?: ProjectStatus
      name?: string
      description?: string | null
      isVisibleToCustomer?: boolean
    } = {}

    if (data.status !== undefined) updateData.status = data.status as ProjectStatus
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.isVisibleToCustomer !== undefined) updateData.isVisibleToCustomer = data.isVisibleToCustomer

    const project = await prisma.project.update({
      where: { id },
      data: updateData
    })

    // Write-back to Autotask if project is AT-synced and status changed
    if (data.status !== undefined && existing.autotaskProjectId && data.status !== existing.status) {
      try {
        const { AutotaskClient, mapLocalProjectStatusToAt } = await import('@/lib/autotask')
        const atStatus = mapLocalProjectStatusToAt(data.status)
        if (atStatus !== null) {
          const client = new AutotaskClient()
          await client.updateProjectStatus(existing.autotaskProjectId, atStatus)
          console.log(`[Autotask Write-back] Updated project ${existing.autotaskProjectId} status to ${atStatus}`)
        }
      } catch (atErr) {
        console.error('[Autotask Write-back] Failed to sync project status:', atErr instanceof Error ? atErr.message : atErr)
      }
    }

    return NextResponse.json(project)
  } catch (error) {
    console.error('Project update error:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { prisma } = await import("@/lib/prisma")
    const { id } = await params

    await prisma.project.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
