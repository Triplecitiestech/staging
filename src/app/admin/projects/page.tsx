import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PrismaClient, Prisma } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    company: true
    creator: true
    phases: true
  }
}>

export default async function ProjectsPage() {
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500/20 text-green-300 border border-green-500/30'
      case 'COMPLETED': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
      case 'ON_HOLD': return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
      case 'CANCELLED': return 'bg-red-500/20 text-red-300 border border-red-500/30'
      default: return 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
    }
  }

  const getProjectTypeLabel = (type: string) => {
    switch (type) {
      case 'M365_MIGRATION': return 'M365 Migration'
      case 'ONBOARDING': return 'Client Onboarding'
      case 'FORTRESS': return 'TCT Fortress'
      case 'CUSTOM': return 'Custom'
      default: return type
    }
  }

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
            <div className="max-w-md mx-auto">
              <svg
                className="mx-auto h-12 w-12 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-white">No projects yet</h3>
              <p className="mt-2 text-sm text-slate-300">
                Get started by creating your first project
              </p>
              <Link
                href="/admin/projects/new"
                className="mt-6 inline-flex items-center px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all"
              >
                + Create Project
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {projects.map((project) => {
                  const completedPhases = project.phases.filter(p => p.status === 'COMPLETE').length
                  const totalPhases = project.phases.length
                  const progress = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0

                  return (
                    <tr key={project.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-white">
                              {project.title}
                            </div>
                            {project.aiGenerated && (
                              <div className="text-xs text-purple-400 flex items-center gap-1 mt-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M13 7H7v6h6V7z" />
                                  <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
                                </svg>
                                AI Generated
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-200">{project.company.displayName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-300">
                          {getProjectTypeLabel(project.projectType)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(project.status)}`}>
                          {project.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-700 rounded-full h-2 max-w-[100px]">
                            <div
                              className="bg-gradient-to-r from-cyan-500 to-cyan-600 h-2 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-300">{progress}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          href={`/admin/projects/${project.id}`}
                          className="text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
