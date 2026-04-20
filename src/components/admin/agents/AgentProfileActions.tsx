'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  agentId: string
  isActive: boolean
  hasPassword: boolean
}

export default function AgentProfileActions({ agentId, isActive, hasPassword }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const callPatch = async (body: Record<string, unknown>, label: string) => {
    setBusy(label); setError(null); setInfo(null)
    try {
      const res = await fetch(`/api/admin/sales-agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Update failed.')
      } else {
        router.refresh()
      }
    } finally {
      setBusy(null)
    }
  }

  const resendWelcome = async () => {
    setBusy('resend'); setError(null); setInfo(null)
    try {
      const res = await fetch(`/api/admin/sales-agents/${agentId}/resend-welcome`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not resend welcome email.')
      } else {
        setInfo('Welcome email resent. The new link expires in 48 hours and the agent\'s previous password (if any) was reset.')
        router.refresh()
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <button
          onClick={resendWelcome}
          disabled={busy !== null}
          className="px-3 py-1.5 text-sm bg-slate-700/60 hover:bg-slate-700 border border-white/10 text-white rounded-lg disabled:opacity-50"
          title="Generates a fresh 48-hour password-set link and emails the agent"
        >
          {busy === 'resend' ? 'Sending…' : hasPassword ? 'Reset password & resend' : 'Resend welcome email'}
        </button>
        {isActive ? (
          <button
            onClick={() => callPatch({ isActive: false }, 'deactivate')}
            disabled={busy !== null}
            className="px-3 py-1.5 text-sm bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 rounded-lg disabled:opacity-50"
          >
            {busy === 'deactivate' ? 'Disabling…' : 'Disable account'}
          </button>
        ) : (
          <button
            onClick={() => callPatch({ isActive: true }, 'activate')}
            disabled={busy !== null}
            className="px-3 py-1.5 text-sm bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 rounded-lg disabled:opacity-50"
          >
            {busy === 'activate' ? 'Enabling…' : 'Enable account'}
          </button>
        )}
      </div>
      {error && <div className="px-3 py-1.5 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded">{error}</div>}
      {info && <div className="px-3 py-1.5 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded max-w-md text-right">{info}</div>}
    </div>
  )
}
