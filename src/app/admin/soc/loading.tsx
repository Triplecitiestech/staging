export default function SocLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <div className="bg-black/20 backdrop-blur-md border-b border-white/10 h-16" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-56 bg-slate-700/50 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-800/50 border border-white/10 rounded-lg p-6 space-y-3">
                <div className="h-6 w-12 bg-slate-700/50 rounded" />
                <div className="h-3 w-2/3 bg-slate-700/30 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6 space-y-3">
            <div className="h-4 w-1/3 bg-slate-700/50 rounded" />
            <div className="h-64 bg-slate-700/20 rounded" />
          </div>
        </div>
      </main>
    </div>
  )
}
