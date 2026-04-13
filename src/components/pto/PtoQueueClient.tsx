'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PTO_KIND_LABELS, type PtoKind, type PtoStatus } from '@/lib/pto/types'
import StatusBadge from './StatusBadge'

interface RequestRow {
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
  reviewedByName: string | null
  reviewedAt: string | null
  createdAt: string
  gustoSyncStatus: string | null
  graphSyncStatus: string | null
}

const TABS: Array<{ label: string; status: PtoStatus | 'ALL' }> = [
  { label: 'Pending', status: 'PENDING' },
  { label: 'Approved', status: 'APPROVED' },
  { label: 'Denied', status: 'DENIED' },
  { label: 'Cancelled', status: 'CANCELLED' },
  { label: 'All', status: 'ALL' },
]

export default function PtoQueueClient() {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<PtoStatus | 'ALL'>('PENDING')

  const load = useCallback(
    async (status: PtoStatus | 'ALL', signal?: AbortSignal) => {
      setLoading(true)
      try {
        const qs = new URLSearchParams({ scope: 'all' })
        if (status !== 'ALL') qs.set('status', status)
        const res = await fetch(`/api/pto/requests?${qs}`, { signal })
        const data = await res.json()
        setRows(data.requests ?? [])
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('[pto] queue load failed', err)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    const controller = new AbortController()
    load(tab, controller.signal)
    return () => controller.abort()
  }, [tab, load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {TABS.map((t) => (
          <button
            key={t.status}
            type="button"
            onClick={() => setTab(t.status)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              tab === t.status
                ? 'bg-cyan-500 text-white'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400">
          No requests match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-white/5 text-left">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Employee</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Dates</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Hours</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Submitted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{r.employeeName}</p>
                    <p className="text-xs text-slate-400">{r.employeeEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-200">{PTO_KIND_LABELS[r.kind] ?? r.kind}</td>
                  <td className="px-4 py-3 text-slate-200 whitespace-nowrap">
                    {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}
                  </td>
                  <td className="px-4 py-3 text-slate-200">{r.totalHours.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/pto/${r.id}`}
                      className="text-cyan-400 hover:text-cyan-300 text-xs font-medium"
                    >
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
