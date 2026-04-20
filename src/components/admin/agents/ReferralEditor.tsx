'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const STATUSES = [
  'SUBMITTED', 'CONTACTED', 'PROPOSAL_SENT', 'SIGNED',
  'MONTH_1_PAID', 'MONTH_2_PAID', 'COMMISSION_DUE', 'COMMISSION_PAID',
  'LOST', 'NOT_A_FIT',
] as const

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted', CONTACTED: 'Contacted', PROPOSAL_SENT: 'Proposal Sent',
  SIGNED: 'Signed', MONTH_1_PAID: 'Month 1 Paid', MONTH_2_PAID: 'Month 2 Paid',
  COMMISSION_DUE: 'Commission Due', COMMISSION_PAID: 'Commission Paid',
  LOST: 'Lost', NOT_A_FIT: 'Not a Fit',
}

interface InitialState {
  status: string
  contractMonthlyValue: string
  commissionDueDate: string
  commissionPaidDate: string
  internalAdminNotes: string
}

export default function ReferralEditor({ referralId, initial }: { referralId: string; initial: InitialState }) {
  const router = useRouter()
  const [form, setForm] = useState<InitialState>(initial)
  const [statusNote, setStatusNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const set = <K extends keyof InitialState>(k: K, v: InitialState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const body: Record<string, unknown> = {
        status: form.status,
        contractMonthlyValue: form.contractMonthlyValue,
        commissionDueDate: form.commissionDueDate || null,
        commissionPaidDate: form.commissionPaidDate || null,
        internalAdminNotes: form.internalAdminNotes,
      }
      if (statusNote.trim() && form.status !== initial.status) body.statusNote = statusNote.trim()
      const res = await fetch(`/api/admin/sales-referrals/${referralId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Update failed.')
        setSaving(false)
        return
      }
      setSavedAt(new Date())
      setStatusNote('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 space-y-5">
      <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider">Edit referral</h2>
      {error && <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-300">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Status">
          <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Contract monthly value (USD)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.contractMonthlyValue}
            onChange={e => set('contractMonthlyValue', e.target.value)}
            className={inputCls}
            placeholder="e.g. 3500.00"
          />
        </Field>
      </div>

      {form.status !== initial.status && (
        <Field label="Note for this status change (optional)">
          <input
            type="text"
            value={statusNote}
            onChange={e => setStatusNote(e.target.value)}
            className={inputCls}
            placeholder="e.g. Reached out by email; awaiting reply"
          />
        </Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Commission due date">
          <input
            type="date"
            value={form.commissionDueDate}
            onChange={e => set('commissionDueDate', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Commission paid date">
          <input
            type="date"
            value={form.commissionPaidDate}
            onChange={e => set('commissionPaidDate', e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Internal admin notes (not visible to the agent)">
        <textarea
          rows={4}
          value={form.internalAdminNotes}
          onChange={e => set('internalAdminNotes', e.target.value)}
          className={inputCls}
          placeholder="Internal context, deal notes, scoping details — agents will never see this."
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        {savedAt && <span className="text-xs text-emerald-300">Saved {savedAt.toLocaleTimeString()}</span>}
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg disabled:opacity-50 font-medium"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

const inputCls = 'w-full px-3 py-2 bg-slate-900/50 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-200 mb-2">{label}</label>
      {children}
    </div>
  )
}
