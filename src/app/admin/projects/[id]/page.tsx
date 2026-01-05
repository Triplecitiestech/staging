import Link from 'next/link'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { PrismaClient, Prisma } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import PhaseCard from '@/components/projects/PhaseCard'
import AIProjectAssistant from '@/components/admin/AIProjectAssistant'
import AdminHeader from '@/components/admin/AdminHeader'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    company: true
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
  let project: ProjectWithRelations | null = null

  try {
    project = await prisma.project.findUnique({
      where: { id },
      include: {
        company: true,
        phases: {
          include: {
            tasks: {
              where: {
                parentTaskId: null // Only fetch top-level tasks
              },
              include: {
                comments: {
                  orderBy: { createdAt: 'asc' }
                },
                assignments: {
                  orderBy: { assignedAt: 'asc' }
                },
                subTasks: {
                  include: {
                    comments: {
                      orderBy: { createdAt: 'asc' }
                    },
                    assignments: {
                      orderBy: { assignedAt: 'asc' }
                    },
                    subTasks: {
                      include: {
                        comments: {
                          orderBy: { createdAt: 'asc' }
                        },
                        assignments: {
                          orderBy: { assignedAt: 'asc' }
                        },
                        subTasks: true // 3 levels deep
                      }
                    }
                  }
                }
              },
              orderBy: { orderIndex: 'asc' }
            }
          },
          orderBy: { orderIndex: 'asc' }
        }
      }
    }) as ProjectWithRelations | null
  } catch (error) {
    // If notes column doesn't exist yet, fall back to fetching without it
    console.error('Error fetching project with tasks:', error)
    project = await prisma.project.findUnique({
      where: { id },
      include: {
        company: true,
        phases: {
          include: {
            tasks: {
              select: {
                id: true,
                phaseId: true,
                taskText: true,
                completed: true,
                completedBy: true,
                completedAt: true,
                orderIndex: true,
                createdAt: true
              }
            }
          },
          orderBy: { orderIndex: 'asc' }
        }
      }
    }) as ProjectWithRelations | null
  }

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
      <AdminHeader />

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
            {/* Preview as Customer Button */}
            <Link
              href={`/admin/preview/${project.company.slug}`}
              target="_blank"
              className="block bg-gradient-to-r from-purple-600/20 to-purple-500/10 backdrop-blur-sm border border-purple-500/30 rounded-lg p-4 hover:border-purple-500/50 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-300 mb-1">Preview</p>
                  <p className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">Customer View</p>
                </div>
                <svg className="w-6 h-6 text-purple-400 group-hover:text-purple-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
            </Link>

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
              <p className="text-white text-sm">{project.createdBy}</p>
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
              {project.phases.map((phase, index) => (
                <PhaseCard
                  key={phase.id}
                  phase={phase}
                  index={index}
                  companyName={project.company.displayName}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* AI Assistant */}
      <AIProjectAssistant
        projectId={project.id}
        projectContext={{
          projectName: project.title,
          companyName: project.company.displayName,
          description: `${getProjectTypeLabel(project.projectType)} project for ${project.company.displayName}`
        }}
      />
    </div>
  )
}
