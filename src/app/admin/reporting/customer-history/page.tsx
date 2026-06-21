import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import CustomerHistoryGenerator from '@/components/reporting/CustomerHistoryGenerator'

export default async function CustomerHistoryPage() {
  const session = await auth()
  if (!session) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Customer History (TBR)</h1>
          <p className="text-slate-400 mt-2">
            Pull a customer&apos;s full multi-year ticket history live from Autotask — totals by year, queues, ticket
            types, priorities, reactive vs. proactive, resolution times, open backlog, plus Datto RMM devices &amp;
            alerts. Ideal prep for a Technology Business Review with a customer you haven&apos;t met with in a while.
          </p>
        </div>
        <CustomerHistoryGenerator />
      </main>
    </div>
  )
}
