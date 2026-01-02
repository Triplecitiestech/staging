import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ProjectList from '@/components/projects/ProjectList'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    company: true
    creator: true
    phases: true
  }
}>

export default async function ProjectsPage() {
  const { prisma } = await import("@/lib/prisma")
  const session = await auth()

  if (!session) {
    redirect('/admin')
  }

  // Fetch all projects with related data
  const projects: ProjectWithRelations[] = await prisma.project.findMany({
    include: {
      company: true,
      creator: true,
      phases: {
        orderBy: { orderIndex: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  }) as ProjectWithRelations[]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Image
                src="/logo/tctlogo.webp"
                alt="Triple Cities Tech Logo"
                width={48}
                height={48}
                className="w-12 h-12 object-contain"
              />
              <div>
                <h1 className="text-2xl font-bold text-white">Projects</h1>
                <p className="text-sm text-slate-400">Manage all client projects</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/admin"
                className="text-slate-300 hover:text-white transition-colors text-sm font-medium"
              >
                Back to Dashboard
              </Link>
              <Link
                href="/admin/projects/new"
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium"
              >
                + New Project
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {projects.length === 0 ? (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-12 text-center">
            <h3 className="text-lg font-medium text-white">No projects yet</h3>
            <p className="text-sm text-slate-300 mt-2">Get started by creating your first project</p>
            <Link href="/admin/projects/new" className="mt-6 inline-flex items-center px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all">
              + Create Project
            </Link>
          </div>
        ) : (
          <ProjectList projects={projects} />
        )}
      </main>
    </div>
  )
}
