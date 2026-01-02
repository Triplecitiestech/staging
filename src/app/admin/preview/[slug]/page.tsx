import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import OnboardingPortal from '@/components/onboarding/OnboardingPortal'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

interface PageProps {
  params: Promise<{ slug: string }>
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
  })

  if (!company) {
    notFound()
  }

  // Transform data for OnboardingPortal component
  const onboardingData = company.projects.length > 0 ? {
    companyName: company.displayName,
    projectName: company.projects[0].title,
    phases: company.projects[0].phases.map(phase => ({
      id: phase.id,
      title: phase.title,
      description: phase.description,
      status: phase.status,
      customerNotes: phase.customerNotes,
      internalNotes: null, // Hide internal notes from preview
      estimatedDays: phase.estimatedDays,
      owner: phase.owner,
      orderIndex: phase.orderIndex,
      tasks: phase.tasks.map(task => ({
        id: task.id,
        taskText: task.taskText,
        completed: task.completed,
        notes: task.notes,
        orderIndex: task.orderIndex
      }))
    }))
  } : undefined

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
