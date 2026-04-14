'use client'

import { useCallback, useEffect, useState } from 'react'

interface CoverageRequest {
  id: string
  employeeName: string
  employeeEmail: string
  kind: string
  startDate: string
  endDate: string
  totalHours: number
  notes: string | null
  status: string
  coverageStaffName: string | null
  coverageStaffEmail: string | null
  coverageResponse: string | null
  coverageRespondedAt: string | null
  coverageResponseNotes: string | null
}

function fmtDateRange(a: string, b: string) {
  const fmt = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }
  return a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`
}

export default function CoverageResponseClient({ token }: { token: string }) {
  const [req, setReq] = useState<CoverageRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState<null | 'accepted' | 'declined'>(null)
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/pto/coverage/${encodeURIComponent(token)}`, { signal })
        const text = await res.text()
        if (!res.ok) {
          let msg = `Request failed (${res.status})`
          try {
            msg = JSON.parse(text).error ?? msg
          } catch {}
          throw new Error(msg)
        }
        const data = JSON.parse(text) as CoverageRequest
        setReq(data)
        if (data.coverageResponse === 'accepted' || data.coverageResponse === 'declined') {
          setDone(data.coverageResponse)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    },
    [token]
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const respond = async (response: 'accepted' | 'declined') => {
    setSubmitting(response)
    try {
      const res = await fetch(`/api/pto/coverage/${encodeURIComponent(token)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, notes: notes || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error ?? 'Could not record response')
        return
      }
      setDone(response)
    } finally {
      setSubmitting(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-slate-400 text-center">
        Loading…
      </div>
    )
  }
  if (error || !req) {
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-8 text-rose-100 text-center">
        {error ?? 'Coverage request not found.'}
      </div>
    )
  }

  if (done) {
    return (
      <div
        className={`rounded-lg border p-8 text-center ${
          done === 'accepted'
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-rose-500/30 bg-rose-500/10'
        }`}
      >
        <p className="text-3xl mb-3">{done === 'accepted' ? '✓' : '✕'}</p>
        <h2
          className={`text-xl font-semibold ${
            done === 'accepted' ? 'text-emerald-200' : 'text-rose-200'
          } mb-2`}
        >
          Coverage {done}
        </h2>
        <p className="text-slate-300 text-sm">
          Thanks for responding. HR and {req.employeeName} have been notified.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-6 space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Covering for</p>
        <p className="text-xl text-white font-semibold">{req.employeeName}</p>
        <p className="text-sm text-slate-400">{req.employeeEmail}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 text-sm border-t border-white/10 pt-5">
        <div>
          <p className="text-xs text-slate-400 uppercase">Type</p>
          <p className="text-white font-medium">{req.kind}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-slate-400 uppercase">Dates</p>
          <p className="text-white font-medium">{fmtDateRange(req.startDate, req.endDate)}</p>
          <p className="text-slate-400 text-xs">{req.totalHours.toFixed(2)} hours total</p>
        </div>
      </div>

      {req.notes && (
        <div className="rounded-md border-l-2 border-slate-500 bg-slate-500/5 p-3">
          <p className="text-xs font-semibold text-slate-300 uppercase">Notes from {req.employeeName.split(' ')[0]}</p>
          <p className="text-sm text-slate-100 mt-1 whitespace-pre-wrap">{req.notes}</p>
        </div>
      )}

      <div className="border-t border-white/10 pt-5">
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          Notes (optional — seen by HR and the requester)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. 'All good, I'll handle their tickets' or 'I'm also out that week'"
          className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => respond('accepted')}
          disabled={submitting !== null}
          className="flex-1 px-5 py-3 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-400 disabled:opacity-50 transition-colors"
        >
          {submitting === 'accepted' ? 'Recording…' : 'Accept coverage'}
        </button>
        <button
          type="button"
          onClick={() => respond('declined')}
          disabled={submitting !== null}
          className="flex-1 px-5 py-3 rounded-lg bg-rose-500 text-white font-semibold hover:bg-rose-400 disabled:opacity-50 transition-colors"
        >
          {submitting === 'declined' ? 'Recording…' : 'Decline'}
        </button>
      </div>
    </div>
  )
}
