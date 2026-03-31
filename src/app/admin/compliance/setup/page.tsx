import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import ComplianceSetupWizard from '@/components/compliance/ComplianceSetupWizard'

export const dynamic = 'force-dynamic'

export default async function ComplianceSetupPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ComplianceSetupWizard />
      </main>
    </div>
  )
}
