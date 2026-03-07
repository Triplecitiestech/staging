import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import FailureDashboard from '@/components/admin/debug/FailureDashboard'

export const dynamic = 'force-dynamic'

export default async function FailuresPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Test Failure Dashboard</h1>
          <p className="text-slate-400 mt-1">Browser test failures, debugging artifacts, and AI-generated fix suggestions</p>
        </div>
        <FailureDashboard />
      </main>
    </div>
  )
}
