export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-slate-800/70 rounded" />
        <div className="h-4 w-full max-w-2xl bg-slate-800/50 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-800/40 border border-slate-700/40 rounded-lg" />
          ))}
        </div>
        <div className="h-48 bg-slate-800/40 border border-slate-700/40 rounded-xl" />
        <div className="h-64 bg-slate-800/40 border border-slate-700/40 rounded-xl" />
      </div>
    </div>
  )
}
