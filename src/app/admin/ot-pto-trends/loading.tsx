export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
        <div className="h-8 w-64 bg-white/10 rounded mb-3" />
        <div className="h-4 w-96 bg-white/10 rounded mb-8" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-48 bg-white/5 rounded-lg border border-white/10" />
          <div className="h-48 bg-white/5 rounded-lg border border-white/10" />
        </div>
      </div>
    </div>
  )
}
