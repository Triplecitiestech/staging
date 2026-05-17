'use client'

/**
 * PolicyResyncButton — re-pulls a SharePoint-imported policy's source
 * bytes + extracted text from the customer's tenant without making the
 * operator delete + re-import.
 *
 * Only meaningful when the policy has a stored sourcePointer (set at
 * import time for SharePoint-sourced rows). For pasted / generated
 * policies and pre-feature legacy rows, the button is hidden — those
 * have no pointer to re-pull from.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
  policyId: string
  /** Whether the row has a sourcePointer. Hides the button when false. */
  enabled: boolean
}

export default function PolicyResyncButton({ companyId, policyId, enabled }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!enabled) return null

  async function resync() {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(
        `/api/compliance/${companyId}/policies/${policyId}/refetch-source`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `Re-sync failed (${res.status})`)
        return
      }
      const bytes = typeof body?.byteSize === 'number' ? `${(body.byteSize / 1024).toFixed(0)} KB` : 'updated'
      setSuccess(`✓ Re-synced from SharePoint (${bytes}). Re-analyze to refresh the AI mapping.`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={resync}
        disabled={busy}
        title="Pull the latest bytes from SharePoint and re-extract text. Useful when the source policy has been edited since import."
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 hover:bg-slate-800/80 disabled:opacity-50"
      >
        {busy ? 'Re-syncing…' : 'Re-sync from SharePoint'}
      </button>
      {success && <span className="text-[11px] text-emerald-300">{success}</span>}
      {error && <span className="text-[11px] text-rose-300">{error}</span>}
    </div>
  )
}
