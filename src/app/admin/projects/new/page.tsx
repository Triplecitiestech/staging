import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import NewProjectWithAI from '@/components/projects/NewProjectWithAI'
import AdminHeader from '@/components/admin/AdminHeader'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

export default async function NewProjectPage() {
  const session = await auth()

  if (!session) {
    redirect('/admin')
  }

  // Fetch companies and templates for the form
  let companies
  try {
    companies = await prisma.company.findMany({
      orderBy: { displayName: 'asc' }
    })
  } catch {
    // Fallback if there are any schema issues
    companies = await prisma.company.findMany({
      select: {
        id: true,
        slug: true,
        displayName: true,
        primaryContact: true,
        contactEmail: true,
        contactTitle: true,
        passwordHash: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { displayName: 'asc' }
    })
  }

  const templates = await prisma.projectTemplate.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />

      {/* Form with AI Assistant */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Create New Project</h1>
          <p className="text-slate-400 mt-2">Set up a new client project</p>
        </div>
        <NewProjectWithAI
          companies={companies}
          templates={templates}
          userEmail={session.user?.email || ''}
        />
      </main>
    </div>
  )
}
