import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import NewProjectForm from '@/components/projects/NewProjectForm'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

export default async function NewProjectPage() {
  const session = await auth()

  if (!session) {
    redirect('/admin')
  }

  // Fetch companies and templates for the form
  const [companies, templates] = await Promise.all([
    prisma.company.findMany({
      orderBy: { displayName: 'asc' }
    }),
    prisma.projectTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    })
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create New Project</h1>
              <p className="mt-1 text-sm text-gray-600">
                Set up a new client onboarding or migration project
              </p>
            </div>
            <Link
              href="/admin/projects"
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NewProjectForm
          companies={companies}
          templates={templates}
          userEmail={session.user?.email || ''}
        />
      </div>
    </div>
  )
}
