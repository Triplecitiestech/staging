import { Suspense } from 'react'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import CfoSettingsClient from '@/components/cfo/CfoSettingsClient'

// Access gate is inherited from /admin/cfo/layout.tsx.
export default function CfoSettingsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">CFO Settings</h1>
            <p className="text-slate-400 mt-1">QuickBooks connection, debts, and category mapping</p>
          </div>
          <Link href="/admin/cfo" className="text-sm text-cyan-300 hover:text-cyan-200">← Back to dashboard</Link>
        </div>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl border border-white/10 bg-white/5" />}>
          <CfoSettingsClient />
        </Suspense>
      </main>
    </div>
  )
}
