/**
 * Persistent workflow step nav. Rendered by the
 * /admin/compliance/[companyId] layout, visible on every step page.
 *
 * Each step shows: number badge, title, short description, status icon,
 * and an optional detail line (e.g. "16 of 24 required answers
 * complete"). Locked steps are non-clickable; the current and done
 * steps link to their page.
 *
 * Desktop: left column. Mobile: collapses to a horizontal scrollable
 * strip at the top of the page (handled by the parent layout's
 * flex direction).
 */

import Link from 'next/link'
import type { WorkflowStep } from '@/lib/compliance/workflow-state'

interface Props {
  steps: WorkflowStep[]
  currentKey?: WorkflowStep['key']
}

export default function WorkflowNav({ steps, currentKey }: Props) {
  return (
    <nav aria-label="Compliance workflow steps" className="space-y-1.5">
      {steps.map((s) => {
        const isCurrent = s.key === currentKey || (!currentKey && s.status === 'current')
        const linkable = s.status !== 'locked'

        const inner = (
          <div
            className={`flex items-start gap-3 rounded-lg border p-2.5 transition-colors ${
              isCurrent
                ? 'bg-cyan-500/10 border-cyan-500/40'
                : s.status === 'done'
                ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
                : linkable
                ? 'bg-slate-800/30 border-white/5 hover:bg-slate-800/60'
                : 'bg-slate-900/30 border-white/5 opacity-60'
            }`}
          >
            <StepBadge step={s} isCurrent={isCurrent} />
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium truncate ${
                  isCurrent ? 'text-cyan-100' : s.status === 'done' ? 'text-emerald-100' : 'text-white'
                }`}
              >
                {s.title}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{s.description}</p>
              {s.detail && (
                <p className="text-[10px] text-cyan-300/80 mt-0.5 truncate">{s.detail}</p>
              )}
            </div>
          </div>
        )

        return linkable ? (
          <Link key={s.key} href={s.href} className="block focus:outline-none focus:ring-1 focus:ring-cyan-500/50 rounded-lg">
            {inner}
          </Link>
        ) : (
          <div key={s.key} aria-disabled className="cursor-not-allowed">
            {inner}
          </div>
        )
      })}
    </nav>
  )
}

function StepBadge({ step, isCurrent }: { step: WorkflowStep; isCurrent: boolean }) {
  const base = 'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border'
  if (step.status === 'done') {
    return (
      <div className={`${base} bg-emerald-500/20 border-emerald-500/40 text-emerald-200`} aria-label="Step complete">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden="true">
          <path d="M3 8l3.5 3.5L13 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }
  if (isCurrent) {
    return <div className={`${base} bg-cyan-500/30 border-cyan-400/60 text-cyan-100`}>{step.number}</div>
  }
  if (step.status === 'locked') {
    return <div className={`${base} bg-slate-800/60 border-white/10 text-slate-500`}>{step.number}</div>
  }
  return <div className={`${base} bg-slate-700/40 border-white/10 text-slate-300`}>{step.number}</div>
}
