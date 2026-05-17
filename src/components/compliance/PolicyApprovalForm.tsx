'use client'

/**
 * Customer-facing approve/reject form for a single policy. Rendered
 * inside the magic-link review page at /portal/policy-approval/[token].
 *
 * Submits to /api/portal/policy-approval/[token]/decide. On success,
 * shows a thank-you state inline — no redirect, the customer can
 * close the tab.
 */

import { useState } from 'react'

interface Props {
  token: string
  policyTitle: string
}

type Phase = 'idle' | 'submitting' | 'done' | 'error'

export default function PolicyApprovalForm({ token, policyTitle }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)

  async function submit(d: 'approved' | 'rejected') {
    if (d === 'rejected' && notes.trim().length === 0) {
      setError('Please leave a short note so TCT knows what to revise.')
      setDecision(d)
      return
    }
    setDecision(d)
    setPhase('submitting')
    setError(null)
    try {
      const res = await fetch(`/api/portal/policy-approval/${token}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: d, decisionNotes: notes.trim() || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `Submit failed (${res.status})`)
        setPhase('error')
        return
      }
      setDoneMessage(
        d === 'approved'
          ? `Thanks — your approval for "${policyTitle}" was recorded. TCT can now publish it to your SharePoint or other storage.`
          : `Thanks — your feedback on "${policyTitle}" was recorded. TCT will revise it and send you a new approval request.`
      )
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setPhase('error')
    }
  }

  if (phase === 'done') {
    return (
      <section className={`rounded-xl border p-5 ${
        decision === 'approved'
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
      }`}>
        <p className="text-base font-semibold">{decision === 'approved' ? '✓ Approval recorded' : '✓ Feedback recorded'}</p>
        <p className="text-sm mt-1">{doneMessage}</p>
        <p className="text-xs mt-3 opacity-70">You can close this tab.</p>
      </section>
    )
  }

  return (
    <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5 space-y-4">
      <header>
        <h2 className="text-base font-semibold text-white">Your decision</h2>
        <p className="text-xs text-slate-400 mt-1">
          Approve to allow TCT to publish this policy to your SharePoint or other storage.
          Reject (with notes) to ask TCT to revise it.
        </p>
      </header>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">
          Notes <span className="text-slate-500 normal-case">(required when rejecting)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Optional context for TCT — e.g. 'Approved as-is' or 'Please clarify section 3 about device disposal'."
          disabled={phase === 'submitting'}
          className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        />
      </div>

      {error && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => submit('rejected')}
          disabled={phase === 'submitting'}
          className="px-4 py-2 text-sm rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
        >
          {phase === 'submitting' && decision === 'rejected' ? 'Submitting…' : 'Reject & send notes'}
        </button>
        <button
          type="button"
          onClick={() => submit('approved')}
          disabled={phase === 'submitting'}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {phase === 'submitting' && decision === 'approved' ? 'Submitting…' : 'Approve'}
        </button>
      </div>
    </section>
  )
}
