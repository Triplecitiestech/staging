'use client'

/**
 * RunAssessmentButton — creates + runs a fresh assessment for one
 * (company, framework). Two-step API: POST /api/compliance to create,
 * then POST /api/compliance/assessments/[id] to run.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
  frameworkId: string
  label: string
  small?: boolean
}

export default function RunAssessmentButton({ companyId, frameworkId, label, small }: Props) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    try {
      // 1. Create
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
      const assessmentId = createBody?.data?.id ?? createBody?.id
      if (!assessmentId) {
        setError('Server did not return an assessment id.')
        return
      }
      // 2. Run
      const runRes = await fetch(`/api/compliance/assessments/${assessmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const runBody = await runRes.json().catch(() => ({}))
      if (!runRes.ok) {
        setError(typeof runBody?.error === 'string' ? runBody.error : `Run failed (${runRes.status})`)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setRunning(false)
    }
  }

  const sizeCls = small ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className={`${sizeCls} font-medium rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 whitespace-nowrap`}
      >
        {running ? 'Running…' : label}
      </button>
      {error && (
        <p className="text-[10px] text-rose-300 max-w-xs text-right">{error}</p>
      )}
    </div>
  )
}
