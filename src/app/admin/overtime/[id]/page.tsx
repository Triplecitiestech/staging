import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import { hasPermission } from '@/lib/permissions'
import OvertimeDetailClient from '@/components/overtime/OvertimeDetailClient'

export const dynamic = 'force-dynamic'

export default async function OvertimeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/auth/signin')
  const { id } = await params
  const canApprove = hasPermission(session.user?.role, 'approve_overtime', session.user?.permissionOverrides)
  const canIntake = hasPermission(session.user?.role, 'overtime_intake', session.user?.permissionOverrides)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Overtime Request</h1>
        </div>
        <OvertimeDetailClient
          id={id}
          canApprove={canApprove}
          canIntake={canIntake}
          currentStaffId={session.user?.staffId ?? null}
        />
      </main>
    </div>
  )
}
