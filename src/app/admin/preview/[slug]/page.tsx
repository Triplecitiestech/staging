import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { PrismaClient, Prisma } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import OnboardingPortal from '@/components/onboarding/OnboardingPortal'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

type CompanyWithProjects = Prisma.CompanyGetPayload<{
  include: {
    projects: {
      include: {
        phases: {
          include: {
            tasks: true
          }
        }
      }
    }
  }
}>

interface PageProps {
  params: Promise<{ slug: string }>
}

// Convert database status to display format
function convertStatus(status: string): 'Not Started' | 'Scheduled' | 'Waiting on Customer' | 'In Progress' | 'Requires Customer Coordination' | 'Discussed' | 'Complete' {
  switch (status) {
    case 'NOT_STARTED': return 'Not Started'
    case 'SCHEDULED': return 'Scheduled'
    case 'WAITING_ON_CUSTOMER': return 'Waiting on Customer'
    case 'IN_PROGRESS': return 'In Progress'
    case 'REQUIRES_CUSTOMER_COORDINATION': return 'Requires Customer Coordination'
    case 'DISCUSSED': return 'Discussed'
    case 'COMPLETE': return 'Complete'
    case 'COMPLETED': return 'Complete' // Map old COMPLETED to Complete
    case 'ON_HOLD': return 'Waiting on Customer' // Map ON_HOLD to a valid status
    default: return 'Not Started'
  }
}

// Convert database owner to display format
function convertOwner(owner: string | null): 'TCT' | 'Customer' | 'Both' {
  if (owner === 'CUSTOMER') return 'Customer'
  if (owner === 'BOTH') return 'Both'
  return 'TCT'
}

export default async function AdminPreviewPage({ params }: PageProps) {
  try {
    // Verify admin authentication
    const session = await auth()
    if (!session) {
      redirect('/admin')
    }

    const { slug } = await params
    console.log('[Admin Preview] Loading preview for slug:', slug)

    // Fetch company from database
    let company
    try {
      company = await prisma.company.findUnique({
        where: { slug },
        include: {
          projects: {
            include: {
              phases: {
                include: {
                  tasks: {
                    where: {
                      isVisibleToCustomer: true
                    },
                    select: {
                      id: true,
                      taskText: true,
                      completed: true,
                      orderIndex: true,
                      status: true
                    },
                    orderBy: { orderIndex: 'asc' }
                  }
                },
                orderBy: { orderIndex: 'asc' }
              }
            },
            orderBy: { updatedAt: 'desc' }
          }
        }
      }) as CompanyWithProjects | null
    } catch (dbError) {
      console.error('[Admin Preview] Database error fetching company:', dbError)
      // Try without specific task fields if there's a schema mismatch
      company = await prisma.company.findUnique({
        where: { slug },
        include: {
          projects: {
            include: {
              phases: {
                orderBy: { orderIndex: 'asc' }
              }
            },
            orderBy: { updatedAt: 'desc' }
          }
        }
      }) as CompanyWithProjects | null
    }

    if (!company) {
      console.log('[Admin Preview] Company not found:', slug)
      notFound()
    }

    console.log('[Admin Preview] Found company:', company.displayName, 'Projects:', company.projects.length)

    // Find the most recent active project, or fall back to most recently updated
    const activeProject = company.projects.find(p => p.status === 'ACTIVE') || company.projects[0]

    // Transform data for OnboardingPortal component
    const onboardingData = activeProject ? {
      companySlug: slug,
      companyDisplayName: company.displayName,
      lastUpdated: activeProject.updatedAt.toISOString(),
      phases: activeProject.phases.map(phase => ({
        id: phase.id,
        title: phase.title,
        description: phase.description || '',
        status: convertStatus(phase.status),
        owner: convertOwner(phase.owner),
        notes: phase.customerNotes || undefined,
        tasks: phase.tasks?.map(task => ({
          id: task.id,
          taskText: task.taskText,
          completed: task.completed,
          status: task.status || 'NOT_STARTED',
          notes: undefined
        })) || []
      }))
    } : null

  return (
    <div className="relative">
      {/* Admin Preview Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-slate-900 via-gray-900 to-slate-900 border-b border-cyan-500/30 text-white px-4 py-2 text-center text-sm font-semibold shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span className="text-cyan-300">Admin Preview Mode</span>
          <span className="text-slate-400">•</span>
          <span className="text-slate-300">Viewing as: {company.displayName}</span>
        </div>
      </div>

      {/* Add padding to account for banner */}
      <div className="pt-10">
        <OnboardingPortal
          companySlug={slug}
          isAuthenticated={true}
          onboardingData={onboardingData}
          projects={activeProject ? [activeProject] : null}
        />
      </div>
    </div>
  )
  } catch (error) {
    console.error('[Admin Preview] Fatal error:', error)
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-red-900/20 backdrop-blur-md border border-red-500/30 rounded-lg p-8">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Preview Error</h1>
          <p className="text-slate-300 mb-4">
            Failed to load preview. This could be due to:
          </p>
          <ul className="text-slate-400 text-sm space-y-2 mb-6 list-disc list-inside">
            <li>Company not found in database</li>
            <li>Database migration pending</li>
            <li>Database connection issue</li>
          </ul>
          <p className="text-xs text-slate-500">
            Error: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    )
  }
}
