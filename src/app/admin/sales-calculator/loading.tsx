export default function SalesCalculatorLoading() {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)' }}
    >
      <div className="border-b border-white/10 h-[88px]" />
      <main className="max-w-[1500px] mx-auto px-5 py-6 grid lg:grid-cols-[minmax(380px,440px)_1fr] gap-6">
        <div className="animate-pulse space-y-5">
          <div className="h-6 w-32 bg-slate-700/50 rounded" />
          <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-5 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-1/3 bg-slate-700/30 rounded" />
                <div className="h-9 bg-slate-700/40 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
        <div className="animate-pulse space-y-5">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-8 w-24 bg-slate-700/30 rounded-lg" />
            ))}
          </div>
          <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-6">
            <div className="h-64 bg-slate-700/20 rounded" />
          </div>
          <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-6">
            <div className="h-40 bg-slate-700/20 rounded" />
          </div>
        </div>
      </main>
    </div>
  )
}
