import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PhaseStatus } from '@prisma/client'

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

    // When phase status changes to COMPLETE, write-back all AT-synced child tasks as complete
    // When phase status changes to IN_PROGRESS, write-back non-complete tasks as in-progress
    if (data.status !== undefined) {
      try {
        const { AutotaskClient, mapLocalStatusToAt } = await import('@/lib/autotask')
        const atTasks = await prisma.phaseTask.findMany({
          where: { phaseId: id, autotaskTaskId: { not: null } },
          select: { id: true, autotaskTaskId: true, status: true }
        })

        if (atTasks.length > 0) {
          const client = new AutotaskClient()
          const DONE_STATUSES = ['REVIEWED_AND_DONE', 'NOT_APPLICABLE', 'ITG_DOCUMENTED']

          // Look up the project's autotaskProjectId for the child entity path
          const phaseWithProject = await prisma.phase.findUnique({
            where: { id },
            select: { project: { select: { autotaskProjectId: true } } }
          })
          const atProjectId = phaseWithProject?.project?.autotaskProjectId || undefined

          for (const task of atTasks) {
            if (!task.autotaskTaskId) continue

            let targetAtStatus: number | null = null

            if (data.status === 'COMPLETE' && !DONE_STATUSES.includes(task.status)) {
              // Phase marked complete — mark all incomplete tasks as complete in AT
              targetAtStatus = 5 // AT_TASK_STATUS_COMPLETE
              await prisma.phaseTask.update({
                where: { id: task.id },
                data: { status: 'REVIEWED_AND_DONE', completed: true, completedAt: new Date() }
              })
            } else if (data.status === 'IN_PROGRESS' && task.status === 'NOT_STARTED') {
              // Phase moved to in-progress — update NOT_STARTED tasks
              targetAtStatus = mapLocalStatusToAt('WORK_IN_PROGRESS')
              await prisma.phaseTask.update({
                where: { id: task.id },
                data: { status: 'WORK_IN_PROGRESS' }
              })
            }

            if (targetAtStatus !== null) {
              try {
                await client.updateTaskStatus(task.autotaskTaskId, targetAtStatus, atProjectId)
                console.log(`[Autotask Write-back] Updated task ${task.autotaskTaskId} status to ${targetAtStatus} (phase status change)`)
              } catch (taskErr) {
                console.error(`[Autotask Write-back] Failed to update task ${task.autotaskTaskId}:`, taskErr instanceof Error ? taskErr.message : taskErr)
              }
            }
          }
        }
      } catch (atErr) {
        console.error('[Autotask Write-back] Phase task sync failed:', atErr instanceof Error ? atErr.message : atErr)
      }
    }

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
    const { prisma } = await import("@/lib/prisma")
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
