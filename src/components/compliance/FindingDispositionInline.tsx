'use client'

/**
 * FindingDispositionInline — just the disposition form body, no row
 * chrome. Mounted lazily by DispositionToggleButton when the operator
 * actually opens the disposition panel for a finding. Posts to the
 * same /api/compliance/[companyId]/dispositions endpoint as the
 * legacy FindingDispositionRow.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DispositionFields {
  lifecycleStatus: string | null
  assignedTo: string | null
  dueDate: string | null
  acceptedRiskRationale: string | null
  customerImpactSummary: string | null
  internalNotes: string | null
}

interface Props {
  companyId: string
  frameworkId: string
  controlId: string
  disposition: DispositionFields
}

const LIFECYCLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'accepted_risk', label: 'Accepted risk' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'customer_declined', label: 'Customer declined' },
  { value: 'billable_project', label: 'Billable project' },
  { value: 'superseded', label: 'Superseded' },
]

export default function FindingDispositionInline(props: Props) {
  const router = useRouter()
  const [lifecycleStatus, setLifecycleStatus] = useState(props.disposition.lifecycleStatus ?? 'open')
  const [assignedTo, setAssignedTo] = useState(props.disposition.assignedTo ?? '')
  const [dueDate, setDueDate] = useState(props.disposition.dueDate?.slice(0, 10) ?? '')
  const [acceptedRiskRationale, setAcceptedRiskRationale] = useState(props.disposition.acceptedRiskRationale ?? '')
  const [customerImpactSummary, setCustomerImpactSummary] = useState(props.disposition.customerImpactSummary ?? '')
  const [internalNotes, setInternalNotes] = useState(props.disposition.internalNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const requiresRationale = lifecycleStatus === 'accepted_risk'

  async function save() {
    if (requiresRationale && !acceptedRiskRationale.trim()) {
      setError('Accepted-risk rationale is required when status is accepted_risk.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/compliance/${props.companyId}/dispositions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameworkId: props.frameworkId,
          controlId: props.controlId,
          lifecycleStatus,
          assignedTo: assignedTo || null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          acceptedRiskRationale: acceptedRiskRationale || null,
          customerImpactSummary: customerImpactSummary || null,
          internalNotes: internalNotes || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `Save failed (${res.status})`)
      } else {
        setSavedAt(Date.now())
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-slate-900/60 border border-violet-500/20 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Lifecycle status">
          <select
            value={lifecycleStatus}
            onChange={(e) => setLifecycleStatus(e.target.value)}
            className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            {LIFECYCLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Assigned to">
          <input
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="staff email or id"
            className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
          />
        </Field>
        <Field label="Due date">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
        </Field>
        <Field label="Customer impact (used in bundle report)">
          <textarea
            value={customerImpactSummary}
            onChange={(e) => setCustomerImpactSummary(e.target.value)}
            rows={2}
            className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
        </Field>
        {requiresRationale && (
          <Field label="Accepted-risk rationale" className="sm:col-span-2">
            <textarea
              value={acceptedRiskRationale}
              onChange={(e) => setAcceptedRiskRationale(e.target.value)}
              rows={2}
              className="w-full bg-slate-900/50 border border-rose-500/30 rounded-lg px-3 py-2 text-sm text-white"
            />
          </Field>
        )}
        <Field label="Internal notes (staff only)" className="sm:col-span-2">
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
        </Field>
      </div>

      {error && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {savedAt && Date.now() - savedAt < 5000 && (
          <span className="text-xs text-emerald-300">Saved.</span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-2 text-xs font-medium rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-200 hover:bg-violet-500/30 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save disposition'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, className, children }: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  )
}
