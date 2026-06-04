'use client'

/**
 * AI Managed Services Playbook — page shell.
 * ─────────────────────────────────────────────────────────────────────────────
 * This file owns only the page CHROME: the dark canvas, the scroll progress bar,
 * the sticky scroll-spy sidebar, the mobile TOC, and the content layout. The
 * actual content lives in ./ai-playbook/sections/*.tsx, composed from the shared
 * building blocks in ./ai-playbook/primitives.tsx.
 *
 * ── How to add a section ──────────────────────────────────────────────────────
 *  1. Create ./ai-playbook/sections/MyThing.tsx. Default-export a component that
 *     renders either:
 *        <section id="my-id" className="pt-20 scroll-mt-8"> … </section>   (plain)
 *     or <GradSection id="my-id"> … </GradSection>   (soft ambient wash)
 *     Build the body from primitives: <SecHead>, <Lead>, <Body>, <Callout>,
 *     <Bullets>, <H3>/<H4>, <Phase>/<SubPhase>, <Gate>, tables, etc.
 *  2. Register it in ./ai-playbook/sections/index.tsx — add one line to SECTIONS
 *     with a matching `id`, the `num` badge, and the sidebar `label`. Order in
 *     that array = order on the page AND in the TOC.
 *  That's it — the sidebar, scroll-spy, and progress bar pick it up automatically.
 *
 *  To add drill-down detail to a phase, pass a `detail={…}` prop to <Phase>
 *  built from <SubPhase> blocks (see the docstring on Phase in primitives.tsx).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { SECTIONS } from './ai-playbook/sections'
import Masthead from './ai-playbook/sections/Masthead'

export default function AiManagedServicesPlaybook() {
  const [activeId, setActiveId] = useState(SECTIONS[0]?.id ?? '')
  const [scrollPct, setScrollPct] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveId(e.target.id) })
      },
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 }
    )
    SECTIONS.forEach(({ id }) => {
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
      {/* Page canvas — this playbook was designed for a uniform near-black surface.
          AdminShell paints a blue ambient gradient behind admin pages, which turns
          every dark block here into a hard-edged rectangle. This full-bleed dark
          layer covers that ambient (only while this page is mounted) so the masthead,
          section bands, and cards melt into the canvas the way the design intends. */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        aria-hidden
        style={{ background: 'radial-gradient(125% 90% at 50% -8%, #0b121c 0%, #07090e 55%, #050609 100%)' }}
      />

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
              {SECTIONS.map((item) => (
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

          <Masthead />

          {SECTIONS.map(({ id, Component }) => (
            <Component key={id} />
          ))}

        </div>
      </div>
    </>
  )
}
