'use client'

/**
 * RemediateButton — primary action on a failing/partial finding.
 *
 * Two-step UI per operator preference (selected via AskUserQuestion):
 *   1. Click "Remediate" → POSTs with confirm=false → preview modal opens
 *      showing what the action will do, preconditions, blast radius.
 *   2. Click "Confirm + apply" → POSTs with confirm=true → executor runs
 *      against the customer's M365 tenant (or fires the manual workflow).
 *
 * No bundle / customer-approval round-trip — this is the MSP-applied
 * fast path for routine config remediations. Bundles are still
 * available on the Changes step for change types that need customer
 * sign-off.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface RemediateAction {
  id: string
  name: string
  /** 'full' (the action satisfies this control on its own) or 'partial'. */
  coverage: 'full' | 'partial'
}

interface Props {
  companyId: string
  frameworkId: string
  controlId: string
  findingId: string
  /** Actions from the catalog that satisfy this control. Sorted full-first. */
  actions: RemediateAction[]
}

interface PreviewEntity {
  type: string
  id: string
  name?: string
}

interface PreviewPrecondition {
  status: 'pass' | 'fail' | 'unknown'
  message: string
}

interface PreviewData {
  action: {
    id: string
    name: string
    impact: {
      userFacing: string
      blastRadius: string
      estimatedDisruptionMinutes: number
      sessionDisruptive: boolean
      requiresEndUserAction: boolean
    }
    executorKind: 'automated' | 'manual'
    executorHandler: string | null
  }
  preview: {
    totalAffected: number
    affectedEntities?: PreviewEntity[]
    summary?: string
    isLiveQuery: boolean
    warnings?: string[]
    preconditions?: {
      allPass: boolean
      anyHardFail: boolean
      results: PreviewPrecondition[]
    }
  }
  hasRealPreviewer: boolean
}

type Phase = 'idle' | 'previewing' | 'reviewing' | 'applying' | 'done' | 'error'

