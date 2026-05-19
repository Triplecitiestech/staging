'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import StatusBadge from './StatusBadge'
import { OT_CATEGORIES, REACTIVE_REASONS, type OvertimeFlowType, type OvertimeStatus } from '@/lib/overtime/types'

interface OvertimeRow {
  id: string
  workDate: string
  startTime: string | null
  endTime: string | null
  estimatedHours: number
  reason: string
  status: OvertimeStatus
  flowType: OvertimeFlowType
  otCategory: string | null
  reactiveReason: string | null
  lateSubmission: boolean
  flagForCeoReview: boolean
  reviewedByName: string | null
  reviewedAt: string | null
  payrollRecordedAt: string | null
  createdAt: string
}

type FormMode = 'closed' | 'planned' | 'reactive'

export default function OvertimeClient({
  canApprove,
  canIntake,
}: {
  canApprove: boolean
  canIntake: boolean
}) {
  const [rows, setRows] = useState<OvertimeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [formMode, setFormMode] = useState<FormMode>('closed')

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const res = await fetch('/api/overtime/requests', { signal })
      const text = await res.text()
      if (!res.ok) {
        console.error('[overtime] list failed', text)
        setRows([])
        return
      }
      const data = text ? JSON.parse(text) : { requests: [] }
      setRows(data.requests ?? [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error('[overtime] list failed', err)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <div className="space-y-8">
      {(canApprove || canIntake) && (
        <section className="rounded-lg border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-violet-300 uppercase tracking-wide">HR access</h2>
            <p className="text-slate-200 text-sm mt-1">
              Review pending overtime requests and record reactive entries.
            </p>
          </div>
          <Link
            href="/admin/overtime/queue"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/20 whitespace-nowrap"
          >
            Open Overtime Queue
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </section>
      )}

      {/* Two-route explainer */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-5">
          <h2 className="text-sm font-semibold text-violet-300 uppercase tracking-wide mb-3">
            Planned overtime
          </h2>
          <p className="text-sm text-slate-200 mb-3">
            Scheduled work outside normal hours — project work, maintenance windows, training.
            Submit before you start.
          </p>
          <ol className="text-xs text-slate-300 space-y-1 list-decimal pl-4">
            <li>Submit form at least 30 minutes before start time.</li>
            <li>HR reviews and forwards to Kurtis.</li>
            <li>Kurtis approves or denies.</li>
            <li>Do the work; HR enters in payroll.</li>
          </ol>
        </div>
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-5">
          <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wide mb-3">
            Reactive overtime (already happened)
          </h2>
          <p className="text-sm text-slate-200 mb-3">
            Customer call ran past hours, after-hours emergency, on-call escalation. Log it
            within 24 hours and HR records it for payroll.
          </p>
          <ol className="text-xs text-slate-300 space-y-1 list-decimal pl-4">
            <li>Log start/end time, reason, and incident context.</li>
            <li>HR + Kurtis are notified (FYI).</li>
            <li>HR records for payroll — cannot be denied.</li>
          </ol>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Log overtime</h2>
            <p className="text-sm text-slate-400">Pick the route that matches your situation.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setFormMode(formMode === 'planned' ? 'closed' : 'planned')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                formMode === 'planned'
                  ? 'bg-violet-400 text-slate-950'
                  : 'bg-violet-500 text-white hover:bg-violet-400'
              }`}
            >
              Request planned OT
            </button>
            <button
              type="button"
              onClick={() => setFormMode(formMode === 'reactive' ? 'closed' : 'reactive')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                formMode === 'reactive'
                  ? 'bg-cyan-400 text-slate-950'
                  : 'bg-cyan-500 text-white hover:bg-cyan-400'
              }`}
            >
              Log OT that already happened
            </button>
          </div>
        </div>
        {formMode === 'planned' && (
          <div className="mt-5">
            <PlannedOvertimeForm onSubmitted={() => { setFormMode('closed'); load() }} />
          </div>
        )}
        {formMode === 'reactive' && (
          <div className="mt-5">
            <ReactiveOvertimeForm onSubmitted={() => { setFormMode('closed'); load() }} />
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">My overtime requests</h2>
        <RequestsTable rows={rows} loading={loading} onChanged={load} />
      </section>
    </div>
  )
}

function PlannedOvertimeForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [workDate, setWorkDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [hours, setHours] = useState('2')
  const [reason, setReason] = useState('')
  const [otCategory, setOtCategory] = useState<string>(OT_CATEGORIES[0])
  const [otCategoryOther, setOtCategoryOther] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!workDate) return setError('Date is required')
    if (!reason.trim()) return setError('Reason is required')
    if (otCategory === 'Other' && !otCategoryOther.trim()) {
      return setError('Please describe the "Other" category')
    }
    const hrs = Number.parseFloat(hours)
    if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) return setError('Hours must be 0–24')

    setSubmitting(true)
    try {
      const res = await fetch('/api/overtime/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flowType: 'APPROVAL',
          workDate,
          startTime: startTime || undefined,
          estimatedHours: hrs,
          reason,
          otCategory,
          otCategoryOther: otCategory === 'Other' ? otCategoryOther.trim() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message ?? data.error ?? 'Submission failed')
        setSubmitting(false)
        return
      }
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-5 space-y-4"
      style={{ colorScheme: 'dark' }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Date</label>
          <input
            type="date"
            required
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-violet-500/30 text-white px-3 py-2 text-sm [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Start time <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="e.g. 5:00 PM"
            maxLength={50}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
          />
          <p className="text-[10px] text-slate-500 mt-1">Must be ≥30 min in future.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Estimated hours</label>
          <input
            type="number"
            min="0.25"
            max="24"
            step="0.25"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          Category <span className="text-rose-400">*</span>
        </label>
        <select
          value={otCategory}
          onChange={(e) => setOtCategory(e.target.value)}
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
        >
          {OT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {otCategory === 'Other' && (
          <input
            type="text"
            value={otCategoryOther}
            onChange={(e) => setOtCategoryOther(e.target.value)}
            maxLength={120}
            placeholder="Describe the category"
            required
            className="w-full rounded-md bg-slate-900 border border-violet-500/30 text-white px-3 py-2 text-sm mt-2"
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          Reason <span className="text-rose-400">*</span>
        </label>
        <textarea
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="e.g. Need to migrate the customer's email server outside business hours to avoid downtime."
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
        />
      </div>

      {error && <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-400 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit planned OT'}
        </button>
      </div>
    </form>
  )
}

function ReactiveOvertimeForm({ onSubmitted }: { onSubmitted: () => void }) {
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const [workDate, setWorkDate] = useState(today)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [actualHours, setActualHours] = useState('1')
  const [reactiveReason, setReactiveReason] = useState<string>(REACTIVE_REASONS[0])
  const [reactiveReasonOther, setReactiveReasonOther] = useState('')
  const [incidentContext, setIncidentContext] = useState('')
  const [lateReason, setLateReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!workDate) return setError('Date is required')
    if (!startTime || !endTime) return setError('Start and end times are required — these are the times you actually worked')
    if (reactiveReason === 'Other' && !reactiveReasonOther.trim()) {
      return setError('Please describe the "Other" reason')
    }
    if (incidentContext.trim().length < 30) {
      return setError('Incident context must be at least 30 characters — describe the customer, what happened, and the outcome.')
    }
    const hrs = Number.parseFloat(actualHours)
    if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) return setError('Actual hours must be 0–24')

    setSubmitting(true)
    try {
      const res = await fetch('/api/overtime/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flowType: 'NOTIFICATION',
          workDate,
          startTime,
          endTime,
          actualHours: hrs,
          reactiveReason,
          reactiveReasonOther: reactiveReason === 'Other' ? reactiveReasonOther.trim() : undefined,
          incidentContext: incidentContext.trim(),
          lateReason: lateReason.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        // If the server says we need a late reason, prompt and resubmit
        if (data.error === 'late_reason_required') {
          setError(`This submission is more than 24 hours after the work ended. Please add a "Why submitted late" note below.`)
          setSubmitting(false)
          return
        }
        setError(data.message ?? data.error ?? 'Submission failed')
        setSubmitting(false)
        return
      }
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-4"
      style={{ colorScheme: 'dark' }}
    >
      <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
        <strong>Log the work that already happened.</strong> HR records it for payroll — no approval gate.
        Submit within 24 hours when possible.
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Date</label>
          <input
            type="date"
            required
            max={today}
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-cyan-500/30 text-white px-3 py-2 text-sm [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Start time</label>
          <input
            type="text"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="5:00 PM"
            maxLength={50}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">End time</label>
          <input
            type="text"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="6:30 PM"
            maxLength={50}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Actual hours</label>
          <input
            type="number"
            min="0.25"
            max="24"
            step="0.25"
            value={actualHours}
            onChange={(e) => setActualHours(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          Reason <span className="text-rose-400">*</span>
        </label>
        <select
          value={reactiveReason}
          onChange={(e) => setReactiveReason(e.target.value)}
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        >
          {REACTIVE_REASONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {reactiveReason === 'Other' && (
          <input
            type="text"
            value={reactiveReasonOther}
            onChange={(e) => setReactiveReasonOther(e.target.value)}
            maxLength={120}
            placeholder="Describe the reason"
            required
            className="w-full rounded-md bg-slate-900 border border-cyan-500/30 text-white px-3 py-2 text-sm mt-2"
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          Incident context <span className="text-rose-400">*</span>{' '}
          <span className="text-slate-500 font-normal">— what customer, what happened, what was the outcome (min 30 chars)</span>
        </label>
        <textarea
          required
          minLength={30}
          value={incidentContext}
          onChange={(e) => setIncidentContext(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="e.g. Acme Corp's email outage call started at 4:55 PM and went until 6:30 PM — resolved by failing over to the secondary MX. Customer was unable to send mail during that window."
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
        />
        <p className="text-[11px] text-slate-500 mt-1">{incidentContext.length}/30 minimum characters</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          Why submitted late?{' '}
          <span className="text-slate-500 font-normal">— required if over 24 hours after end time</span>
        </label>
        <input
          type="text"
          value={lateReason}
          onChange={(e) => setLateReason(e.target.value)}
          maxLength={1000}
          placeholder="(leave blank if submitting same-day)"
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
        />
      </div>

      {error && <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50"
        >
          {submitting ? 'Logging…' : 'Log reactive OT'}
        </button>
      </div>
    </form>
  )
}

function RequestsTable({
  rows,
  loading,
  onChanged,
}: {
  rows: OvertimeRow[]
  loading: boolean
  onChanged: () => void
}) {
  if (loading) return <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400 text-sm">Loading…</div>
  if (rows.length === 0)
    return <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400 text-sm">No overtime requests yet.</div>

  const cancel = async (id: string) => {
    if (!confirm('Cancel this overtime request?')) return
    const res = await fetch(`/api/overtime/requests/${id}/cancel`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Could not cancel')
      return
    }
    onChanged()
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-white/5 text-left">
          <tr>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Flow</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Time</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Hours</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3 text-white whitespace-nowrap">{r.workDate}</td>
              <td className="px-4 py-3 text-slate-400 text-xs uppercase tracking-wide">
                {r.flowType === 'NOTIFICATION' ? 'Reactive' : 'Planned'}
                {r.lateSubmission && <span className="text-rose-400 ml-1">late</span>}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {r.startTime ?? '—'}
                {r.endTime ? ` → ${r.endTime}` : ''}
              </td>
              <td className="px-4 py-3 text-slate-200">{r.estimatedHours.toFixed(2)}</td>
              <td className="px-4 py-3"><StatusBadge status={r.status} flowType={r.flowType} /></td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/overtime/${r.id}`} className="text-cyan-400 hover:text-cyan-300 text-xs font-medium mr-3">View</Link>
                {(r.status === 'PENDING_INTAKE' || r.status === 'PENDING_APPROVAL') && (
                  <button type="button" onClick={() => cancel(r.id)} className="text-rose-400 hover:text-rose-300 text-xs font-medium">Cancel</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
