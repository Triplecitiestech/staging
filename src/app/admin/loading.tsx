export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      {/* Header skeleton */}
      <div className="bg-black/20 backdrop-blur-md border-b border-white/10 h-16" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-8 w-48 bg-slate-700/50 rounded" />
              <div className="h-4 w-64 bg-slate-700/30 rounded mt-3" />
            </div>
            <div className="h-10 w-36 bg-slate-700/50 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-slate-800/50 border border-white/10 rounded-lg p-6 space-y-3">
                <div className="h-4 w-3/4 bg-slate-700/50 rounded" />
                <div className="h-3 w-1/2 bg-slate-700/30 rounded" />
                <div className="h-3 w-2/3 bg-slate-700/30 rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
