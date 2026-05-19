import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import { hasPermission } from '@/lib/permissions'
import TrendsClient from '@/components/admin/OtPtoTrendsClient'

export const dynamic = 'force-dynamic'

export default async function OtPtoTrendsPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')
  const canView =
    hasPermission(session.user?.role, 'approve_pto', session.user?.permissionOverrides) ||
    hasPermission(session.user?.role, 'approve_overtime', session.user?.permissionOverrides)
  if (!canView) redirect('/admin')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">PTO &amp; Overtime Trends</h1>
          <p className="text-slate-400 mt-1">
            Patterns and flagged items across both systems. Sick-day balance data is whatever HR
            has manually recorded — there&apos;s no live Gusto reconciliation yet.
          </p>
        </div>
        <TrendsClient />
      </main>
    </div>
  )
}
