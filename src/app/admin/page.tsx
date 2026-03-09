import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { SignInButton } from '@/components/auth/AuthButtons'
import AdminHeader from '@/components/admin/AdminHeader'
import AutotaskSyncPanel from '@/components/admin/AutotaskSyncPanel'
import SystemHealthDashboard from '@/components/admin/SystemHealthDashboard'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

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
              Project Management Dashboard
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

  // Fetch data for sections below the health dashboard
  const [totalBlogPosts, publishedBlogPosts] = await Promise.all([
    prisma.blogPost.count(),
    prisma.blogPost.count({ where: { status: 'PUBLISHED' } }),
  ])

  const recentProjects = await prisma.project.findMany({
    take: 5,
    orderBy: { updatedAt: 'desc' },
    include: {
      company: true,
      phases: true
    }
  }) as ProjectWithRelations[]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'COMPLETED': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'ON_HOLD':
      case 'CANCELLED': return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'Active'
      case 'COMPLETED': return 'Complete'
      case 'ON_HOLD':
      case 'CANCELLED': return 'Inactive'
      default: return status.replace(/_/g, ' ')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      {/* Ambient gradient grid background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(6,182,212,0.08)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(139,92,246,0.08)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(14,165,233,0.04)_0%,_transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <div className="relative z-10">
      <AdminHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome + System Health */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">System Health Dashboard</h2>
          <p className="text-sm text-slate-400">Welcome back, {session.user?.name?.split(' ')[0]}. Real-time status of all platform systems.</p>
        </div>

        {/* System Health Dashboard (client component with auto-refresh) */}
        <div className="mb-10">
          <SystemHealthDashboard />
        </div>

        {/* Quick Actions */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href="/admin/projects/new"
              className="group p-4 bg-gradient-to-br from-cyan-600/20 to-cyan-500/10 hover:from-cyan-600/30 hover:to-cyan-500/20 border border-cyan-500/30 hover:border-cyan-400/50 rounded-lg transition-all duration-300 hover:scale-105"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">New Project</h3>
                  <p className="text-xs text-slate-400">Create project</p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/companies/new"
              className="group p-4 bg-gradient-to-br from-rose-600/20 to-rose-500/10 hover:from-rose-600/30 hover:to-rose-500/20 border border-rose-500/30 hover:border-rose-400/50 rounded-lg transition-all duration-300 hover:scale-105"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-500/20 rounded-lg">
                  <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Add Company</h3>
                  <p className="text-xs text-slate-400">Onboard client</p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/companies"
              className="group p-4 bg-gradient-to-br from-green-600/20 to-green-500/10 hover:from-green-600/30 hover:to-green-500/20 border border-green-500/30 hover:border-green-400/50 rounded-lg transition-all duration-300 hover:scale-105"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Companies</h3>
                  <p className="text-xs text-slate-400">View all clients</p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/projects"
              className="group p-4 bg-gradient-to-br from-teal-600/20 to-teal-500/10 hover:from-teal-600/30 hover:to-teal-500/20 border border-teal-500/30 hover:border-teal-400/50 rounded-lg transition-all duration-300 hover:scale-105"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-500/20 rounded-lg">
                  <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Projects</h3>
                  <p className="text-xs text-slate-400">View & edit all</p>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Blog + Autotask Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          {/* Blog Management */}
          <div className="bg-gradient-to-br from-indigo-900/30 to-indigo-800/20 border border-indigo-500/30 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white">Blog Management</h2>
              <Link href="/admin/blog" className="text-indigo-400 hover:text-indigo-300 text-xs font-medium flex items-center gap-1">
                Manage
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Total Posts</span>
                <span className="text-white font-bold">{totalBlogPosts}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Published</span>
                <span className="text-green-400 font-bold">{publishedBlogPosts}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Drafts</span>
                <span className="text-slate-300 font-bold">{totalBlogPosts - publishedBlogPosts}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/blog" className="text-xs text-cyan-400 hover:text-cyan-300">Edit Posts</Link>
              <span className="text-slate-600">|</span>
              <Link href="/blog" target="_blank" className="text-xs text-cyan-400 hover:text-cyan-300">View Blog</Link>
              <span className="text-slate-600">|</span>
              <Link href="/admin/blog/generate" className="text-xs text-cyan-400 hover:text-cyan-300">Generate (AI)</Link>
            </div>
          </div>

          {/* Autotask Sync */}
          <AutotaskSyncPanel />
        </div>

        {/* Recent Projects */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 rounded-lg p-5 mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">Recent Projects</h2>
            <Link href="/admin/projects" className="text-cyan-400 hover:text-cyan-300 text-xs font-medium flex items-center gap-1">
              View All
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {recentProjects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-4 text-sm">No projects yet</p>
              <Link
                href="/admin/projects/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 hover:bg-cyan-500/30 transition-all text-sm"
              >
                Create Your First Project
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/admin/projects/${project.id}`}
                  className="block p-3 bg-slate-900/50 hover:bg-slate-900/80 border border-white/10 hover:border-cyan-500/30 rounded-lg transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 mr-3">
                      <h3 className="text-sm text-white font-semibold group-hover:text-cyan-300 transition-colors truncate">
                        {project.title}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="truncate">{project.company.displayName}</span>
                        <span>·</span>
                        <span>{project.phases.length} phases</span>
                        <span>·</span>
                        <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border whitespace-nowrap ${getStatusColor(project.status)}`}>
                      {getStatusLabel(project.status)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  )
}
