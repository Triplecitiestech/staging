import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient, ProjectType, PhaseStatus, PhaseOwner } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

// Type for template phase JSON structure
interface TemplatePhase {
  title: string
  description?: string
  estimatedDays?: number
  owner?: string
  tasks?: string[]
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
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { companyId, projectType, title, templateId, useTemplate, createdBy, lastModifiedBy } = body

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

    // Create project data
    const projectData = {
      companyId,
      projectType: projectType as ProjectType,
      title,
      slug,
      status: 'ACTIVE',
      createdBy: createdBy || session.user.email,
      lastModifiedBy: lastModifiedBy || session.user.email,
      aiGenerated: false,
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
        }>
      }
    }> = []
    if (useTemplate && templateId) {
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
                }))
              : []
          }
        }))
      }
    }

    // Create project with phases
    const project = await prisma.project.create({
      data: {
        ...projectData,
        phases: phasesData.length > 0 ? {
          create: phasesData
        } : undefined,
      },
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

    // Create audit log
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

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error('Error creating project:', error)
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projects = await prisma.project.findMany({
      include: {
        company: true,
        creator: true,
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
