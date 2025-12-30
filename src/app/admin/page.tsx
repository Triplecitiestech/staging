import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { SignInButton, SignOutButton } from '@/components/auth/AuthButtons'

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

  // User is authenticated - show dashboard
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
                <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                <p className="text-sm text-slate-400">Triple Cities Tech</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
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
        {/* User Info Card */}
        <div className="mb-8 p-6 bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg">
          <p className="text-sm text-slate-400 mb-1">Signed in as</p>
          <p className="text-xl font-semibold text-white">{session.user?.name}</p>
          <p className="text-sm text-slate-300">{session.user?.email}</p>
          {session.user?.role && (
            <span className="inline-block mt-2 px-3 py-1 bg-cyan-500/20 text-cyan-300 text-xs font-semibold uppercase rounded-full border border-cyan-500/30">
              {session.user.role}
            </span>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* View Projects */}
            <Link
              href="/admin/projects"
              className="group relative p-6 bg-gradient-to-br from-cyan-600/20 to-cyan-500/10 hover:from-cyan-600/30 hover:to-cyan-500/20 backdrop-blur-sm border border-cyan-500/30 hover:border-cyan-400/50 rounded-lg transition-all duration-300 hover:scale-105"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-cyan-500/20 rounded-lg">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <svg className="w-5 h-5 text-cyan-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">View Projects</h3>
              <p className="text-sm text-slate-300">Manage all client projects and track progress</p>
            </Link>

            {/* Create New Project */}
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
              <p className="text-sm text-slate-300">Start a new client project from templates</p>
            </Link>

            {/* Database Setup */}
            <Link
              href="/admin/setup"
              className="group relative p-6 bg-gradient-to-br from-slate-700/20 to-slate-800/10 hover:from-slate-700/30 hover:to-slate-800/20 backdrop-blur-sm border border-white/10 hover:border-white/20 rounded-lg transition-all duration-300 hover:scale-105"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-white/10 rounded-lg">
                  <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <svg className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Database Setup</h3>
              <p className="text-sm text-slate-300">Configure database and initial data</p>
            </Link>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-white/10 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">System Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Database Connection</span>
              <span className="flex items-center text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Authentication</span>
              <span className="flex items-center text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                Microsoft OAuth
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Project Management</span>
              <span className="flex items-center text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                Active
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
