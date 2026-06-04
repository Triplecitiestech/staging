'use client'

/**
 * Shared building blocks for the AI Managed Services Playbook.
 *
 * Section files import from here and compose these — keep all visual primitives
 * in this one file so the look stays consistent as the doc grows. If you need a
 * new repeated pattern (a new kind of card, table, callout), add it here rather
 * than inlining bespoke markup in a section.
 */

import { useState } from 'react'
import { ArrowRight, ChevronRight } from 'lucide-react'

// ── Section headers ──────────────────────────────────────────────────────────

export function SecBadge({ n }: { n: string }) {
  return (
    <div
      className="flex-none w-[72px] h-[72px] rounded-2xl flex items-center justify-center font-mono text-[28px] font-bold text-cyan-300 border border-cyan-400/30"
      style={{
        background: 'linear-gradient(135deg, rgba(34,211,238,0.14), rgba(34,211,238,0.03))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
      }}
    >
      {n}
    </div>
  )
}

export function SecHead({ n, kicker, children }: { n: string; kicker: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-5 mb-7">
      <SecBadge n={n} />
      <div>
        <div className="text-[12.5px] font-bold uppercase tracking-[0.2em] text-cyan-400 mb-1">{kicker}</div>
        <h2 className="text-[clamp(2rem,3.4vw,2.85rem)] font-black leading-[1.02] tracking-tight text-white">
          {children}
        </h2>
      </div>
    </div>
  )
}

// ── Text ─────────────────────────────────────────────────────────────────────

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-xl leading-relaxed text-slate-100 font-normal mb-2 max-w-[760px]">{children}</p>
}

export function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-[16.5px] leading-[1.7] text-slate-300 mb-4">{children}</p>
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-2xl font-extrabold text-white tracking-tight mt-12 mb-3.5">{children}</h3>
}

export function H4({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[15px] font-bold uppercase tracking-[0.12em] text-cyan-300 mt-8 mb-3">{children}</h4>
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-3 mb-4 pl-0 list-none">
      {items.map((item, i) => (
        <li key={i} className="relative pl-6 text-[16.5px] leading-relaxed text-slate-300">
          <span
            className="absolute left-0.5 top-[9px] w-2 h-2 rounded-full bg-cyan-400"
            style={{ boxShadow: '0 0 10px rgba(34,211,238,0.7)' }}
          />
          {item}
        </li>
      ))}
    </ul>
  )
}

// ── Callouts ─────────────────────────────────────────────────────────────────

export function Callout({ label, warn, open, children }: { label: React.ReactNode; warn?: boolean; open?: boolean; children: React.ReactNode }) {
  if (open) {
    return (
      <div className="rounded-2xl p-7 my-7 border border-dashed border-white/30 bg-white/[0.025]">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300 mb-3">{label}</div>
        {children}
      </div>
    )
  }
  return (
    <div
      className="relative rounded-2xl p-7 pl-9 my-7 border overflow-hidden"
      style={
        warn
          ? { background: 'linear-gradient(135deg, rgba(244,63,94,0.10), rgba(244,63,94,0.02))', borderColor: 'rgba(251,113,133,0.35)' }
          : { background: 'linear-gradient(135deg, rgba(34,211,238,0.09), rgba(34,211,238,0.02))', borderColor: 'rgba(34,211,238,0.30)' }
      }
    >
      <div className={`absolute left-0 top-[22px] bottom-[22px] w-1 rounded-r-sm ${warn ? 'bg-rose-400' : 'bg-cyan-400'}`} />
      <div className={`flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.16em] mb-3 ${warn ? 'text-rose-400' : 'text-cyan-300'}`}>
        {label}
      </div>
      {children}
    </div>
  )
}

export function CalloutP({ children, quote }: { children: React.ReactNode; quote?: boolean }) {
  if (quote) return <p className="text-[21px] leading-[1.45] font-semibold text-white tracking-tight m-0">{children}</p>
  return <p className="text-[16.5px] leading-[1.65] text-slate-200 mb-3 last:mb-0">{children}</p>
}

export function DividerQuote({ src, children }: { src: string; children: React.ReactNode }) {
  return (
    <div
      className="my-11 p-8 md:p-9 rounded-3xl text-center border border-cyan-400/30"
      style={{ background: 'linear-gradient(135deg, #000 0%, #0f172a 60%, #0e7490 130%)' }}
    >
      <p className="text-[23px] leading-relaxed font-semibold text-white tracking-tight max-w-[720px] mx-auto m-0">{children}</p>
      <div className="mt-4 text-[12.5px] font-bold uppercase tracking-[0.16em] text-cyan-400">{src}</div>
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────────

/**
 * Wrap a section in this to give it a gentle ambient wash for visual rhythm.
 * Every edge dissolves into the page canvas, so there are no band seams no
 * matter how many of these you stack. Plain sections (no wash) use a bare
 * <section id=… className="pt-20 scroll-mt-8"> instead.
 */
export function GradSection({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="relative -mx-6 px-6 md:-mx-14 md:px-14 pt-20 pb-14 scroll-mt-8">
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            'radial-gradient(110% 75% at 78% 32%, rgba(13,148,136,0.13) 0%, rgba(8,47,73,0.08) 38%, transparent 72%)',
          maskImage: 'linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%)',
        }}
      />
      <div className="relative">{children}</div>
    </section>
  )
}

// ── Decision gates ───────────────────────────────────────────────────────────

