'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PTO_KIND_LABELS, type PtoKind, type PtoStatus } from '@/lib/pto/types'
import StatusBadge from './StatusBadge'

interface RequestSummary {
  id: string
  employeeStaffId: string
  employeeName: string
  employeeEmail: string
  kind: PtoKind
  startDate: string
  endDate: string
  totalHours: number
  notes: string | null
  coverage: string | null
  status: PtoStatus
  intakeByName: string | null
  intakeAt: string | null
  intakeSkipped: boolean
  reviewedAt: string | null
  reviewedByName: string | null
  managerNotes: string | null
  createdAt: string
  gustoRecordedAt: string | null
  graphSyncStatus: string | null
}

export default function PtoClient({
  canApprove,
  canIntake,
}: {
  canApprove: boolean
  canIntake: boolean
}) {
  const [requests, setRequests] = useState<RequestSummary[]>([])
  const [reqLoading, setReqLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  const loadRequests = useCallback(async (signal?: AbortSignal) => {
    setReqLoading(true)
    try {
      const res = await fetch('/api/pto/requests', { signal })
      const text = await res.text()
      if (!res.ok) {
        console.error('[pto] requests fetch failed:', res.status, text)
        setRequests([])
        return
      }
      const data = text ? JSON.parse(text) : { requests: [] }
      setRequests(data.requests ?? [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error('[pto] failed to load requests', err)
      setRequests([])
    } finally {
      setReqLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadRequests(controller.signal)
    return () => controller.abort()
  }, [loadRequests])

  return (
    <div className="space-y-8">
      {/* How it works explainer */}
      <section className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-5">
        <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wide mb-2">
          How PTO requests work
        </h2>
        <ol className="text-sm text-slate-200 space-y-1.5">
          <li><span className="text-cyan-400 font-semibold">1.</span> You submit your request below.</li>
          <li><span className="text-cyan-400 font-semibold">2.</span> HR (Rio) collects context — balance, history, coverage — and forwards to Kurtis.</li>
          <li><span className="text-cyan-400 font-semibold">3.</span> Kurtis approves or denies.</li>
          <li><span className="text-cyan-400 font-semibold">4.</span> If approved, the shared calendar is updated and you get a calendar invite.</li>
        </ol>
        {(canApprove || canIntake) && (
          <p className="mt-3 text-xs text-slate-400">
            You have HR access.{' '}
            <Link href="/admin/pto/queue" className="text-cyan-400 hover:text-cyan-300 font-medium">
              Open the approval queue →
            </Link>
          </p>
        )}
      </section>

      {/* New request */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Request time off</h2>
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 transition-colors"
          >
            {formOpen ? 'Close form' : 'New request'}
          </button>
        </div>
        {formOpen && (
          <NewRequestForm
            onSubmitted={() => {
              setFormOpen(false)
              loadRequests()
            }}
          />
        )}
      </section>

      {/* Requests history */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">My requests</h2>
        <RequestsTable
          requests={requests}
          loading={reqLoading}
          onCancelled={() => {
            loadRequests()
          }}
        />
      </section>
    </div>
  )
}

function NewRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [kind, setKind] = useState<PtoKind>('VACATION')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [partial, setPartial] = useState(false)
  const [partialHours, setPartialHours] = useState('4')
  const [notes, setNotes] = useState('')
  const [coverage, setCoverage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!startDate || !endDate) {
      setError('Start and end dates are required')
      return
    }
    setSubmitting(true)
    try {
      let hoursPerDay: Record<string, number> | undefined
      if (partial && startDate === endDate) {
        const n = Number.parseFloat(partialHours)
        if (!Number.isFinite(n) || n <= 0 || n > 24) {
          setError('Partial hours must be between 0 and 24')
          setSubmitting(false)
          return
        }
        hoursPerDay = { [startDate]: n }
      }
      const res = await fetch('/api/pto/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          startDate,
          endDate,
          hoursPerDay,
          notes: notes || undefined,
          coverage: coverage || undefined,
        }),
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

  const singleDay = startDate && endDate && startDate === endDate

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-white/10 bg-white/5 p-5 space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Type</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PtoKind)}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          >
            {Object.entries(PTO_KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="hidden md:block" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Start date</label>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">End date</label>
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {singleDay && (
        <div className="rounded-md border border-white/10 bg-slate-900/50 p-3">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={partial}
              onChange={(e) => setPartial(e.target.checked)}
              className="accent-cyan-500"
            />
            Partial day
          </label>
          {partial && (
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-slate-400">Hours</label>
              <input
                type="number"
                min="0.5"
                max="12"
                step="0.5"
                value={partialHours}
                onChange={(e) => setPartialHours(e.target.value)}
                className="w-24 rounded-md bg-slate-900 border border-white/10 text-white px-2 py-1 text-sm"
              />
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          Who is covering your shift/work?
        </label>
        <input
          type="text"
          value={coverage}
          onChange={(e) => setCoverage(e.target.value)}
          maxLength={500}
          placeholder="e.g. John will handle tickets; Sarah is on-call"
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  )
}

function RequestsTable({
  requests,
  loading,
  onCancelled,
}: {
  requests: RequestSummary[]
  loading: boolean
  onCancelled: () => void
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400 text-sm">
        Loading…
      </div>
    )
  }
  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400 text-sm">
        You haven&apos;t submitted any requests yet.
      </div>
    )
  }

  const cancel = async (id: string) => {
    if (!confirm('Cancel this request?')) return
    const res = await fetch(`/api/pto/requests/${id}/cancel`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Could not cancel')
      return
    }
    onCancelled()
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-white/5 text-left">
          <tr>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Dates</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Hours</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {requests.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3 text-white">{PTO_KIND_LABELS[r.kind] ?? r.kind}</td>
              <td className="px-4 py-3 text-slate-200 whitespace-nowrap">
                {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}
              </td>
              <td className="px-4 py-3 text-slate-200">{r.totalHours.toFixed(2)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/pto/${r.id}`}
                  className="text-cyan-400 hover:text-cyan-300 text-xs font-medium mr-3"
                >
                  View
                </Link>
                {(r.status === 'PENDING_INTAKE' ||
                  r.status === 'PENDING' ||
                  r.status === 'PENDING_APPROVAL') && (
                  <button
                    type="button"
                    onClick={() => cancel(r.id)}
                    className="text-rose-400 hover:text-rose-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
