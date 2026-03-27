import Image from 'next/image'
import { auth } from '@/auth'
import { SignInButton } from '@/components/auth/AuthButtons'
import AdminHeader from '@/components/admin/AdminHeader'
import AdminShell from '@/components/admin/AdminShell'
import SystemHealthDashboard from '@/components/admin/SystemHealthDashboard'
import DashboardStatusCards from '@/components/admin/DashboardStatusCards'
import DbLatencyGraph from '@/components/admin/DbLatencyGraph'

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

  return (
    <AdminShell>
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

        {/* Historical DB Latency Graph */}
        <div className="mb-10">
          <DbLatencyGraph />
        </div>

        {/* System Status Cards */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-white mb-4">Platform Systems</h2>
          <DashboardStatusCards />
        </div>
      </main>
    </AdminShell>
  )
}
