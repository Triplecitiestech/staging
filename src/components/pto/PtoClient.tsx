'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PTO_KIND_LABELS, type PtoKind, type PtoStatus } from '@/lib/pto/types'
import StatusBadge from './StatusBadge'
import SyncBadge from './SyncBadge'

interface Balance {
  policyUuid: string
  policyName: string
  policyType: string
  balanceHours: number
}

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
  reviewedAt: string | null
  reviewedByName: string | null
  managerNotes: string | null
  createdAt: string
  gustoSyncStatus: string | null
  graphSyncStatus: string | null
}

interface BalanceResponse {
  connected: boolean
  mapped?: boolean
  balances: Balance[]
  error?: string
}

export default function PtoClient({ canApprove }: { canApprove: boolean }) {
  const [balances, setBalances] = useState<Balance[] | null>(null)
  const [balanceState, setBalanceState] = useState<'loading' | 'ok' | 'unmapped' | 'disconnected' | 'error'>(
    'loading'
  )
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [requests, setRequests] = useState<RequestSummary[]>([])
  const [reqLoading, setReqLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  const loadBalance = useCallback(async (signal?: AbortSignal) => {
    setBalanceState('loading')
    try {
      const res = await fetch('/api/pto/balance', { signal })
      // Read body as text first so we can surface non-JSON responses clearly
      const text = await res.text()
      let data: (BalanceResponse & { code?: string }) | null = null
      try {
        data = text ? (JSON.parse(text) as BalanceResponse) : null
      } catch {
        // Non-JSON response
      }

      if (!res.ok || !data) {
        const code = data?.code
        if (code === 'pto_migration_missing') {
          setBalanceState('error')
          setBalanceError(
            'Database tables for the PTO system have not been installed yet. An admin must run the PTO migration.'
          )
          setBalances([])
          return
        }
        setBalanceState('error')
        setBalanceError(
          data?.error ??
            `Server returned ${res.status} ${res.statusText || ''}`.trim()
        )
        setBalances([])
        return
      }

      if (!data.connected) {
        setBalanceState('disconnected')
        setBalances([])
      } else if (data.mapped === false) {
        setBalanceState('unmapped')
        setBalances([])
      } else if (data.error) {
        setBalanceState('error')
        setBalanceError(data.error)
        setBalances([])
      } else {
        setBalances(data.balances)
        setBalanceState('ok')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setBalanceState('error')
      setBalanceError(err instanceof Error ? err.message : 'Failed to load balances')
    }
  }, [])

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
    loadBalance(controller.signal)
    loadRequests(controller.signal)
    return () => controller.abort()
  }, [loadBalance, loadRequests])

  return (
    <div className="space-y-8">
      {/* Balances */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">My balances</h2>
          {canApprove && (
            <Link
              href="/admin/pto/queue"
              className="text-sm text-cyan-400 hover:text-cyan-300 font-medium"
            >
              Open approval queue →
            </Link>
          )}
        </div>

        {balanceState === 'loading' && (
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded-lg bg-white/5 border border-white/10 animate-pulse"
              />
            ))}
          </div>
        )}

        {balanceState === 'disconnected' && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            Gusto is not connected yet. An admin can connect Gusto at{' '}
            <Link href="/admin/settings/integrations/gusto" className="underline font-medium">
              Settings · Integrations · Gusto
            </Link>
            .
          </div>
        )}

        {balanceState === 'unmapped' && (
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4 text-cyan-100">
            Your account is not yet linked to a Gusto employee record. Contact an admin to map
            your accounts before submitting a request.
          </div>
        )}

        {balanceState === 'error' && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
            Could not load balances: {balanceError}
          </div>
        )}

        {balanceState === 'ok' && balances && balances.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-slate-300">
            No time-off policies are assigned to you in Gusto yet.
          </div>
        )}

        {balanceState === 'ok' && balances && balances.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {balances.map((b) => (
              <div
                key={b.policyUuid}
                className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-900/60 to-slate-900/30 p-4"
              >
                <p className="text-xs uppercase tracking-wide text-slate-400">{b.policyType}</p>
                <p className="text-sm font-semibold text-white mt-1">{b.policyName}</p>
                <p className="text-3xl font-bold text-cyan-300 mt-2">
                  {b.balanceHours.toFixed(2)}
                  <span className="text-sm font-normal text-slate-400 ml-1">hrs</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">≈ {(b.balanceHours / 8).toFixed(1)} days</p>
              </div>
            ))}
          </div>
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
            balances={balances}
            onSubmitted={() => {
              setFormOpen(false)
              loadRequests()
              loadBalance()
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
            loadBalance()
          }}
        />
      </section>
    </div>
  )
}

function NewRequestForm({
  balances,
  onSubmitted,
}: {
  balances: Balance[] | null
  onSubmitted: () => void
}) {
  const [kind, setKind] = useState<PtoKind>('VACATION')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [partial, setPartial] = useState(false)
  const [partialHours, setPartialHours] = useState('4')
  const [policyUuid, setPolicyUuid] = useState('')
  const [notes, setNotes] = useState('')
  const [coverage, setCoverage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const policyOptions = useMemo(() => balances ?? [], [balances])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!startDate || !endDate) {
      setError('Start and end dates are required')
      return
    }
    setSubmitting(true)
    try {
      // Build hoursPerDay for partial day only when a single day + partial checked
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
      const selected = policyOptions.find((p) => p.policyUuid === policyUuid)
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
          gustoPolicyUuid: selected?.policyUuid,
          gustoPolicyName: selected?.policyName,
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
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Policy (from Gusto)</label>
          <select
            value={policyUuid}
            onChange={(e) => setPolicyUuid(e.target.value)}
            className="w-full rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="">— None / will not deduct from Gusto —</option>
            {policyOptions.map((p) => (
              <option key={p.policyUuid} value={p.policyUuid}>
                {p.policyName} ({p.balanceHours.toFixed(2)} hrs available)
              </option>
            ))}
          </select>
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
          Who is covering your shift/work? (optional)
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
        You haven’t submitted any requests yet.
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
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Reviewer</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Sync</th>
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
              <td className="px-4 py-3 text-slate-400 text-xs">
                {r.reviewedByName ? `${r.reviewedByName}` : '—'}
              </td>
              <td className="px-4 py-3 space-x-1">
                {r.status === 'APPROVED' && (
                  <>
                    <SyncBadge label="Gusto" status={r.gustoSyncStatus} />
                    <SyncBadge label="M365" status={r.graphSyncStatus} />
                  </>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/pto/${r.id}`}
                  className="text-cyan-400 hover:text-cyan-300 text-xs font-medium mr-3"
                >
                  View
                </Link>
                {r.status === 'PENDING' && (
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
