import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import WanReliabilityGenerator from '@/components/reporting/WanReliabilityGenerator'

export default async function WanReliabilityPage() {
  const session = await auth()
  if (!session) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">WAN Reliability (ISP / SLA)</h1>
          <p className="text-slate-400 mt-2">
            Historical WAN/circuit reliability for any monitored site, live from Domotz: outage history, uptime, MTBF/MTTR,
            daily instability, SLA compliance (99.99% availability / 4-hour repair), and latency &amp; packet-loss trends.
            Export as Markdown, JSON or text, or open the printable report.
          </p>
        </div>
        <WanReliabilityGenerator />
      </main>
    </div>
  )
}
