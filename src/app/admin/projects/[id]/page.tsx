import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { PrismaClient, Prisma } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    company: true
    creator: true
    phases: {
      include: {
        tasks: true
      }
    }
  }
}>

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()

  if (!session) {
    redirect('/admin')
  }

  const { id } = await params

  // Fetch project with all related data
  const project: ProjectWithRelations | null = await prisma.project.findUnique({
    where: { id },
    include: {
      company: true,
      creator: true,
      phases: {
        include: {
          tasks: true
        },
        orderBy: { orderIndex: 'asc' }
      }
    }
  }) as ProjectWithRelations | null

  if (!project) {
    notFound()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500/20 text-green-300 border border-green-500/30'
      case 'COMPLETE': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
      case 'ON_HOLD': return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
      case 'CANCELLED': return 'bg-red-500/20 text-red-300 border border-red-500/30'
      case 'NOT_STARTED': return 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
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

  const completedPhases = project.phases.filter(p => p.status === 'COMPLETE').length
  const totalPhases = project.phases.length
  const progress = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0

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
                <h1 className="text-2xl font-bold text-white">{project.title}</h1>
                <p className="text-sm text-slate-400">{project.company.displayName}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/admin/projects"
                className="text-slate-300 hover:text-white transition-colors text-sm font-medium"
              >
                ← Back to Projects
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Project Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Main Info */}
          <div className="lg:col-span-2 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Project Details</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-400 mb-1">Project Type</p>
                <p className="text-white">{getProjectTypeLabel(project.projectType)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Status</p>
                <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full ${getStatusColor(project.status)}`}>
                  {project.status.replace('_', ' ')}
                </span>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Progress</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-slate-700 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-cyan-600 h-3 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-300 font-medium">{progress}%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {completedPhases} of {totalPhases} phases completed
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Created</p>
                <p className="text-white">{new Date(project.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Last Updated</p>
                <p className="text-white">{new Date(project.updatedAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-cyan-600/20 to-cyan-500/10 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-6">
              <p className="text-sm text-cyan-300 mb-1">Total Phases</p>
              <p className="text-3xl font-bold text-white">{totalPhases}</p>
            </div>
            <div className="bg-gradient-to-br from-green-600/20 to-green-500/10 backdrop-blur-sm border border-green-500/30 rounded-lg p-6">
              <p className="text-sm text-green-300 mb-1">Completed</p>
              <p className="text-3xl font-bold text-white">{completedPhases}</p>
            </div>
            <div className="bg-gradient-to-br from-slate-700/20 to-slate-800/10 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <p className="text-sm text-slate-300 mb-1">Created By</p>
              <p className="text-white text-sm">{project.creator?.name || project.createdBy}</p>
            </div>
          </div>
        </div>

        {/* Phases */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-6">Project Phases</h2>

          {project.phases.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400">No phases yet</p>
              <p className="text-sm text-slate-500 mt-2">Phases will appear here once added to the project</p>
            </div>
          ) : (
            <div className="space-y-4">
              {project.phases.map((phase, index) => {
                const completedTasks = phase.tasks.filter(t => t.completed).length
                const totalTasks = phase.tasks.length
                const phaseProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

                return (
                  <div
                    key={phase.id}
                    className="bg-slate-900/50 border border-white/10 rounded-lg p-5 hover:border-white/20 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="flex items-center justify-center w-8 h-8 bg-cyan-500/20 rounded-lg text-cyan-400 font-bold text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white mb-1">{phase.title}</h3>
                          {phase.description && (
                            <p className="text-sm text-slate-300 mb-2">{phase.description}</p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            {phase.owner && (
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {phase.owner}
                              </span>
                            )}
                            {phase.estimatedDays && (
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {phase.estimatedDays} days
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              {completedTasks}/{totalTasks} tasks
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(phase.status)}`}>
                        {phase.status.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Phase Progress */}
                    {totalTasks > 0 && (
                      <div className="flex items-center gap-3 mt-3">
                        <div className="flex-1 bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-cyan-500 to-cyan-600 h-2 rounded-full transition-all"
                            style={{ width: `${phaseProgress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-300 font-medium w-12 text-right">{phaseProgress}%</span>
                      </div>
                    )}

                    {/* Tasks */}
                    {phase.tasks.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {phase.tasks.map(task => (
                          <div key={task.id} className="flex items-center gap-2 text-sm">
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                              task.completed
                                ? 'bg-cyan-500 border-cyan-500'
                                : 'border-slate-500'
                            }`}>
                              {task.completed && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <span className={task.completed ? 'text-slate-400 line-through' : 'text-slate-300'}>
                              {task.taskText}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
