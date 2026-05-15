/**
 * Placeholder body for compliance workflow steps whose UI hasn't shipped
 * yet (slice 1 only builds onboard / profile / connect). Renders a
 * "lands in a later slice" panel with the step title, description, and
 * whatever current-state count we have, so the navigation flow doesn't
 * hit dead 404s in the meantime.
 */

import Link from 'next/link'
import type { WorkflowStep } from '@/lib/compliance/workflow-state'

interface Props {
  step: WorkflowStep
  prev?: WorkflowStep
  next?: WorkflowStep
  /** Optional inline body — e.g. a count summary the page already has. */
  children?: React.ReactNode
}

export default function StepStub({ step, prev, next, children }: Props) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-cyan-400">Step {step.number}</p>
        <h2 className="text-2xl font-bold text-white">{step.title}</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">{step.description}</p>
      </header>

      <section className="bg-cyan-500/5 border border-cyan-500/30 rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-cyan-300">Coming in a later slice</p>
        <p className="text-sm text-slate-300 mt-1">
          The in-flow UI for this step is part of the next workflow rebuild
          slice. The underlying backend already works — use the legacy
          dashboard if you need to act on this step right now.
        </p>
        <Link
          href="/admin/compliance"
          className="inline-block mt-3 text-xs text-cyan-300 hover:text-cyan-200 underline"
        >
          Open legacy compliance dashboard →
        </Link>
        {step.detail && (
          <p className="text-xs text-cyan-200/80 mt-3">Current state: {step.detail}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        {prev ? (
          <Link href={prev.href} className="text-xs text-slate-400 hover:text-cyan-300">
            ← Back to {prev.title}
          </Link>
        ) : <span />}
        {next && (
          <Link
            href={next.href}
            className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
          >
            Next: {next.title} →
          </Link>
        )}
      </div>
    </div>
  )
}
