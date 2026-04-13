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
  status: PtoStatus
  intakeByName: string | null
  intakeAt: string | null
  intakeSkipped: boolean
  reviewedByName: string | null
  reviewedAt: string | null
  gustoRecordedAt: string | null
  createdAt: string
}

type TabId = 'my_queue' | 'intake' | 'approval' | 'approved' | 'denied' | 'cancelled' | 'all'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'my_queue', label: 'My queue' },
  { id: 'intake', label: 'Pending HR intake' },
  { id: 'approval', label: 'Pending final approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'denied', label: 'Denied' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
]

export default function PtoQueueClient({
  canIntake,
  canApprove,
}: {
  canIntake: boolean
  canApprove: boolean
}) {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>('my_queue')

  const load = useCallback(
    async (id: TabId, signal?: AbortSignal) => {
      setLoading(true)
      try {
        const qs = new URLSearchParams({ scope: 'all' })
        if (id === 'intake') qs.set('status', 'PENDING_INTAKE')
        else if (id === 'approval') qs.set('status', 'PENDING_APPROVAL')
        else if (id === 'approved') qs.set('status', 'APPROVED')
        else if (id === 'denied') qs.set('status', 'DENIED')
        else if (id === 'cancelled') qs.set('status', 'CANCELLED')
        // 'my_queue' and 'all' don't pre-filter server-side

        const res = await fetch(`/api/pto/requests?${qs}`, { signal })
        const data = await res.json()
        let list: RequestRow[] = data.requests ?? []

        if (id === 'my_queue') {
          list = list.filter((r) => {
            if (canIntake && (r.status === 'PENDING_INTAKE' || r.status === 'PENDING')) return true
            if (canApprove && r.status === 'PENDING_APPROVAL') return true
            // Approved but not yet recorded in Gusto — still on HR's to-do list
            if ((canIntake || canApprove) && r.status === 'APPROVED' && !r.gustoRecordedAt) return true
            return false
          })
        }

        setRows(list)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('[pto] queue load failed', err)
      } finally {
        setLoading(false)
      }
    },
    [canIntake, canApprove]
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
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              tab === t.id
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
          {tab === 'my_queue'
            ? 'Nothing needs your attention right now.'
            : 'No requests match this filter.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-white/5 text-left">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Employee</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Dates</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Hours</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Gusto</th>
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
                  <td className="px-4 py-3 text-xs">
                    {r.status === 'APPROVED' ? (
                      r.gustoRecordedAt ? (
                        <span className="text-emerald-300">Recorded</span>
                      ) : (
                        <span className="text-amber-300">Needs entry</span>
                      )
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/pto/${r.id}`}
                      className="text-cyan-400 hover:text-cyan-300 text-xs font-medium"
                    >
                      {r.status === 'PENDING_INTAKE' || r.status === 'PENDING'
                        ? 'Intake →'
                        : r.status === 'PENDING_APPROVAL'
                        ? 'Review →'
                        : 'Open →'}
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