export default function RemediateButton({ companyId, frameworkId, controlId, findingId, actions }: Props) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [actionId, setActionId] = useState(actions[0]?.id ?? '')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [appliedSummary, setAppliedSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (actions.length === 0) {
    return (
      <span className="text-[11px] text-slate-500 italic">
        No automated remediation available
      </span>
    )
  }

  async function openPreview() {
    setPhase('previewing')
    setError(null)
    setPreview(null)
    try {
      const res = await fetch(`/api/compliance/${companyId}/findings/remediate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, frameworkId, controlId, findingId, confirm: false }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `preview failed (${res.status})`)
        setPhase('error')
        return
      }
      setPreview(body.data as PreviewData)
      setPhase('reviewing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error')
      setPhase('error')
    }
  }

  async function apply() {
    setPhase('applying')
    setError(null)
    try {
      const res = await fetch(`/api/compliance/${companyId}/findings/remediate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, frameworkId, controlId, findingId, confirm: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `apply failed (${res.status})`)
        setPhase('error')
        return
      }
      const summary = body?.data?.executor?.summary ?? 'Remediation submitted'
      setAppliedSummary(typeof summary === 'string' ? summary : 'Remediation submitted')
      setPhase('done')
      // Refresh the page so the finding re-renders against the new
      // pending-change state. The actual finding status doesn't change
      // until the verification worker runs.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error')
      setPhase('error')
    }
  }

  function reset() {
    setPhase('idle')
    setPreview(null)
    setError(null)
    setAppliedSummary(null)
  }

  // ----- DONE state — shown inline, no modal needed -----
  if (phase === 'done') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-200">
          ✓ Submitted
        </span>
        <span className="text-[11px] text-slate-400 truncate max-w-md">{appliedSummary}</span>
        <button
          type="button"
          onClick={reset}
          className="text-[11px] text-slate-500 hover:text-slate-300 underline"
        >
          dismiss
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {actions.length > 1 && (
          <select
            value={actionId}
            onChange={(e) => setActionId(e.target.value)}
            disabled={phase !== 'idle' && phase !== 'error'}
            className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white max-w-xs"
          >
            {actions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.coverage === 'partial' ? ' (partial)' : ''}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={openPreview}
          disabled={phase === 'previewing' || phase === 'reviewing' || phase === 'applying'}
          className="px-3 py-1 text-xs font-medium rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {phase === 'previewing' ? 'Previewing…' : 'Remediate'}
        </button>
        {error && phase === 'error' && (
          <span className="text-[11px] text-rose-300 max-w-md">{error}</span>
        )}
      </div>

      {/* Preview / confirm modal — stays mounted during apply so the
          operator sees the spinner without the modal flashing away. */}
      {(phase === 'reviewing' || phase === 'applying') && preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && phase !== 'applying') reset() }}
        >
          <div className="bg-slate-900 border border-white/10 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 space-y-4">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-cyan-400">Remediate · preview</p>
                <h3 className="text-lg font-bold text-white mt-1">{preview.action.name}</h3>
                {/* Surface the originating control so the operator sees
                    WHY this action is being suggested. Without this the
                    customer-impact text reads as generic — the operator
                    has to mentally map the action back to the finding. */}
                <p className="text-xs text-slate-400 mt-1">
                  Suggested for{' '}
                  <span className="text-cyan-300 font-mono">{frameworkId}</span>{' '}
                  control{' '}
                  <span className="text-cyan-300 font-mono">{controlId}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="text-slate-400 hover:text-white text-xl leading-none flex-shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <section className="bg-slate-800/40 border border-white/5 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                Customer impact
              </p>
              <p className="text-sm text-slate-200">{preview.action.impact.userFacing}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-400">
                <span>Blast radius: <span className="text-slate-200">{preview.action.impact.blastRadius.replace(/_/g, ' ')}</span></span>
                <span>Disruption: <span className="text-slate-200">~{preview.action.impact.estimatedDisruptionMinutes} min</span></span>
                {preview.action.impact.sessionDisruptive && (
                  <span className="text-rose-300">may interrupt active sessions</span>
                )}
                {preview.action.impact.requiresEndUserAction && (
                  <span className="text-violet-300">end users must take action</span>
                )}
              </div>
            </section>

            <section className="bg-slate-800/40 border border-white/5 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                Affects {preview.preview.totalAffected} entit{preview.preview.totalAffected === 1 ? 'y' : 'ies'}
                {!preview.preview.isLiveQuery && ' (estimated — no live previewer for this action)'}
              </p>
              {preview.preview.summary && (
                <p className="text-xs text-slate-300">{preview.preview.summary}</p>
              )}
              {preview.preview.affectedEntities && preview.preview.affectedEntities.length > 0 && (
                <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {preview.preview.affectedEntities.slice(0, 30).map((e, i) => (
                    <li key={`${e.id}-${i}`} className="text-[11px] text-slate-400 font-mono">
                      {e.type}: {e.name ?? e.id}
                    </li>
                  ))}
                  {preview.preview.affectedEntities.length > 30 && (
                    <li className="text-[11px] text-slate-500">
                      … and {preview.preview.affectedEntities.length - 30} more
                    </li>
                  )}
                </ul>
              )}
            </section>

            {preview.preview.preconditions && (
              <section className="bg-slate-800/40 border border-white/5 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                  Preconditions {preview.preview.preconditions.anyHardFail ? '— FAILED' : preview.preview.preconditions.allPass ? '— all pass' : '— some unknown'}
                </p>
                <ul className="space-y-1">
                  {preview.preview.preconditions.results.map((p, i) => (
                    <li key={i} className="text-xs flex items-start gap-2">
                      <span className={
                        p.status === 'pass'    ? 'text-emerald-300' :
                        p.status === 'fail'    ? 'text-rose-300' :
                                                 'text-slate-400'
                      }>
                        {p.status === 'pass' ? '✓' : p.status === 'fail' ? '✗' : '?'}
                      </span>
                      <span className="text-slate-300">{p.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {preview.preview.warnings && preview.preview.warnings.length > 0 && (
              <section className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-cyan-300 mb-1">Warnings</p>
                <ul className="space-y-1 text-xs text-cyan-100/80 list-disc list-inside">
                  {preview.preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </section>
            )}

            {!preview.hasRealPreviewer && preview.action.executorKind === 'automated' && (
              <p className="text-[11px] text-slate-500 italic">
                Note: the live previewer for this action hasn&apos;t been wired
                yet, so the affected-entity list is a placeholder. The
                executor itself runs (stubbed in some cases — see audit
                log after apply).
              </p>
            )}

            {error && (
              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={reset}
                disabled={phase === 'applying'}
                className="px-3 py-2 text-xs rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 hover:bg-slate-800/80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={phase === 'applying' || (preview.preview.preconditions?.anyHardFail ?? false)}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
              >
                {phase === 'applying' ? 'Applying…' : 'Confirm + apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
