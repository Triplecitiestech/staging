import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { AutotaskClient, mapAtTaskStatus, mapAtTaskPriority } from '@/lib/autotask'
import type { TaskStatus, Priority } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/autotask/sync-project
 * Force sync a single project's phases, tasks, and notes from Autotask.
 * Returns a detailed log of what was synced.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId, autotaskProjectId } = await request.json()
    if (!projectId || !autotaskProjectId) {
      return NextResponse.json({ error: 'projectId and autotaskProjectId required' }, { status: 400 })
    }

    const client = new AutotaskClient()
    const log: string[] = []
    const atProjectId = parseInt(autotaskProjectId, 10)

    log.push(`Starting sync for Autotask project ${atProjectId}...`)

    // Fetch phases from Autotask
    let atPhases: { id: number; title: string; description?: string; sortOrder?: number; scheduled?: boolean }[] = []
    try {
      const rawPhases = await client.getProjectPhases(atProjectId)
      atPhases = rawPhases
      log.push(`Fetched ${atPhases.length} phase(s) from Autotask`)
    } catch (error) {
      log.push(`ERROR fetching phases: ${error instanceof Error ? error.message : 'Unknown'}`)
    }

    // Sync each phase
    let phasesCreated = 0, phasesUpdated = 0, tasksCreated = 0, tasksUpdated = 0

    for (const atPhase of atPhases) {
      const atPhaseId = String(atPhase.id)

      // Find or create local phase
      let localPhase = await prisma.phase.findFirst({
        where: { autotaskPhaseId: atPhaseId },
      })

      if (localPhase) {
        await prisma.phase.update({
          where: { id: localPhase.id },
          data: {
            title: atPhase.title || localPhase.title,
            description: atPhase.description || localPhase.description,
            orderIndex: atPhase.sortOrder ?? localPhase.orderIndex,
          },
        })
        phasesUpdated++
        log.push(`  Updated phase: ${atPhase.title}`)
      } else {
        localPhase = await prisma.phase.create({
          data: {
            projectId,
            autotaskPhaseId: atPhaseId,
            title: atPhase.title || `Phase ${atPhase.id}`,
            description: atPhase.description || '',
            orderIndex: atPhase.sortOrder ?? 0,
            status: 'NOT_STARTED',
          },
        })
        phasesCreated++
        log.push(`  Created phase: ${atPhase.title}`)
      }

      // Fetch tasks for this phase
      try {
        const atTasks = await client.getProjectTasks(atPhase.id)
        log.push(`  Fetched ${atTasks.length} task(s) for phase "${atPhase.title}"`)

        for (const atTask of atTasks) {
          const atTaskId = String(atTask.id)
          const status = mapAtTaskStatus(atTask.status) as TaskStatus
          const priority = mapAtTaskPriority(atTask.priority || 2) as Priority
          const DONE_STATUSES = ['REVIEWED_AND_DONE', 'NOT_APPLICABLE', 'ITG_DOCUMENTED']

          const existingTask = await prisma.phaseTask.findFirst({
            where: { autotaskTaskId: atTaskId },
          })

          if (existingTask) {
            await prisma.phaseTask.update({
              where: { id: existingTask.id },
              data: {
                taskText: atTask.title || existingTask.taskText,
                status,
                priority,
                completed: DONE_STATUSES.includes(status),
                notes: atTask.description || existingTask.notes,
              },
            })
            tasksUpdated++
          } else {
            await prisma.phaseTask.create({
              data: {
                phaseId: localPhase.id,
                autotaskTaskId: atTaskId,
                taskText: atTask.title || `Task ${atTask.id}`,
                status,
                priority,
                completed: DONE_STATUSES.includes(status),
                orderIndex: 0,
                notes: atTask.description || '',
              },
            })
            tasksCreated++
          }
        }
      } catch (error) {
        log.push(`  ERROR fetching tasks for phase "${atPhase.title}": ${error instanceof Error ? error.message : 'Unknown'}`)
      }
    }

    // Update phase statuses based on task completion
    const localPhases = await prisma.phase.findMany({
      where: { projectId },
      include: { tasks: { select: { status: true } } },
    })

    for (const phase of localPhases) {
      if (phase.tasks.length === 0) continue
      const DONE_STATUSES = ['REVIEWED_AND_DONE', 'NOT_APPLICABLE', 'ITG_DOCUMENTED']
      const allDone = phase.tasks.every(t => DONE_STATUSES.includes(t.status))
      const anyInProgress = phase.tasks.some(t => t.status === 'WORK_IN_PROGRESS')
      const anyWaiting = phase.tasks.some(t => t.status === 'WAITING_ON_CLIENT')

      let newStatus = phase.status
      if (allDone) newStatus = 'COMPLETE'
      else if (anyWaiting) newStatus = 'WAITING_ON_CUSTOMER'
      else if (anyInProgress) newStatus = 'IN_PROGRESS'
      else newStatus = 'NOT_STARTED'

      if (newStatus !== phase.status) {
        await prisma.phase.update({
          where: { id: phase.id },
          data: { status: newStatus },
        })
        log.push(`  Phase "${phase.title}" status: ${phase.status} → ${newStatus}`)
      }
    }

    // Update project sync timestamp
    await prisma.project.update({
      where: { id: projectId },
      data: { autotaskLastSync: new Date() },
    })

    log.push('')
    log.push(`Summary: ${phasesCreated} phases created, ${phasesUpdated} updated, ${tasksCreated} tasks created, ${tasksUpdated} updated`)
    log.push(`Sync completed at ${new Date().toISOString()}`)

    return NextResponse.json({ success: true, log: log.join('\n') })
  } catch (error) {
    console.error('Error syncing project:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
