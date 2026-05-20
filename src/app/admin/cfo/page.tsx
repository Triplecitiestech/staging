import AdminHeader from '@/components/admin/AdminHeader'

// Placeholder until the dashboard logic + React/Recharts UI are ported. The
// access gate lives in layout.tsx — reaching this page means access passed.
export default function CfoDashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">CFO Dashboard</h1>
          <p className="text-slate-400 mt-1">Cash flow, runway, debts, AR, and QuickBooks — staff finance access only</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Access confirmed</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                This area is restricted to staff explicitly granted the CFO dashboard permission or
                belonging to a configured finance/accounting Entra group. The financial dashboard
                (Sequence cash-flow analytics + QuickBooks) will be built out here next.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
