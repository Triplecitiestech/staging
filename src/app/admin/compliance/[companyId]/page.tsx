/**
 * /admin/compliance/[companyId] — Workflow landing.
 *
 * Shows progress through the linear onboard → ... → reassess flow.
 * The persistent step nav (rendered by the layout) is the primary
 * navigation surface; this page summarizes journey state and points
 * the operator at the next concrete action.
 */

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getWorkflowState } from '@/lib/compliance/workflow-state'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function ComplianceWorkflowLanding({ params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const steps = await getWorkflowState(companyId)
  const doneCount = steps.filter((s) => s.status === 'done').length
  const totalCount = steps.length
  const current = steps.find((s) => s.status === 'current') ?? steps[0]

  return (
    <div className="space-y-5">
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-cyan-400">Workflow progress</p>
        <div className="flex flex-wrap items-end gap-4 mt-1">
          <p className="text-3xl font-bold text-white">
            {doneCount} <span className="text-slate-500">/ {totalCount}</span>
          </p>
          <p className="text-sm text-slate-400">steps complete</p>
        </div>
        <div className="mt-3 h-1.5 w-full bg-slate-800/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
            style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }}
            aria-label={`${Math.round((doneCount / totalCount) * 100)}% complete`}
          />
        </div>
      </section>

      {/* Next action card */}
      {current && (
        <section className="bg-cyan-500/5 border border-cyan-500/30 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-cyan-300">Next action</p>
          <h2 className="text-xl font-semibold text-white mt-1">
            Step {current.number}: {current.title}
          </h2>
          <p className="text-sm text-slate-300 mt-1">{current.description}</p>
          {current.detail && (
            <p className="text-xs text-cyan-200/80 mt-1">{current.detail}</p>
          )}
          <Link
            href={current.href}
            className="inline-block mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
          >
            Go to {current.title} →
          </Link>
        </section>
      )}

      {/* Inline step summary (echoes the left nav for the landing context) */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
          The journey
        </h2>
        <ol className="space-y-2">
          {steps.map((s) => (
            <li
              key={s.key}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                s.status === 'done'
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : s.status === 'current'
                  ? 'bg-cyan-500/10 border-cyan-500/40'
                  : 'bg-slate-800/30 border-white/5'
              }`}
            >
              <div
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border ${
                  s.status === 'done'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                    : s.status === 'current'
                    ? 'bg-cyan-500/30 border-cyan-400/60 text-cyan-100'
                    : 'bg-slate-800/60 border-white/10 text-slate-400'
                }`}
              >
                {s.number}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-white">{s.title}</p>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      s.status === 'done'
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : s.status === 'current'
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'bg-slate-700/40 text-slate-400'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{s.description}</p>
                {s.detail && (
                  <p className="text-[11px] text-cyan-300/80 mt-0.5">{s.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
