'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  agentName: string
}

export default function AgreementSignForm({ agentName }: Props) {
  const router = useRouter()
  const [signedName, setSignedName] = useState('')
  const [accept, setAccept] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!signedName.trim() || signedName.trim().length < 2) {
      setError('Please type your full legal name.')
      return
    }
    if (!accept) {
      setError('You must check the box to accept the agreement.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/agent-portal/agreement/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedName: signedName.trim(), accept: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not record your signature.')
        setSubmitting(false)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="text-xs uppercase tracking-wider text-slate-400">Sign Agreement</div>
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-300">{error}</div>
      )}
      <div>
        <label className="block text-sm text-slate-300 mb-1">Type your full legal name as an electronic signature</label>
        <input
          type="text"
          value={signedName}
          onChange={e => setSignedName(e.target.value)}
          placeholder={agentName}
          disabled={submitting}
          maxLength={200}
          className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-white text-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          style={{ fontFamily: 'cursive' }}
          autoComplete="off"
        />
        <p className="text-xs text-slate-500 mt-1">Your account is registered to {agentName}.</p>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-200 cursor-pointer">
        <input
          type="checkbox"
          checked={accept}
          onChange={e => setAccept(e.target.checked)}
          disabled={submitting}
          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
        />
        <span>
          I have read and agree to the terms of this Referral Agent Agreement. I understand that typing my
          name above and submitting this form constitutes my legally binding electronic signature.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !signedName.trim() || !accept}
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium shadow-lg shadow-cyan-500/20 disabled:opacity-50"
        >
          {submitting ? 'Signing…' : 'Sign agreement'}
        </button>
        <span className="text-xs text-slate-500">Once signed, you can download a printable copy.</span>
      </div>
    </form>
  )
}
