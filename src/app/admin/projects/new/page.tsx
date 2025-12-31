import Link from 'next/link'
import Image from 'next/image'
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
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Image
                src="/logo/tctlogo.webp"
                alt="Triple Cities Tech Logo"
                width={48}
                height={48}
                className="w-12 h-12 object-contain"
              />
              <div>
                <h1 className="text-2xl font-bold text-white">Create New Project</h1>
                <p className="text-sm text-slate-400">
                  Set up a new client project
                </p>
              </div>
            </div>
            <Link
              href="/admin/projects"
              className="px-4 py-2 border border-white/20 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all"
            >
              Cancel
            </Link>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NewProjectForm
          companies={companies}
          templates={templates}
          userEmail={session.user?.email || ''}
        />
      </main>
    </div>
  )
}
