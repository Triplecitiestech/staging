'use client'

/**
 * Inline deployed/not-deployed toggle for one (companyId, toolId) row.
 *
 * Writes to the existing POST /api/compliance/registry/company-tools
 * endpoint, which upserts the compliance_company_tools row. The assessment
 * engine reads from that table and treats `deployed=false` as "tool is
 * intentionally not in use at this customer" → controls that lean on
 * that tool resolve to not_applicable instead of collection_failed.
 *
 * Optimistic UI: flips immediately on click and rolls back if the POST
 * fails. router.refresh() at the end so any other counters on the page
 * (verified connector count, etc.) re-render against the new state.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
  toolId: string
  deployed: boolean
}

export default function CompanyToolToggle({ companyId, toolId, deployed }: Props) {
  const router = useRouter()
  const [local, setLocal] = useState(deployed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function flip() {
    const next = !local
    setLocal(next)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/compliance/registry/company-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, toolId, deployed: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body?.error === 'string' ? body.error : `save failed (${res.status})`)
        setLocal(!next) // rollback
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error')
      setLocal(!next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {error && (
        <span className="text-[10px] text-rose-300" title={error}>
          save failed
        </span>
      )}
      <button
        type="button"
        onClick={flip}
        disabled={saving}
        aria-pressed={local}
        aria-label={`${local ? 'Deployed' : 'Not deployed'} — click to toggle`}
        className={`relative inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border text-[10px] uppercase tracking-wider transition-colors disabled:opacity-60 ${
          local
            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/25'
            : 'bg-slate-700/40 border-white/10 text-slate-300 hover:bg-slate-700/60'
        }`}
      >
        <span
          className={`inline-block w-4 h-4 rounded-full transition-colors ${
            local ? 'bg-emerald-400' : 'bg-slate-500'
          }`}
        />
        {local ? 'Deployed' : 'Not deployed'}
      </button>
    </div>
  )
}
