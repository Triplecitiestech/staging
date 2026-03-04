import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PhaseStatus, PhaseOwner, ProjectType, TaskStatus } from '@prisma/client'
import { createRequestLogger } from '@/lib/server-logger'
import { apiSuccess, apiError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// Type for template phase JSON structure
interface TemplatePhase {
  title: string
  description?: string
  estimatedDays?: number
  owner?: string
  tasks?: string[]
}

// Type for AI-generated phase structure
interface AIPhase {
  name: string
  description?: string
  orderIndex: number
  tasks?: Array<{
    taskText: string
    completed: boolean
    orderIndex: number
    notes?: string
  }>
}

// Create a URL-friendly slug
function createSlug(companyName: string, title: string): string {
  const combined = `${companyName}-${title}`
  return combined
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100)
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger('POST /api/projects')
  log.info('Request received')

  try {
    const { prisma } = await import('@/lib/prisma')
    const session = await auth()
    if (!session?.user?.email) {
      log.warn('Unauthorized request')
      return apiError('Unauthorized', log.requestId, 401)
    }
    log.info('Authenticated', { userId: session.user.email })

    const body = await request.json()
    const { companyId, projectType, title, templateId, useTemplate, createdBy, lastModifiedBy, aiPhases } = body

    log.info('Project creation request', {
      companyId,
      projectType,
      title,
      templateId,
      useTemplate,
      aiPhasesCount: aiPhases?.length || 0,
    })

    // Validate required fields
    if (!companyId || !projectType || !title) {
      log.warn('Missing required fields', { companyId: !!companyId, projectType: !!projectType, title: !!title })
      return apiError('Missing required fields', log.requestId, 400, 'MISSING_FIELDS')
    }

    // Idempotency: check for Idempotency-Key header
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (idempotencyKey) {
      log.info('Idempotency key provided', { idempotencyKey })
    }

    // Get company for slug generation
    const timerDb = log.startTimer('db-total')
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    })

    if (!company) {
      log.warn('Company not found', { companyId })
      return apiError('Company not found', log.requestId, 404, 'COMPANY_NOT_FOUND')
    }

    // Generate unique slug
    let slug = createSlug(company.displayName, title)
    let slugExists = await prisma.project.findUnique({ where: { slug } })
    let counter = 1
    while (slugExists) {
      slug = `${createSlug(company.displayName, title)}-${counter}`
      slugExists = await prisma.project.findUnique({ where: { slug } })
      counter++
    }

    // Build phase data from AI phases or template
    let phasesData: Array<{
      title: string
      description: string | null
      status: PhaseStatus
      owner: PhaseOwner | null
      estimatedDays: number | null
      orderIndex: number
      customerNotes: null
      internalNotes: null
      tasks: {
        create: Array<{
          taskText: string
          completed: boolean
          orderIndex: number
          status: TaskStatus
        }>
      }
    }> = []

    // Priority: AI-generated phases > Template phases
    if (aiPhases && Array.isArray(aiPhases) && aiPhases.length > 0) {
      log.info('Using AI-generated phases', { count: aiPhases.length })
      phasesData = (aiPhases as AIPhase[]).map((phase) => ({
        title: phase.name,
        description: phase.description || null,
        status: 'NOT_STARTED' as PhaseStatus,
        owner: null,
        estimatedDays: null,
        orderIndex: phase.orderIndex,
        customerNotes: null,
        internalNotes: null,
        tasks: {
          create: Array.isArray(phase.tasks)
            ? phase.tasks.map((task) => ({
                taskText: task.taskText,
                completed: task.completed || false,
                orderIndex: task.orderIndex,
                status: (task.completed ? 'COMPLETE' : 'NOT_STARTED') as TaskStatus,
              }))
            : []
        }
      }))
    } else if (useTemplate && templateId) {
      log.info('Using template phases', { templateId })
      const template = await prisma.projectTemplate.findUnique({
        where: { id: templateId }
      })

      if (template && Array.isArray(template.phasesJson)) {
        phasesData = (template.phasesJson as unknown as TemplatePhase[]).map((phase, index) => ({
          title: phase.title,
          description: phase.description || null,
          status: 'NOT_STARTED' as PhaseStatus,
          owner: (phase.owner as PhaseOwner) || null,
          estimatedDays: phase.estimatedDays || null,
          orderIndex: index + 1,
          customerNotes: null,
          internalNotes: null,
          tasks: {
            create: Array.isArray(phase.tasks)
              ? phase.tasks.map((task: string, taskIndex: number) => ({
                  taskText: task,
                  completed: false,
                  orderIndex: taskIndex + 1,
                  status: 'NOT_STARTED' as TaskStatus,
                }))
              : []
          }
        }))
      }
    }

    // Create project - match production database schema exactly
    const projectData = {
      companyId,
      projectType: projectType as ProjectType,
      title,
      slug,
      status: 'ACTIVE' as const,
      createdBy: createdBy || session.user.email,
      lastModifiedBy: lastModifiedBy || session.user.email,
      aiGenerated: false,
      phases: phasesData.length > 0 ? {
        create: phasesData
      } : undefined,
    }

    let project
    try {
      project = await prisma.project.create({
        data: projectData,
        include: {
          company: true,
          phases: {
            include: {
              tasks: true
            },
            orderBy: { orderIndex: 'asc' }
          }
        }
      })
      log.info('Project created with phases', { projectId: project.id, phaseCount: project.phases.length })
    } catch (phaseError) {
      log.warn('Failed to create with phases, retrying without', {
        error: phaseError instanceof Error ? phaseError.message : 'Unknown error',
      })
      // If creating with phases fails, create without them
      const simpleProjectData = {
        companyId,
        projectType: projectType as ProjectType,
        title,
        slug,
        status: 'ACTIVE' as const,
        createdBy: createdBy || session.user.email,
        lastModifiedBy: lastModifiedBy || session.user.email,
        aiGenerated: false,
      }
      project = await prisma.project.create({
        data: simpleProjectData,
        include: {
          company: true,
          phases: {
            include: {
              tasks: true
            },
            orderBy: { orderIndex: 'asc' }
          }
        }
      })
      log.info('Project created without phases (fallback)', { projectId: project.id })
    }
    const dbMs = timerDb()

    // Create audit log (non-blocking - don't fail if this errors)
    try {
      await prisma.auditLog.create({
        data: {
          projectId: project.id,
          staffEmail: session.user.email,
          staffName: session.user.name || null,
          actionType: 'CREATED',
          entityType: 'project',
          notes: useTemplate && templateId ? 'Project created using template' : 'Project created manually',
        }
      })
    } catch (auditError) {
      log.warn('Audit log creation failed (non-critical)', {
        error: auditError instanceof Error ? auditError.message : 'Unknown error',
      })
    }

    log.info('Project creation complete', {
      projectId: project.id,
      slug: project.slug,
      phaseCount: project.phases.length,
      dbTimeMs: dbMs,
      durationMs: log.elapsed(),
    })

    return apiSuccess(
      {
        id: project.id,
        title: project.title,
        slug: project.slug,
        status: project.status,
        projectType: project.projectType,
        companyId: project.companyId,
        companyName: project.company.displayName,
        phaseCount: project.phases.length,
        createdAt: project.createdAt.toISOString(),
      },
      `/admin/projects/${project.id}`,
      log.requestId,
      201
    )
  } catch (error) {
    log.error('Project creation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: log.elapsed(),
    })
    return apiError('Failed to create project', log.requestId, 500)
  }
}

export async function GET() {
  const log = createRequestLogger('GET /api/projects')
  log.info('Request received')

  try {
    const { prisma } = await import('@/lib/prisma')
    const session = await auth()
    if (!session?.user?.email) {
      log.warn('Unauthorized request')
      return apiError('Unauthorized', log.requestId, 401)
    }
    log.info('Authenticated', { userId: session.user.email })

    const timerDb = log.startTimer('db-query')
    const projects = await prisma.project.findMany({
      include: {
        company: true,
        phases: {
          orderBy: { orderIndex: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    const dbMs = timerDb()

    log.info('Projects fetched', {
      count: projects.length,
      dbTimeMs: dbMs,
      durationMs: log.elapsed(),
    })

    return NextResponse.json(projects)
  } catch (error) {
    log.error('Failed to fetch projects', {
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: log.elapsed(),
    })
    return apiError('Failed to fetch projects', log.requestId, 500)
  }
}
