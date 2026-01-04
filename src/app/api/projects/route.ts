import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PhaseStatus, PhaseOwner, ProjectType, TaskStatus } from '@prisma/client'

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
  try {
    const { prisma } = await import("@/lib/prisma")
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { companyId, projectType, title, templateId, useTemplate, createdBy, lastModifiedBy, aiPhases } = body

    console.log('[Project Creation] Request body:', { companyId, projectType, title, templateId, useTemplate, aiPhases: aiPhases?.length || 0 })

    // Validate required fields
    if (!companyId || !projectType || !title) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Get company for slug generation
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
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

    // If using template, fetch template and create phases
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
      console.log('[Project Creation] Using AI-generated phases')
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
      console.log('[Project Creation] Using template phases')
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

    console.log('[Project Creation] Phases data:', JSON.stringify(phasesData, null, 2))

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

    console.log('[Project Creation] Creating project with data:', JSON.stringify(projectData, null, 2))

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
      console.log('[Project Creation] Project created successfully with phases:', project.id)
    } catch (phaseError) {
      console.error('[Project Creation] Failed to create with phases, creating without:', phaseError)
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
      console.log('[Project Creation] Project created successfully without phases:', project.id)
    }

    // Create audit log (non-blocking - don't fail if this errors)
    try {
      await prisma.auditLog.create({
        data: {
          projectId: project.id,
          staffEmail: session.user.email,
          staffName: session.user.name || null,
          actionType: 'CREATED',
          entityType: 'project',
          notes: useTemplate && templateId ? `Project created using template` : 'Project created manually',
        }
      })
    } catch (auditError) {
      console.error('[Project Creation] Audit log creation failed (non-critical):', auditError)
      // Continue anyway - audit log failure shouldn't prevent project creation
    }

    return NextResponse.json(project, { status: 201 })
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; meta?: unknown; stack?: string }
    console.error('Error creating project:', error)
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error')
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('Full error object:', JSON.stringify(error, null, 2))

    // Log Prisma-specific error details
    if (err.code) console.error('Prisma error code:', err.code)
    if (err.meta) console.error('Prisma error meta:', JSON.stringify(err.meta, null, 2))

    return NextResponse.json(
      {
        error: 'Failed to create project',
        details: error instanceof Error ? error.message : 'Unknown error',
        prismaCode: err.code,
        prismaMeta: err.meta,
        fullError: JSON.stringify(error, null, 2)
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const { prisma } = await import("@/lib/prisma")
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projects = await prisma.project.findMany({
      include: {
        company: true,
        phases: {
          orderBy: { orderIndex: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(projects)
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}
