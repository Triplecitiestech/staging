export default function PortalMigrationLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <div className="bg-black/20 backdrop-blur-md border-b border-white/10 h-16" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-slate-700/50 rounded" />
            <div className="h-4 w-96 max-w-full bg-slate-700/30 rounded" />
          </div>
          <div className="bg-slate-800/50 border border-white/10 rounded-xl p-8">
            <div className="h-6 w-64 bg-slate-700/40 rounded mb-3" />
            <div className="h-4 w-full max-w-xl bg-slate-700/20 rounded mb-6" />
            <div className="border-2 border-dashed border-white/10 rounded-xl h-48" />
          </div>
        </div>
      </main>
    </div>
  )
}
