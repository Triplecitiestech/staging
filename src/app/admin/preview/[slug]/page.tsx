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
    case 'IN_PROGRESS': return 'In Progress'
    case 'COMPLETED': return 'Complete'
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
  // Verify admin authentication
  const session = await auth()
  if (!session) {
    redirect('/admin')
  }

  const { slug } = await params

  // Fetch company from database
  const company = await prisma.company.findUnique({
    where: { slug },
    include: {
      projects: {
        include: {
          phases: {
            include: {
              tasks: {
                orderBy: { orderIndex: 'asc' }
              }
            },
            orderBy: { orderIndex: 'asc' }
          }
        }
      }
    }
  }) as CompanyWithProjects | null

  if (!company) {
    notFound()
  }

  // Transform data for OnboardingPortal component
  const onboardingData = company.projects.length > 0 ? {
    companySlug: slug,
    companyDisplayName: company.displayName,
    lastUpdated: company.projects[0].updatedAt.toISOString(),
    phases: company.projects[0].phases.map(phase => ({
      id: phase.id,
      title: phase.title,
      description: phase.description || '',
      status: convertStatus(phase.status),
      owner: convertOwner(phase.owner),
      notes: phase.customerNotes || undefined, // Use customer notes as the notes field
    }))
  } : null

  return (
    <div className="relative">
      {/* Admin Preview Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-purple-600 text-white px-4 py-2 text-center text-sm font-semibold">
        Admin Preview Mode • Viewing as: {company.displayName}
      </div>

      {/* Add padding to account for banner */}
      <div className="pt-10">
        <OnboardingPortal
          companySlug={slug}
          isAuthenticated={true}
          onboardingData={onboardingData}
        />
      </div>
    </div>
  )
}
