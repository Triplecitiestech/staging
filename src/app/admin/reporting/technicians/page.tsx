import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import TechnicianReport from '@/components/reporting/TechnicianReport'

export default async function TechniciansReportPage() {
  const session = await auth()
  if (!session) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Technician Performance</h1>
          <p className="text-slate-400 mt-2">Individual technician metrics and comparisons</p>
        </div>
        <TechnicianReport />
      </main>
    </div>
  )
}
