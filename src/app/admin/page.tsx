import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { SignInButton, SignOutButton } from '@/components/auth/AuthButtons'
import AdminNav from '@/components/admin/AdminNav'
import { PrismaClient, Prisma } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    company: true
    phases: true
  }
}>

export default async function AdminPage() {
  const session = await auth()

  // If not authenticated, show sign-in page
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl p-8">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <Image
                src="/logo/tctlogo.webp"
                alt="Triple Cities Tech Logo"
                width={80}
                height={80}
                className="w-20 h-20 object-contain"
              />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Admin Dashboard
            </h1>
            <p className="text-slate-300 mb-8">
              Sign in with your Microsoft account to access the admin dashboard
            </p>
            <SignInButton />
          </div>
        </div>
      </div>
    )
  }

  // Fetch analytics data
  const [totalProjects, activeProjects, totalCompanies] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: 'ACTIVE' } }),
    prisma.company.count(),
  ])

  const recentProjects: ProjectWithRelations[] = await prisma.project.findMany({
    take: 5,
    orderBy: { updatedAt: 'desc' },
    include: {
      company: true,
      phases: true
    }
  })

  const completedProjects = await prisma.project.count({ where: { status: 'COMPLETED' } })
  const onHoldProjects = await prisma.project.count({ where: { status: 'ON_HOLD' } })
  const totalPhases = await prisma.phase.count()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'COMPLETED': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'ON_HOLD': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'CANCELLED': return 'bg-red-500/20 text-red-300 border-red-500/30'
      case 'NOT_STARTED': return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    }
  }

  // User is authenticated - show dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
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
                <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                <p className="text-sm text-slate-400">Triple Cities Tech</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <AdminNav />
              <Link
                href="/"
                className="text-slate-300 hover:text-white transition-colors text-sm font-medium"
              >
                Back to Website
              </Link>
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Welcome back, {session.user?.name?.split(' ')[0]}!</h2>
          <p className="text-slate-400">Here's what's happening with your projects</p>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {/* Total Projects */}
          <div className="bg-gradient-to-br from-cyan-600/20 to-cyan-500/10 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-cyan-300 font-semibold">Total Projects</p>
              <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-4xl font-bold text-white mb-1">{totalProjects}</p>
            <p className="text-xs text-cyan-200">All time</p>
          </div>

          {/* Active Projects */}
          <div className="bg-gradient-to-br from-green-600/20 to-green-500/10 backdrop-blur-sm border border-green-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-green-300 font-semibold">Active Projects</p>
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-4xl font-bold text-white mb-1">{activeProjects}</p>
            <p className="text-xs text-green-200">In progress</p>
          </div>

          {/* Completed Projects */}
          <div className="bg-gradient-to-br from-blue-600/20 to-blue-500/10 backdrop-blur-sm border border-blue-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-blue-300 font-semibold">Completed</p>
              <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-4xl font-bold text-white mb-1">{completedProjects}</p>
            <p className="text-xs text-blue-200">Finished</p>
          </div>

          {/* Total Companies */}
          <div className="bg-gradient-to-br from-purple-600/20 to-purple-500/10 backdrop-blur-sm border border-purple-500/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-purple-300 font-semibold">Companies</p>
              <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-4xl font-bold text-white mb-1">{totalCompanies}</p>
            <p className="text-xs text-purple-200">Active clients</p>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">On Hold</p>
                <p className="text-2xl font-bold text-white">{onHoldProjects}</p>
              </div>
              <div className="p-3 bg-yellow-500/20 rounded-lg">
                <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Completion Rate</p>
                <p className="text-2xl font-bold text-white">
                  {totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0}%
                </p>
              </div>
              <div className="p-3 bg-cyan-500/20 rounded-lg">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400 mb-1">Avg. Phases/Project</p>
                <p className="text-2xl font-bold text-white">
                  {totalProjects > 0
                    ? Math.round((totalPhases / totalProjects) * 10) / 10
                    : 0}
                </p>
              </div>
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Projects */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6 mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Recent Projects</h2>
            <Link
              href="/admin/projects"
              className="text-cyan-400 hover:text-cyan-300 text-sm font-medium flex items-center gap-1"
            >
              View All
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {recentProjects.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400 mb-4">No projects yet</p>
              <Link
                href="/admin/projects/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 hover:bg-cyan-500/30 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Project
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/admin/projects/${project.id}`}
                  className="block p-4 bg-slate-900/50 hover:bg-slate-900/80 border border-white/10 hover:border-cyan-500/30 rounded-lg transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-white font-semibold mb-1 group-hover:text-cyan-300 transition-colors">
                        {project.title}
                      </h3>
                      <p className="text-sm text-slate-400 mb-2">{project.company.displayName}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{project.phases.length} phases</span>
                        <span>•</span>
                        <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(project.status)}`}>
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-bold text-white mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link
              href="/admin/projects/new"
              className="group relative p-6 bg-gradient-to-br from-cyan-600/20 to-cyan-500/10 hover:from-cyan-600/30 hover:to-cyan-500/20 backdrop-blur-sm border border-cyan-500/30 hover:border-cyan-400/50 rounded-lg transition-all duration-300 hover:scale-105"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-cyan-500/20 rounded-lg">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <svg className="w-5 h-5 text-cyan-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Create New Project</h3>
              <p className="text-sm text-slate-300">Start a new client project</p>
            </Link>

            <Link
              href="/admin/companies/new"
              className="group relative p-6 bg-gradient-to-br from-purple-600/20 to-purple-500/10 hover:from-purple-600/30 hover:to-purple-500/20 backdrop-blur-sm border border-purple-500/30 hover:border-purple-400/50 rounded-lg transition-all duration-300 hover:scale-105"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-purple-500/20 rounded-lg">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <svg className="w-5 h-5 text-purple-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Add New Company</h3>
              <p className="text-sm text-slate-300">Onboard a new client</p>
            </Link>

            <Link
              href="/admin/companies"
              className="group relative p-6 bg-gradient-to-br from-green-600/20 to-green-500/10 hover:from-green-600/30 hover:to-green-500/20 backdrop-blur-sm border border-green-500/30 hover:border-green-400/50 rounded-lg transition-all duration-300 hover:scale-105"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-green-500/20 rounded-lg">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <svg className="w-5 h-5 text-green-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Manage Companies</h3>
              <p className="text-sm text-slate-300">View all clients</p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
