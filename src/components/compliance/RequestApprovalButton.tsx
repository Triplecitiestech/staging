'use client'

/**
 * RequestApprovalButton — staff action that emails the customer's
 * HR / PoC a magic-link to review + approve a policy.
 *
 * Sits next to PublishPolicyButton on each policy row's expanded
 * panel. Two distinct verbs:
 *
 *   Publish to customer SharePoint  — operator vouches for the
 *                                     customer (checkbox in modal).
 *   Request customer approval       — customer reviews in their
 *                                     browser, decides themselves
 *                                     (this component).
 *
 * Modal collects the recipient email + optional note. On success,
 * shows the magic link inline so the operator can copy it manually
 * if the email bounces or hasn't arrived yet.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
  policyId: string
  policyTitle: string
}

type Phase = 'idle' | 'reviewing' | 'sending' | 'done' | 'error'

export default function RequestApprovalButton({ companyId, policyId, policyTitle }: Props) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [recipient, setRecipient] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    reviewUrl: string
    expiresAt: string
    emailWarning: string | null
  } | null>(null)

  function open() {
    setPhase('reviewing')
    setError(null)
    setResult(null)
  }
  function reset() {
    setPhase('idle')
    setError(null)
  }

  async function send() {
    if (!recipient.trim()) {
      setError('Recipient email is required.')
      return
    }
    setPhase('sending')
    setError(null)
    try {
      const res = await fetch(`/api/compliance/${companyId}/policies/${policyId}/request-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: recipient.trim(), requesterNote: note.trim() || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `Send failed (${res.status})`)
        setPhase('error')
        return
      }
      setResult({
        reviewUrl: body.data.reviewUrl,
        expiresAt: body.data.expiresAt,
        emailWarning: body.data.emailWarning ?? null,
      })
      setPhase('done')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setPhase('error')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/25"
      >
        Request customer approval
      </button>

      {(phase === 'reviewing' || phase === 'sending' || phase === 'error' || phase === 'done') && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && phase !== 'sending') reset() }}
        >
          <div className="bg-slate-900 border border-white/10 rounded-xl max-w-xl w-full p-5 space-y-4">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-cyan-300">Customer approval</p>
                <h3 className="text-lg font-bold text-white mt-1 truncate">{policyTitle}</h3>
              </div>
              <button
                type="button"
                onClick={reset}
                disabled={phase === 'sending'}
                className="text-slate-400 hover:text-white text-xl leading-none disabled:opacity-40"
                aria-label="Close"
              >
                ×
              </button>
            </header>

            {phase !== 'done' && (
              <>
                <section className="space-y-2">
                  <label className="block text-[11px] text-slate-400 uppercase tracking-wider">
                    Recipient email
                  </label>
                  <input
                    type="email"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="hr@customer.com"
                    disabled={phase === 'sending'}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <p className="text-[11px] text-slate-500">
                    The customer&apos;s HR contact, designated PoC, or whoever signs off on policy.
                  </p>
                </section>

                <section className="space-y-2">
                  <label className="block text-[11px] text-slate-400 uppercase tracking-wider">
                    Note to recipient (optional)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Optional context — e.g. &quot;Updated for the new device-disposal vendor we onboarded last month.&quot;"
                    disabled={phase === 'sending'}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </section>

                {error && (
                  <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">{error}</p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={reset}
                    disabled={phase === 'sending'}
                    className="px-3 py-2 text-xs rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 hover:bg-slate-800/80 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={send}
                    disabled={phase === 'sending' || !recipient.trim()}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
                  >
                    {phase === 'sending' ? 'Sending…' : 'Send approval request'}
                  </button>
                </div>
              </>
            )}

            {phase === 'done' && result && (
              <section className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-emerald-200">✓ Approval request sent</p>
                {result.emailWarning ? (
                  <p className="text-xs text-cyan-200/80">
                    Note: {result.emailWarning} You can paste the link below to the customer directly.
                  </p>
                ) : (
                  <p className="text-xs text-emerald-100/90">
                    Email queued to {recipient}. They&apos;ll get a magic link to review + approve.
                  </p>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Review link (copy if needed)</p>
                  <input
                    type="text"
                    value={result.reviewUrl}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-slate-300 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Expires {new Date(result.expiresAt).toLocaleDateString()}</p>
                </div>
                <div className="flex justify-end">
                  <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-200 underline">
                    Close
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  )
}
