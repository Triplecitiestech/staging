import AdminHeader from '@/components/admin/AdminHeader'

export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="h-8 w-40 bg-white/10 rounded animate-pulse mb-4" />
        <div className="h-4 w-64 bg-white/5 rounded animate-pulse mb-8" />
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-white/5 border border-white/10 animate-pulse" />
          ))}
        </div>
      </main>
    </div>
  )
}