export function Gate({
  fork, question, yesLabel = 'If yes', noLabel = 'If no', yesText, noText, cols,
}: {
  fork: string; question: string; yesLabel?: string; noLabel?: string; yesText: React.ReactNode; noText: React.ReactNode; cols?: string
}) {
  return (
    <div className={`grid rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden mb-4 ${cols ?? 'grid-cols-[1.3fr_1fr_1fr]'}`}>
      <div className="p-5 border-r border-white/10">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-2">{fork}</div>
        <div className="text-[16.5px] font-semibold text-white leading-snug">{question}</div>
      </div>
      <div className="p-5 border-r border-white/10">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-400 mb-2">
          <ArrowRight size={12} />{yesLabel}
        </div>
        <div className="text-sm leading-relaxed text-slate-300">{yesText}</div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-rose-400 mb-2">
          <ArrowRight size={12} />{noLabel}
        </div>
        <div className="text-sm leading-relaxed text-slate-300">{noText}</div>
      </div>
    </div>
  )
}

export function SinglePathGate({ fork, question, pathColor, pathLabel, children }: { fork: string; question: string; pathColor: string; pathLabel: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_1.6fr] rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden mb-4">
      <div className="p-5 border-r border-white/10">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-2">{fork}</div>
        <div className="text-[16.5px] font-semibold text-white leading-snug">{question}</div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: pathColor }}>
          <ArrowRight size={12} />{pathLabel}
        </div>
        <div className="text-sm leading-relaxed text-slate-300">{children}</div>
      </div>
    </div>
  )
}

// ── Phases & sub-phases ──────────────────────────────────────────────────────

/**
 * A phase in the delivery timeline.
 *
 * Pass a `detail` node to attach a collapsible drill-down — use this for the
 * deep sub-phase breakdowns. The summary `children` always show; `detail`
 * reveals on click. Compose `detail` from <SubPhase> blocks, e.g.:
 *
 *   <Phase n="1" title="Foundation & Data Cleanup" gated
 *     detail={<>
 *       <SubPhase label="1.1" title="SharePoint audit">…</SubPhase>
 *       <SubPhase label="1.2" title="Entra hygiene">…</SubPhase>
 *     </>}
 *   >
 *     <Bullets items={[…]} />
 *   </Phase>
 */
export function Phase({
  n, title, gated, children, output, detail, detailLabel = 'Detailed sub-phases',
}: {
  n: string
  title: React.ReactNode
  gated?: boolean
  children: React.ReactNode
  output?: string
  detail?: React.ReactNode
  detailLabel?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative grid grid-cols-[90px_1fr] gap-7 pb-9 last:pb-0">
      {/* connector */}
      <div
        className="absolute left-[31px] top-[62px] bottom-[-6px] w-0.5 last-of-type:hidden"
        style={{ background: 'linear-gradient(180deg, #22D3EE, rgba(34,211,238,0.1))' }}
      />
      {/* number */}
      <div
        className="relative z-10 w-[62px] h-[62px] rounded-full flex flex-col items-center justify-center border-[1.5px] border-cyan-400/30"
        style={{ background: 'linear-gradient(135deg, #0b1620, #020608)', boxShadow: '0 0 24px rgba(6,182,212,0.25)' }}
      >
        <span className="text-[8px] font-bold uppercase tracking-wide text-slate-500">Phase</span>
        <span className="text-[26px] font-black text-cyan-300 leading-none">{n}</span>
      </div>
      {/* body */}
      <div className="pt-1">
        <h3 className="text-xl font-extrabold text-white tracking-tight mb-2">
          {title}
          {gated && (
            <span className="ml-2.5 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-rose-400/16 text-rose-400 border border-rose-400/30 align-middle">
              Gated
            </span>
          )}
        </h3>
        {children}
        {output && <p className="mt-3 text-sm text-cyan-200">{output}</p>}
        {detail && (
          <div className="mt-4">
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-cyan-300 hover:text-cyan-200 transition-colors"
            >
              <ChevronRight size={15} className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
              {open ? 'Hide details' : detailLabel}
            </button>
            {open && (
              <div className="mt-4 flex flex-col gap-5 rounded-xl border border-white/10 bg-white/[0.025] p-5 md:p-6">
                {detail}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** A nested step inside a Phase's `detail` drill-down. */
export function SubPhase({ label, title, children }: { label?: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative pl-5 border-l-2 border-cyan-400/25">
      <div className="flex items-baseline gap-2.5 mb-1.5">
        {label && <span className="font-mono text-[12px] font-bold text-cyan-400/90 flex-none">{label}</span>}
        <h4 className="text-[16px] font-bold text-white tracking-tight">{title}</h4>
      </div>
      <div className="text-[15px] leading-relaxed text-slate-300">{children}</div>
    </div>
  )
}

// ── Misc cards ───────────────────────────────────────────────────────────────

export function QRow({ theme, question, tells }: { theme: string; question: string; tells: string }) {
  return (
    <div className="grid grid-cols-[170px_1fr_230px] gap-6 items-start p-5 rounded-xl border border-white/10 bg-white/[0.025] transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.04]">
      <div className="text-xs font-bold uppercase tracking-[0.1em] text-cyan-400 pt-0.5">{theme}</div>
      <div className="text-base leading-snug text-white font-medium">{question}</div>
      <div className="text-[13.5px] leading-snug text-slate-400 pt-0.5">
        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 mb-1">Tells you</span>
        {tells}
      </div>
    </div>
  )
}

export function ExCard({ status, title, children }: { status: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-6 bg-white/[0.03] border border-white/10">
      <span className="inline-block text-[10.5px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full mb-3 bg-cyan-400/12 text-cyan-300 border border-cyan-400/30">
        {status}
      </span>
      <h4 className="text-[17px] font-bold text-white mb-2">{title}</h4>
      <p className="text-sm leading-relaxed text-slate-400 m-0">{children}</p>
    </div>
  )
}
