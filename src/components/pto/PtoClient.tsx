'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  APPROVAL_FLOW_KINDS,
  NOTIFICATION_FLOW_KINDS,
  PTO_KIND_LABELS,
  type PtoFlowType,
  type PtoKind,
  type PtoStatus,
} from '@/lib/pto/types'
import StatusBadge from './StatusBadge'

interface RequestSummary {
  id: string
  employeeStaffId: string
  employeeName: string
  employeeEmail: string
  kind: PtoKind
  flowType: PtoFlowType
  startDate: string
  endDate: string
  totalHours: number
  notes: string | null
  coverage: string | null
  status: PtoStatus
  overrideShortNotice: boolean
  overrideReason: string | null
  paidOrUnpaid: string | null
  flagForCeoReview: boolean
  flagReason: string | null
  intakeByName: string | null
  intakeAt: string | null
  intakeSkipped: boolean
  reviewedAt: string | null
  reviewedByName: string | null
  managerNotes: string | null
  createdAt: string
  gustoRecordedAt: string | null
  gustoLoggedAt: string | null
  graphSyncStatus: string | null
}

type FormMode = 'closed' | 'planned' | 'sick'

export default function PtoClient({
  canApprove,
  canIntake,
}: {
  canApprove: boolean
  canIntake: boolean
}) {
  const [requests, setRequests] = useState<RequestSummary[]>([])
  const [reqLoading, setReqLoading] = useState(true)
  const [formMode, setFormMode] = useState<FormMode>('closed')

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
      {(canApprove || canIntake) && (
        <section className="rounded-lg border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-violet-300 uppercase tracking-wide">
              HR access
            </h2>
            <p className="text-slate-200 text-sm mt-1">
              Review pending requests, complete intake, record sick days, and approve or deny.
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

      {/* Two-route explainer */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-5">
          <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wide mb-3">
            Planned time off
          </h2>
          <p className="text-sm text-slate-200 mb-3">
            Vacation, personal days, jury duty, planned unpaid leave — submit at least 2 weeks in advance.
          </p>
          <ol className="text-xs text-slate-300 space-y-1 list-decimal pl-4">
            <li>Submit form with dates, hours, and a reliever.</li>
            <li>Reliever accepts or declines via email.</li>
            <li>HR reviews and forwards to Kurtis.</li>
            <li>Kurtis approves or denies. You get an email.</li>
            <li>Calendar invite sent; HR logs in Gusto.</li>
          </ol>
        </div>
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-5">
          <h2 className="text-sm font-semibold text-blue-300 uppercase tracking-wide mb-3">
            Unplanned (sick / emergency)
          </h2>
          <p className="text-sm text-slate-200 mb-3">
            Sick days, bereavement, family emergencies, same-day medical — already happened, no approval needed.
          </p>
          <ol className="text-xs text-slate-300 space-y-1 list-decimal pl-4">
            <li>Notify HR with type, dates, and hours.</li>
            <li>HR records to Gusto (paid or unpaid).</li>
            <li>You and Kurtis are CC&apos;d on the record.</li>
          </ol>
        </div>
      </section>

      {/* Two CTAs */}
      <section className="rounded-lg border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Submit a request</h2>
            <p className="text-sm text-slate-400">Pick the route that matches your situation.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setFormMode(formMode === 'planned' ? 'closed' : 'planned')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                formMode === 'planned'
                  ? 'bg-cyan-400 text-slate-950'
                  : 'bg-cyan-500 text-white hover:bg-cyan-400'
              }`}
            >
              Request planned time off
            </button>
            <button
              type="button"
              onClick={() => setFormMode(formMode === 'sick' ? 'closed' : 'sick')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                formMode === 'sick'
                  ? 'bg-blue-400 text-slate-950'
                  : 'bg-blue-500 text-white hover:bg-blue-400'
              }`}
            >
              Report sick day or emergency
            </button>
          </div>
        </div>

        {formMode === 'planned' && (
          <div className="mt-5">
            <PlannedRequestForm
              onSubmitted={() => {
                setFormMode('closed')
                loadRequests()
              }}
            />
          </div>
        )}
        {formMode === 'sick' && (
          <div className="mt-5">
            <NotificationRequestForm
              onSubmitted={() => {
                setFormMode('closed')
                loadRequests()
              }}
            />
          </div>
        )}
      </section>

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

function PlannedRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [kind, setKind] = useState<PtoKind>('VACATION')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [hoursPerWorkDay, setHoursPerWorkDay] = useState('8')
  const [notes, setNotes] = useState('')
  const [coverageStaffId, setCoverageStaffId] = useState('')
  const [overrideShortNotice, setOverrideShortNotice] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [staff, setStaff] = useState<StaffListItem[]>([])
  const [staffLoading, setStaffLoading] = useState(true)

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

  // Detect short notice (<14 days out)
  const isShortNotice = useMemo(() => {
    if (!startDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [sy, sm, sd] = startDate.split('-').map(Number)
    const start = new Date(sy, sm - 1, sd)
    const days = Math.floor((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return days < 14
  }, [startDate])

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
    if (!startDate || !endDate) return setError('Start and end dates are required')
    const hrs = Number.parseFloat(hoursPerWorkDay)
    if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) {
      return setError('Hours per work day must be between 0 and 24')
    }
    if (isShortNotice && (!overrideShortNotice || !overrideReason.trim())) {
      return setError('This request is under the 2-week minimum. Confirm short-notice override and provide a reason.')
    }

    setSubmitting(true)
    try {
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
          overrideShortNotice: isShortNotice ? overrideShortNotice : false,
          overrideReason:
            isShortNotice && overrideShortNotice ? overrideReason.trim() : undefined,
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
      className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-4"
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
            {APPROVAL_FLOW_KINDS.map((k) => (
              <option key={k} value={k}>
                {PTO_KIND_LABELS[k]}
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
        <div className="rounded-md border border-cyan-500/20 bg-cyan-500/10 p-3 text-sm text-cyan-100">
          <strong>{previewTotal.toFixed(2)} hours</strong> total across{' '}
          {startDate === endDate ? '1 day' : `${startDate} → ${endDate}`} (weekdays only).
        </div>
      )}

      {isShortNotice && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-4">
          <p className="text-sm text-rose-200 font-semibold mb-2">
            ⚠ This request is under the 2-week minimum notice period.
          </p>
          <p className="text-xs text-rose-200/80 mb-3">
            Planned PTO normally needs 14+ days notice. To submit anyway, confirm the override below
            and explain why. The reason is shown prominently to HR and Kurtis.
          </p>
          <label className="flex items-start gap-2 text-sm text-slate-200 mb-2">
            <input
              type="checkbox"
              checked={overrideShortNotice}
              onChange={(e) => setOverrideShortNotice(e.target.checked)}
              className="mt-1"
            />
            <span>Submit as short-notice override</span>
          </label>
          {overrideShortNotice && (
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={2}
              maxLength={1000}
              required
              placeholder="e.g. Found a flight deal for next week; family member visiting unexpectedly."
              className="w-full rounded-md bg-slate-900 border border-rose-500/30 text-white px-3 py-2 text-sm"
            />
          )}
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
        <label className="block text-xs font-semibold text-slate-300 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. Heading out of town for a wedding. John, please cover my tickets."
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  )
}

function NotificationRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const [kind, setKind] = useState<PtoKind>('SICK')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [hours, setHours] = useState('8')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewTotal = useMemo(() => {
    if (!startDate || !endDate) return null
    const hrs = Number.parseFloat(hours)
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
  }, [startDate, endDate, hours])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!startDate || !endDate) return setError('Dates are required')
    const hrs = Number.parseFloat(hours)
    if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) return setError('Hours must be 0–24')

    setSubmitting(true)
    try {
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
      className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-5 space-y-4"
      style={{ colorScheme: 'dark' }}
    >
      <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-100">
        <strong>No approval needed.</strong> HR will record this time in Gusto. You don&apos;t need a reliever.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Type</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PtoKind)}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            {NOTIFICATION_FLOW_KINDS.map((k) => (
              <option key={k} value={k}>
                {PTO_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Hours per day</label>
          <input
            type="number"
            min="0.5"
            max="24"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-slate-500 mt-1">8 = full day, 4 = half day.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Start date</label>
          <input
            type="date"
            required
            max={today}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-blue-500/30 text-white px-3 py-2 text-sm focus:outline-none focus:border-blue-500 [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">End date</label>
          <input
            type="date"
            required
            max={today}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-blue-500/30 text-white px-3 py-2 text-sm focus:outline-none focus:border-blue-500 [color-scheme:dark]"
          />
        </div>
      </div>

      {previewTotal !== null && (
        <div className="rounded-md border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-100">
          <strong>{previewTotal.toFixed(2)} hours</strong> total (weekdays only).
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          Notes for HR <span className="text-slate-500 font-normal">— optional</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. Came down with a flu Monday — feeling better today, back tomorrow."
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-400 disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Notify HR'}
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
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Flow</th>
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
              <td className="px-4 py-3 text-slate-400 text-xs uppercase tracking-wide">
                {r.flowType === 'NOTIFICATION' ? 'Notify' : 'Approval'}
              </td>
              <td className="px-4 py-3 text-slate-200 whitespace-nowrap">
                {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}
              </td>
              <td className="px-4 py-3 text-slate-200">{r.totalHours.toFixed(2)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} flowType={r.flowType} />
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
