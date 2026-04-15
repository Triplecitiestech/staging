import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ProjectList from '@/components/projects/ProjectList'
import AdminHeader from '@/components/admin/AdminHeader'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const { prisma } = await import("@/lib/prisma")
  const session = await auth()

  if (!session) {
    redirect('/admin')
  }

  // Use explicit select to avoid "column does not exist" errors
  // when schema fields haven't been migrated to production yet
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      projectType: true,
      createdAt: true,
      aiGenerated: true,
      autotaskProjectId: true,
      isVisibleToCustomer: true,
      company: {
        select: {
          displayName: true,
          slug: true,
        }
      },
      phases: {
        select: {
          status: true,
          tasks: {
            select: { status: true, completed: true },
            where: { parentTaskId: null }
          }
        },
        orderBy: { orderIndex: 'asc' as const }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Projects</h1>
            <p className="text-slate-400 mt-2">Manage all client projects</p>
          </div>
          <Link
            href="/admin/projects/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium shadow-lg shadow-cyan-500/20"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Project
          </Link>
        </div>
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
