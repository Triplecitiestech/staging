'use client'

/**
 * Policy list with click-to-expand content view.
 *
 * Each row is collapsed by default showing the title, source badge,
 * category, framework chips, and coverage counts. Clicking the row
 * (or its arrow) expands to reveal the full policy content + per-control
 * coverage detail.
 */

import { useState } from 'react'

interface FrameworkChip {
  id: string
  label: string
}

export interface PolicyDisplay {
  id: string
  title: string
  source: string
  category: string
  content: string
  frameworkChips: FrameworkChip[]
  analyzedAt: string | null
  covered: number
  partial: number
  missing: number
  coveredControls: string[]
  partialControls: string[]
  missingControls: string[]
  analysisText: string
  updatedAt: string
}

interface Props {
  policies: PolicyDisplay[]
}

export default function PolicyList({ policies }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (policies.length === 0) {
    return (
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-400">
          No policies in the library yet. Use the &quot;Open policy editor&quot;
          button above to upload, paste, or AI-generate the first policy.
        </p>
      </section>
    )
  }

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
        Policy library ({policies.length})
      </h3>
      <ul className="space-y-2">
        {policies.map((p) => {
          const isOpen = openId === p.id
          return (
            <li
              key={p.id}
              className="bg-slate-800/40 border border-white/5 rounded-lg overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : p.id)}
                className="w-full text-left p-3 hover:bg-slate-800/60 focus:bg-slate-800/60 focus:outline-none"
                aria-expanded={isOpen}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{p.title}</p>
                      <SourceBadge source={p.source} />
                      {p.category && (
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">
                          {p.category}
                        </span>
                      )}
                    </div>
                    {p.frameworkChips.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.frameworkChips.map((c) => (
                          <span
                            key={c.id}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-200"
                          >
                            {c.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                      {(p.covered + p.partial + p.missing) > 0 ? (
                        <>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            {p.covered} covered
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                            {p.partial} partial
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30">
                            {p.missing} missing
                          </span>
                          {p.analyzedAt && (
                            <span className="text-slate-500">
                              Analyzed {new Date(p.analyzedAt).toLocaleDateString()}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-500">
                          Not yet analyzed against framework controls
                        </span>
                      )}
                    </div>
                  </div>
                  <Chevron open={isOpen} />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-white/5 p-4 space-y-4 bg-slate-950/40">
                  {p.analysisText && (
                    <section>
                      <h4 className="text-[11px] uppercase tracking-wider text-cyan-300 mb-1">
                        Analysis summary
                      </h4>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap">{p.analysisText}</p>
                    </section>
                  )}

                  <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ControlSetPanel label="Covered"  controls={p.coveredControls} tone="emerald" />
                    <ControlSetPanel label="Partial"  controls={p.partialControls} tone="cyan" />
                    <ControlSetPanel label="Missing"  controls={p.missingControls} tone="rose" />
                  </section>

                  <section>
                    <h4 className="text-[11px] uppercase tracking-wider text-slate-300 mb-1">
                      Policy content
                    </h4>
                    <div className="bg-slate-900 border border-white/10 rounded-lg p-3 max-h-96 overflow-y-auto">
                      <pre className="text-xs text-slate-200 whitespace-pre-wrap font-sans">
                        {p.content || '(no content recorded)'}
                      </pre>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Last updated {new Date(p.updatedAt).toLocaleString()}
                    </p>
                  </section>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function SourceBadge({ source }: { source: string }) {
  const tone = source === 'generated' ? 'violet' : source === 'sharepoint' ? 'cyan' : 'slate'
  const cls =
    tone === 'violet' ? 'bg-violet-500/10 text-violet-300 border-violet-500/30' :
    tone === 'cyan'   ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' :
                        'bg-slate-700/40 text-slate-300 border-white/10'
  return (
    <span className={`shrink-0 text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 border ${cls}`}>
      {source}
    </span>
  )
}

function ControlSetPanel({ label, controls, tone }: { label: string; controls: string[]; tone: 'emerald' | 'cyan' | 'rose' }) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-200' :
    tone === 'cyan'    ? 'bg-cyan-500/5 border-cyan-500/20 text-cyan-200' :
                         'bg-rose-500/5 border-rose-500/20 text-rose-200'
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label} ({controls.length})</p>
      {controls.length === 0 ? (
        <p className="text-[11px] opacity-60 mt-1">—</p>
      ) : (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {controls.slice(0, 18).map((c) => (
            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/60 border border-white/10 text-slate-200">
              {c}
            </span>
          ))}
          {controls.length > 18 && (
            <span className="text-[10px] px-1.5 py-0.5 text-slate-400">
              +{controls.length - 18} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`shrink-0 w-4 h-4 mt-1 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
