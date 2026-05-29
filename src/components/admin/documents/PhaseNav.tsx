'use client'

import { useEffect, useState } from 'react'

export interface PhaseStep {
  id: string
  node: string
  label: string
  sub: string
}

/**
 * Sticky phase-pipeline stepper for the Secure Boot playbook. Scroll-spies the
 * active phase via IntersectionObserver and smooth-scrolls on click.
 */
export default function PhaseNav({ steps }: { steps: PhaseStep[] }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const targets = steps
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el))

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = steps.findIndex((s) => s.id === entry.target.id)
            if (idx >= 0) setActive(idx)
          }
        })
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
    )

    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [steps])

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav
      aria-label="Phase pipeline"
      className="sticky top-0 z-40 border-y border-cyan-400/30 bg-black/80 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-0 overflow-x-auto px-4 py-4 sm:px-6 lg:px-8">
        {steps.map((step, i) => {
          const isActive = i === active
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => go(step.id)}
              className="relative min-w-[110px] flex-1 px-1 text-center"
            >
              <div
                className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full text-lg font-black transition-all ${
                  isActive
                    ? 'border-2 border-cyan-300 bg-gradient-to-r from-cyan-400 to-cyan-600 text-[#04222a] shadow-lg shadow-cyan-500/40'
                    : 'border-2 border-slate-600 bg-slate-800 text-slate-400'
                }`}
              >
                {step.node}
              </div>
              <div
                className={`text-sm font-bold transition-colors ${
                  isActive ? 'text-white' : 'text-slate-400'
                }`}
              >
                {step.label}
              </div>
              <div className="text-xs text-slate-600">{step.sub}</div>
              {i < steps.length - 1 && (
                <div
                  className={`absolute top-[21px] left-[calc(50%+28px)] hidden h-0.5 w-[calc(100%-56px)] sm:block ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500 to-slate-700'
                      : 'bg-slate-700'
                  }`}
                />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
