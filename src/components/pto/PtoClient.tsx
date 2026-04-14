'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
      {/* HR shortcut — big button at the top, only for HR staff */}
      {(canApprove || canIntake) && (
        <section className="rounded-lg border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-violet-300 uppercase tracking-wide">
              HR access
            </h2>
            <p className="text-slate-200 text-sm mt-1">
              Review pending requests, complete intake, and approve or deny.
            </p>
          </div>
          <Link
            href="/admin/pto/queue"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-400 transition-colors shadow-lg shadow-violet-500/20 whitespace-nowrap"
          >
            Open PTO Queue
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </section>
      )}

      {/* How it works explainer */}
      <section className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-5">
        <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wide mb-3">
          How PTO requests work
        </h2>
        <ol className="text-sm text-slate-200 space-y-2">
          <li>
            <span className="text-cyan-400 font-semibold">Step 1 — Submit.</span>{' '}
            Fill out the form below with dates, hours, and who you&apos;d like to cover your work.
          </li>
          <li>
            <span className="text-cyan-400 font-semibold">Step 2 — HR intake.</span>{' '}
            Rio looks up your current PTO balance in Gusto, confirms coverage, and forwards the request to Kurtis with context.
          </li>
          <li>
            <span className="text-cyan-400 font-semibold">Step 3 — Coverage confirmation.</span>{' '}
            The teammate you picked gets an email to accept or decline covering your work. HR and you both see their response.
          </li>
          <li>
            <span className="text-cyan-400 font-semibold">Step 4 — Final approval.</span>{' '}
            Kurtis reviews everything and approves or denies. You get an email with the decision.
          </li>
          <li>
            <span className="text-cyan-400 font-semibold">Step 5 — Calendar + Gusto.</span>{' '}
            If approved, the shared time-off calendar is updated automatically and you receive a calendar invite. HR manually enters the PTO in Gusto to close the loop.
          </li>
        </ol>
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

interface StaffListItem {
  id: string
  name: string
  email: string
}

function NewRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [kind, setKind] = useState<PtoKind>('VACATION')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [hoursPerWorkDay, setHoursPerWorkDay] = useState('8')
  const [notes, setNotes] = useState('')
  const [coverageStaffId, setCoverageStaffId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [staff, setStaff] = useState<StaffListItem[]>([])
  const [staffLoading, setStaffLoading] = useState(true)

  // Load staff for coverage dropdown
  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch('/api/admin/staff/list', { signal: controller.signal })
        const data = await res.json().catch(() => ({ staff: [] }))
        setStaff(data.staff ?? [])
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.warn('[pto] staff list load failed', err)
      } finally {
        setStaffLoading(false)
      }
    })()
    return () => controller.abort()
  }, [])

  // Compute preview total hours
  const previewTotal = useMemo(() => {
    if (!startDate || !endDate) return null
    const hrs = Number.parseFloat(hoursPerWorkDay)
    if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) return null
    const [sy, sm, sd] = startDate.split('-').map(Number)
    const [ey, em, ed] = endDate.split('-').map(Number)
    const start = new Date(Date.UTC(sy, sm - 1, sd))
    const end = new Date(Date.UTC(ey, em - 1, ed))
    if (end.getTime() < start.getTime()) return null
    let total = 0
    const cur = new Date(start)
    while (cur.getTime() <= end.getTime()) {
      const dow = cur.getUTCDay()
      if (dow >= 1 && dow <= 5) total += hrs
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    return Math.round(total * 100) / 100
  }, [startDate, endDate, hoursPerWorkDay])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!startDate || !endDate) {
      setError('Start and end dates are required')
      return
    }
    const hrs = Number.parseFloat(hoursPerWorkDay)
    if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) {
      setError('Hours per work day must be between 0 and 24')
      return
    }

    setSubmitting(true)
    try {
      // Build per-day hours for every weekday in the range using the
      // user's chosen hours-per-work-day.
      const hoursPerDay: Record<string, number> = {}
      const [sy, sm, sd] = startDate.split('-').map(Number)
      const [ey, em, ed] = endDate.split('-').map(Number)
      const start = new Date(Date.UTC(sy, sm - 1, sd))
      const end = new Date(Date.UTC(ey, em - 1, ed))
      const cur = new Date(start)
      while (cur.getTime() <= end.getTime()) {
        const dow = cur.getUTCDay()
        const y = cur.getUTCFullYear()
        const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
        const d = String(cur.getUTCDate()).padStart(2, '0')
        if (dow >= 1 && dow <= 5) hoursPerDay[`${y}-${m}-${d}`] = hrs
        cur.setUTCDate(cur.getUTCDate() + 1)
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
          coverageStaffId: coverageStaffId || undefined,
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

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-white/10 bg-white/5 p-5 space-y-4"
      // force-dark so native date-picker popup is legible on dark theme
      style={{ colorScheme: 'dark' }}
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
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Business hours per work day
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              value={hoursPerWorkDay}
              onChange={(e) => setHoursPerWorkDay(e.target.value)}
              className="w-28 rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
            />
            <span className="text-xs text-slate-400">
              {hoursPerWorkDay === '8' && 'Full day'}
              {hoursPerWorkDay === '4' && 'Half day'}
              {!['4', '8'].includes(hoursPerWorkDay) && 'Custom'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Weekends count as 0. 4 = half day, 8 = full day.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Start date</label>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-cyan-500/30 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">End date</label>
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-cyan-500/30 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 [color-scheme:dark]"
          />
        </div>
      </div>

      {previewTotal !== null && (
        <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-cyan-100">
          <strong>{previewTotal.toFixed(2)} hours</strong> total across{' '}
          {startDate === endDate ? '1 day' : `${startDate} → ${endDate}`} (weekdays only).
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          Who will cover your shift/work?{' '}
          <span className="text-slate-500 font-normal">— they&apos;ll be emailed for confirmation</span>
        </label>
        <select
          value={coverageStaffId}
          onChange={(e) => setCoverageStaffId(e.target.value)}
          disabled={staffLoading}
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        >
          <option value="">— Pick a teammate —</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.email})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          Notes{' '}
          <span className="text-slate-500 font-normal">
            — sent to HR, the coverer, and the final approver
          </span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. Heading out of town for a wedding. John, please cover my tickets. I'll be back Monday."
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
