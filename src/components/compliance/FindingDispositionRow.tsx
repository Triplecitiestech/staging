'use client'

/**
 * FindingDispositionRow — collapsed row for a single finding with inline
 * disposition editing.
 *
 * Used by /admin/compliance/[companyId]/findings. Server fetches the row
 * data; this component renders it and exposes an "Edit disposition" toggle
 * that opens an inline form which POSTs to
 * /api/compliance/[companyId]/dispositions.
 */

import { useState } from 'react'

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
  title: string
  findingStatus: string
  effectiveStatus: string
  confidence: string
  reasoning: string
  remediation: string | null
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

export default function FindingDispositionRow(props: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Form state — initialized from props but editable.
  const [lifecycleStatus, setLifecycleStatus] = useState(props.disposition.lifecycleStatus ?? 'open')
  const [assignedTo, setAssignedTo] = useState(props.disposition.assignedTo ?? '')
  const [dueDate, setDueDate] = useState(props.disposition.dueDate?.slice(0, 10) ?? '')
  const [acceptedRiskRationale, setAcceptedRiskRationale] = useState(props.disposition.acceptedRiskRationale ?? '')
  const [customerImpactSummary, setCustomerImpactSummary] = useState(props.disposition.customerImpactSummary ?? '')
  const [internalNotes, setInternalNotes] = useState(props.disposition.internalNotes ?? '')

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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSaving(false)
    }
  }

  const statusTone =
    props.effectiveStatus === 'pass' ? 'emerald' :
    props.effectiveStatus === 'fail' ? 'rose' :
    props.effectiveStatus === 'not_applicable' ? 'slate' :
    'cyan'

  return (
    <li className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40"
      >
        <span className={`shrink-0 text-[10px] uppercase tracking-wider rounded px-2 py-1 border ${
          statusTone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
          statusTone === 'rose' ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' :
          statusTone === 'slate' ? 'bg-slate-700/40 text-slate-300 border-white/10' :
          'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
        }`}>
          {props.effectiveStatus}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">
            {props.controlId} <span className="text-slate-400 font-normal">— {props.title}</span>
          </p>
          <p className="text-xs text-slate-500 truncate">
            confidence: {props.confidence}
            {props.disposition.lifecycleStatus && (
              <span className="ml-2 text-violet-300">· {props.disposition.lifecycleStatus.replace(/_/g, ' ')}</span>
            )}
            {props.disposition.dueDate && (
              <span className="ml-2 text-slate-400">· due {props.disposition.dueDate.slice(0, 10)}</span>
            )}
          </p>
        </div>
        <span className="text-slate-500 text-sm shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 p-4 space-y-4">
          {/* Reasoning + remediation */}
          {props.reasoning && (
            <details className="text-xs text-slate-300">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                Reasoning
              </summary>
              <p className="mt-2 whitespace-pre-line">{props.reasoning}</p>
            </details>
          )}
          {props.remediation && (
            <details className="text-xs text-slate-300">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                Suggested remediation
              </summary>
              <p className="mt-2 whitespace-pre-line">{props.remediation}</p>
            </details>
          )}

          {/* Disposition editor */}
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
            <Field label="Customer impact summary" hint="Plain-English text rendered into the customer-facing bundle">
              <textarea
                value={customerImpactSummary}
                onChange={(e) => setCustomerImpactSummary(e.target.value)}
                rows={2}
                className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </Field>
            {requiresRationale && (
              <Field label="Accepted-risk rationale" hint="Required for accepted_risk status" className="sm:col-span-2">
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
              className="px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save disposition'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function Field({ label, hint, className, children }: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}
