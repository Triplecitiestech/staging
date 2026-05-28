'use client'

/**
 * CfoAccordion — the categorized, expandable status-list used across the
 * CFO dashboard. Mirrors the compliance findings list: each row is a
 * status badge + optional rank/id + label + right-aligned value + an
 * indicator dot + expand chevron; expanding reveals secondary detail
 * metrics. Optional grouping renders a slate header bar per group (the
 * "1.x — family" bar in the compliance UI).
 *
 * Presentational only — callers map their domain data into rows.
 */

import { useState } from 'react'

export type Tone = 'emerald' | 'cyan' | 'rose' | 'red' | 'violet' | 'blue' | 'slate'

const TONE_BADGE: Record<Tone, string> = {
  emerald: 'bg-emerald-500/20 text-emerald-300',
  cyan: 'bg-cyan-500/20 text-cyan-300',
  rose: 'bg-rose-500/20 text-rose-300',
  red: 'bg-red-500/20 text-red-300',
  violet: 'bg-violet-500/20 text-violet-300',
  blue: 'bg-blue-500/20 text-blue-300',
  slate: 'bg-slate-500/20 text-slate-400',
}
const TONE_DOT: Record<Tone, string> = {
  emerald: 'bg-emerald-400',
  cyan: 'bg-cyan-400',
  rose: 'bg-rose-400',
  red: 'bg-red-500',
  violet: 'bg-violet-400',
  blue: 'bg-blue-400',
  slate: 'bg-slate-500',
}
const TONE_TEXT: Record<Tone, string> = {
  emerald: 'text-emerald-300',
  cyan: 'text-cyan-300',
  rose: 'text-rose-300',
  red: 'text-red-300',
  violet: 'text-violet-300',
  blue: 'text-blue-300',
  slate: 'text-slate-400',
}
const TONE_BAR: Record<Tone, string> = {
  emerald: 'bg-emerald-400/70',
  cyan: 'bg-cyan-400/70',
  rose: 'bg-rose-400/70',
  red: 'bg-red-500/70',
  violet: 'bg-violet-400/70',
  blue: 'bg-blue-400/70',
  slate: 'bg-slate-400/70',
}

export interface AccordionDetail {
  label: string
  value: string
  tone?: Tone
}

export interface AccordionRow {
  /** Stable key + expand identity. */
  id: string
  /** Left-most status pill (YES / PARTIAL / weekly / +12% …). */
  badge?: { label: string; tone: Tone }
  /** Optional mono identifier shown before the label (rank, code). */
  rank?: string
  label: string
  /** Muted secondary text on the same line as the label. */
  sublabel?: string
  /** Right-aligned primary value (usually a dollar amount). */
  value?: string
  valueTone?: Tone
  /** Indicator dot before the chevron. */
  dot?: Tone
  /** Thin progress bar under the label (for share-of-total rows). */
  bar?: { pct: number; tone?: Tone }
  /** Key/value metrics revealed on expand. */
  details: AccordionDetail[]
}

export interface AccordionGroup {
  key: string
  heading?: string
  rows: AccordionRow[]
}

interface Props {
  rows?: AccordionRow[]
  groups?: AccordionGroup[]
  empty?: string
}

export default function CfoAccordion({ rows, groups, empty = 'Nothing to show.' }: Props) {
  const resolved: AccordionGroup[] = groups ?? (rows ? [{ key: '_', rows }] : [])
  const total = resolved.reduce((n, g) => n + g.rows.length, 0)

  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (total === 0) {
    return (
      <div className="rounded-lg border border-white/5 bg-slate-900/30 p-6 text-center">
        <p className="text-sm text-slate-400">{empty}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {resolved.map((group) => (
        <section key={group.key} className="overflow-hidden rounded-lg border border-white/5">
          {group.heading && (
            <header className="border-b border-white/5 bg-slate-900/50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-300">{group.heading}</h3>
            </header>
          )}
          <ul className="divide-y divide-white/5">
            {group.rows.map((row) => {
              const isOpen = open.has(row.id)
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => toggle(row.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {row.badge && (
                        <span
                          className={`inline-flex w-16 flex-shrink-0 items-center justify-center rounded py-0.5 text-xs font-bold ${TONE_BADGE[row.badge.tone]}`}
                        >
                          {row.badge.label}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          {row.rank && (
                            <span className="flex-shrink-0 font-mono text-sm text-white">{row.rank}</span>
                          )}
                          <span className="truncate text-sm text-slate-200" title={row.label}>
                            {row.label}
                          </span>
                          {row.sublabel && (
                            <span className="flex-shrink-0 text-xs text-slate-500">{row.sublabel}</span>
                          )}
                        </div>
                        {row.bar && (
                          <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/5">
                            <div
                              className={`h-1.5 rounded-full ${TONE_BAR[row.bar.tone ?? 'cyan']}`}
                              style={{ width: `${Math.min(100, Math.max(0, row.bar.pct))}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2.5">
                      {row.value && (
                        <span
                          className={`whitespace-nowrap text-sm font-semibold ${row.valueTone ? TONE_TEXT[row.valueTone] : 'text-slate-200'}`}
                        >
                          {row.value}
                        </span>
                      )}
                      {row.dot && <span className={`h-2 w-2 rounded-full ${TONE_DOT[row.dot]}`} />}
                      <span className="w-3 text-center text-slate-500">{isOpen ? '−' : '+'}</span>
                    </div>
                  </button>

                  {isOpen && row.details.length > 0 && (
                    <div className="bg-slate-900/20 px-4 pb-4 pt-1">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                        {row.details.map((det) => (
                          <div key={det.label}>
                            <dt className="text-[10px] uppercase tracking-wider text-slate-500">{det.label}</dt>
                            <dd className={`text-sm ${det.tone ? TONE_TEXT[det.tone] : 'text-slate-200'}`}>
                              {det.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
