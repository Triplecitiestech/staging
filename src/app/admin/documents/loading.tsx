export default function DocumentsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <div className="h-16 border-b border-white/10 bg-black/20 backdrop-blur-md" />
      <div className="border-b border-white/10 bg-black/20 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-4">
          <div className="h-4 w-40 rounded bg-slate-700/30" />
          <div className="h-12 w-2/3 rounded bg-slate-700/50" />
          <div className="h-4 w-1/2 rounded bg-slate-700/30" />
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid animate-pulse gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="h-3 w-24 rounded bg-slate-700/30" />
              <div className="h-5 w-3/4 rounded bg-slate-700/50" />
              <div className="h-3 w-full rounded bg-slate-700/20" />
              <div className="h-3 w-5/6 rounded bg-slate-700/20" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
