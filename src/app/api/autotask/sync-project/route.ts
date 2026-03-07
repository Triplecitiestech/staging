import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { AutotaskClient, mapAtTaskStatus, mapAtTaskPriority, mapAtProjectStatus, mapLocalStatusToAt, mapLocalProjectStatusToAt } from '@/lib/autotask'
import type { TaskStatus, Priority } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/autotask/sync-project
 * 2-way sync: push local status changes TO Autotask, then pull updates FROM Autotask.
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

    log.push(`Starting 2-way sync for Autotask project ${atProjectId}...`)
    log.push('')

    // ========================================
    // PHASE 1: PUSH local changes TO Autotask
    // ========================================
    log.push('=== Phase 1: Push local changes to Autotask ===')

    // Push project status
    const localProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true }
    })

    if (localProject) {
      const atProjectStatus = mapLocalProjectStatusToAt(localProject.status)
      if (atProjectStatus !== null) {
        try {
          await client.updateProjectStatus(autotaskProjectId, atProjectStatus)
          log.push(`Pushed project status: ${localProject.status} -> AT status ${atProjectStatus}`)
        } catch (error) {
          log.push(`WARNING: Could not push project status: ${error instanceof Error ? error.message : 'Unknown'}`)
        }
      }
    }

    // Push task statuses for all AT-synced tasks
    const localTasks = await prisma.phaseTask.findMany({
      where: {
        phase: { projectId },
        autotaskTaskId: { not: null }
      },
      select: { id: true, taskText: true, autotaskTaskId: true, status: true }
    })

    let tasksPushed = 0
    for (const task of localTasks) {
      if (!task.autotaskTaskId) continue
      const atStatus = mapLocalStatusToAt(task.status)
      if (atStatus !== null) {
        try {
          await client.updateTaskStatus(task.autotaskTaskId, atStatus, autotaskProjectId)
          tasksPushed++
        } catch (error) {
          log.push(`  WARNING: Could not push task "${task.taskText}": ${error instanceof Error ? error.message : 'Unknown'}`)
        }
      }
    }
    log.push(`Pushed ${tasksPushed} task status(es) to Autotask`)
    log.push('')

    // ========================================
    // PHASE 2: PULL updates FROM Autotask
    // ========================================
    log.push('=== Phase 2: Pull updates from Autotask ===')

    // Pull project status from Autotask
    try {
      const atProject = await client.getProject(atProjectId)
      if (atProject) {
        const mappedProjectStatus = mapAtProjectStatus(atProject.status)
        if (mappedProjectStatus !== localProject?.status) {
          await prisma.project.update({
            where: { id: projectId },
            data: { status: mappedProjectStatus }
          })
          log.push(`Updated project status from Autotask: ${localProject?.status} -> ${mappedProjectStatus}`)
        }
      }
    } catch (error) {
      log.push(`WARNING: Could not pull project status: ${error instanceof Error ? error.message : 'Unknown'}`)
    }

    // Fetch phases from Autotask
    let atPhases: { id: number; title: string; description?: string; sortOrder?: number; scheduled?: boolean }[] = []
    try {
      const rawPhases = await client.getProjectPhases(atProjectId)
      atPhases = rawPhases
      log.push(`Fetched ${atPhases.length} phase(s) from Autotask`)
    } catch (error) {
      log.push(`ERROR fetching phases: ${error instanceof Error ? error.message : 'Unknown'}`)
    }

    // Fetch ALL tasks for the project once, then group by phaseID
    let allAtTasks: Awaited<ReturnType<typeof client.getProjectTasks>> = []
    try {
      allAtTasks = await client.getProjectTasks(atProjectId)
      log.push(`Fetched ${allAtTasks.length} total task(s) for project`)
    } catch (error) {
      log.push(`ERROR fetching tasks: ${error instanceof Error ? error.message : 'Unknown'}`)
    }

    // Group tasks by phaseID
    const tasksByPhase = new Map<number, typeof allAtTasks>()
    for (const task of allAtTasks) {
      const phaseId = task.phaseID || 0
      if (!tasksByPhase.has(phaseId)) tasksByPhase.set(phaseId, [])
      tasksByPhase.get(phaseId)!.push(task)
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

      // Get tasks for this phase from the pre-fetched data
      const phaseTasks = tasksByPhase.get(atPhase.id) || []
      log.push(`  ${phaseTasks.length} task(s) for phase "${atPhase.title}"`)

      for (const atTask of phaseTasks) {
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
        log.push(`  Phase "${phase.title}" status: ${phase.status} -> ${newStatus}`)
      }
    }

    // Update project sync timestamp
    await prisma.project.update({
      where: { id: projectId },
      data: { autotaskLastSync: new Date() },
    })

    log.push('')
    log.push(`Summary: ${phasesCreated} phases created, ${phasesUpdated} updated, ${tasksCreated} tasks created, ${tasksUpdated} updated`)
    log.push(`${tasksPushed} task statuses pushed to Autotask`)
    log.push(`2-way sync completed at ${new Date().toISOString()}`)

    return NextResponse.json({ success: true, log: log.join('\n') })
  } catch (error) {
    console.error('Error syncing project:', error)
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
