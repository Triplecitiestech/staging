import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import OnboardingPortal from '@/components/onboarding/OnboardingPortal'
import PreviewBanner from '@/components/admin/PreviewBanner'

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
        select: {
          id: true,
          slug: true,
          displayName: true,
          primaryContact: true,
          contactEmail: true,
          contactTitle: true,
          autotaskCompanyId: true,
          createdAt: true,
          updatedAt: true,
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
                      status: true,
                      notes: true,
                      autotaskTaskId: true,
                      comments: {
                        where: {
                          isInternal: false
                        },
                        orderBy: { createdAt: 'asc' },
                        select: {
                          id: true,
                          content: true,
                          authorName: true,
                          authorEmail: true,
                          createdAt: true
                        }
                      }
                    },
                    orderBy: { orderIndex: 'asc' }
                  },
                  comments: {
                    where: {
                      isInternal: false
                    },
                    orderBy: { createdAt: 'asc' },
                    select: {
                      id: true,
                      content: true,
                      authorName: true,
                      authorEmail: true,
                      createdAt: true
                    }
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
        select: {
          id: true,
          slug: true,
          displayName: true,
          primaryContact: true,
          contactEmail: true,
          contactTitle: true,
          autotaskCompanyId: true,
          createdAt: true,
          updatedAt: true,
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

    // Pass all projects to the dashboard (not just a single active one)
    const allProjects = company.projects

  return (
    <div className="relative">
      {/* Admin Preview Banner */}
      <PreviewBanner companyName={company.displayName} />

      {/* Add padding to account for banner */}
      <div className="pt-10">
        <OnboardingPortal
          companySlug={slug}
          companyDisplayName={company.displayName}
          isAuthenticated={true}
          onboardingData={null}
          projects={allProjects.length > 0 ? allProjects : null}
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
