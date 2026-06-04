'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, AlertTriangle, Check, X, ArrowRight } from 'lucide-react'

const TOC = [
  { id: 'core', num: '01', label: 'The Core Model' },
  { id: 'scope', num: '02', label: 'Included vs. Not Included' },
  { id: 'phases', num: '03', label: 'Delivery Phases' },
  { id: 'platform', num: '04', label: 'ChatGPT vs. Claude' },
  { id: 'risk', num: '05', label: 'Security, Risk & Compliance' },
  { id: 'tokens', num: '06', label: 'Token Economics & Billing' },
  { id: 'discovery', num: '07', label: 'Discovery Questions' },
  { id: 'development', num: '08', label: 'AI Development Track' },
  { id: 'cases', num: '09', label: 'Examples & Case Studies' },
  { id: 'actions', num: '10', label: 'Action Items' },
]

// ── Shared sub-components ────────────────────────────────────────────────────

function SecBadge({ n }: { n: string }) {
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

function SecHead({ n, kicker, children }: { n: string; kicker: string; children: React.ReactNode }) {
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

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-xl leading-relaxed text-slate-100 font-normal mb-2 max-w-[760px]">{children}</p>
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-[16.5px] leading-[1.7] text-slate-300 mb-4">{children}</p>
}

function Callout({ label, warn, open, children }: { label: React.ReactNode; warn?: boolean; open?: boolean; children: React.ReactNode }) {
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

function CalloutP({ children, quote }: { children: React.ReactNode; quote?: boolean }) {
  if (quote) return <p className="text-[21px] leading-[1.45] font-semibold text-white tracking-tight m-0">{children}</p>
  return <p className="text-[16.5px] leading-[1.65] text-slate-200 mb-3 last:mb-0">{children}</p>
}

function Bullets({ items }: { items: React.ReactNode[] }) {
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

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-2xl font-extrabold text-white tracking-tight mt-12 mb-3.5">{children}</h3>
}

function H4({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[15px] font-bold uppercase tracking-[0.12em] text-cyan-300 mt-8 mb-3">{children}</h4>
}

function GradSection({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div
      className="-mx-6 px-6 md:-mx-14 md:px-14"
      style={{ background: 'linear-gradient(135deg, #000 0%, #0b1118 55%, #0a3543 130%)' }}
    >
      <section id={id} className="pt-20 scroll-mt-8 pb-0">
        {children}
      </section>
    </div>
  )
}

function Gate({
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

function SinglePathGate({ fork, question, pathColor, pathLabel, children }: { fork: string; question: string; pathColor: string; pathLabel: string; children: React.ReactNode }) {
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

function Phase({ n, title, gated, children, output }: { n: string; title: React.ReactNode; gated?: boolean; children: React.ReactNode; output?: string }) {
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
      </div>
    </div>
  )
}

function QRow({ theme, question, tells }: { theme: string; question: string; tells: string }) {
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

function ExCard({ status, title, children }: { status: string; title: string; children: React.ReactNode }) {
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

function DividerQuote({ src, children }: { src: string; children: React.ReactNode }) {
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

// ── Main component ────────────────────────────────────────────────────────────

export default function AiManagedServicesPlaybook() {
  const [activeId, setActiveId] = useState('core')
  const [scrollPct, setScrollPct] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveId(e.target.id) })
      },
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 }
    )
    TOC.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight
      setScrollPct(h > 0 ? window.scrollY / h : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => { observer.disconnect(); window.removeEventListener('scroll', onScroll) }
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setSidebarOpen(false)
  }

  return (
    <>
      {/* Progress bar */}
      <div className="fixed top-14 left-0 right-0 z-50 h-[2px]">
        <div
          className="h-full origin-left"
          style={{
            background: 'linear-gradient(90deg, #22D3EE, #0891B2)',
            transform: `scaleX(${scrollPct})`,
          }}
        />
      </div>

      {/* Sidebar backdrop on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-14 left-0 w-[260px] h-[calc(100vh-56px)] z-30 flex flex-col border-r border-white/10 overflow-y-auto transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{ background: 'rgba(8,10,14,0.92)', backdropFilter: 'blur(18px)' }}
      >
        <div className="p-7 pb-0">
          <Link href="/admin/documents" className="block">
            <Image
              src="/logo/tctlogo.webp"
              alt="Triple Cities Tech"
              width={121}
              height={32}
              className="h-8 w-auto object-contain"
            />
          </Link>
          <div className="mt-5 mb-3.5 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-400">
            AI Managed Services Playbook
          </div>
          <nav>
            <ul className="flex flex-col gap-px list-none p-0 m-0">
              {TOC.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => scrollTo(item.id)}
                    className={`w-full flex items-baseline gap-3 px-3 py-2 rounded-lg text-[14px] text-left transition-all border-l-2 ${
                      activeId === item.id
                        ? 'bg-cyan-400/10 text-white font-semibold border-l-cyan-400'
                        : 'text-slate-400 font-medium border-l-transparent hover:bg-white/[0.04] hover:text-slate-100'
                    }`}
                  >
                    <span
                      className={`font-mono text-[11px] font-bold flex-none w-4 transition-colors ${
                        activeId === item.id ? 'text-cyan-400' : 'text-slate-600'
                      }`}
                    >
                      {item.num}
                    </span>
                    <span className="leading-snug">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-auto p-7 border-t border-white/10 text-[11.5px] leading-relaxed text-slate-500">
          <strong className="text-slate-300 font-semibold">Internal working document — v1.0</strong>
          <br />Go-to-market draft
          <br />Kurtis Florance &amp; James King
          <br />June 4, 2026
        </div>
      </aside>

      {/* Mobile TOC button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed bottom-6 right-6 z-40 lg:hidden w-12 h-12 rounded-full flex items-center justify-center text-[#04222a] shadow-lg shadow-cyan-500/30"
        style={{ background: 'linear-gradient(135deg, #22D3EE, #0891B2)' }}
        aria-label="Table of contents"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {/* Main content */}
      <div className="lg:ml-[260px]">
        <div className="max-w-[940px] mx-auto px-6 md:px-14 pb-40">

          {/* Back link */}
          <div className="pt-6 pb-2">
            <Link
              href="/admin/documents"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-cyan-400 transition-colors"
            >
              <ArrowLeft size={14} />
              Documents
            </Link>
          </div>

          {/* ── MASTHEAD ── */}
          <header className="relative overflow-hidden -mx-6 md:-mx-14 px-6 md:px-14 pt-24 pb-18 mb-0 border-b border-white/10">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-[0.34]"
              style={{ backgroundImage: "url('/herobg.webp')" }}
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.78) 60%, #000 100%)' }}
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
                {[
                  <><strong className="text-cyan-300 font-bold">v1.0</strong> Go-to-market draft</>,
                  'Built from the TBR / AI pitch meeting',
                  'Kurtis Florance & James King',
                  'June 4, 2026',
                ].map((chip, i) => (
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

          {/* ══════════════════════════════════════════════════
              §1 — THE CORE MODEL
          ══════════════════════════════════════════════════ */}
          <section id="core" className="pt-20 scroll-mt-8">
            <SecHead n="01" kicker="The #1 Rule">
              The <span className="text-cyan-400">Core Model</span>
            </SecHead>

            <Lead>
              The offering is split into two distinct, <strong className="text-cyan-300 font-bold">separately-sold</strong> motions. Keeping them separate is the single most important rule in this playbook.
            </Lead>
            <Body>
              Conflating them is what lets the wrong client think they can call you to "snap your fingers" on custom work for a flat monthly fee. Sell them apart. Price them apart. Talk about them apart.
            </Body>

            {/* Two-part model cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 my-7">
              {/* MRR card */}
              <div
                className="rounded-3xl p-8 border border-cyan-400/30 overflow-hidden"
                style={{
                  background: 'linear-gradient(160deg, rgba(6,182,212,0.16), rgba(0,0,0,0.55))',
                  boxShadow: '0 8px 24px rgba(6,182,212,0.20)',
                }}
              >
                <span
                  className="inline-flex items-center text-[11.5px] font-bold uppercase tracking-[0.16em] px-3 py-1.5 rounded-full mb-4 text-[#04222a]"
                  style={{ background: 'linear-gradient(90deg, #22D3EE, #0891B2)' }}
                >
                  Recurring · MRR
                </span>
                <h3 className="text-[27px] font-black text-white tracking-tight mb-1.5">AI Managed Services</h3>
                <div className="text-sm font-semibold text-cyan-300 tracking-wide mb-4">"Set it and forget it" SaaS-style margin</div>
                <p className="text-[15.5px] leading-relaxed text-slate-300 m-0">
                  Infrastructure, governance, user enablement, and adds / moves / changes on the managed environment. Predictable, near-free money once configured.
                </p>
                <div className="mt-5 pt-4 border-t border-white/10 text-sm leading-snug text-slate-200">
                  <strong className="text-white font-semibold">Pitch this in every TBR.</strong> It's the foundation the AI layer rides on.
                </div>
              </div>
              {/* Dev card */}
              <div
                className="rounded-3xl p-8 border border-white/20 overflow-hidden"
                style={{ background: 'linear-gradient(160deg, rgba(31,41,55,0.55), rgba(0,0,0,0.6))' }}
              >
                <span className="inline-flex items-center text-[11.5px] font-bold uppercase tracking-[0.16em] px-3 py-1.5 rounded-full mb-4 bg-purple-500/18 text-purple-300 border border-purple-500/40">
                  Project-based · One-off
                </span>
                <h3 className="text-[27px] font-black text-white tracking-tight mb-1.5">AI Development</h3>
                <div className="text-sm font-semibold text-purple-300 tracking-wide mb-4">Custom builds, billed up front</div>
                <p className="text-[15.5px] leading-relaxed text-slate-300 m-0">
                  Custom GPTs, agents, integrations, automations, and data cleanup. Bigger dollars up front — and each build carries its own recurring maintenance fee once delivered.
                </p>
                <div className="mt-5 pt-4 border-t border-white/10 text-sm leading-snug text-slate-200">
                  <strong className="text-white font-semibold">Near-term, these out-earn the recurring.</strong> They can be large.
                </div>
              </div>
            </div>

            <Callout label="Why carry both">
              <CalloutP>
                MRR is the predictable, near-free money once configured. But in the near term the one-off projects will make more than the recurring. The natural regression: <strong className="text-white font-semibold">a client adopts managed services, gets a taste of what AI can do, then buys a project</strong> to push past the out-of-the-box limits.
              </CalloutP>
            </Callout>

            <H3>Hard prerequisite — do not skip</H3>
            <Callout warn label={<><AlertTriangle size={16} /> Foundations + clean data first</>}>
              <CalloutP>
                If they don't have a properly configured Microsoft environment, or the data is a mess, that's a <strong className="text-white font-semibold">full stop</strong>. You clean the data first — that's its own project.
              </CalloutP>
              <CalloutP>
                Without good, clean, connected context, the LLM is just a chatbot with no knowledge of their business. Garbage in, garbage out. The MSP foundation is the thing that makes the AI layer possible — that's also why the margins work.
              </CalloutP>
            </Callout>

            <H3>Go-to-market sequencing</H3>
            <Body>Do not let buildout block client conversations. The phased rollout:</Body>
            <Bullets items={[
              <><strong className="text-white font-semibold">Now — Thought leadership.</strong> Use TBRs to establish TCT as the AI authority. Show the amazing things, share the journey ("AI is in its AOL stage — evolving fast"), talk prompting for free. Goal: they walk away wowed.</>,
              <><strong className="text-white font-semibold">Next — Partner channels.</strong> Anthropic's Claude Partner Network is already live (launched March 2026; free to join, with a partner portal and certifications) — apply now. OpenAI has no public reseller program; the path there is provisioning and managing ChatGPT Business on the client's behalf, plus tracking OpenAI's enterprise pathways. The goal of both: predictable billing and multi-tenancy.</>,
              <><strong className="text-white font-semibold">Then — Scale.</strong> Standardized bundle, Autotask line items, monthly AI overview webinars, case studies feeding new-client meetings.</>,
            ]} />
            <Callout label="Timeline anchor">
              <CalloutP>
                By <strong className="text-white font-semibold">end of June</strong>, have something on the books to take to a client. The TBR audience is small — fewer than 10 — so the bar is "get these done," not "build the perfect platform."
              </CalloutP>
            </Callout>
          </section>

          {/* ══════════════════════════════════════════════════
              §2 — SCOPE
          ══════════════════════════════════════════════════ */}
          <section id="scope" className="pt-20 scroll-mt-8">
            <SecHead n="02" kicker="The Scope Boundary">
              What's Included <span className="text-cyan-400">vs. What's Not</span>
            </SecHead>

            <Lead>
              The clarity here — <strong className="text-white font-bold">"adds / moves / changes yes, custom integrations no"</strong> — is what protects your time and keeps the recurring fee honest.
            </Lead>

            <H4>AI Managed Services — the recurring bundle</H4>
            <div className="rounded-xl overflow-hidden border border-white/10 my-6">
              <table className="w-full border-collapse text-[15px]">
                <thead>
                  <tr>
                    <th className="text-left px-5 py-4 text-emerald-400 font-bold text-[13px] uppercase tracking-wide bg-emerald-400/10 border-b border-cyan-400/30 w-1/2">✅ Included in MRR</th>
                    <th className="text-left px-5 py-4 text-rose-400 font-bold text-[13px] uppercase tracking-wide bg-rose-400/10 border-b border-cyan-400/30 w-1/2">❌ Not included (= AI Development project)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Infrastructure setup — domain, business / Team account, inviting employees', 'Custom GPTs and agents — one-off builds (can be done at onboarding)'],
                    ['Security & governance — confirm & document that client data is not used for training (off by default on Business)', 'Custom integrations to ERP / CRM where no native connector exists'],
                    ['Ecosystem integrations — native connectors: ChatGPT ↔ Microsoft, SharePoint, email', 'Automations & scheduled agents built for a specific business outcome'],
                    ['User enablement — AI office hours, prompting education, sharing what works', 'Data cleanup / SharePoint remediation (prerequisite project)'],
                    ['Adds, moves, changes (AMC) on the managed environment', 'Building or maintaining a custom app (e.g., an ERP replacement)'],
                    ['Token pool monitoring & threshold alerting (roadmap — see §6)', 'Live one-off tweaks to delivered custom products (governed by a release cycle)'],
                    ['Platform selection guidance — ChatGPT vs. Claude per use case', 'CUI / CMMC-regulated workloads (see §5 risk)'],
                  ].map(([inc, exc], i) => (
                    <tr key={i} className="border-b border-white/10 last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 align-top text-slate-300 border-r border-white/10">
                        <div className="flex gap-3 items-start">
                          <Check size={18} className="text-emerald-400 flex-none mt-0.5" />
                          <span dangerouslySetInnerHTML={{ __html: inc.replace(/—/, '<strong class="text-white">—</strong>').replace(/^([^—]+)/, (m) => `<strong class="text-white">${m}</strong>`) }} />
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top text-slate-300">
                        <div className="flex gap-3 items-start">
                          <X size={18} className="text-rose-400 flex-none mt-0.5" />
                          <span dangerouslySetInnerHTML={{ __html: exc.replace(/—/, '<strong class="text-white">—</strong>').replace(/^([^—]+)/, (m) => `<strong class="text-white">${m}</strong>`) }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Callout label="The line in the sand">
              <CalloutP quote>
                "We manage the infrastructure — the Microsoft, the OpenAI. You want adds, moves, changes, whatever — included. But if you're building custom integrations, that's not supported, that's not in scope."
              </CalloutP>
            </Callout>

            <Callout warn label={<><AlertTriangle size={16} /> If a client buys AI direct (not through TCT)</>}>
              <CalloutP>
                We will still help them manage it — <strong className="text-white font-semibold">but only on a contract.</strong> We can't force them through us; we just can't carry the ongoing maintenance for free.
              </CalloutP>
            </Callout>
          </section>

          {/* ══════════════════════════════════════════════════
              §3 — PHASES  (gradient section)
          ══════════════════════════════════════════════════ */}
          <GradSection id="phases">
            <SecHead n="03" kicker="Step-by-Step">
              Delivery <span className="text-cyan-400">Phases</span>
            </SecHead>

            <Lead>This mirrors traditional managed-services onboarding, but for AI. <strong className="text-white font-bold">Follow the order.</strong></Lead>
            <Body>Skipping a step "can bite everyone" — readiness gates exist for a reason.</Body>

            <div className="my-7">
              <Phase n="0" title="Discovery & Readiness Assessment" output="Output → a go / clean-data-first / not-ready decision and a recommended platform.">
                <Bullets items={[
                  'Run the discovery questions (§7) to determine the best delivery path.',
                  'Audit foundations: is the Microsoft environment configured correctly? Is there clean, connectable data?',
                  'Score AI readiness and surface low-hanging fruit.',
                ]} />
              </Phase>
              <Phase n="1" title="Foundation & Data Cleanup" gated>
                <Bullets items={[
                  <><strong className="text-white font-semibold">If data fails the readiness gate:</strong> scope a cleanup project first (we use AI to do it). Cost varies with how messy SharePoint is.</>,
                  'Confirm Microsoft / Entra / SharePoint hygiene and that systems are AI-connectable.',
                  <><strong className="text-white font-semibold">Do not proceed to Phase 2</strong> until the foundation passes.</>,
                ]} />
              </Phase>
              <Phase n="2" title="Platform Selection & Provisioning">
                <Bullets items={[
                  'Choose platform per use case (see §4). Default to ChatGPT for everyday employee use today.',
                  'Stand up the business / Team account, configure the domain, prepare to invite employees.',
                  'Confirm training is off (default on Business — contractual, not a per-account toggle) and document it. Confirm corporate (not personal) accounts for all employees.',
                ]} />
              </Phase>
              <Phase n="3" title="Governance & Integrations">
                <Bullets items={[
                  'Apply security & governance baseline; document the ring-fencing.',
                  <><strong className="text-white font-semibold">Wire native connectors:</strong> ChatGPT ↔ Microsoft, SharePoint, email. Context is everything — the more clean context, the better the output.</>,
                  'Define user tiers (basic vs. advanced consumers, like Microsoft licensing).',
                ]} />
              </Phase>
              <Phase n="4" title="User Enablement & Adoption">
                <Bullets items={[
                  'Launch AI office hours. Two to three weeks of sessions teaching prompting: "try this, come back to me." Review how they prompted, give better examples.',
                  <>Centralize support through office hours — <strong className="text-white font-semibold">not</strong> "I built my own GPT, can I call you?" ad-hoc calls that eat time.</>,
                  'Optional: monthly AI overview webinar (all-client). Good feedback loop, but it\'s a commitment.',
                ]} />
              </Phase>
              <Phase n="5" title={<>Ongoing Management <span className="text-sm font-bold text-cyan-300 tracking-wide">— the MRR</span></>}>
                <Bullets items={[
                  'Monitor token consumption against the org pool; alert at thresholds; decide reallocate vs. buy more.',
                  'Handle adds / moves / changes.',
                  '"Surface project opportunities: \'you\'ve got a taste — it can also do these things as a project.\'"',
                ]} />
              </Phase>
            </div>

            <H3>Decision gates &amp; forks</H3>
            <div className="my-6 space-y-0">
              <Gate fork="At this fork" question="Foundations + clean data present?" yesText="Proceed to platform selection." noText={<>Sell a data-cleanup project first <strong className="text-white font-semibold">(full stop)</strong>.</>} />
              <Gate fork="At this fork" question="Workload involves CUI / CMMC data?" yesText="Do not put it in AI — lean no at this stage." noText="Proceed under standard disclaimer." />
              <Gate fork="At this fork" question="Client buying AI through TCT?" yesText="Full managed services — we handle everything." noText="Help only on contract; ongoing maintenance is theirs." />
              <Gate fork="At this fork" question="Use case = everyday chat / employee enablement?" yesText="Standardize on ChatGPT." noText="Custom build / automation → Claude, AI Development project." />
              <Gate fork="At this fork" question="Client wants custom build now?" yesText="Scope as AI Development w/ release cycle & recurring fee." noText="Stay in managed services; revisit at next TBR." />
              <Gate fork="At this fork" question={'Client\'s only concern is "AI sees our data"?'} yesText="Educate (§5); if a true full-stop, consider local Spark / private cloud." noLabel="Otherwise" noText="Proceed — same risk model as Google / Microsoft for 20 yrs." />
            </div>
          </GradSection>

          {/* ══════════════════════════════════════════════════
              §4 — PLATFORM
          ══════════════════════════════════════════════════ */}
          <section id="platform" className="pt-20 scroll-mt-8">
            <SecHead n="04" kicker="Platform Selection">
              ChatGPT <span className="text-cyan-400">vs. Claude</span>
            </SecHead>

            <Lead>
              Two sides of the same coin. Part of every engagement is determining which platform fits the company and its goals — and the honest answer is <strong className="text-white font-bold">most businesses end up needing both.</strong>
            </Lead>

            <div className="rounded-xl overflow-hidden border border-white/10 my-6">
              <table className="w-full border-collapse text-[15px]">
                <thead>
                  <tr>
                    <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30 w-[18%]"></th>
                    <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-emerald-400 bg-cyan-400/10 border-b border-cyan-400/30">ChatGPT <span className="text-slate-400 font-medium normal-case">(OpenAI)</span></th>
                    <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-purple-300 bg-cyan-400/10 border-b border-cyan-400/30">Claude <span className="text-slate-400 font-medium normal-case">(Anthropic)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Best for', 'Everyday employee use, talking to AI with business context, custom GPTs & agents', 'Custom integrations, APIs, automations, development-grade work'],
                    ['Why', 'Easier interface, easier to use, ready for this kind of deployment today', 'Clearly the winner for build / integration projects'],
                    ['Maturity for rollout', 'Ready now — standardize here for managed services', 'Will likely be best out of the gate for chat once ready, but not yet'],
                    ['Partner / channel status', 'No public reseller program; provision & manage ChatGPT Business on client\'s behalf (~$25/user/mo, 2-seat minimum). Track OpenAI enterprise pathways.', 'Claude Partner Network live since March 2026 — free to join, partner portal + certifications + Services Track'],
                  ].map(([label, gpt, claude], i) => (
                    <tr key={i} className="border-b border-white/10 last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 font-semibold text-white border-r border-white/10 align-top">{label}</td>
                      <td className="px-5 py-4 text-slate-300 border-r border-white/10 align-top">{gpt}</td>
                      <td className="px-5 py-4 text-slate-300 align-top">{claude}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Callout label="The standardization call">
              <CalloutP>
                <strong className="text-white font-semibold">Managed services standard = ChatGPT.</strong> It's the only one truly ready for broad employee deployment right now. Reach for Claude on the development / integration side, where it's the clear winner.
              </CalloutP>
              <CalloutP quote>
                "ChatGPT can do things Claude can't, and vice versa" — which is exactly why TCT carries both.
              </CalloutP>
            </Callout>

            <Callout open label={<><span className="px-2 py-0.5 rounded-full bg-rose-400/16 text-rose-400 text-[10.5px] font-bold uppercase tracking-wide border border-rose-400/30">Cost reality</span> Internal — factor into pricing</>}>
              <CalloutP>
                Both tools are needed. Roughly <strong className="text-white font-semibold">$200–$350/mo per tool</strong> to operate at team tier.
              </CalloutP>
            </Callout>
          </section>

          {/* ══════════════════════════════════════════════════
              §5 — RISK
          ══════════════════════════════════════════════════ */}
          <section id="risk" className="pt-20 scroll-mt-8">
            <SecHead n="05" kicker="How to Talk About It">
              Security, Risk <span className="text-cyan-400">&amp; Compliance</span>
            </SecHead>

            <Lead>Lead from the truth, not from fear.</Lead>
            <Body>The competitor instinct is "security, security, secure the AI" — but the headline data-exfiltration fear is largely a false alarm, and <strong className="text-white font-semibold">saying so is a differentiator.</strong></Body>

            <H3>Myth #1 — "AI will leak our data to competitors"</H3>
            <Callout label={<span className="text-emerald-400">False alarm</span>}>
              <CalloutP>
                Data exfiltration through AI does not work the way people think. Putting TCT financials into a personal LLM <strong className="text-white font-semibold">does not</strong> let another company query the model for "TCT's financials." It never works that way.
              </CalloutP>
              <CalloutP>
                The most an LLM might absorb is generic patterns — not "this specific company does it this way." The narrow exception: public website content a model lists as a reference.
              </CalloutP>
            </Callout>

            <H3>Risk #2 — Employee offboarding</H3>
            <Callout warn label={<><AlertTriangle size={16} /> Real</>}>
              <CalloutP>
                If an employee keeps all their work and files inside a <strong className="text-white font-semibold">personal</strong> AI account and then leaves, that data walks out the door. <strong className="text-white font-semibold">Fix: corporate accounts, not personal.</strong>
              </CalloutP>
            </Callout>

            <H3>Risk #3 — Provider control &amp; future use</H3>
            <Callout label="Acknowledge, don't over-sell">
              <CalloutP>
                You have no control or visibility over what the provider does with inputs now or later (terms can change; the platform could be sold). This is the <strong className="text-white font-semibold">same bargain we've accepted with Google and Microsoft for 20 years</strong> — arguably higher with AI because it correlates more.
              </CalloutP>
              <CalloutP>
                There is nothing you, TCT, or anyone can do to change that. So name it plainly: <em>"No one knows exactly where your data may go. If that's a full-stop concern, you can't use cloud AI — and you'll fall behind those who accept the risk."</em> Make the risk known; let them choose.
              </CalloutP>
            </Callout>

            <H3>Forks on sensitivity</H3>
            <div className="my-6">
              <SinglePathGate fork="Sensitivity fork" question="Hard sensitivity concern" pathColor="#67E8F9" pathLabel="Path">
                Buy a Spark / build local (private cloud). Set expectations: fewer integrations, more limitations than cloud LLMs.
              </SinglePathGate>
              <SinglePathGate fork="Compliance fork" question="CUI / CMMC data" pathColor="#FB7185" pathLabel="Path">
                Lean no at this stage. Even though providers aren't training on your data, don't put CUI in. No firm answer yet — treat as out of scope.
              </SinglePathGate>
              <SinglePathGate fork="Everyone else" question="Standard engagement" pathColor="#34D399" pathLabel="Path">
                Provide the disclaimer, ring-fence training off, use corporate accounts, and proceed.
              </SinglePathGate>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              §6 — TOKENS  (gradient section)
          ══════════════════════════════════════════════════ */}
          <GradSection id="tokens">
            <SecHead n="06" kicker="The Hardest Part to Get Right">
              Token Economics <span className="text-cyan-400">&amp; Billing</span>
            </SecHead>

            <Lead>Governing token consumption is the single hardest part of ongoing management — and the most important to get right.</Lead>

            <Callout warn label={<><AlertTriangle size={16} /> The failure mode</>}>
              <CalloutP>
                Get it wrong and a client's bill jumps from <strong className="text-white font-semibold">~$4K to ~$12K/month</strong> — and they come to you furious.
              </CalloutP>
            </Callout>

            <H3>What a token is — the client explanation</H3>
            <Body>
              A token is a unit of measurement, <strong className="text-white font-semibold">like a utility</strong>. It rolls up energy, hardware, and overhead into one billable unit. Newer, more capable models cost more per token. Frame it like <strong className="text-white font-semibold">Azure consumption, not like Microsoft mailbox size</strong>: the variable to watch is consumption, not storage.
            </Body>

            <H3>Chat vs. API — the key distinction</H3>
            <div className="rounded-xl overflow-hidden border border-white/10 my-6">
              <table className="w-full border-collapse text-[15px]">
                <thead>
                  <tr>
                    <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30 w-1/4">Mode</th>
                    <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30">Token behavior</th>
                    <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30">Implication</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/10 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 font-semibold text-white border-r border-white/10 align-top">Business / Team chat</td>
                    <td className="px-5 py-4 text-slate-300 border-r border-white/10 align-top">Effectively unlimited; no per-token tracking</td>
                    <td className="px-5 py-4 text-slate-300 align-top"><span className="text-emerald-400 font-semibold">Safe</span> for broad employee enablement — predictable</td>
                  </tr>
                  <tr className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 font-semibold text-white border-r border-white/10 align-top">API / agents / custom builds</td>
                    <td className="px-5 py-4 text-slate-300 border-r border-white/10 align-top">Burns tokens fast; must be metered</td>
                    <td className="px-5 py-4 text-slate-300 align-top"><span className="text-rose-400 font-semibold">This is where runaway bills happen</span> — monitor closely</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <H3>The pool model</H3>
            <Bullets items={[
              <>The org buys a <strong className="text-white font-semibold">pool of tokens</strong>; you allocate per employee (tiered, like Microsoft — basic vs. advanced users).</>,
              <>Divvy <strong className="text-white font-semibold">~70–80%</strong> to employees; keep <strong className="text-white font-semibold">~20–30%</strong> in reserve as a buffer.</>,
              'When a heavy user nears their cap, alert → decide: grant from reserve (fine if reserve holds), reallocate from light users, or buy more.',
              <>Goal for the client: <strong className="text-white font-semibold">predictable billing.</strong></>,
            ]} />

            <Callout open label={<><span className="px-2 py-0.5 rounded-full bg-rose-400/16 text-rose-400 text-[10.5px] font-bold uppercase tracking-wide border border-rose-400/30">Open · 0%</span> Be honest internally</>}>
              <CalloutP>
                <strong className="text-white font-semibold">Monitoring is at 0%.</strong> There's no token-threshold monitoring system yet. Building a fragile homegrown monitor with hooks into client businesses is a bad idea.
              </CalloutP>
              <CalloutP>
                The right path is partner-channel multi-tenancy — Anthropic's Partner Network is live now; for OpenAI, manage ChatGPT Business directly while tracking their enterprise pathways — to get native consumption controls, the same way Microsoft licensing works, but with consumption.
              </CalloutP>
            </Callout>

            <H3>Packaging &amp; pricing</H3>
            <Bullets items={[
              <><strong className="text-white font-semibold">Seamless add-on:</strong> take existing quotes (Complete Care / Fortress) and add a per-user AI line item. <em>"You're paying $150/user — now it's $200 and includes AI services."</em> Make it easy to say yes.</>,
              <><strong className="text-white font-semibold">Reference data point (Integris / Kevin):</strong> cost ~$10/user, charging ~$50/user/mo. No stated minimum for them — but TCT clients have a lower barrier to entry, so watch the entry point.</>,
              <><strong className="text-white font-semibold">Margins look excellent</strong> because the MSP foundation is already in place; the AI layer rides on top.</>,
              <><strong className="text-white font-semibold">One-off projects:</strong> charge something, refine over time. Near-term these out-earn the recurring.</>,
            ]} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
              {[
                { n: '$150→$200', l: 'Per-user add-on framing' },
                { n: '~$10', l: 'Reference cost / user (Integris)' },
                { n: '70–30', l: 'Allocate / reserve token split' },
                { n: '0%', l: 'Monitoring built so far' },
              ].map((s) => (
                <div key={s.n} className="p-5 rounded-xl bg-white/[0.03] border border-white/10">
                  <div className="text-3xl font-black text-cyan-400 leading-none tracking-tight">{s.n}</div>
                  <div className="text-sm text-slate-400 mt-2 leading-snug">{s.l}</div>
                </div>
              ))}
            </div>
          </GradSection>

          {/* ══════════════════════════════════════════════════
              §7 — DISCOVERY
          ══════════════════════════════════════════════════ */}
          <section id="discovery" className="pt-20 scroll-mt-8">
            <SecHead n="07" kicker="Before Any AI Implementation">
              Discovery <span className="text-cyan-400">Questions</span>
            </SecHead>

            <Lead>Use these to determine the best delivery path — platform, tier, project vs. managed, and readiness.</Lead>
            <Body>Ask, then map each answer to the fork it informs.</Body>

            <div className="flex flex-col gap-3 my-6">
              <QRow theme="Profit Leak" question='"Where do you feel the business wastes the most time or money right now?"' tells="Targets the first automation / project" />
              <QRow theme="Manual Bottlenecks" question='"What are the top 2–3 things your team does manually that feel repetitive or outdated?"' tells="Low-hanging fruit for custom GPTs / agents" />
              <QRow theme="AI Awareness" question={"\"Have you experimented with any AI tools yet — and if so, what's working or frustrating you?\""} tells="Maturity → office-hours depth" />
              <QRow theme="Revenue Targets" question='"If you could add $10K/month without adding staff, where would it come from — more clients, higher ticket, or efficiency?"' tells="Frames the ROI pitch" />
              <QRow theme="Decision Power" question='"Who makes the final call on growth strategy or budget allocation?"' tells="Identifies the real buyer" />
              <QRow theme="Speed to Change" question='"When you see something that could improve profits, how fast do you typically move?"' tells="Sets rollout pace expectations" />
              <QRow theme="Tech Tolerance" question='"Does your team lean into new tools easily, or does adoption need more hand-holding?"' tells="Sizes the enablement / office-hours scope" />
              <QRow theme="Visibility & Reporting" question='"Do you have visibility into key metrics, or is it gut instinct and scattered reports?"' tells="Data-readiness signal" />
              <QRow theme="Risk vs. Reward" question='"Are you more focused on top-line revenue, protecting margins, or reducing dependency on human effort?"' tells="Tunes messaging emphasis" />
              <QRow theme="Future Vision" question='"If we met 12 months from now, what would make you call this year a success?"' tells="Anchors the roadmap & next TBR" />
            </div>

            <H3>TCT-specific readiness add-ons</H3>
            <Bullets items={[
              <><strong className="text-white font-semibold">Is your Microsoft environment set up and healthy?</strong> <em>(foundation gate)</em></>,
              <><strong className="text-white font-semibold">Where does your data live, and is it clean and connectable?</strong> <em>(data gate — full stop if no)</em></>,
              <><strong className="text-white font-semibold">Do you handle CUI / CMMC-regulated data?</strong> <em>(compliance fork)</em></>,
              <><strong className="text-white font-semibold">Will you buy AI through us, or do you already have / insist on your own?</strong> <em>(scope fork)</em></>,
            ]} />
          </section>

          {/* ══════════════════════════════════════════════════
              §8 — DEVELOPMENT
          ══════════════════════════════════════════════════ */}
          <section id="development" className="pt-20 scroll-mt-8">
            <SecHead n="08" kicker="Project Track & Release Discipline">
              AI <span className="text-cyan-400">Development</span>
            </SecHead>

            <Lead>Anything custom — GPTs, agents, integrations, automations, app builds — lives here, <strong className="text-white font-bold">not in the monthly fee.</strong></Lead>
            <Body>This is development work; treat it with development discipline so a single client can't consume you with live tweak requests.</Body>

            <H3>Guardrails</H3>
            <Bullets items={[
              <><strong className="text-white font-semibold">Every signature-ready quote states a development cycle.</strong> The product ships at, say, v1.2; new asks queue into the next release (1.3, 1.4).</>,
              <><strong className="text-white font-semibold">No live tweaking.</strong> Work flows development → test → production. AI makes this faster than traditional dev (you can speak tweaks into existence), so it needn't be rigid — but the guardrails protect your time.</>,
              <><strong className="text-white font-semibold">Communicate the roadmap like a game studio patch list:</strong> "here's what's in 1.3, here's what's on the PTR / dev list." Sets expectations and kills the "call you every other day" problem.</>,
              <><strong className="text-white font-semibold">Custom builds always carry a monthly recurring maintenance fee</strong> — never sell a custom product without it.</>,
            ]} />

            <H3>Project examples — fast, one-off mini-projects</H3>
            <Bullets items={[
              'Custom GPT for grant writing.',
              'Scheduled agent that performs a task automatically.',
              'Connector / automation into SharePoint, email, or a line-of-business app.',
              'Larger builds: replacing a single legacy app (e.g., an ERP-style solution) — potentially six-figure for bigger orgs, smaller for TCT\'s clients.',
            ]} />

            <DividerQuote src="Land the project · Attach the maintenance MRR">
              One-off projects out-earn recurring at first — they can be large. The recurring then compounds as "set-it-and-forget-it" SaaS margin.
            </DividerQuote>
          </section>

          {/* ══════════════════════════════════════════════════
              §9 — CASE STUDIES
          ══════════════════════════════════════════════════ */}
          <section id="cases" className="pt-20 scroll-mt-8">
            <SecHead n="09" kicker="To Be Authored">
              Examples <span className="text-cyan-400">&amp; Case Studies</span>
            </SecHead>

            <Callout open label={<><span className="px-2 py-0.5 rounded-full bg-rose-400/16 text-rose-400 text-[10.5px] font-bold uppercase tracking-wide border border-rose-400/30">Action item</span> No written case studies yet</>}>
              <CalloutP>
                These need to be authored. Below are the real, in-flight examples from the conversation to formalize into one-pagers — split into <strong className="text-white font-semibold">everyday-usage stories</strong> (to sell managed services) and <strong className="text-white font-semibold">app / project stories</strong> (to sell development).
              </CalloutP>
            </Callout>

            <H3>Everyday-usage case studies <span className="text-sm font-bold text-cyan-300 tracking-wide">— sell managed services</span></H3>
            <Bullets items={[
              <><strong className="text-white font-semibold">Custom GPT for grant writing</strong> — standard capability inside the LLM dashboard, fast to build.</>,
              <><strong className="text-white font-semibold">Scheduled agent performing a recurring task</strong> — demonstrates automation without a big project.</>,
              <><strong className="text-white font-semibold">Connector-driven context</strong> — ChatGPT referencing SharePoint / Microsoft data to answer business questions.</>,
            ]} />

            <H3>App / project case studies <span className="text-sm font-bold text-purple-300 tracking-wide">— sell development</span></H3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5">
              <ExCard status="On the horizon" title="AllSpec — AI-built / maintained ERP-style solution">
                Replacing a single legacy app; warrants the full development conversation. TCT's most concrete near-term AI project.
              </ExCard>
              <ExCard status="In flight" title="SmartSumai — Kurtis's property mgmt system">
                Product-grade build with a feedback / roadmap loop. NYC-market interest; a company in Italy ($5–10M real estate) likely to adopt.
              </ExCard>
              <ExCard status="Lesson baked in" title="EcoSpect">
                Value-realization follow-up: schedule a check-in after a project so clients feel the value. Baked into the TBR "check-in" slide.
              </ExCard>
              <ExCard status="Proof of concept" title="Mom's business">
                Learning ground / proof-of-concept. Framed explicitly as a case study, not a paid engagement.
              </ExCard>
            </div>

            <DividerQuote src="Positioning line that works">
              "AI is in its AOL stage — mind-blowing, evolving fast. We'll share our journey with you. We can do this for you right now, but you'd pay thousands; we don't want that. We're getting it to a consumable, easy-to-pitch stage — and you'll walk away knowing things you had no idea were possible."
            </DividerQuote>
          </section>

          {/* ══════════════════════════════════════════════════
              §10 — ACTION ITEMS  (gradient section)
          ══════════════════════════════════════════════════ */}
          <GradSection id="actions">
            <SecHead n="10" kicker="On the Books by End of June">
              Action Items to <span className="text-cyan-400">Operationalize</span>
            </SecHead>

            <Lead>Pulled from the meeting — what has to happen to make this real.</Lead>

            <div className="flex flex-col gap-3 my-6">
              {[
                <><strong className="text-white font-semibold">Investigate OpenAI's enterprise / partner pathways</strong> — note there is no public reseller program; plan to provision and manage ChatGPT Business directly (~$25/user/mo, 2-seat minimum). Verify any minimums before quoting.</>,
                <><strong className="text-white font-semibold">Apply to the Claude Partner Network</strong> (live since March 2026, free) to access the partner portal, certifications, and Services Track for multi-tenancy + predictable billing.</>,
                <><strong className="text-white font-semibold">Build the AI services and finalize pricing in Autotask</strong> — make it real, as per-user add-on line items.</>,
                <><strong className="text-white font-semibold">Author case studies</strong> (everyday-usage + app / project) for thought-leadership in TBRs.</>,
                <><strong className="text-white font-semibold">Design the token-monitoring approach</strong> — deprioritize homegrown; lean on partner-channel multi-tenancy (Anthropic Partner Network live; manage OpenAI Business directly).</>,
                <><strong className="text-white font-semibold">Define AI office-hours curriculum</strong> (2–3 weeks of prompting sessions) and decide on the monthly all-client AI webinar.</>,
                <><strong className="text-white font-semibold">Document the scope boundary</strong> (AMC included / custom integrations excluded) into the standard quote terms, including the development-cycle language.</>,
              ].map((item, i) => (
                <div key={i} className="flex gap-4 items-start p-4 rounded-xl bg-white/[0.03] border border-white/10">
                  <div className="flex-none w-5 h-5 rounded-md border-[1.5px] border-cyan-400/50 bg-cyan-400/[0.06] mt-0.5" />
                  <div className="text-[15.5px] leading-relaxed text-slate-200">{item}</div>
                </div>
              ))}
            </div>

            {/* End mark */}
            <div className="mt-24 pt-8 border-t border-white/10 flex items-center justify-between flex-wrap gap-4 pb-0">
              <div className="text-[13px] leading-relaxed text-slate-500">
                <strong className="text-slate-300">Source:</strong> Fathom recording "TBR / AI pitch generation," Kurtis Florance &amp; James King, June 4, 2026.
                <br />Internal working document — v1.0 · Go-to-market draft.
              </div>
              <Image src="/logo/tctlogo.webp" alt="Triple Cities Tech" width={80} height={21} className="h-[26px] w-auto opacity-75" />
            </div>
          </GradSection>

        </div>
      </div>
    </>
  )
}
