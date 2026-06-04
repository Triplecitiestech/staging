/** The hero masthead. Not a TOC section — rendered once at the top of the doc. */
export default function Masthead() {
  const chips: React.ReactNode[] = [
    <><strong className="text-cyan-300 font-bold">v1.0</strong> Go-to-market draft</>,
    'Built from the TBR / AI pitch meeting',
    'Kurtis Florance & James King',
    'June 4, 2026',
  ]

  return (
    <header className="relative overflow-hidden -mx-6 md:-mx-14 px-6 md:px-14 pt-24 pb-20 mb-0">
      {/* Hero image, edge-faded so it melts into the page canvas instead of
          hard-cutting at a rectangle boundary. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('/herobg.webp')",
          opacity: 0.3,
          maskImage: 'radial-gradient(82% 140% at 50% -12%, #000 0%, #000 26%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(82% 140% at 50% -12%, #000 0%, #000 26%, transparent 72%)',
        }}
      />
      {/* Legibility + blend: dark at the top, dissolving into the canvas at the
          bottom — no hard divider line between the masthead and §1. */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(3,6,11,0.6) 0%, rgba(5,8,14,0.32) 55%, transparent 100%)' }}
      />
      <div className="relative z-10 max-w-[828px] pb-16">
        <div className="flex items-center gap-3.5 mb-10">
          <span
            className="w-[7px] h-[7px] rounded-full bg-cyan-400"
            style={{ boxShadow: '0 0 12px #22D3EE' }}
          />
          <span className="text-[12.5px] font-bold uppercase tracking-[0.26em] text-slate-400">Triple Cities Tech</span>
        </div>
        <div className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-400 mb-2">
          Service Bundle · Delivery Playbook · Sales Framework
        </div>
        <h1
          className="font-black leading-[0.94] tracking-tight text-white mt-3"
          style={{ fontSize: 'clamp(3rem, 6vw, 4.75rem)' }}
        >
          AI Managed<br />Services <span className="text-cyan-400">Playbook</span>
        </h1>
        <p className="text-xl leading-relaxed text-slate-300 font-normal mt-6 max-w-[680px]">
          How TCT packages, sells, and delivers AI as a managed service — the rules that keep the recurring fee honest and the projects profitable.
        </p>
        <div className="flex flex-wrap gap-2.5 mt-9">
          {chips.map((chip, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[12.5px] font-semibold text-slate-300"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </header>
  )
}
