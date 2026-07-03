export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-72 bg-slate-800/70 rounded" />
        <div className="h-4 w-full max-w-xl bg-slate-800/50 rounded" />
        <div className="h-40 bg-slate-800/40 border border-white/10 rounded-lg" />
        <div className="h-40 bg-slate-800/40 border border-white/10 rounded-lg" />
      </div>
    </div>
  )
}
