import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import HiringCalculator from '@/components/cfo/HiringCalculator'

// Access gate is inherited from /admin/cfo/layout.tsx.
export default function CfoHiringPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">New hire break-even calculator</h1>
            <p className="text-slate-400 mt-1">Fully-loaded cost & required revenue — US employees (W-2) vs. US contractors (1099) vs. Philippines contractors</p>
          </div>
          <Link href="/admin/cfo" className="text-sm text-cyan-300 hover:text-cyan-200">← Back to dashboard</Link>
        </div>
        <HiringCalculator />
      </main>
    </div>
  )
}
