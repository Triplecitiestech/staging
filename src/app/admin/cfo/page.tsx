import AdminHeader from '@/components/admin/AdminHeader'
import CfoDashboardClient from '@/components/cfo/CfoDashboardClient'

// Access gate lives in layout.tsx — reaching this page means access passed.
export default function CfoDashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">CFO Dashboard</h1>
          <p className="text-slate-400 mt-1">Cash flow, runway, debts, AR, and QuickBooks — staff finance access only</p>
        </div>
        <CfoDashboardClient />
      </main>
    </div>
  )
}
