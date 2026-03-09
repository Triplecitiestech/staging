import AdminHeader from '@/components/admin/AdminHeader'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import MonitoringDashboardClient from '@/components/admin/MonitoringDashboardClient'

export default async function MonitoringPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(6,182,212,0.08)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(139,92,246,0.08)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(14,165,233,0.04)_0%,_transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>
      <div className="relative z-10">
        <AdminHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Platform Monitoring</h1>
            <p className="text-sm text-slate-400">AI usage, database limits, cost tracking, and threshold alerts</p>
          </div>
          <MonitoringDashboardClient />
        </main>
      </div>
    </div>
  )
}
