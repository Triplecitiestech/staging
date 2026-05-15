'use client'

/**
 * Framework picker + Run button for the Run Assessment workflow step.
 *
 * Two-call API: POST /api/compliance creates the assessment row,
 * POST /api/compliance/assessments/[id] runs the evaluator. Same
 * pattern the legacy dashboard's RunAssessmentButton already uses;
 * this just adds the framework selector inline so the operator picks
 * before clicking Run.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface FrameworkOption {
  id: string
  label: string
  /** True if the customer ticked this framework in their profile. */
  fromProfile: boolean
}

interface Props {
  companyId: string
  options: FrameworkOption[]
  defaultFrameworkId: string
}

export default function AssessRunPanel({ companyId, options, defaultFrameworkId }: Props) {
  const router = useRouter()
  const [frameworkId, setFrameworkId] = useState(defaultFrameworkId)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusLine, setStatusLine] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    setStatusLine('Creating assessment…')
    try {
      const createRes = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, frameworkId }),
      })
      const createBody = await createRes.json().catch(() => ({}))
      if (!createRes.ok) {
        setError(typeof createBody?.error === 'string' ? createBody.error : `Create failed (${createRes.status})`)
        return
      }
      const assessmentId = createBody?.data?.id ?? createBody?.assessmentId ?? createBody?.id
      if (!assessmentId) {
        setError('Server did not return an assessment id.')
        return
      }
      setStatusLine('Collecting evidence + evaluating controls…')
      const runRes = await fetch(`/api/compliance/assessments/${assessmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const runBody = await runRes.json().catch(() => ({}))
      if (!runRes.ok) {
        setError(typeof runBody?.error === 'string' ? runBody.error : `Run failed (${runRes.status})`)
        return
      }
      setStatusLine('Done — refreshing…')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setRunning(false)
      // Clear the inline status after a beat so it doesn't linger on idle.
      setTimeout(() => setStatusLine(null), 1500)
    }
  }

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5 space-y-3">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Run a new assessment
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Pick a framework and click Run. The engine collects evidence from
            every verified connector, evaluates each control, and writes
            findings you can disposition in the next step.
          </p>
        </div>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="text-xs uppercase tracking-wider text-slate-400 sm:w-32 shrink-0">
          Framework
        </label>
        <select
          value={frameworkId}
          onChange={(e) => setFrameworkId(e.target.value)}
          disabled={running}
          className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}{o.fromProfile ? ' (in profile)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50 whitespace-nowrap"
        >
          {running ? 'Running…' : 'Run assessment'}
        </button>
      </div>

      {statusLine && (
        <p className="text-xs text-cyan-300/80">{statusLine}</p>
      )}
      {error && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </section>
  )
}
