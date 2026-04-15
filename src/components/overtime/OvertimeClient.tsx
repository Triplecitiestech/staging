'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import StatusBadge from './StatusBadge'
import type { OvertimeStatus } from '@/lib/overtime/types'

interface OvertimeRow {
  id: string
  workDate: string
  startTime: string | null
  estimatedHours: number
  reason: string
  status: OvertimeStatus
  reviewedByName: string | null
  reviewedAt: string | null
  payrollRecordedAt: string | null
  createdAt: string
}

export default function OvertimeClient({
  canApprove,
  canIntake,
}: {
  canApprove: boolean
  canIntake: boolean
}) {
  const [rows, setRows] = useState<OvertimeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

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
            <p className="text-slate-200 text-sm mt-1">Review pending overtime requests.</p>
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

      <section className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-5">
        <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wide mb-3">
          How overtime requests work
        </h2>
        <ol className="text-sm text-slate-200 space-y-2">
          <li><span className="text-cyan-400 font-semibold">Step 1 — Submit.</span> File the request <em>before</em> performing the overtime. Include date, time, hours, and reason.</li>
          <li><span className="text-cyan-400 font-semibold">Step 2 — HR intake.</span> Rio reviews and forwards to Kurtis with any context.</li>
          <li><span className="text-cyan-400 font-semibold">Step 3 — Final approval.</span> Kurtis approves or denies. You get an email with the decision.</li>
          <li><span className="text-cyan-400 font-semibold">Step 4 — Payroll.</span> After the work is complete, HR records the actual hours and includes them in payroll.</li>
        </ol>
        <p className="text-xs text-slate-500 mt-3">
          Late submissions are not honored unless explicitly approved.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Request overtime</h2>
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="px-4 py-2 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-400 transition-colors"
          >
            {formOpen ? 'Close form' : 'New request'}
          </button>
        </div>
        {formOpen && <NewOvertimeForm onSubmitted={() => { setFormOpen(false); load() }} />}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">My overtime requests</h2>
        <RequestsTable rows={rows} loading={loading} onChanged={load} />
      </section>
    </div>
  )
}

function NewOvertimeForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [workDate, setWorkDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [hours, setHours] = useState('2')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!workDate) return setError('Date is required')
    if (!reason.trim()) return setError('Reason is required')
    const hrs = Number.parseFloat(hours)
    if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) return setError('Hours must be 0–24')

    setSubmitting(true)
    try {
      const res = await fetch('/api/overtime/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workDate, startTime: startTime || undefined, estimatedHours: hrs, reason }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Submission failed')
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
      className="rounded-lg border border-white/10 bg-white/5 p-5 space-y-4"
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
            className="w-full rounded-md bg-slate-900 border border-cyan-500/30 text-white px-3 py-2 text-sm [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Start time (optional)</label>
          <input
            type="text"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="e.g. 5:00 PM"
            maxLength={50}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
          />
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
          Reason <span className="text-rose-400">*</span>
          <span className="text-slate-500 font-normal"> — required, brief summary of the work</span>
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
          {submitting ? 'Submitting…' : 'Submit overtime request'}
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
              <td className="px-4 py-3 text-slate-200">{r.startTime ?? '—'}</td>
              <td className="px-4 py-3 text-slate-200">{r.estimatedHours.toFixed(2)}</td>
              <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
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
