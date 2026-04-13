import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import { hasPermission } from '@/lib/permissions'
import PtoQueueClient from '@/components/pto/PtoQueueClient'

export const dynamic = 'force-dynamic'

export default async function PtoQueuePage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  if (
    !hasPermission(
      session.user?.role,
      'approve_pto',
      session.user?.permissionOverrides
    )
  ) {
    redirect('/admin/pto')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">PTO Approval Queue</h1>
            <p className="text-slate-400 mt-1">
              Review pending requests, then approve or deny.
            </p>
          </div>
        </div>
        <PtoQueueClient />
      </main>
    </div>
  )
}
