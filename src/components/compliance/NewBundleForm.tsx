'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
}

export default function NewBundleForm({ companyId }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [customerFacingNotes, setCustomerFacingNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/compliance/${companyId}/bundles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          customerFacingNotes: customerFacingNotes.trim() || null,
          internalNotes: internalNotes.trim() || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `Create failed (${res.status})`)
        return
      }
      const id = body?.data?.id ?? body?.id
      if (!id) {
        setError('Server did not return a bundle id.')
        return
      }
      router.push(`/admin/compliance/${companyId}/changes/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-slate-900/50 border border-white/10 rounded-xl p-5 space-y-4">
      <div>
        <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">
          Bundle title (internal)
        </label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "Q2 2026 Security Updates"'
          className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
        />
      </div>
      <div>
        <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">
          Customer-facing intro (optional)
        </label>
        <textarea
          value={customerFacingNotes}
          onChange={(e) => setCustomerFacingNotes(e.target.value)}
          rows={3}
          placeholder="A friendly paragraph that opens the bundle report. Leave blank to use the default."
          className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
        />
        <p className="text-[11px] text-slate-500 mt-1">
          Appears at the top of the customer-facing report. Default is a generic
          "we identified N changes" line.
        </p>
      </div>
      <div>
        <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">
          Internal notes (staff only)
        </label>
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={2}
          className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        />
      </div>

      {error && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create bundle →'}
        </button>
      </div>
    </form>
  )
}
