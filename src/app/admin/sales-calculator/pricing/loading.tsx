export default function SalesCalculatorPricingLoading() {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)' }}
    >
      <main className="max-w-[1100px] mx-auto px-5 py-6">
        <div className="animate-pulse space-y-5">
          <div className="h-7 w-48 bg-slate-700/50 rounded" />
          <div className="h-4 w-96 bg-slate-700/30 rounded" />
          <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-4">
            <div className="h-9 bg-slate-700/40 rounded-xl w-full max-w-md" />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-slate-800/50 border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="h-4 w-56 bg-slate-700/40 rounded" />
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="h-3 w-1/3 bg-slate-700/30 rounded" />
                  <div className="h-7 w-28 bg-slate-700/40 rounded-lg" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
