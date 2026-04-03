export default function ContactsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <div className="bg-black/20 backdrop-blur-md border-b border-white/10 h-16" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center justify-between">
            <div className="h-8 w-40 bg-slate-700/50 rounded" />
            <div className="h-9 w-28 bg-slate-700/40 rounded-lg" />
          </div>
          <div className="bg-slate-800/50 border border-white/10 rounded-lg overflow-hidden">
            <div className="h-10 bg-slate-700/20 border-b border-white/5" />
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-14 border-b border-white/5 px-4 flex items-center gap-4">
                <div className="h-4 w-32 bg-slate-700/30 rounded" />
                <div className="h-4 w-48 bg-slate-700/20 rounded" />
                <div className="h-4 w-24 bg-slate-700/20 rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
