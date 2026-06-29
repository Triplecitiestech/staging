export default function WanReliabilityLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <div className="bg-black/20 backdrop-blur-md border-b border-white/10 h-16" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-slate-700/50 rounded" />
          <div className="h-4 w-96 bg-slate-700/30 rounded" />
          <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-1/2 bg-slate-700/30 rounded" />
                  <div className="h-9 bg-slate-700/40 rounded-lg" />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-9 w-28 bg-slate-700/30 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
