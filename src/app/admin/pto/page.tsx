import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import { hasPermission } from '@/lib/permissions'
import PtoClient from '@/components/pto/PtoClient'

export const dynamic = 'force-dynamic'

export default async function PtoPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const canApprove = hasPermission(
    session.user?.role,
    'approve_pto',
    session.user?.permissionOverrides
  )
  const canIntake = hasPermission(
    session.user?.role,
    'pto_intake',
    session.user?.permissionOverrides
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Time Off</h1>
          <p className="text-slate-400 mt-1">
            Submit a PTO request and track its approval status.
          </p>
        </div>
        <PtoClient canApprove={canApprove} canIntake={canIntake} />
      </main>
    </div>
  )
}
