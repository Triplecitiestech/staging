import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import DeliveryEconomicsDashboard from '@/components/reporting/DeliveryEconomicsDashboard'

export default async function DeliveryEconomicsPage() {
  const session = await auth()
  if (!session) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Delivery Economics &amp; Capacity</h1>
          <p className="text-slate-400 mt-2 max-w-3xl">
            What it actually costs to serve an endpoint, how much delivery capacity is left, and whether billable work is
            being billed — measured from Autotask time entries joined to Datto RMM endpoint counts. Captured weekly so the
            figures form a trend rather than a single reading; every snapshot is kept, so you can look back at any past week.
            Internal data: contains cost and margin detail, not for customer distribution.
          </p>
        </div>
        <DeliveryEconomicsDashboard />
      </main>
    </div>
  )
}
