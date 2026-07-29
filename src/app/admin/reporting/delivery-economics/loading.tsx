export default function DeliveryEconomicsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <div className="bg-black/20 backdrop-blur-md border-b border-white/10 h-16" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-80 bg-slate-700/50 rounded" />
          <div className="h-4 w-full max-w-3xl bg-slate-700/30 rounded" />
          <div className="flex gap-3">
            <div className="h-10 w-48 bg-slate-700/40 rounded-lg" />
            <div className="h-10 w-64 bg-slate-700/30 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-slate-800/50 border border-white/10 rounded-lg p-4 space-y-2">
                <div className="h-7 w-24 bg-slate-700/40 rounded" />
                <div className="h-3 w-3/4 bg-slate-700/30 rounded" />
              </div>
            ))}
          </div>
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <div className="h-5 w-56 bg-slate-700/40 rounded" />
              <div className="h-32 bg-slate-800/40 border border-white/10 rounded-lg" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
