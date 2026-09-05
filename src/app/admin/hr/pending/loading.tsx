export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <div className="mb-4 h-4 w-64 animate-pulse rounded bg-slate-800" />
        <div className="mb-2 h-8 w-72 animate-pulse rounded bg-slate-800" />
        <div className="mb-6 h-4 w-full max-w-3xl animate-pulse rounded bg-slate-800/70" />

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-white/10 bg-slate-800/40"
            />
          ))}
        </div>

        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-white/10 bg-slate-800/40"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
